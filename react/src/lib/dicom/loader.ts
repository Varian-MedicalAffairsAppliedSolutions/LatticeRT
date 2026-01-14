import * as dicomParser from 'dicom-parser';
import type { CtSeries, CtSlice, RtStructFile, Volume } from '../../types';
import { cross3, dot3, norm3, type Vec3 } from '../math';

// Helper to read file as ArrayBuffer
export async function readFileAsArrayBuffer(file: File): Promise<ArrayBuffer> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as ArrayBuffer);
        reader.onerror = () => reject(reader.error || new Error('File read failed'));
        reader.readAsArrayBuffer(file);
    });
}

export function getTagString(ds: any, tag: string): string | null {
    try {
        return ds.string(tag) || null;
    } catch {
        return null;
    }
}

function getTagFloat(ds: any, tag: string): number | null {
    try {
        const v = ds.floatString(tag);
        return Number.isFinite(v) ? v : null;
    } catch {
        return null;
    }
}

function getTagUint16(ds: any, tag: string): number | null {
    try {
        const v = ds.uint16(tag);
        return Number.isFinite(v) ? v : null;
    } catch {
        return null;
    }
}

function parseBackslashNumbers(s: string | null, expectedLen: number | null = null): number[] | null {
    if (s == null) return null;
    const parts = String(s)
        .split('\\')
        .map((x) => Number(x))
        .filter((x) => Number.isFinite(x));
    if (expectedLen != null && parts.length < expectedLen) return null;
    return parts;
}

export function parseImagePosition(ds: any): Vec3 {
    const ipp = parseBackslashNumbers(getTagString(ds, 'x00200032'), 3);
    return (ipp as Vec3) || [0, 0, 0];
}

function parseImageOrientation(ds: any): number[] {
    const iop = parseBackslashNumbers(getTagString(ds, 'x00200037'), 6);
    return iop || [1, 0, 0, 0, 1, 0];
}

function parsePixelSpacing(ds: any): [number, number] {
    const ps = parseBackslashNumbers(getTagString(ds, 'x00280030'), 2);
    return (ps as [number, number]) || [1, 1];
}

function extractReferencedSeriesUIDFromRtstruct(dataSet: any): string | null {
    try {
        const rfor = dataSet?.elements?.x30060010?.items?.[0]?.dataSet;
        const rtStudy = rfor?.elements?.x30060012?.items?.[0]?.dataSet;
        const rtSeries = rtStudy?.elements?.x30060014?.items?.[0]?.dataSet;
        const seriesUID = rtSeries?.string?.call(rtSeries, 'x0020000e') || null;
        return seriesUID;
    } catch {
        return null;
    }
}

export interface IngestionResult {
    ctSeries: Map<string, CtSeries>;
    rtFiles: RtStructFile[];
    counts: { ct: number; rs: number; other: number };
}

export async function ingestDicomFiles(fileList: File[]): Promise<IngestionResult> {
    const ctSeriesMap = new Map<string, CtSeries>();
    const rsFiles: RtStructFile[] = [];
    let otherCount = 0;
    let ctCount = 0;
    let rsCount = 0;

    for (const file of fileList) {
        if (!file || file.size === 0) continue;
        let arrayBuffer: ArrayBuffer;
        try {
            arrayBuffer = await readFileAsArrayBuffer(file);
        } catch (e) {
            console.error(`Failed to read ${file.name}`, e);
            continue;
        }
        const byteArray = new Uint8Array(arrayBuffer);
        let dataSet: any;
        try {
            dataSet = dicomParser.parseDicom(byteArray);
        } catch {
            otherCount++;
            continue;
        }

        const modality = (getTagString(dataSet, 'x00080060') || '').trim().toUpperCase();
        const sopClassUID = (getTagString(dataSet, 'x00080016') || '').trim();
        const isCt =
            modality === 'CT' ||
            sopClassUID === '1.2.840.10008.5.1.4.1.1.2' ||
            sopClassUID === '1.2.840.10008.5.1.4.1.1.2.1';
        const isRtstruct =
            modality === 'RTSTRUCT' ||
            sopClassUID === '1.2.840.10008.5.1.4.1.1.481.3';

        if (isCt) {
            ctCount++;
            const seriesUID = getTagString(dataSet, 'x0020000e') || 'UNKNOWN_SERIES';
            const seriesDesc = getTagString(dataSet, 'x0008103e') || '';
            const sopUID = getTagString(dataSet, 'x00080018') || '';
            const forUID = getTagString(dataSet, 'x00200052') || '';
            const inst = Number(getTagString(dataSet, 'x00200013') || '') || 0;
            const ipp = parseImagePosition(dataSet);
            const iop = parseImageOrientation(dataSet);
            const ps = parsePixelSpacing(dataSet);
            const rows = getTagUint16(dataSet, 'x00280010') || 0;
            const cols = getTagUint16(dataSet, 'x00280011') || 0;

            const entry: CtSlice = {
                file, arrayBuffer, dataSet, seriesUID, seriesDesc, sopUID, forUID, inst, ipp, iop, ps, rows, cols,
                normal: [0, 0, 1], z: 0 // Will be computed in sort
            };

            if (!ctSeriesMap.has(seriesUID)) {
                ctSeriesMap.set(seriesUID, { seriesUID, desc: seriesDesc, forUID, slices: [] });
            }
            ctSeriesMap.get(seriesUID)!.slices.push(entry);
        } else if (isRtstruct) {
            rsCount++;
            const refSeriesUID = extractReferencedSeriesUIDFromRtstruct(dataSet);
            const forUID = getTagString(dataSet, 'x00200052') || null;
            rsFiles.push({ file, arrayBuffer, dataSet, refSeriesUID, forUID });
        } else {
            otherCount++;
        }
    }

    return { ctSeries: ctSeriesMap, rtFiles: rsFiles, counts: { ct: ctCount, rs: rsCount, other: otherCount } };
}

function sortSlicesByPosition(series: CtSeries) {
    if (!series || !series.slices?.length) return;
    const first = series.slices[0].dataSet;
    const iop = parseImageOrientation(first);
    const rowCos = norm3(iop.slice(0, 3) as Vec3);
    const colCos = norm3(iop.slice(3, 6) as Vec3);
    const normal = norm3(cross3(rowCos, colCos));

    series.slices.forEach((s) => {
        s.normal = normal; // Assign normal
        s.z = dot3(s.ipp, normal);
        s._w = s.z;
    });
    series.slices.sort((a, b) => (a._w! - b._w!) || (a.inst - b.inst));
    series._rowCos = rowCos;
    series._colCos = colCos;
    series._normal = normal;
}

function computeSliceSpacing(positions: Vec3[], normal: Vec3, fallback = 1.0): number {
    if (!positions || positions.length < 2) return fallback || 1.0;
    const deltas: number[] = [];
    for (let i = 1; i < positions.length; i++) {
        const prev = positions[i - 1];
        const curr = positions[i];
        const diff: Vec3 = [curr[0] - prev[0], curr[1] - prev[1], curr[2] - prev[2]];
        const dist = Math.abs(dot3(diff, normal));
        if (Number.isFinite(dist) && dist > 0) deltas.push(dist);
    }
    if (!deltas.length) return fallback || 1.0;
    return deltas.reduce((a, b) => a + b, 0) / deltas.length;
}

export function buildCtVolumeFromSeries(series: CtSeries): Volume {
    sortSlicesByPosition(series);
    const slices = series.slices;
    const first = slices[0].dataSet;
    const patientPosition = (getTagString(first, 'x00185100') || '').trim().toUpperCase();

    const width = getTagUint16(first, 'x00280011') || 512;
    const height = getTagUint16(first, 'x00280010') || 512;
    const ps = parsePixelSpacing(first);
    const rowSpacing = ps[0] || 1;
    const colSpacing = ps[1] || 1;

    // Recalculate orientation from sorted slices to be sure
    const iop = parseImageOrientation(first);
    const rowCos = norm3(iop.slice(0, 3) as Vec3);
    const colCos = norm3(iop.slice(3, 6) as Vec3);
    const normal = norm3(cross3(rowCos, colCos));

    const positions = slices.map((s) => parseImagePosition(s.dataSet));
    const sliceThickness = getTagFloat(first, 'x00180050') || 1.0;
    const sliceSpacing = computeSliceSpacing(positions, normal, sliceThickness);

    const slope = getTagFloat(first, 'x00281053') ?? 1;
    const intercept = getTagFloat(first, 'x00281052') ?? 0;

    const scalars = new Float32Array(width * height * slices.length);
    let offset = 0;
    for (const s of slices) {
        const ds = s.dataSet;
        const elem = ds.elements?.x7fe00010;
        if (!elem) {
            offset += width * height;
            continue;
        }
        // Access raw bytes
        const raw = new Int16Array(s.arrayBuffer, elem.dataOffset, elem.length / 2);
        const len = Math.min(raw.length, width * height);
        for (let i = 0; i < len; i++) scalars[offset + i] = raw[i] * slope + intercept;
        offset += width * height;
    }

    return {
        slices,
        width,
        height,
        depth: slices.length,
        rowSpacing,
        colSpacing,
        sliceSpacing,
        rowCos,
        colCos,
        normal,
        origin: positions[0],
        positions,
        slope,
        intercept,
        scalars,
        forUID: series.forUID,
        patientPosition
    };
}
