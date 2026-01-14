import { add3, dot3, mul3, type Vec3 } from '../math';

export function maskToEdgeLoops(mask: Uint8Array, rows: number, cols: number): number[][][] {
    if (!mask) return [];

    // Edges graph: start "x,y" -> list of end "x,y"
    // Using simple encoding for key: y*cols + x? No, vertices are between pixels.
    // Pixel (c,r). Vertices are intersections.
    // Vertex (x,y) can range 0..cols, 0..rows.
    const edges = new Map<string, string[]>();
    const used = new Set<string>(); // "k0|k1"

    const key = (x: number, y: number) => `${x},${y}`;

    const pushEdge = (x0: number, y0: number, x1: number, y1: number) => {
        const k0 = key(x0, y0);
        const k1 = key(x1, y1);
        if (!edges.has(k0)) edges.set(k0, []);
        edges.get(k0)!.push(k1);
        used.add(`${k0}|${k1}`);
    };

    const at = (r: number, c: number) => (r >= 0 && r < rows && c >= 0 && c < cols) ? mask[r * cols + c] : 0;

    for (let r = 0; r < rows; r++) {
        const off = r * cols;
        for (let c = 0; c < cols; c++) {
            if (!mask[off + c]) continue;
            // Scan 4 neighbors. If neighbor is 0, add edge.
            // Edge direction follows right-hand rule (CW around 1s).
            // Top (r-1): if 0, edge (c, r) -> (c+1, r)
            if (!at(r - 1, c)) pushEdge(c, r, c + 1, r);
            // Right (c+1): if 0, edge (c+1, r) -> (c+1, r+1)
            if (!at(r, c + 1)) pushEdge(c + 1, r, c + 1, r + 1);
            // Bottom (r+1): if 0, edge (c+1, r+1) -> (c, r+1)
            if (!at(r + 1, c)) pushEdge(c + 1, r + 1, c, r + 1);
            // Left (c-1): if 0, edge (c, r+1) -> (c, r)
            if (!at(r, c - 1)) pushEdge(c, r + 1, c, r);
        }
    }

    const edgeUnused = new Set(used);
    const loops: number[][][] = [];

    for (const edgeKey of used) {
        if (!edgeUnused.has(edgeKey)) continue;
        const parts = edgeKey.split('|');
        const kStart = parts[0];
        const kNext = parts[1];

        // Traverse loop
        const loop: number[][] = [];
        let currK = kStart;
        let nextK = kNext;
        edgeUnused.delete(edgeKey);

        loop.push(parseKey(currK));

        let guard = 0;
        while (nextK !== kStart && guard++ < 200000) {
            loop.push(parseKey(nextK));
            const outs = edges.get(nextK);
            if (!outs || !outs.length) break;

            let found = null;
            for (const cand of outs) {
                const ek = `${nextK}|${cand}`;
                if (edgeUnused.has(ek)) {
                    found = cand;
                    edgeUnused.delete(ek);
                    break;
                }
            }
            if (!found) break;
            currK = nextK;
            nextK = found;
        }

        if (nextK === kStart && loop.length >= 4) {
            loops.push(loop);
        }
    }

    return loops;
}

function parseKey(k: string): number[] {
    const p = k.split(',');
    return [parseInt(p[0], 10), parseInt(p[1], 10)];
}

export function simplifyGridLoop(loop: number[][]) {
    if (!Array.isArray(loop) || loop.length < 4) return loop;
    const out: number[][] = [];
    const n = loop.length;
    for (let i = 0; i < n; i++) {
        const prev = loop[(i - 1 + n) % n];
        const curr = loop[i];
        const next = loop[(i + 1) % n];
        const dx1 = Math.sign(curr[0] - prev[0]);
        const dy1 = Math.sign(curr[1] - prev[1]);
        const dx2 = Math.sign(next[0] - curr[0]);
        const dy2 = Math.sign(next[1] - curr[1]);
        if (dx1 === dx2 && dy1 === dy2) continue;
        out.push(curr);
    }
    // Subsample if too large (DICOM limits)
    if (out.length > 4000) {
        const step = Math.ceil(out.length / 4000);
        const slim = [];
        for (let i = 0; i < out.length; i += step) slim.push(out[i]);
        return slim.length >= 4 ? slim : out;
    }
    return out.length >= 4 ? out : loop;
}

export function makeCircleContourPoints(
    center: Vec3,
    radiusMm: number,
    wSlice: number,
    normal: Vec3,
    rowCos: Vec3,
    colCos: Vec3,
    segCount: number
): Vec3[] | null {
    const wc = dot3(center, normal);
    const dz = wSlice - wc;
    if (Math.abs(dz) > radiusMm) return null;

    const rz = Math.sqrt(Math.max(0, radiusMm * radiusMm - dz * dz));
    const centerProj = add3(center, mul3(normal, dz));
    const pts: Vec3[] = [];
    const n = Math.max(12, segCount | 0);
    const inc = (Math.PI * 2) / n;

    for (let i = 0; i < n; i++) {
        const t = i * inc;
        const a = Math.cos(t) * rz;
        const b = Math.sin(t) * rz;
        // p = centerProj + rowCos*a + colCos*b
        const p = add3(add3(centerProj, mul3(rowCos, a)), mul3(colCos, b));
        pts.push(p);
    }
    // Close loop? DICOM usually implies closed if ContourGeometricType is CLOSED_PLANAR.
    // Repeating first point is explicitly required by some parsers, 
    // but dcmjs might handle it. 
    // Legacy implementation repeats it.
    pts.push(pts[0]);
    return pts;
}
