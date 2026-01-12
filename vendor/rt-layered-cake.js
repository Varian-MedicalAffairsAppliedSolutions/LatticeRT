/**
 * Minimal layered-cake mesh builder for RTSTRUCT → mesh.
 * Exports:
 *  - parseRtToLayeredCake(rtStructDataset, ctSeriesDatasets): LayeredCakeStructure[]
 *  - buildMeshFromLayeredCake(structure): MeshBuffers { positions, normals, indices }
 *  - computeVolume(structure): number (mm^3)
 *
 * DICOM accessors expect dicomParser-like datasets (string/floatString/intString).
 */
(function(root, factory){
  const mod = factory();
  if (typeof module !== 'undefined' && module.exports){ module.exports = mod; }
  else root.RtLayeredCake = mod;
})(typeof self !== 'undefined' ? self : this, function(){
  // --- Helpers --------------------------------------------------------------
  const EPS = 1e-6;
  const clamp = (v, lo, hi)=> Math.max(lo, Math.min(hi, v));
  const dot = (a,b)=> a[0]*b[0] + a[1]*b[1] + a[2]*b[2];
  const sub = (a,b)=> [a[0]-b[0], a[1]-b[1], a[2]-b[2]];
  const cross = (a,b)=> [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
  const len = (v)=> Math.sqrt(dot(v,v));
  const norm = (v)=> { const L = len(v) || 1; return [v[0]/L, v[1]/L, v[2]/L]; };

  // Earcut (mini) from Mapbox, trimmed for polygons with holes.
  function earcut(data, holeIndices, dim){
    dim = dim || 2;
    holeIndices = holeIndices || [];
    const hasHoles = holeIndices.length > 0;
    const outerLen = hasHoles ? holeIndices[0] * dim : data.length;
    const outer = linkedList(data, 0, outerLen, dim, true);
    if (!outer) return [];
    const holes = [];
    if (hasHoles){
      for (let i = 0, lenH = holeIndices.length; i < lenH; i++){
        const start = holeIndices[i] * dim;
        const end = i < lenH - 1 ? holeIndices[i+1] * dim : data.length;
        const list = linkedList(data, start, end, dim, false);
        if (list) holes.push(list);
      }
    }
    const triangles = [];
    earcutLinked(outer, holes, triangles, dim);
    return triangles;
  }
  function Node(i, x, y){ this.i=i; this.x=x; this.y=y; this.prev=this.next=null; this.z=null; this.prevZ=this.nextZ=null; this.steiner=false; }
  function linkedList(data, start, end, dim, clockwise){
    let last = null;
    if (clockwise === (signedArea(data, start, end, dim) > 0)){
      for (let i=start; i<end; i+=dim) last = insertNode(i, data[i], data[i+1], last);
    } else {
      for (let i=end-dim; i>=start; i-=dim) last = insertNode(i, data[i], data[i+1], last);
    }
    if (last && equals(last, last.next)){ removeNode(last); last = last.next; }
    return last;
  }
  function signedArea(data, start, end, dim){
    let sum = 0;
    for (let i=start, j=end-dim; i<end; i+=dim){
      const xi = data[i], yi = data[i+1];
      const xj = data[j], yj = data[j+1];
      sum += (xj - xi) * (yi + yj);
      j = i;
    }
    return sum;
  }
  function insertNode(i, x, y, last){
    const p = new Node(i, x, y);
    if (!last){
      p.prev = p; p.next = p;
    } else {
      p.next = last.next; p.prev = last;
      last.next.prev = p; last.next = p;
    }
    return p;
  }
  function removeNode(p){ p.next.prev = p.prev; p.prev.next = p.next; if (p.prevZ) p.prevZ.nextZ = p.nextZ; if (p.nextZ) p.nextZ.prevZ = p.prevZ; }
  function equals(p1, p2){ return Math.abs(p1.x - p2.x) <= EPS && Math.abs(p1.y - p2.y) <= EPS; }
  function earcutLinked(outer, holes, triangles, dim){
    if (!outer) return;
    if (holes && holes.length){
      outer = eliminateHoles(holes, outer);
    }
    earcutLoop(outer, triangles, dim);
  }
  function earcutLoop(node, triangles, dim){
    if (!node) return;
    let stop = node, prev, next;
    while (node.prev !== node.next){
      prev = node.prev; next = node.next;
      if (isEar(node)){
        triangles.push(prev.i / dim, node.i / dim, next.i / dim);
        removeNode(node);
        node = next.next;
        stop = next.next;
        continue;
      }
      node = next;
      if (node === stop){
        break;
      }
    }
  }
  function isEar(node){
    const a = node.prev, b = node, c = node.next;
    if (area(a,b,c) >= 0) return false;
    let p = node.next.next;
    while (p !== node.prev){
      if (pointInTriangle(a.x,a.y,b.x,b.y,c.x,c.y,p.x,p.y) && area(p.prev,p,p.next) >= 0){
        return false;
      }
      p = p.next;
    }
    return true;
  }
  function area(p,q,r){ return (q.x - p.x)*(r.y - p.y) - (q.y - p.y)*(r.x - p.x); }
  function pointInTriangle(ax,ay,bx,by,cx,cy,px,py){
    const v0x = cx - ax, v0y = cy - ay;
    const v1x = bx - ax, v1y = by - ay;
    const v2x = px - ax, v2y = py - ay;
    const dot00 = v0x*v0x + v0y*v0y;
    const dot01 = v0x*v1x + v0y*v1y;
    const dot02 = v0x*v2x + v0y*v2y;
    const dot11 = v1x*v1x + v1y*v1y;
    const dot12 = v1x*v2x + v1y*v2y;
    const invDen = 1 / (dot00 * dot11 - dot01 * dot01 || 1);
    const u = (dot11 * dot02 - dot01 * dot12) * invDen;
    const v = (dot00 * dot12 - dot01 * dot02) * invDen;
    return u >= 0 && v >= 0 && (u + v) <= 1;
  }
  function eliminateHoles(holes, outer){
    for (const hole of holes){
      // find leftmost
      let left = hole;
      let p = hole.next;
      while (p !== hole){
        if (p.x < left.x) left = p;
        p = p.next;
      }
      outer = findBridge(left, outer);
    }
    return outer;
  }
  function findBridge(hole, outer){
    let p = outer, hx = hole.x, hy = hole.y, qx = -Infinity, m = null;
    do {
      if (hy <= p.y && hy >= p.next.y){
        const x = p.x + (hy - p.y) * (p.next.x - p.x) / (p.next.y - p.y || 1);
        if (x <= hx && x > qx){
          qx = x;
          if (x === hx){
            if (hy === p.y) return p;
            if (hy === p.next.y) return p.next;
          }
          m = p.x < p.next.x ? p : p.next;
        }
      }
      p = p.next;
    } while (p !== outer);
    if (!m) return outer;
    const newNode = insertNode(-1, hole.x, hole.y, m);
    splitPolygon(newNode, m);
    return outer;
  }
  function splitPolygon(a, b){
    const a2 = new Node(a.i, a.x, a.y);
    const b2 = new Node(b.i, b.x, b.y);
    const an = a.next;
    const bp = b.prev;
    a.next = b; b.prev = a;
    a2.next = an; an.prev = a2;
    b2.next = a2; a2.prev = b2;
    bp.next = b2; b2.prev = bp;
  }

  // --- Geometry builders ---------------------------------------------------
  function getTag(ds, tag, def=null){
    if (!ds) return def;
    // Multi-valued tags (IPP/IOP/PixelSpacing) must be read from the raw string,
    // since dicomParser.floatString(tag) returns only the first component.
    if (Array.isArray(def) && typeof ds.string === 'function'){
      const s = ds.string(tag);
      if (s != null) return s.split('\\').map(Number);
      return def;
    }
    if (typeof ds.floatString === 'function'){
      const v = ds.floatString(tag);
      if (Number.isFinite(v)) return v;
    }
    if (typeof ds.string === 'function'){
      const s = ds.string(tag);
      if (s == null) return def;
      const n = Number(s);
      return Number.isFinite(n) ? n : s;
    }
    return def;
  }

  function extractCtSlices(ctDatasets){
    const slices = [];
    for (const ds of ctDatasets || []){
      const ipp = getTag(ds, 'x00200032', [0,0,0]).map(Number);
      const iop = getTag(ds, 'x00200037', [1,0,0,0,1,0]).map(Number);
      const ps = getTag(ds, 'x00280030', [1,1]).map(Number);
      const sop = typeof ds.string === 'function' ? ds.string('x00080018') || null : null;
      if (ipp.length === 3 && iop.length === 6 && ps.length === 2){
        slices.push({ ipp, iop, ps, sop });
      }
    }
    if (!slices.length) return [];
    const r = norm([slices[0].iop[0], slices[0].iop[1], slices[0].iop[2]]);
    const c = norm([slices[0].iop[3], slices[0].iop[4], slices[0].iop[5]]);
    const n = norm(cross(r, c));
    slices.forEach(s=>{
      s.normal = n;
      s.z = dot(s.ipp, n);
    });
    slices.sort((a,b)=> a.z - b.z);
    return slices;
  }

  function parseRtToLayeredCake(rtStructDataset, ctSeriesDatasets){
    const slices = extractCtSlices(ctSeriesDatasets);
    const sopToSlice = new Map();
    slices.forEach((s, idx)=> sopToSlice.set(s.sop, idx));
    const contours = [];
    const roiSeq = rtStructDataset?.elements?.['x30060020'];
    const roiNameMap = new Map();
    if (roiSeq?.items?.length){
      for (const it of roiSeq.items){
        const ds = it.dataSet;
        const num = parseInt(ds?.string?.call(ds, 'x30060022') || '0', 10) || 0;
        const name = ds?.string?.call(ds, 'x30060026') || `ROI ${num}`;
        roiNameMap.set(num, name);
      }
    }
    const contourSeq = rtStructDataset?.elements?.['x30060039'];
    if (!contourSeq?.items?.length) return [];

    // Some exporters embed multiple contours into a single ContourData by
    // inserting 0,0,0 triplets as separators. Split these so polygons don't
    // self-intersect and disappear under even-odd fill rules.
    const splitOnZeroTriplets = (nums) => {
      const segments = [];
      let seg = [];
      for (let i = 0; i + 2 < nums.length; i += 3){
        const x = nums[i], y = nums[i + 1], z = nums[i + 2];
        if (x === 0 && y === 0 && z === 0){
          if (seg.length >= 9) segments.push(seg);
          seg = [];
          continue;
        }
        seg.push(x, y, z);
      }
      if (seg.length >= 9) segments.push(seg);
      return segments.length ? segments : [nums];
    };

    for (const it of contourSeq.items){
      const ds = it.dataSet;
      const roiNum = parseInt(ds?.string?.call(ds, 'x30060084') || '0', 10) || 0;
      const name = roiNameMap.get(roiNum) || `ROI ${roiNum}`;
      const cs = ds?.elements?.['x30060040'];
      if (!cs?.items?.length) continue;
      for (const cItem of cs.items){
        const cDs = cItem.dataSet;
        const sopRef = cDs?.elements?.['x30060016']?.items?.[0]?.dataSet;
        const sopUid = sopRef?.string?.call(sopRef, 'x00081155') || null;
        const pts = cDs?.string?.call(cDs, 'x30060050');
        if (!pts) continue;
        const nums = pts.split('\\').map(Number).filter(Number.isFinite);
        if (nums.length % 3 !== 0) continue;
        const segments = splitOnZeroTriplets(nums);
        for (const segNums of segments){
          if (!segNums || segNums.length % 3 !== 0) continue;
          const triplets = [];
          for (let i=0; i<segNums.length; i+=3) triplets.push([segNums[i], segNums[i+1], segNums[i+2]]);
          if (triplets.length < 3) continue;
          contours.push({ roiNum, name, sopUid, points: triplets });
        }
      }
    }
    const normal = slices.length ? slices[0].normal : [0,0,1];
    const structures = [];
    const grouped = new Map();
    contours.forEach(c=>{
      if (!grouped.has(c.roiNum)) grouped.set(c.roiNum, { roiNum: c.roiNum, name: c.name, bySlice: new Map() });
      const g = grouped.get(c.roiNum);
      let zCenter = null;
      if (c.sopUid && sopToSlice.has(c.sopUid)){
        const idx = sopToSlice.get(c.sopUid);
        const s = slices[idx];
        if (s && Number.isFinite(s.z)) zCenter = s.z;
      }
      if (zCenter == null){
        zCenter = dot(c.points[0], normal);
      }
      const sliceKey = Math.round(zCenter * 100);
      if (!Number.isFinite(sliceKey)) return;
      if (!g.bySlice.has(sliceKey)) g.bySlice.set(sliceKey, []);
      g.bySlice.get(sliceKey).push(c.points);
    });
    grouped.forEach(value => structures.push(value));
    // Build slice data per structure: loops projected to slice plane
    const r = slices.length ? slices[0].iop.slice(0,3).map(Number) : [1,0,0];
    const c = slices.length ? slices[0].iop.slice(3,6).map(Number) : [0,1,0];
    structures.forEach(struct => {
      const layers = [];
      const keys = Array.from(struct.bySlice.keys()).sort((a,b)=>a-b);
      keys.forEach(key=>{
        const polys3d = struct.bySlice.get(key) || [];
        const loops = [];
        polys3d.forEach(poly=>{
          const uv = poly.map(p=>{
            const u = dot(p, r);
            const v = dot(p, c);
            return [u, v];
          });
          loops.push(uv);
        });
        const polygons = buildPolygonsWithHoles(loops);
        const zCenter = (typeof key === 'number' && Number.isFinite(key)) ? (key / 100) : 0;
        layers.push({ zCenter, polygons });
      });
      layers.sort((a,b)=> a.zCenter - b.zCenter);
      // thickness per layer:
      // - Use contour spacing (zCenter deltas) so spacing reflects actual contour planes.
      // - Avoid "gap filling": cap half-thickness by the typical slice spacing so large
      //   contour gaps do not produce thick slabs that bridge missing-slice regions.
      const deltas = [];
      for (let i = 1; i < layers.length; i++){
        const dz = layers[i].zCenter - layers[i - 1].zCenter;
        if (Number.isFinite(dz) && dz > EPS) deltas.push(dz);
      }
      deltas.sort((a,b)=>a-b);
      const typical = deltas.length ? deltas[Math.floor(deltas.length / 2)] : 1;
      const halfCap = Math.max(EPS, typical / 2);
      const global = (typeof globalThis !== 'undefined') ? globalThis : null;
      const endcapMode = String(global?.__planScorerContourEndcapMode ?? global?.__planScorerStructureEndcapMode ?? 'trapezoid').toLowerCase();
      const useTrapezoidEnds = endcapMode === 'trapezoid' || endcapMode === 'tps';
      const gapFactorRaw = Number(global?.__planScorerContourGapFactor ?? global?.__planScorerStructureGapFactor);
      const gapFactor = (Number.isFinite(gapFactorRaw) && gapFactorRaw > 1) ? gapFactorRaw : Number.POSITIVE_INFINITY;
      for (let i=0; i<layers.length; i++){
        const prev = layers[i-1], next = layers[i+1];
        const dzPrev = prev ? (layers[i].zCenter - prev.zCenter) : null;
        const dzNext = next ? (next.zCenter - layers[i].zCenter) : null;
        const largePrevGap = prev && Number.isFinite(dzPrev) && dzPrev > typical * gapFactor;
        const largeNextGap = next && Number.isFinite(dzNext) && dzNext > typical * gapFactor;
        const endcapLower = useTrapezoidEnds ? 0 : halfCap;
        const endcapUpper = useTrapezoidEnds ? 0 : halfCap;
        const singleSlice = layers.length === 1;
        const lower = singleSlice
          ? halfCap
          : (prev && Number.isFinite(dzPrev) && !largePrevGap ? Math.min(dzPrev / 2, halfCap) : endcapLower);
        const upper = singleSlice
          ? halfCap
          : (next && Number.isFinite(dzNext) && !largeNextGap ? Math.min(dzNext / 2, halfCap) : endcapUpper);
        layers[i].thickness = Math.max(EPS, lower + upper);
      }
      struct.layers = layers;
    });
    return structures;
  }

  function polygonArea(loop){
    let area = 0;
    for (let i=0, j=loop.length-1; i<loop.length; j=i++){
      const xi = loop[i][0], yi = loop[i][1];
      const xj = loop[j][0], yj = loop[j][1];
      area += (xj - xi) * (yi + yj);
    }
    return area / 2;
  }

  function ensureOrientation(loop, ccw){
    const a = polygonArea(loop);
    if ((ccw && a < 0) || (!ccw && a > 0)) loop.reverse();
    return loop;
  }

  function pointInPoly(pt, loop){
    let inside = false;
    for (let i=0, j=loop.length-1; i<loop.length; j=i++){
      const xi = loop[i][0], yi = loop[i][1];
      const xj = loop[j][0], yj = loop[j][1];
      const intersect = ((yi > pt[1]) !== (yj > pt[1])) && (pt[0] < (xj - xi) * (pt[1] - yi) / (yj - yi + EPS) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  }

  function buildPolygonsWithHoles(loops){
    if (!loops || !loops.length) return [];
    const closeLoop = (loop) => {
      if (!loop || loop.length < 3) return loop || [];
      const first = loop[0];
      const last = loop[loop.length - 1];
      if (first && last && (Math.abs(first[0] - last[0]) > EPS || Math.abs(first[1] - last[1]) > EPS)){
        return loop.concat([[first[0], first[1]]]);
      }
      return loop;
    };
    const loopBounds = (loop) => {
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const p of loop){
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
    const boundsContainPoint = (b, pt) => {
      if (!b || !pt) return false;
      const x = pt[0], y = pt[1];
      return x >= b.minX - EPS && x <= b.maxX + EPS && y >= b.minY - EPS && y <= b.maxY + EPS;
    };
    const entries = [];
    for (const raw of loops){
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

    // Determine nesting via containment (even/odd depth), independent of input winding.
    const parent = new Array(entries.length).fill(null);
    for (let i = 0; i < entries.length; i++){
      const pt = entries[i].loop[0];
      let best = null;
      let bestArea = Infinity;
      for (let j = 0; j < entries.length; j++){
        if (i === j) continue;
        if (!(entries[j].areaAbs > entries[i].areaAbs + EPS)) continue; // parent must be larger
        if (!boundsContainPoint(entries[j].bounds, pt)) continue;
        if (pointInPoly(pt, entries[j].loop)){
          if (entries[j].areaAbs < bestArea){
            bestArea = entries[j].areaAbs;
            best = j;
          }
        }
      }
      parent[i] = best;
    }
    const depth = new Array(entries.length).fill(0);
    for (let i = 0; i < entries.length; i++){
      let d = 0;
      let cur = parent[i];
      while (cur != null && d < 1000){
        d++;
        cur = parent[cur];
      }
      depth[i] = d;
    }

    const polyByIdx = new Map();
    for (let i = 0; i < entries.length; i++){
      if (depth[i] % 2 !== 0) continue; // even depth = filled (outer / island)
      const outer = entries[i].loop.slice();
      ensureOrientation(outer, true);
      polyByIdx.set(i, { outer, holes: [] });
    }
    for (let i = 0; i < entries.length; i++){
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

  function computeVolume(structure){
    if (!structure?.layers) return 0;
    let vol = 0;
    structure.layers.forEach(layer => {
      layer.polygons.forEach(poly => {
        const outerA = Math.abs(polygonArea(poly.outer));
        const holeA = poly.holes.reduce((s,h)=> s + Math.abs(polygonArea(h)), 0);
        const area = Math.max(0, outerA - holeA);
        vol += area * layer.thickness;
      });
    });
    return vol; // mm^3 (u/v in mm coordinates)
  }

  function buildMeshFromLayeredCake(structure){
    if (!structure?.layers) return { positions:new Float32Array(), normals:new Float32Array(), indices:new Uint32Array() };
    const pos = [];
    const normals = [];
    const indices = [];
    const pushVertex = (v, n) => { pos.push(...v); normals.push(...n); return (pos.length/3)-1; };
    structure.layers.forEach(layer => {
      const z0 = layer.zCenter - layer.thickness/2;
      const z1 = layer.zCenter + layer.thickness/2;
      const nBottom = [0,0,-1];
      const nTop = [0,0,1];
      layer.polygons.forEach(poly => {
        const { outer, holes } = poly;
        // Flatten loops for earcut
        const verts2d = [];
        const holeIdx = [];
        let vertCount = 0;
        outer.forEach(p => { verts2d.push(p[0], p[1]); vertCount++; });
        holes.forEach(h => {
          holeIdx.push(vertCount);
          h.forEach(p => { verts2d.push(p[0], p[1]); vertCount++; });
        });
        const triIdx = earcut(verts2d, holeIdx, 2);
        // Caps
        triIdx.forEach((i, tIdx) => {
          const vx = verts2d[i*2], vy = verts2d[i*2+1];
          if (tIdx % 3 === 0){
            // nothing; just keeping structure
          }
        });
        for (let i=0; i<triIdx.length; i+=3){
          const a = triIdx[i], b = triIdx[i+1], c = triIdx[i+2];
          const va0 = triVertex(verts2d, a, z0);
          const vb0 = triVertex(verts2d, b, z0);
          const vc0 = triVertex(verts2d, c, z0);
          const ia = pushVertex(va0, nBottom);
          const ib = pushVertex(vb0, nBottom);
          const ic = pushVertex(vc0, nBottom);
          indices.push(ia, ib, ic);
          const va1 = triVertex(verts2d, a, z1);
          const vb1 = triVertex(verts2d, b, z1);
          const vc1 = triVertex(verts2d, c, z1);
          const ia1 = pushVertex(va1, nTop);
          const ib1 = pushVertex(vb1, nTop);
          const ic1 = pushVertex(vc1, nTop);
          indices.push(ia1, ic1, ib1); // flip winding for top
        }
        // Walls
        const makeWalls = (loop, outward) => {
          for (let i=0; i<loop.length; i++){
            const j = (i+1) % loop.length;
            const p0 = loop[i], p1 = loop[j];
            const v0 = [p0[0], p0[1], z0];
            const v1 = [p1[0], p1[1], z0];
            const v2 = [p1[0], p1[1], z1];
            const v3 = [p0[0], p0[1], z1];
            const edge = sub(v1, v0);
            const n = norm(cross(edge, outward ? [0,0,1] : [0,0,-1]));
            const i0 = pushVertex(v0, n);
            const i1 = pushVertex(v1, n);
            const i2 = pushVertex(v2, n);
            const i3 = pushVertex(v3, n);
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

  function triVertex(flat, idx, z){
    return [flat[idx*2], flat[idx*2+1], z];
  }

  // --- Worker-friendly wrapper (optional) -------------------------------
  async function workerEntry(msg){
    const { rtStruct, ctSeries } = msg;
    const structures = parseRtToLayeredCake(rtStruct, ctSeries);
    const meshes = structures.map(struct => {
      const mesh = buildMeshFromLayeredCake(struct);
      const volumeMm3 = computeVolume(struct);
      return { roiNum: struct.roiNum, name: struct.name, mesh, volumeMm3 };
    });
    return { meshes };
  }

  return {
    parseRtToLayeredCake,
    buildMeshFromLayeredCake,
    computeVolume,
    workerEntry
  };
});
