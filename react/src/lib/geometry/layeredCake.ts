import earcut from 'earcut';
import { cross3, dot3, norm3, sub3, type Vec3 } from '../math';

// Type definitions for internal structures
export interface LayeredCakeStructure {
    roiNum: number;
    name: string;
    layers: CakeLayer[];
}

export interface CakeLayer {
    zCenter: number;
    thickness: number;
    polygons: CakePolygon[];
}

export interface CakePolygon {
    outer: number[][]; // [u, v] coordinates in mm
    holes: number[][][]; // Array of holes, each is [u, v] list
}

export interface MeshBuffers {
    positions: Float32Array;
    normals: Float32Array;
    indices: Uint32Array;
}

const EPS = 1e-6;

// --- Helper Functions ---

function polygonArea(loop: number[][]): number {
    let area = 0;
    for (let i = 0, j = loop.length - 1; i < loop.length; j = i++) {
        const xi = loop[i][0], yi = loop[i][1];
        const xj = loop[j][0], yj = loop[j][1];
        area += (xj - xi) * (yi + yj);
    }
    return area / 2;
}

function ensureOrientation(loop: number[][], ccw: boolean): number[][] {
    const a = polygonArea(loop);
    if ((ccw && a < 0) || (!ccw && a > 0)) loop.reverse();
    return loop;
}

function pointInPoly(pt: number[], loop: number[][]): boolean {
    let inside = false;
    for (let i = 0, j = loop.length - 1; i < loop.length; j = i++) {
        const xi = loop[i][0], yi = loop[i][1];
        const xj = loop[j][0], yj = loop[j][1];
        const intersect = ((yi > pt[1]) !== (yj > pt[1])) && (pt[0] < (xj - xi) * (pt[1] - yi) / (yj - yi + EPS) + xi);
        if (intersect) inside = !inside;
    }
    return inside;
}

function buildPolygonsWithHoles(loops: number[][][]): CakePolygon[] {
    if (!loops || !loops.length) return [];

    const closeLoop = (loop: number[][]) => {
        if (!loop || loop.length < 3) return loop || [];
        const first = loop[0];
        const last = loop[loop.length - 1];
        if (first && last && (Math.abs(first[0] - last[0]) > EPS || Math.abs(first[1] - last[1]) > EPS)) {
            return loop.concat([[first[0], first[1]]]);
        }
        return loop;
    };

    const loopBounds = (loop: number[][]) => {
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const p of loop) {
            if (!p) continue;
            const x = p[0], y = p[1];
            if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
            if (x < minX) minX = x;
            if (y < minY) minY = y;
            if (x > maxX) maxX = x;
            if (y > maxY) maxY = y;
        }
        if (!Number.isFinite(minX) || !Number.isFinite(minY)) return null;
        return { minX, minY, maxX, maxY };
    };

    const boundsContainPoint = (b: { minX: number; minY: number; maxX: number; maxY: number }, pt: number[]) => {
        if (!b || !pt) return false;
        const x = pt[0], y = pt[1];
        return x >= b.minX - EPS && x <= b.maxX + EPS && y >= b.minY - EPS && y <= b.maxY + EPS;
    };

    const entries = [];
    for (const raw of loops) {
        if (!raw || raw.length < 3) continue;
        const loop = closeLoop(raw.map(p => [Number(p[0]), Number(p[1])]).filter(p => Number.isFinite(p[0]) && Number.isFinite(p[1])));
        if (loop.length < 4) continue;
        const bounds = loopBounds(loop);
        if (!bounds) continue;
        const areaAbs = Math.abs(polygonArea(loop));
        if (!(areaAbs > EPS)) continue;
        entries.push({ loop, bounds, areaAbs });
    }
    if (!entries.length) return [];

    const parent = new Array(entries.length).fill(null);
    for (let i = 0; i < entries.length; i++) {
        const pt = entries[i].loop[0];
        let best = null;
        let bestArea = Infinity;
        for (let j = 0; j < entries.length; j++) {
            if (i === j) continue;
            if (!(entries[j].areaAbs > entries[i].areaAbs + EPS)) continue;
            if (!boundsContainPoint(entries[j].bounds, pt)) continue;
            if (pointInPoly(pt, entries[j].loop)) {
                if (entries[j].areaAbs < bestArea) {
                    bestArea = entries[j].areaAbs;
                    best = j;
                }
            }
        }
        parent[i] = best;
    }

    const depth = new Array(entries.length).fill(0);
    for (let i = 0; i < entries.length; i++) {
        let d = 0;
        let cur = parent[i];
        while (cur != null && d < 1000) {
            d++;
            cur = parent[cur];
        }
        depth[i] = d;
    }

    interface PolyBuilder {
        outer: number[][];
        holes: number[][][];
    }

    const polyByIdx = new Map<number, PolyBuilder>();
    for (let i = 0; i < entries.length; i++) {
        if (depth[i] % 2 !== 0) continue; // even depth = filled (outer)
        const outer = entries[i].loop.slice();
        ensureOrientation(outer, true);
        polyByIdx.set(i, { outer, holes: [] });
    }

    for (let i = 0; i < entries.length; i++) {
        if (depth[i] % 2 === 0) continue; // odd depth = hole
        const p = parent[i];
        if (p == null) continue;
        const container = polyByIdx.get(p);
        if (!container) continue;
        const hole = entries[i].loop.slice();
        ensureOrientation(hole, false);
        container.holes.push(hole);
    }

    return Array.from(polyByIdx.values());
}

function getTag(ds: any, tag: string, def: any = null): any {
    if (!ds) return def;
    if (Array.isArray(def) && typeof ds.string === 'function') {
        const s = ds.string(tag);
        if (s != null) return s.split('\\').map(Number);
        return def;
    }
    if (typeof ds.floatString === 'function') {
        const v = ds.floatString(tag);
        if (Number.isFinite(v)) return v;
    }
    if (typeof ds.string === 'function') {
        const s = ds.string(tag);
        if (s == null) return def;
        const n = Number(s);
        return Number.isFinite(n) ? n : s;
    }
    return def;
}

function extractCtSlices(ctDatasets: any[]) {
    const slices = [];
    for (const ds of ctDatasets || []) {
        const ipp = getTag(ds, 'x00200032', [0, 0, 0]).map(Number);
        const iop = getTag(ds, 'x00200037', [1, 0, 0, 0, 1, 0]).map(Number);
        const ps = getTag(ds, 'x00280030', [1, 1]).map(Number);
        const sop = typeof ds.string === 'function' ? ds.string('x00080018') || null : null;
        if (ipp.length === 3 && iop.length === 6 && ps.length === 2) {
            slices.push({ ipp, iop, ps, sop, normal: [0, 0, 1] as Vec3, z: 0 });
        }
    }
    if (!slices.length) return [];
    const r = norm3([slices[0].iop[0], slices[0].iop[1], slices[0].iop[2]] as Vec3);
    const c = norm3([slices[0].iop[3], slices[0].iop[4], slices[0].iop[5]] as Vec3);
    const n = norm3(cross3(r, c));
    slices.forEach(s => {
        s.normal = n;
        s.z = dot3(s.ipp as Vec3, n);
    });
    slices.sort((a, b) => a.z - b.z);
    return slices;
}

export function parseRtToLayeredCake(rtStructDataset: any, ctSeriesDatasets: any[]): LayeredCakeStructure[] {
    const slices = extractCtSlices(ctSeriesDatasets);
    const sopToSlice = new Map<string, number>();
    slices.forEach((s, idx) => { if (s.sop) sopToSlice.set(s.sop, idx); });

    const contours: { roiNum: number; name: string; sopUid: string | null; points: Vec3[] }[] = [];
    const roiSeq = rtStructDataset?.elements?.['x30060020'];
    const roiNameMap = new Map<number, string>();

    if (roiSeq?.items?.length) {
        for (const it of roiSeq.items) {
            const ds = it.dataSet;
            const num = parseInt(ds?.string?.call(ds, 'x30060022') || '0', 10) || 0;
            const name = ds?.string?.call(ds, 'x30060026') || `ROI ${num}`;
            roiNameMap.set(num, name);
        }
    }

    const contourSeq = rtStructDataset?.elements?.['x30060039'];
    if (!contourSeq?.items?.length) return [];

    const splitOnZeroTriplets = (nums: number[]) => {
        const segments = [];
        let seg = [];
        for (let i = 0; i + 2 < nums.length; i += 3) {
            const x = nums[i], y = nums[i + 1], z = nums[i + 2];
            if (x === 0 && y === 0 && z === 0) {
                if (seg.length >= 9) segments.push(seg);
                seg = [];
                continue;
            }
            seg.push(x, y, z);
        }
        if (seg.length >= 9) segments.push(seg);
        return segments.length ? segments : [nums];
    };

    for (const it of contourSeq.items) {
        const ds = it.dataSet;
        const roiNum = parseInt(ds?.string?.call(ds, 'x30060084') || '0', 10) || 0;
        const name = roiNameMap.get(roiNum) || `ROI ${roiNum}`;
        const cs = ds?.elements?.['x30060040'];
        if (!cs?.items?.length) continue;

        for (const cItem of cs.items) {
            const cDs = cItem.dataSet;
            const sopRef = cDs?.elements?.['x30060016']?.items?.[0]?.dataSet;
            const sopUid = sopRef?.string?.call(sopRef, 'x00081155') || null;
            const pts = cDs?.string?.call(cDs, 'x30060050');
            if (!pts) continue;

            const nums = pts.split('\\').map(Number).filter(Number.isFinite);
            if (nums.length % 3 !== 0) continue;

            const segments = splitOnZeroTriplets(nums);
            for (const segNums of segments) {
                if (!segNums || segNums.length % 3 !== 0) continue;
                const triplets: Vec3[] = [];
                for (let i = 0; i < segNums.length; i += 3) {
                    triplets.push([segNums[i], segNums[i + 1], segNums[i + 2]]);
                }
                if (triplets.length < 3) continue;
                contours.push({ roiNum, name, sopUid, points: triplets });
            }
        }
    }

    const normal = slices.length ? slices[0].normal : [0, 0, 1] as Vec3;
    const structures: LayeredCakeStructure[] = [];

    interface GroupedEntry {
        roiNum: number;
        name: string;
        bySlice: Map<number, Vec3[][]>;
    }

    const grouped = new Map<number, GroupedEntry>();

    contours.forEach(c => {
        if (!grouped.has(c.roiNum)) grouped.set(c.roiNum, { roiNum: c.roiNum, name: c.name, bySlice: new Map() });
        const g = grouped.get(c.roiNum)!;

        let zCenter = null;
        if (c.sopUid && sopToSlice.has(c.sopUid)) {
            const idx = sopToSlice.get(c.sopUid)!;
            const s = slices[idx];
            if (s && Number.isFinite(s.z)) zCenter = s.z;
        }
        if (zCenter == null) {
            zCenter = dot3(c.points[0] as Vec3, normal);
        }
        const sliceKey = Math.round(zCenter * 100);
        if (!Number.isFinite(sliceKey)) return;

        if (!g.bySlice.has(sliceKey)) g.bySlice.set(sliceKey, []);
        g.bySlice.get(sliceKey)!.push(c.points);
    });

    grouped.forEach(value => {
        const layers: CakeLayer[] = [];
        const keys = Array.from(value.bySlice.keys()).sort((a, b) => a - b);

        const r = slices.length ? ([slices[0].iop[0], slices[0].iop[1], slices[0].iop[2]] as Vec3) : ([1, 0, 0] as Vec3);
        const c = slices.length ? ([slices[0].iop[3], slices[0].iop[4], slices[0].iop[5]] as Vec3) : ([0, 1, 0] as Vec3);
        const rNorm = norm3(r);
        const cNorm = norm3(c);

        keys.forEach(key => {
            const polys3d = value.bySlice.get(key) || [];
            const loops: number[][][] = [];
            polys3d.forEach(poly => {
                const uv: number[][] = poly.map(p => {
                    const u = dot3(p, rNorm);
                    const v = dot3(p, cNorm);
                    return [u, v];
                });
                loops.push(uv);
            });
            const polygons = buildPolygonsWithHoles(loops);
            const zCenter = (key / 100);
            layers.push({ zCenter, thickness: 1, polygons });
        });
        layers.sort((a, b) => a.zCenter - b.zCenter);

        // Thickness calculation
        const deltas: number[] = [];
        for (let i = 1; i < layers.length; i++) {
            const dz = layers[i].zCenter - layers[i - 1].zCenter;
            if (Number.isFinite(dz) && dz > EPS) deltas.push(dz);
        }
        deltas.sort((a, b) => a - b);
        const typical = deltas.length ? deltas[Math.floor(deltas.length / 2)] : 1;
        const halfCap = Math.max(EPS, typical / 2);

        const useTrapezoidEnds = true;

        for (let i = 0; i < layers.length; i++) {
            const prev = layers[i - 1];
            const next = layers[i + 1];
            const dzPrev = prev ? (layers[i].zCenter - prev.zCenter) : null;
            const dzNext = next ? (next.zCenter - layers[i].zCenter) : null;

            const endcapLower = useTrapezoidEnds ? 0 : halfCap;
            const endcapUpper = useTrapezoidEnds ? 0 : halfCap;

            const singleSlice = layers.length === 1;
            const lower = singleSlice ? halfCap : (prev && Number.isFinite(dzPrev) ? Math.min(dzPrev! / 2, halfCap) : endcapLower);
            const upper = singleSlice ? halfCap : (next && Number.isFinite(dzNext) ? Math.min(dzNext! / 2, halfCap) : endcapUpper);

            layers[i].thickness = Math.max(EPS, lower + upper);
        }

        structures.push({ roiNum: value.roiNum, name: value.name, layers });
    });

    return structures;
}

export function computeVolume(structure: LayeredCakeStructure): number {
    if (!structure?.layers) return 0;
    let vol = 0;
    structure.layers.forEach(layer => {
        layer.polygons.forEach(poly => {
            const outerA = Math.abs(polygonArea(poly.outer));
            const holeA = poly.holes.reduce((s, h) => s + Math.abs(polygonArea(h)), 0);
            const area = Math.max(0, outerA - holeA);
            vol += area * layer.thickness;
        });
    });
    return vol;
}

export function buildMeshFromLayeredCake(structure: LayeredCakeStructure): MeshBuffers {
    if (!structure?.layers) return { positions: new Float32Array(), normals: new Float32Array(), indices: new Uint32Array() };

    const pos: number[] = [];
    const normals: number[] = [];
    const indices: number[] = [];

    const pushVertex = (v: number[], n: number[]) => {
        pos.push(...v);
        normals.push(...n);
        return (pos.length / 3) - 1;
    };

    const triVertex = (flat: number[], idx: number, z: number) => {
        return [flat[idx * 2], flat[idx * 2 + 1], z];
    };

    structure.layers.forEach(layer => {
        const z0 = layer.zCenter - layer.thickness / 2;
        const z1 = layer.zCenter + layer.thickness / 2;
        const nBottom = [0, 0, -1];
        const nTop = [0, 0, 1];

        layer.polygons.forEach(poly => {
            const { outer, holes } = poly;
            const verts2d: number[] = [];
            const holeIdx: number[] = [];
            let vertCount = 0;

            outer.forEach(p => { verts2d.push(p[0], p[1]); vertCount++; });
            holes.forEach(h => {
                holeIdx.push(vertCount);
                h.forEach(p => { verts2d.push(p[0], p[1]); vertCount++; });
            });

            const triIdx = earcut(verts2d, holeIdx, 2);

            for (let i = 0; i < triIdx.length; i += 3) {
                const a = triIdx[i], b = triIdx[i + 1], c = triIdx[i + 2];

                // Bottom cap
                const va0 = triVertex(verts2d, a, z0);
                const vb0 = triVertex(verts2d, b, z0);
                const vc0 = triVertex(verts2d, c, z0);
                const ia = pushVertex(va0, nBottom);
                const ib = pushVertex(vb0, nBottom);
                const ic = pushVertex(vc0, nBottom);
                indices.push(ia, ib, ic);

                // Top cap (flip winding)
                const va1 = triVertex(verts2d, a, z1);
                const vb1 = triVertex(verts2d, b, z1);
                const vc1 = triVertex(verts2d, c, z1);
                const ia1 = pushVertex(va1, nTop);
                const ib1 = pushVertex(vb1, nTop);
                const ic1 = pushVertex(vc1, nTop);
                indices.push(ia1, ic1, ib1);
            }

            // Walls
            const makeWalls = (loop: number[][], outward: boolean) => {
                for (let i = 0; i < loop.length; i++) {
                    const j = (i + 1) % loop.length;
                    const p0 = loop[i], p1 = loop[j];
                    const v0: Vec3 = [p0[0], p0[1], z0];
                    const v1: Vec3 = [p1[0], p1[1], z0];
                    const v2: Vec3 = [p1[0], p1[1], z1];
                    const v3: Vec3 = [p0[0], p0[1], z1];

                    const edge = sub3(v1, v0);
                    const wallN = norm3(cross3(edge, outward ? [0, 0, 1] : [0, 0, -1]));

                    const i0 = pushVertex(v0, wallN);
                    const i1 = pushVertex(v1, wallN);
                    const i2 = pushVertex(v2, wallN);
                    const i3 = pushVertex(v3, wallN);

                    indices.push(i0, i1, i2, i0, i2, i3);
                }
            };

            makeWalls(outer, true);
            holes.forEach(h => makeWalls(h, false));
        });
    });

    return {
        positions: new Float32Array(pos),
        normals: new Float32Array(normals),
        indices: new Uint32Array(indices)
    };
}
