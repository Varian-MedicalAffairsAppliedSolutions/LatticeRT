import { useState } from 'react';
import { useAppStore } from '../store/useAppStore';
import { Download, FileUp, Play, Settings, Layers } from 'lucide-react';
import type { GenerateParams } from '../lib/lattice/flow';
import clsx from 'clsx';

import { Dropzone } from './Dropzone';

export function Sidebar() {
    const {
        ingestFiles, status, isBusy, ctSeries, rtFiles,
        selectedSeriesUID, selectSeries,
        selectedRtIdx, selectRt,
        layeredCake, targetStructName, setTargetStruct,
        generateLattice, lattice, logs,
        generateSupport, clearLattice, exportRtStruct
    } = useAppStore();

    const [supportEnabled, setSupportEnabled] = useState(false);
    const [innerMm, setInnerMm] = useState(5);
    const [midMm, setMidMm] = useState(10);
    const [outerMm, setOuterMm] = useState(20);

    const [pattern, setPattern] = useState<'hcp' | 'sc' | 'ac' | 'cvt3d'>('hcp');
    const [spacing, setSpacing] = useState(50);
    const [radius, setRadius] = useState(5);
    const [sphereSet, setSphereSet] = useState<'peaks' | 'peaks_cold' | 'peaks_warm_cold'>('peaks');
    const [margin, setMargin] = useState(5);
    const [fullOnly, setFullOnly] = useState(true);
    const [xShift, setXShift] = useState(0);
    const [yShift, setYShift] = useState(0);

    const onGenerate = () => {
        const params: GenerateParams = {
            pattern,
            spacing,
            radius,
            xShift,
            yShift,
            fullOnly,
            margin,
            sphereSet
        };
        generateLattice(params);
    };

    const seriesList = Array.from(ctSeries.values());
    const rtList = rtFiles.map((r, i) => ({ file: r.file, idx: i, ref: r.refSeriesUID }));
    const structList = layeredCake || [];

    const onSupport = () => {
        generateSupport(innerMm, midMm, outerMm);
    };

    return (
        <div className="sidebar">
            <div className="sidebar-section">
                <div className="section-header"><FileUp size={12} /> Import</div>
                <Dropzone onFiles={ingestFiles} className="file-upload-area">
                    <div className="hint">Drop CT + RTSTRUCT DICOMs here<br />or click to select</div>
                    <div className="muted" style={{ marginTop: 8 }}>(Local only)</div>
                </Dropzone>
                <div style={{ marginTop: 10 }} className="hint">{status}</div>
            </div>

            <div className="sidebar-section">
                <div className="section-header"><Settings size={12} /> Selection</div>

                <label>CT Series</label>
                <select
                    disabled={!seriesList.length}
                    value={selectedSeriesUID || ''}
                    onChange={e => selectSeries(e.target.value)}
                >
                    {seriesList.length === 0 && <option value="">No CT series loaded</option>}
                    {seriesList.map(s => (
                        <option key={s.seriesUID} value={s.seriesUID}>
                            {s.desc || s.seriesUID} ({s.slices.length})
                        </option>
                    ))}
                </select>

                <label>RTSTRUCT</label>
                <select
                    disabled={!rtList.length}
                    value={selectedRtIdx ?? ''}
                    onChange={e => selectRt(Number(e.target.value))}
                >
                    {rtList.length === 0 && <option value="">No RTSTRUCT loaded</option>}
                    {rtList.map(r => (
                        <option key={r.idx} value={r.idx}>
                            {r.file.name} (ref {r.ref ? '✓' : '?'})
                        </option>
                    ))}
                </select>

                <label>Target ROI (PTV)</label>
                <select
                    disabled={!structList.length}
                    value={targetStructName || ''}
                    onChange={e => setTargetStruct(e.target.value)}
                >
                    {structList.length === 0 && <option value="">No ROIs parsed</option>}
                    {structList.map(s => (
                        <option key={s.name} value={s.name}>{s.name}</option>
                    ))}
                </select>

                <label>Target Boundary Margin (mm)</label>
                <input
                    type="number" step="0.5"
                    value={margin} onChange={e => setMargin(Number(e.target.value))}
                    disabled={!targetStructName}
                />
            </div>

            <div className="sidebar-section">
                <div className="section-header"><Play size={12} /> Lattice</div>

                <label>Pattern</label>
                <select value={pattern} onChange={e => setPattern(e.target.value as any)} disabled={!targetStructName}>
                    <option value="hcp">Hexagonal Closest Packed (HCP)</option>
                    <option value="sc">Simple Cubic (SC)</option>
                    <option value="ac">Alternating Cubic (AC)</option>
                    <option value="cvt3d">Centroidal Voronoi (CVT3D)</option>
                </select>

                <label>Sphere Set</label>
                <select value={sphereSet} onChange={e => setSphereSet(e.target.value as any)} disabled={!targetStructName}>
                    <option value="peaks">Peak (Hot) spheres</option>
                    <option value="peaks_cold">Peak + Cold</option>
                    <option value="peaks_warm_cold">Peak + Warm + Cold</option>
                </select>

                <div className="row">
                    <div>
                        <label>Radius (mm)</label>
                        <input type="number" step="0.5" value={radius} onChange={e => setRadius(Number(e.target.value))} disabled={!targetStructName} />
                    </div>
                    <div>
                        <label>Spacing (mm)</label>
                        <input type="number" step="1.0" value={spacing} onChange={e => setSpacing(Number(e.target.value))} disabled={!targetStructName} />
                    </div>
                </div>

                <div className="row">
                    <div>
                        <label>X Shift (mm)</label>
                        <input type="number" step="0.5" value={xShift} onChange={e => setXShift(Number(e.target.value))} disabled={!targetStructName} />
                    </div>
                    <div>
                        <label>Y Shift (mm)</label>
                        <input type="number" step="0.5" value={yShift} onChange={e => setYShift(Number(e.target.value))} disabled={!targetStructName} />
                    </div>
                </div>

                <div className="checkbox-row">
                    <input type="checkbox" checked={fullOnly} onChange={e => setFullOnly(e.target.checked)} disabled={!targetStructName} />
                    <label>Full spheres only</label>
                </div>

                <div className="btn-row">
                    <button
                        className={clsx("button primary", isBusy && "disabled")}
                        disabled={!targetStructName || isBusy}
                        onClick={onGenerate}
                    >
                        Generate
                    </button>
                    <button
                        className="button"
                        disabled={!lattice.spheres.length || isBusy}
                        onClick={clearLattice}
                    >
                        Clear
                    </button>
                </div>

                {logs.length > 0 && <div className="toast">{logs[logs.length - 1]}</div>}
            </div>

            <div className="sidebar-section">
                <div className="section-header"><Layers size={12} /> Supporting Structure</div>
                <div className="checkbox-row">
                    <input type="checkbox" checked={supportEnabled} onChange={e => setSupportEnabled(e.target.checked)} disabled={!lattice.spheres.length} />
                    <label>Enable supporting ROIs</label>
                </div>

                {supportEnabled && (
                    <>
                        <div className="row3" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                            <div>
                                <label>Inner (mm)</label>
                                <input type="number" value={innerMm} onChange={e => setInnerMm(Number(e.target.value))} />
                            </div>
                            <div>
                                <label>Mid (mm)</label>
                                <input type="number" value={midMm} onChange={e => setMidMm(Number(e.target.value))} />
                            </div>
                            <div>
                                <label>Outer (mm)</label>
                                <input type="number" value={outerMm} onChange={e => setOuterMm(Number(e.target.value))} />
                            </div>
                        </div>
                        <div className="btn-row">
                            <button
                                className="button"
                                disabled={isBusy}
                                onClick={onSupport}
                            >
                                Generate Masks
                            </button>
                        </div>
                    </>
                )}
            </div>

            <div className="sidebar-section">
                <div className="section-header"><Download size={12} /> Export</div>
                <div className="btn-row">
                    <button className="button primary" disabled={!lattice.spheres.length} onClick={exportRtStruct || undefined}>Export RTSTRUCT</button>
                </div>
            </div>

        </div>
    );
}
