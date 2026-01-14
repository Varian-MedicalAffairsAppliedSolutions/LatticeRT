import { type Bounds3D, isUvwInsideStructure } from '../geometry/analysis';
import type { LayeredCakeStructure } from '../geometry/layeredCake';
import { add3, mul3, type Vec3 } from '../math';

export type PatternType = 'hcp' | 'sc' | 'ac' | 'cvt3d';
export type LatticeMode = 'peaks' | 'peaks_cold' | 'peaks_warm_cold';

export interface LatticeParams {
    pattern: PatternType;
    spacing: number;
    bounds: Bounds3D;
}

export function generateLatticeCenters({ pattern, spacing, bounds }: LatticeParams): Vec3[] {
    const centers: Vec3[] = [];
    const uSpan = bounds.uMax - bounds.uMin;
    const vSpan = bounds.vMax - bounds.vMin;
    const wSpan = bounds.wMax - bounds.wMin;

    if (pattern === 'hcp') {
        const ipA = spacing;
        const c = Math.sqrt(8 / 3) * ipA;
        const a1: Vec3 = [ipA, 0, 0];
        const a2: Vec3 = [-0.5 * ipA, (Math.sqrt(3) / 2) * ipA, 0];
        const a3: Vec3 = [0, 0, c];
        const atomFrac: Vec3[] = [
            [0, 0, 0],
            [1 / 3, 2 / 3, 0.5],
        ];
        const fracToCart = (f: Vec3) => add3(add3(mul3(a1, f[0]), mul3(a2, f[1])), mul3(a3, f[2]));

        const nx = Math.ceil(uSpan / ipA) + 3;
        const ny = Math.ceil(vSpan / ((Math.sqrt(3) / 2) * ipA)) + 3;
        const nz = Math.ceil(wSpan / c) + 3;

        const origin: Vec3 = [bounds.uMin - ipA, bounds.vMin - ipA, bounds.wMin - c];

        for (let i = 0; i < nx; i++) {
            for (let j = 0; j < ny; j++) {
                for (let k = 0; k < nz; k++) {
                    const cellShift = add3(add3(add3(origin, mul3(a1, i)), mul3(a2, j)), mul3(a3, k));
                    for (const f of atomFrac) {
                        const p = add3(cellShift, fracToCart(f));
                        centers.push(p);
                    }
                }
            }
        }
        return centers;
    }

    const acScale = pattern === 'ac' ? (1 / Math.sqrt(2)) : 1;
    const stepU = spacing * acScale;
    const stepV = spacing * acScale;
    const stepW = spacing * acScale;

    const nu = Math.ceil(uSpan / stepU) + 3;
    const nv = Math.ceil(vSpan / stepV) + 3;
    const nw = Math.ceil(wSpan / stepW) + 3;

    const u0 = bounds.uMin - stepU;
    const v0 = bounds.vMin - stepV;
    const w0 = bounds.wMin - stepW;

    for (let iu = 0; iu < nu; iu++) {
        for (let iv = 0; iv < nv; iv++) {
            for (let iw = 0; iw < nw; iw++) {
                if (pattern === 'ac') {
                    if ((iu + iv + iw) % 2 !== 0) continue;
                }
                centers.push([u0 + iu * stepU, v0 + iv * stepV, w0 + iw * stepW]);
            }
        }
    }
    return centers;
}

export function generateCvt3dCentersUvw({ targetStruct, bounds, spacing, maxIters = 15, samplesPerIter = 3500 }: { targetStruct: LayeredCakeStructure, bounds: Bounds3D, spacing: number, maxIters?: number, samplesPerIter?: number }): Vec3[] {
    const init = generateLatticeCenters({ pattern: 'hcp', spacing, bounds });
    let gens = init.filter((uvw) => isUvwInsideStructure(targetStruct, uvw));
    if (!gens.length) return [];

    const rnd = (a: number, b: number) => a + Math.random() * (b - a);
    const sampleInside = (): Vec3 | null => {
        for (let tries = 0; tries < 20000; tries++) {
            const u = rnd(bounds.uMin, bounds.uMax);
            const v = rnd(bounds.vMin, bounds.vMax);
            const w = rnd(bounds.wMin, bounds.wMax);
            const p: Vec3 = [u, v, w];
            if (isUvwInsideStructure(targetStruct, p)) return p;
        }
        return null;
    };

    const k = gens.length;
    const m = Math.max(1500, Math.floor(samplesPerIter));

    const distance = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

    for (let iter = 0; iter < maxIters; iter++) {
        const sumU = new Float64Array(k);
        const sumV = new Float64Array(k);
        const sumW = new Float64Array(k);
        const cnt = new Uint32Array(k);

        for (let s = 0; s < m; s++) {
            const p = sampleInside();
            if (!p) continue;
            let best = 0;
            let bestD = Infinity;
            for (let i = 0; i < k; i++) {
                const g = gens[i];
                const du = p[0] - g[0];
                const dv = p[1] - g[1];
                const dw = p[2] - g[2];
                const d2 = du * du + dv * dv + dw * dw;
                if (d2 < bestD) { bestD = d2; best = i; }
            }
            sumU[best] += p[0];
            sumV[best] += p[1];
            sumW[best] += p[2];
            cnt[best] += 1;
        }

        let avgMove = 0;
        for (let i = 0; i < k; i++) {
            if (!cnt[i]) continue;
            const nu = sumU[i] / cnt[i];
            const nv = sumV[i] / cnt[i];
            const nw = sumW[i] / cnt[i];
            const old = gens[i];
            const moved: Vec3 = [nu, nv, nw];

            if (!isUvwInsideStructure(targetStruct, moved)) {
                let ok = false;
                for (let j = 0; j < 40; j++) {
                    const jitter = spacing * 0.15;
                    const cand: Vec3 = [nu + rnd(-jitter, jitter), nv + rnd(-jitter, jitter), nw + rnd(-jitter, jitter)];
                    if (isUvwInsideStructure(targetStruct, cand)) {
                        moved[0] = cand[0]; moved[1] = cand[1]; moved[2] = cand[2];
                        ok = true;
                        break;
                    }
                }
                if (!ok) continue;
            }
            avgMove += distance(old, moved);
            gens[i] = moved;
        }
        avgMove /= Math.max(1, k);
        if (avgMove < 0.25) break;
    }

    // Enforce minimum spacing
    const kept: Vec3[] = [];
    const minD = Math.max(spacing, 0.1);
    for (const g of gens) {
        let ok = true;
        for (let i = 0; i < kept.length; i++) {
            if (distance(g, kept[i]) < minD) { ok = false; break; }
        }
        if (ok) kept.push(g);
    }
    return kept;
}

export function generateHcpValleyCentersUvw({ spacing, bounds }: { spacing: number; bounds: Bounds3D }): { warm: Vec3[]; cold: Vec3[] } {
    const ipA = spacing;
    const c = Math.sqrt(8 / 3) * ipA;
    const a1: Vec3 = [ipA, 0, 0];
    const a2: Vec3 = [-0.5 * ipA, (Math.sqrt(3) / 2) * ipA, 0];
    const a3: Vec3 = [0, 0, c];

    const uSpan = bounds.uMax - bounds.uMin;
    const vSpan = bounds.vMax - bounds.vMin;
    const wSpan = bounds.wMax - bounds.wMin;
    const nx = Math.ceil(uSpan / ipA) + 3;
    const ny = Math.ceil(vSpan / ((Math.sqrt(3) / 2) * ipA)) + 3;
    const nz = Math.ceil(wSpan / c) + 3;

    const origin: Vec3 = [bounds.uMin - ipA, bounds.vMin - ipA, bounds.wMin - c];

    const warm: Vec3[] = [];
    const cold: Vec3[] = [];

    const warmOff1 = mul3(add3(mul3(a1, 2), a2), 1 / 3);
    const warmOff2 = mul3(add3(a1, mul3(a2, 2)), 1 / 3);
    const bOff = warmOff2;

    const octaPlanar = warmOff1;
    const octaZ1 = mul3(a3, 0.25);
    const octaZ2 = mul3(a3, 0.75);

    for (let i = 0; i < nx; i++) {
        for (let j = 0; j < ny; j++) {
            for (let k = 0; k < nz; k++) {
                const cellShift = add3(add3(add3(origin, mul3(a1, i)), mul3(a2, j)), mul3(a3, k));

                warm.push(add3(cellShift, warmOff1));
                warm.push(add3(cellShift, warmOff2));

                const bShift = add3(add3(cellShift, bOff), mul3(a3, 0.5));
                warm.push(add3(bShift, warmOff1));
                warm.push(add3(bShift, warmOff2));

                cold.push(add3(add3(cellShift, octaPlanar), octaZ1));
                cold.push(add3(add3(cellShift, octaPlanar), octaZ2));
            }
        }
    }

    return { warm, cold };
}

function collectMidpointsNearDistanceUvw(points: Vec3[], targetD: number, tol: number, maxPairs = 300000): Vec3[] {
    const pts = points || [];
    if (pts.length < 2) return [];
    const d0 = Math.max(1e-6, Number(targetD) || 0);
    const t = Math.max(0, Number(tol) || 0);
    if (!(d0 > 0)) return [];
    const cell = d0;

    const keyOf = (p: Vec3) => {
        const ix = Math.floor(p[0] / cell);
        const iy = Math.floor(p[1] / cell);
        const iz = Math.floor(p[2] / cell);
        return `${ix},${iy},${iz}`;
    };

    const grid = new Map<string, number[]>();
    for (let i = 0; i < pts.length; i++) {
        const p = pts[i];
        if (!p) continue;
        const k = keyOf(p);
        if (!grid.has(k)) grid.set(k, []);
        grid.get(k)!.push(i);
    }

    const out: Vec3[] = [];
    const reach = Math.max(1, Math.ceil((d0 + t) / cell));
    let pairs = 0;

    for (let i = 0; i < pts.length; i++) {
        const a = pts[i];
        if (!a) continue;
        const ix = Math.floor(a[0] / cell);
        const iy = Math.floor(a[1] / cell);
        const iz = Math.floor(a[2] / cell);

        for (let dx = -reach; dx <= reach; dx++) {
            for (let dy = -reach; dy <= reach; dy++) {
                for (let dz = -reach; dz <= reach; dz++) {
                    const arr = grid.get(`${ix + dx},${iy + dy},${iz + dz}`);
                    if (!arr) continue;
                    for (const j of arr) {
                        if (j <= i) continue;
                        const b = pts[j];
                        if (!b) continue;
                        const d = Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
                        if (Math.abs(d - d0) > t) continue;
                        out.push([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2]);
                        pairs++;
                        if (pairs >= maxPairs) return out;
                    }
                }
            }
        }
    }
    return out;
}

export function generateAcValleyCentersUvw({ peakCentersUvw, spacing }: { peakCentersUvw: Vec3[], spacing: number }): { warm: Vec3[], cold: Vec3[] } {
    const peaks = peakCentersUvw || [];
    const s = Math.max(0, Number(spacing) || 0);
    if (!peaks.length || !s) return { warm: [], cold: [] };

    const dShort = s;
    const dLong = Math.SQRT2 * s;
    const tolShort = Math.max(0.75, 0.08 * s);
    const tolLong = Math.max(1.0, 0.10 * s);

    const warm = collectMidpointsNearDistanceUvw(peaks, dShort, tolShort);
    const cold = collectMidpointsNearDistanceUvw(peaks, dLong, tolLong);
    return { warm, cold };
}

export function dedupPointsGrid(points: Vec3[], minD: number): Vec3[] {
    const pts = points || [];
    const d = Math.max(1e-6, Number(minD) || 0);
    if (pts.length <= 1 || d <= 0) return pts.slice();
    const cell = d;
    const grid = new Map<string, number[]>();
    const uniq: Vec3[] = [];

    const keyOf = (p: Vec3) => {
        const ix = Math.floor(p[0] / cell);
        const iy = Math.floor(p[1] / cell);
        const iz = Math.floor(p[2] / cell);
        return `${ix},${iy},${iz}`;
    };

    const distance = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

    for (const p of pts) {
        if (!p) continue;
        const ix = Math.floor(p[0] / cell);
        const iy = Math.floor(p[1] / cell);
        const iz = Math.floor(p[2] / cell);
        let ok = true;
        for (let dx = -1; dx <= 1 && ok; dx++) {
            for (let dy = -1; dy <= 1 && ok; dy++) {
                for (let dz = -1; dz <= 1 && ok; dz++) {
                    const key = `${ix + dx},${iy + dy},${iz + dz}`;
                    const arr = grid.get(key);
                    if (!arr) continue;
                    for (const j of arr) {
                        if (distance(p, uniq[j]) < d) { ok = false; break; }
                    }
                }
            }
        }
        if (!ok) continue;
        const idx = uniq.length;
        uniq.push(p);
        const key = keyOf(p);
        if (!grid.has(key)) grid.set(key, []);
        grid.get(key)!.push(idx);
    }
    return uniq;
}
