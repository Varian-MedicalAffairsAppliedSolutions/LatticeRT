import { isUvwInsideStructure } from '../geometry/analysis';
import type { LayeredCakeStructure } from '../geometry/layeredCake';
import { add3, mul3, type Vec3 } from '../math';

export function fibonacciSphereDirs(n: number): Vec3[] {
    const dirs: Vec3[] = [];
    const m = Math.max(8, Math.floor(n || 64));
    const phi = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < m; i++) {
        const y = 1 - (i / (m - 1)) * 2;
        const r = Math.sqrt(Math.max(0, 1 - y * y));
        const theta = phi * i;
        const x = Math.cos(theta) * r;
        const z = Math.sin(theta) * r;
        dirs.push([x, y, z]);
    }
    return dirs;
}

export function sphereFullyInsideUvw(struct: LayeredCakeStructure, centerUvw: Vec3, radiusMm: number): boolean {
    const dirs = fibonacciSphereDirs(64);
    const eps = 0.25; // mm inward bias
    const rEff = Math.max(0, radiusMm - eps);
    for (const d of dirs) {
        const p = add3(centerUvw, mul3(d, rEff));
        if (!isUvwInsideStructure(struct, p)) return false;
    }
    return true;
}

export function meanPoint(points: Vec3[]): Vec3 | null {
    if (!points.length) return null;
    let sx = 0, sy = 0, sz = 0;
    for (const p of points) {
        sx += p[0];
        sy += p[1];
        sz += p[2];
    }
    return [sx / points.length, sy / points.length, sz / points.length];
}
