import { create } from 'zustand';
import type { CtSeries, LatticeState, RtStructFile, SupportState, ViewState, Volume } from '../types';
import type { LayeredCakeStructure } from '../lib/geometry/layeredCake';
import { buildCtVolumeFromSeries, ingestDicomFiles } from '../lib/dicom/loader';
import { parseRtToLayeredCake } from '../lib/geometry/layeredCake';
import { generateSpheresFlow, type GenerateParams } from '../lib/lattice/flow';
import { computeMinCtcPair, computeMinCtcPairPeaks } from '../lib/lattice/analysis';
import { computeSupportRingMasksFromSpheres } from '../lib/lattice/support';
import { generateRtStruct } from '../lib/dicom/export';

interface AppState {
    // Data
    files: File[];
    ctSeries: Map<string, CtSeries>;
    rtFiles: RtStructFile[];

    // Selection
    selectedSeriesUID: string | null;
    selectedRtIdx: number | null;

    // Derived Geometry
    volume: Volume | null;
    layeredCake: LayeredCakeStructure[] | null;
    targetStructName: string | null;
    targetStruct: LayeredCakeStructure | null;

    // Lattice
    lattice: LatticeState;
    support: SupportState;

    // View
    view: ViewState;

    // UI Status
    status: string;
    isBusy: boolean;
    logs: string[];

    // Actions
    ingestFiles: (files: File[]) => Promise<void>;
    selectSeries: (seriesUID: string) => void;
    selectRt: (index: number) => void;
    setTargetStruct: (name: string) => void;
    generateLattice: (params: GenerateParams) => Promise<void>;
    generateSupport: (inner: number, mid: number, outer: number) => Promise<void>;
    exportRtStruct: () => Promise<void>;
    clearLattice: () => void;
    updateView: (view: Partial<ViewState>) => void;
    setStatus: (msg: string, busy?: boolean) => void;
    addLog: (msg: string) => void;
    reset: () => void;
}

const DEFAULT_VIEW: ViewState = {
    k: 0,
    row: 0,
    col: 0,
    zoomAxial: 1,
    zoomCoronal: 1,
    zoomSagittal: 1,
    panAxial: { x: 0, y: 0 },
    panCoronal: { x: 0, y: 0 },
    panSagittal: { x: 0, y: 0 },
    wlCenter: 40,
    wlWidth: 400,
};

export const useAppStore = create<AppState>((set, get) => ({
    files: [],
    ctSeries: new Map(),
    rtFiles: [],

    selectedSeriesUID: null,
    selectedRtIdx: null,

    volume: null,
    layeredCake: null,
    targetStructName: null,
    targetStruct: null,

    lattice: {
        spheres: [],
        mode: 'peaks',
        roiName: 'LatticeSpheres',
        minCtcPairPeaks: null,
        minCtcPairAll: null,
    },
    support: {
        box: null, inner: null, mid: null, outer: null, volumesCc: null
    },

    view: { ...DEFAULT_VIEW },

    status: 'Idle',
    isBusy: false,
    logs: [],

    ingestFiles: async (fileList) => {
        set({ status: 'Importing...', isBusy: true });
        try {
            const { ctSeries, rtFiles, counts } = await ingestDicomFiles(fileList);

            set({
                ctSeries,
                rtFiles,
                status: `Imported CT:${counts.ct} RT:${counts.rs}`,
                isBusy: false,
                files: fileList
            });

            if (ctSeries.size > 0) {
                const first = ctSeries.keys().next().value;
                if (first) get().selectSeries(first);
            }
        } catch (e) {
            console.error(e);
            set({ status: 'Import failed', isBusy: false });
            get().addLog(`Import failed: ${e}`);
        }
    },

    selectSeries: (seriesUID) => {
        const series = get().ctSeries.get(seriesUID);
        if (!series) return;

        set({ status: 'Building volume...', isBusy: true });

        setTimeout(() => {
            try {
                const volume = buildCtVolumeFromSeries(series);

                const k = Math.floor(volume.depth / 2);
                const row = Math.floor(volume.height / 2);
                const col = Math.floor(volume.width / 2);

                set({
                    selectedSeriesUID: seriesUID,
                    volume,
                    status: 'Volume ready',
                    isBusy: false,
                    view: { ...DEFAULT_VIEW, k, row, col },
                    layeredCake: null,
                    targetStruct: null,
                    targetStructName: null,
                    lattice: { ...get().lattice, spheres: [] }
                });

                const currentRtFiles = get().rtFiles;
                if (currentRtFiles.length > 0) {
                    const idx = currentRtFiles.findIndex(rt => !rt.refSeriesUID || rt.refSeriesUID === seriesUID);
                    if (idx >= 0) {
                        get().selectRt(idx);
                    }
                }
            } catch (e) {
                console.error(e);
                set({ status: 'Volume build failed', isBusy: false });
                get().addLog(`Volume build failed: ${e}`);
            }
        }, 10);
    },

    selectRt: (index) => {
        const rtFile = get().rtFiles[index];
        const volume = get().volume;
        if (!rtFile || !volume) return;

        set({ status: 'Parsing RTSTRUCT...', isBusy: true, selectedRtIdx: index });

        setTimeout(() => {
            try {
                const layeredCake = parseRtToLayeredCake(rtFile.dataSet, volume.slices.map(s => s.dataSet));
                set({
                    layeredCake,
                    status: 'RTSTRUCT parsed',
                    isBusy: false,
                    targetStruct: null,
                    targetStructName: null
                });

                if (layeredCake.length > 0) {
                    get().setTargetStruct(layeredCake[0].name);
                }
            } catch (e) {
                console.error(e);
                set({ status: 'RT parse failed', isBusy: false });
                get().addLog(`RT parse failed: ${e}`);
            }
        }, 10);
    },

    setTargetStruct: (name) => {
        const structs = get().layeredCake;
        const found = structs?.find(s => s.name === name) || null;
        set({ targetStructName: name, targetStruct: found });
    },

    generateLattice: async (params) => {
        const { targetStruct, volume } = get();
        if (!targetStruct || !volume) return;

        set({ status: 'Generating lattice...', isBusy: true });

        // Allow UI to render loading state
        await new Promise(r => setTimeout(r, 10));

        try {
            const spheres = generateSpheresFlow(targetStruct, volume, params);

            // Count kinds for log
            const counts = { peak: 0, warm: 0, cold: 0 };
            spheres.forEach(s => counts[s.kind]++);

            set((state) => ({
                lattice: {
                    ...state.lattice,
                    spheres,
                    minCtcPairPeaks: computeMinCtcPairPeaks(spheres),
                    minCtcPairAll: computeMinCtcPair(spheres)
                },
                status: `Generated ${spheres.length} spheres (P:${counts.peak} W:${counts.warm} C:${counts.cold})`,
                isBusy: false
            }));
        } catch (e) {
            set({ status: 'Generation error', isBusy: false });
            get().addLog(`${e}`);
        }
    },

    generateSupport: async (inner, mid, outer) => {
        const { volume, lattice } = get();
        if (!volume || !lattice.spheres.length) return;
        set({ status: 'Generating support...', isBusy: true });

        await new Promise(r => setTimeout(r, 10)); // Yield

        try {
            const result = computeSupportRingMasksFromSpheres(volume, lattice.spheres, inner, mid, outer);
            if (!result) throw new Error('Failed to generate support masks');

            set({
                support: result,
                status: 'Support generated',
                isBusy: false
            });
            const v = result.volumesCc;
            if (v) get().addLog(`Support Volumes: Inner=${v.inner.toFixed(2)}cc, Mid=${v.mid.toFixed(2)}cc, Outer=${v.outer.toFixed(2)}cc`);
        } catch (e) {
            console.error(e);
            set({ status: 'Support generation failed', isBusy: false });
            get().addLog(`Support Gen failed: ${e}`);
        }
    },

    exportRtStruct: async () => {
        const { volume, lattice, support } = get();
        if (!volume || !lattice.spheres.length) return;

        set({ status: 'Exporting RTSTRUCT...', isBusy: true });

        // Yield to let UI update
        await new Promise(r => setTimeout(r, 10)); // Yield

        try {
            const buffer = generateRtStruct(volume, lattice, support);
            if (!buffer) throw new Error('Failed to generate RTSTRUCT buffer');

            // Download
            const blob = new Blob([buffer], { type: 'application/dicom' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `RS_Latticepheres_${new Date().toISOString().slice(0, 10)}.dcm`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            set({ status: 'Exported', isBusy: false });
        } catch (e) {
            console.error(e);
            set({ status: 'Export failed', isBusy: false });
            get().addLog(`Export failed: ${e}`);
        }
    },

    clearLattice: () => {
        set({
            lattice: {
                spheres: [],
                mode: 'peaks',
                roiName: 'LatticeSpheres',
                minCtcPairPeaks: null,
                minCtcPairAll: null
            },
            support: { box: null, inner: null, mid: null, outer: null, volumesCc: null },
            status: 'Cleared'
        });
    },

    updateView: (updates) => {
        set((state) => ({ view: { ...state.view, ...updates } }));
    },

    setStatus: (msg, busy = false) => set({ status: msg, isBusy: busy }),

    addLog: (msg) => set((state) => ({ logs: [...state.logs, msg] })),

    reset: () => set({
        files: [], ctSeries: new Map(), rtFiles: [],
        volume: null, layeredCake: null, lattice: { spheres: [], mode: 'peaks', roiName: '', minCtcPairAll: null, minCtcPairPeaks: null }
    })
}));
