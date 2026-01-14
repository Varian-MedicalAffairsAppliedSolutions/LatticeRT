import type { Sphere } from '../../types';

export function splitSpheresByKind(spheres: Sphere[] | null) {
    const peak: Sphere[] = [];
    const warm: Sphere[] = [];
    const cold: Sphere[] = [];
    for (const s of spheres || []) {
        const kind = s.kind === 'cold' ? 'cold' : (s.kind === 'warm' ? 'warm' : 'peak');
        if (kind === 'cold') cold.push(s);
        else if (kind === 'warm') warm.push(s);
        else peak.push(s);
    }
    return { peak, warm, cold };
}

export function computeMinCtcPair(spheres: Sphere[] | null): { idA: number | null, idB: number | null, dMm: number } | null {
    const list = Array.isArray(spheres) ? spheres : [];
    if (list.length < 2) return null;

    // Avoid O(n^2) if extreme; fall back to first 2000.
    const maxN = 2000;
    const n = Math.min(list.length, maxN);
    let best = Infinity;
    let idA: number | null = null;
    let idB: number | null = null;

    for (let i = 0; i < n; i++) {
        const a = list[i];
        const ca = a.center;
        if (!ca || ca.length < 3) continue;
        for (let j = i + 1; j < n; j++) {
            const b = list[j];
            const cb = b.center;
            if (!cb || cb.length < 3) continue;
            const d = Math.hypot(ca[0] - cb[0], ca[1] - cb[1], ca[2] - cb[2]);
            if (d < best) {
                best = d;
                idA = a.id;
                idB = b.id;
            }
        }
    }
    return Number.isFinite(best) ? { idA, idB, dMm: best } : null;
}

export function computeMinCtcPairPeaks(spheres: Sphere[] | null) {
    const { peak } = splitSpheresByKind(spheres);
    return computeMinCtcPair(peak);
}
