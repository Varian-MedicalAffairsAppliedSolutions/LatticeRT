import type { Vec3 } from './lib/math';

export interface CtSlice {
    file: File;
    arrayBuffer: ArrayBuffer;
    dataSet: any; // dicomParser dataset
    seriesUID: string;
    seriesDesc: string;
    sopUID: string;
    forUID: string;
    inst: number;
    ipp: Vec3;
    iop: number[]; // 6 numbers
    ps: [number, number];
    rows: number;
    cols: number;
    normal: Vec3;
    z: number;
    _w?: number; // projected position for sorting
}

export interface Volume {
    slices: CtSlice[];
    width: number;
    height: number;
    depth: number;
    rowSpacing: number;
    colSpacing: number;
    sliceSpacing: number;
    rowCos: Vec3;
    colCos: Vec3;
    normal: Vec3;
    origin: Vec3;
    positions: Vec3[];
    slope: number;
    intercept: number;
    scalars: Float32Array;
    forUID: string;
    patientPosition: string;
}

export interface CtSeries {
    seriesUID: string;
    desc: string;
    forUID: string;
    slices: CtSlice[];
    _rowCos?: Vec3;
    _colCos?: Vec3;
    _normal?: Vec3;
}

export interface RtStructFile {
    file: File;
    arrayBuffer: ArrayBuffer;
    dataSet: any;
    refSeriesUID: string | null;
    forUID: string | null;
}

export type SphereKind = 'peak' | 'warm' | 'cold';

export interface Sphere {
    id: number;
    center: Vec3;
    r: number;
    kind: SphereKind;
}

export interface LatticeState {
    spheres: Sphere[];
    mode: string;
    roiName: string;
    minCtcPairPeaks: { idA: number | null; idB: number | null; dMm: number } | null;
    minCtcPairAll: { idA: number | null; idB: number | null; dMm: number } | null;
}

export interface SupportState {
    box: { r0: number, c0: number, k0: number, bx: number, by: number, bz: number } | null;
    inner: Uint8Array | null;
    mid: Uint8Array | null;
    outer: Uint8Array | null;
    volumesCc: { inner: number, mid: number, outer: number } | null;
}

export interface ViewState {
    k: number;
    row: number;
    col: number;
    zoomAxial: number;
    zoomCoronal: number;
    zoomSagittal: number;
    panAxial: { x: number; y: number };
    panCoronal: { x: number; y: number };
    panSagittal: { x: number; y: number };
    wlCenter: number;
    wlWidth: number;
}
