import type { Sphere, Volume } from '../../types';
import { patientToUvw } from '../geometry/coords';
import { edt3dSquaredFromMask } from '../math/dt';
import { clamp } from '../math';

export function computeSupportRingMasksFromSpheres(
    volume: Volume,
    spheres: Sphere[],
    innerMm: number,
    midMm: number,
    outerMm: number
) {
    const inner = Math.max(0, innerMm || 0);
    const mid = Math.max(0, midMm || 0);
    const outer = Math.max(0, outerMm || 0);
    const dist1 = inner;
    const dist2 = inner + mid;
    const dist3 = inner + mid + outer;
    if (dist3 <= 0) return null;

    const peaks = spheres.filter(s => s.kind === 'peak');
    if (!peaks.length) return null;

    // Pad by max distance
    const baseInfo = computeSphereUnionBaseMaskBox(volume, peaks, dist3);
    if (!baseInfo) return null;
    const { base, box } = baseInfo;

    const dt = edt3dSquaredFromMask(
        base,
        box.bx, box.by, box.bz,
        volume.colSpacing, volume.rowSpacing, volume.sliceSpacing
    );
    if (!dt) return null;

    const n = base.length;
    const t1 = dist1 * dist1;
    const t2 = dist2 * dist2;
    const t3 = dist3 * dist3;
    const innerMask = new Uint8Array(n);
    const midMask = new Uint8Array(n);
    const outerMask = new Uint8Array(n);

    let cntInner = 0;
    let cntMid = 0;
    let cntOuter = 0;

    for (let i = 0; i < n; i++) {
        if (base[i]) continue; // Exclude inside spheres
        const d2 = dt[i];
        if (d2 <= t1 + 1e-6) {
            innerMask[i] = 1;
            cntInner++;
        } else if (d2 <= t2 + 1e-6) {
            midMask[i] = 1;
            cntMid++;
        } else if (d2 <= t3 + 1e-6) {
            outerMask[i] = 1;
            cntOuter++;
        }
    }

    const voxelMm3 = volume.rowSpacing * volume.colSpacing * volume.sliceSpacing;
    const volumesCc = {
        inner: (cntInner * voxelMm3) / 1000,
        mid: (cntMid * voxelMm3) / 1000,
        outer: (cntOuter * voxelMm3) / 1000,
    };

    return { box, inner: innerMask, mid: midMask, outer: outerMask, volumesCc };
}

function computeSphereUnionBaseMaskBox(volume: Volume, peaks: Sphere[], distMaxMm: number) {
    const rows = volume.height;
    const cols = volume.width;
    const depth = volume.depth;
    if (!rows || !cols || !depth) return null;

    const originUvw = patientToUvw(volume.origin, volume);
    const cs = volume.colSpacing;
    const rs = volume.rowSpacing;
    const zs = volume.sliceSpacing;
    const padMm = Math.max(0, distMaxMm || 0);

    let cMin = Infinity, cMax = -Infinity;
    let rMin = Infinity, rMax = -Infinity;
    let kMin = Infinity, kMax = -Infinity;

    // Convert all centers to relative grid coordinates
    const centers: { c: number, r: number, k: number, rMm: number }[] = [];

    for (const s of peaks) {
        const uvw = patientToUvw(s.center, volume);
        const uRel = uvw[0] - originUvw[0];
        const vRel = uvw[1] - originUvw[1];
        const wRel = uvw[2] - originUvw[2];
        const c0 = uRel / cs;
        const r0 = vRel / rs;
        const k0 = wRel / zs;
        const rMm = Math.max(0, s.r);
        centers.push({ c: c0, r: r0, k: k0, rMm });

        const radC = (rMm + padMm) / cs;
        const radR = (rMm + padMm) / rs;
        const radK = (rMm + padMm) / zs;
        cMin = Math.min(cMin, c0 - radC);
        cMax = Math.max(cMax, c0 + radC);
        rMin = Math.min(rMin, r0 - radR);
        rMax = Math.max(rMax, r0 + radR);
        kMin = Math.min(kMin, k0 - radK);
        kMax = Math.max(kMax, k0 + radK);
    }

    const c0 = clamp(Math.floor(cMin) - 2, 0, cols - 1);
    const c1 = clamp(Math.ceil(cMax) + 2, 0, cols - 1);
    const r0 = clamp(Math.floor(rMin) - 2, 0, rows - 1);
    const r1 = clamp(Math.ceil(rMax) + 2, 0, rows - 1);
    const k0 = clamp(Math.floor(kMin) - 1, 0, depth - 1);
    const k1 = clamp(Math.ceil(kMax) + 1, 0, depth - 1);

    const bx = (c1 - c0 + 1) | 0;
    const by = (r1 - r0 + 1) | 0;
    const bz = (k1 - k0 + 1) | 0;
    if (bx <= 0 || by <= 0 || bz <= 0) return null;

    const n = bx * by * bz;
    const base = new Uint8Array(n);
    const idx3 = (x: number, y: number, z: number) => x + bx * (y + by * z);

    // Rasterize spheres
    for (const s of centers) {
        const rMm = s.rMm;
        if (rMm <= 0) continue;
        const radC = rMm / cs;
        const radR = rMm / rs;
        const radK = rMm / zs;

        const x0 = clamp(Math.floor(s.c - radC) - c0 - 1, 0, bx - 1);
        const x1 = clamp(Math.ceil(s.c + radC) - c0 + 1, 0, bx - 1);
        const y0 = clamp(Math.floor(s.r - radR) - r0 - 1, 0, by - 1);
        const y1 = clamp(Math.ceil(s.r + radR) - r0 + 1, 0, by - 1);
        const z0 = clamp(Math.floor(s.k - radK) - k0 - 1, 0, bz - 1);
        const z1 = clamp(Math.ceil(s.k + radK) - k0 + 1, 0, bz - 1);

        const r2 = rMm * rMm;
        for (let z = z0; z <= z1; z++) {
            const dk = (k0 + z) - s.k;
            const dz = dk * zs;
            const dz2 = dz * dz;
            if (dz2 > r2) continue;
            for (let y = y0; y <= y1; y++) {
                const dr = (r0 + y) - s.r;
                const dy = dr * rs;
                const dy2 = dy * dy;
                if (dy2 + dz2 > r2) continue;
                for (let x = x0; x <= x1; x++) {
                    const dc = (c0 + x) - s.c;
                    const dx = dc * cs;
                    const d2 = dx * dx + dy2 + dz2;
                    if (d2 <= r2) base[idx3(x, y, z)] = 1;
                }
            }
        }
    }

    return { base, box: { r0, c0, k0, bx, by, bz } };
}
