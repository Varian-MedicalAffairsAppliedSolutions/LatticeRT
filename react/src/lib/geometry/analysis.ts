import type { LayeredCakeStructure, CakeLayer } from './layeredCake';
import { add3, mul3, type Vec3 } from '../math';

export interface VolumeOrientation {
    rowCos: Vec3;
    colCos: Vec3;
    normal: Vec3;
}

export interface Bounds3D {
    uMin: number;
    uMax: number;
    vMin: number;
    vMax: number;
    wMin: number;
    wMax: number;
}

export function findLayerForW(struct: LayeredCakeStructure, w: number): CakeLayer | null {
    const layers = struct?.layers || [];
    if (!layers.length) return null;
    // Binary search could be better but linear is fine for small N or assumption of sorted
    // Original code used binary search.
    let lo = 0;
    let hi = layers.length - 1;
    while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        const z = layers[mid].zCenter;
        if (z < w) lo = mid + 1;
        else hi = mid - 1;
    }
    const candidates: CakeLayer[] = [];
    if (lo < layers.length) candidates.push(layers[lo]);
    if (lo - 1 >= 0) candidates.push(layers[lo - 1]);

    let best: CakeLayer | null = null;
    let bestDist = Infinity;
    for (const l of candidates) {
        const half = (l.thickness || 1) / 2;
        const dist = Math.abs(w - l.zCenter);
        // 1e-3 epsilon for float comparison
        if (dist <= half + 1e-3 && dist < bestDist) {
            best = l;
            bestDist = dist;
        }
    }
    return best;
}

export function pointInLoop2D(pt: number[], loop: number[][]): boolean {
    let inside = false;
    const x = pt[0];
    const y = pt[1];
    for (let i = 0, j = loop.length - 1; i < loop.length; j = i++) {
        const xi = loop[i][0], yi = loop[i][1];
        const xj = loop[j][0], yj = loop[j][1];
        const intersect = (yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / ((yj - yi) || 1e-12) + xi;
        if (intersect) inside = !inside;
    }
    return inside;
}

export function isUvwInsideStructure(struct: LayeredCakeStructure, uvw: Vec3): boolean {
    if (!struct?.layers?.length) return false;
    const w = uvw[2];
    const layer = findLayerForW(struct, w);
    if (!layer) return false;
    const pt = [uvw[0], uvw[1]];
    for (const poly of layer.polygons || []) {
        if (!pointInLoop2D(pt, poly.outer || [])) continue;
        let inHole = false;
        for (const hole of poly.holes || []) {
            if (pointInLoop2D(pt, hole)) { inHole = true; break; }
        }
        if (!inHole) return true;
    }
    return false;
}

export function computeLayeredCakeBounds(struct: LayeredCakeStructure): Bounds3D | null {
    let uMin = Infinity, uMax = -Infinity;
    let vMin = Infinity, vMax = -Infinity;
    let wMin = Infinity, wMax = -Infinity;

    const layers = struct?.layers || [];
    if (!layers.length) return null;

    for (const layer of layers) {
        const half = (layer.thickness || 0) / 2;
        wMin = Math.min(wMin, layer.zCenter - half);
        wMax = Math.max(wMax, layer.zCenter + half);
        for (const poly of layer.polygons || []) {
            for (const p of poly.outer || []) {
                if (!p) continue;
                uMin = Math.min(uMin, p[0]);
                uMax = Math.max(uMax, p[0]);
                vMin = Math.min(vMin, p[1]);
                vMax = Math.max(vMax, p[1]);
            }
        }
    }
    if (!Number.isFinite(uMin)) return null;
    return { uMin, uMax, vMin, vMax, wMin, wMax };
}

function polygonCentroid(loop: number[][]): { x: number; y: number; area: number } {
    if (!Array.isArray(loop) || loop.length < 3) return { x: 0, y: 0, area: 0 };
    const n = loop.length;
    let A = 0;
    let Cx = 0;
    let Cy = 0;
    for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        const xi = loop[i][0], yi = loop[i][1];
        const xj = loop[j][0], yj = loop[j][1];
        const cross = xi * yj - xj * yi;
        A += cross;
        Cx += (xi + xj) * cross;
        Cy += (yi + yj) * cross;
    }
    A *= 0.5;
    const denom = 6 * (A || 1e-12);
    return { x: Cx / denom, y: Cy / denom, area: A };
}

export function computeLayeredCakeCentroid(struct: LayeredCakeStructure, orientation: VolumeOrientation): { u: number; v: number; w: number; patient: Vec3; vol: number } | null {
    if (!struct?.layers?.length) return null;
    let vol = 0;
    let sumU = 0;
    let sumV = 0;
    let sumW = 0;
    for (const layer of struct.layers) {
        const th = layer.thickness || 0;
        for (const poly of layer.polygons || []) {
            const out = polygonCentroid(poly.outer);
            const holeStats = (poly.holes || []).map((h) => polygonCentroid(h));
            const aOuter = out.area;
            let aEff = aOuter;
            let cu = out.x * aOuter;
            let cv = out.y * aOuter;
            for (const hs of holeStats) {
                aEff -= hs.area;
                cu -= hs.x * hs.area;
                cv -= hs.y * hs.area;
            }
            if (!Number.isFinite(aEff) || Math.abs(aEff) < 1e-6) continue;
            const areaAbs = Math.abs(aEff);
            const uCent = cu / aEff;
            const vCent = cv / aEff;
            const dV = areaAbs * th;
            vol += dV;
            sumU += uCent * dV;
            sumV += vCent * dV;
            sumW += layer.zCenter * dV;
        }
    }
    if (vol <= 0) return null;
    const u = sumU / vol;
    const v = sumV / vol;
    const w = sumW / vol;
    const p = add3(add3(mul3(orientation.rowCos, u), mul3(orientation.colCos, v)), mul3(orientation.normal, w));
    return { u, v, w, patient: p, vol };
}
