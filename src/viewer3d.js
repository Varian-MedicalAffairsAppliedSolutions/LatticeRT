/* global RtLayeredCake */
(function (root, factory) {
  const mod = factory();
  root.Viewer3D = mod;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  function mat4Identity() {
    return [1, 0, 0, 0,
      0, 1, 0, 0,
      0, 0, 1, 0,
      0, 0, 0, 1];
  }

  function mat4Mul(a, b) {
    // Column-major 4x4 multiply: out = a * b.
    const o = new Array(16);
    for (let c = 0; c < 4; c++) {
      const b0 = b[c * 4 + 0];
      const b1 = b[c * 4 + 1];
      const b2 = b[c * 4 + 2];
      const b3 = b[c * 4 + 3];
      o[c * 4 + 0] = a[0] * b0 + a[4] * b1 + a[8] * b2 + a[12] * b3;
      o[c * 4 + 1] = a[1] * b0 + a[5] * b1 + a[9] * b2 + a[13] * b3;
      o[c * 4 + 2] = a[2] * b0 + a[6] * b1 + a[10] * b2 + a[14] * b3;
      o[c * 4 + 3] = a[3] * b0 + a[7] * b1 + a[11] * b2 + a[15] * b3;
    }
    return o;
  }

  function mat4Perspective(fovyRad, aspect, near, far) {
    const f = 1.0 / Math.tan(fovyRad / 2);
    const nf = 1 / (near - far);
    return [
      f / aspect, 0, 0, 0,
      0, f, 0, 0,
      0, 0, (far + near) * nf, -1,
      0, 0, (2 * far * near) * nf, 0
    ];
  }

  function vec3Sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
  function vec3Len(v) { return Math.hypot(v[0], v[1], v[2]); }
  function vec3Norm(v) {
    const L = vec3Len(v) || 1;
    return [v[0] / L, v[1] / L, v[2] / L];
  }
  function vec3Cross(a, b) {
    return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  }
  function vec3Dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  function vec3MulScalar(v, s) { return [v[0] * s, v[1] * s, v[2] * s]; }

  function mat4LookAt(eye, center, up) {
    const f = vec3Norm(vec3Sub(center, eye));
    const s = vec3Norm(vec3Cross(f, up));
    const u = vec3Cross(s, f);
    return [
      s[0], u[0], -f[0], 0,
      s[1], u[1], -f[1], 0,
      s[2], u[2], -f[2], 0,
      -vec3Dot(s, eye), -vec3Dot(u, eye), vec3Dot(f, eye), 1
    ];
  }

  function compileProgram(gl, vsSrc, fsSrc) {
    const compile = (type, src) => {
      const sh = gl.createShader(type);
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      return sh;
    };
    const vs = compile(gl.VERTEX_SHADER, vsSrc);
    const fs = compile(gl.FRAGMENT_SHADER, fsSrc);
    const prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    return prog;
  }

  function create(canvas) {
    let gl = canvas.getContext('webgl', { alpha: false, antialias: true, premultipliedAlpha: false });
    if (!gl) gl = canvas.getContext('experimental-webgl', { alpha: false, antialias: true, premultipliedAlpha: false });
    if (!gl) return null;

    const DEFAULT_VIEW_DISTANCE_MM = 1000; // ~100 cm

    const extUint = gl.getExtension('OES_element_index_uint');
    const canUint32 = !!extUint;

    const vs = `
      attribute vec3 aPos;
      attribute vec3 aNor;
      uniform mat4 uMvp;
      uniform mat4 uModel;
      varying vec3 vNor;
      varying vec3 vPos;
      void main(){
        vec4 wp = uModel * vec4(aPos, 1.0);
        vPos = wp.xyz;
        vNor = mat3(uModel) * aNor;
        gl_Position = uMvp * vec4(aPos, 1.0);
      }
    `;
    const fs = `
      precision mediump float;
      varying vec3 vNor;
      varying vec3 vPos;
      uniform vec3 uEye;
      uniform vec3 uLightDir;
      uniform vec4 uColor;
      uniform float uXray;
      void main(){
        vec3 n = normalize(vNor);
        if (uXray > 0.5) {
          vec3 v = normalize(uEye - vPos);
          float fres = pow(1.0 - abs(dot(n, v)), 2.6);
          float a = max(0.02, uColor.a * (0.12 + 0.88 * fres));
          vec3 rgb = uColor.rgb * (0.10 + 0.90 * fres) * 1.35;
          gl_FragColor = vec4(rgb, a);
        } else {
          float ndl = max(0.0, dot(n, normalize(uLightDir)));
          float amb = 0.22;
          float shade = amb + (1.0 - amb) * ndl;
          vec3 rgb = uColor.rgb * shade;
          gl_FragColor = vec4(rgb, uColor.a);
        }
      }
    `;

    const prog = compileProgram(gl, vs, fs);
    const loc = {
      aPos: gl.getAttribLocation(prog, 'aPos'),
      aNor: gl.getAttribLocation(prog, 'aNor'),
      uMvp: gl.getUniformLocation(prog, 'uMvp'),
      uModel: gl.getUniformLocation(prog, 'uModel'),
      uEye: gl.getUniformLocation(prog, 'uEye'),
      uLightDir: gl.getUniformLocation(prog, 'uLightDir'),
      uColor: gl.getUniformLocation(prog, 'uColor'),
      uXray: gl.getUniformLocation(prog, 'uXray'),
    };

    const ptProg = compileProgram(gl,
      `
      attribute vec3 aPos;
      uniform mat4 uMvp;
      uniform float uSize;
      void main(){
        gl_Position = uMvp * vec4(aPos, 1.0);
        gl_PointSize = uSize;
      }
      `,
      `
      precision mediump float;
      uniform vec4 uColor;
      void main(){
        vec2 p = gl_PointCoord * 2.0 - 1.0;
        float r2 = dot(p,p);
        if (r2 > 1.0) discard;
        float a = 1.0 - smoothstep(0.8, 1.0, r2);
        gl_FragColor = vec4(uColor.rgb, uColor.a * a);
      }
      `
    );
    const ptLoc = {
      aPos: gl.getAttribLocation(ptProg, 'aPos'),
      uMvp: gl.getUniformLocation(ptProg, 'uMvp'),
      uSize: gl.getUniformLocation(ptProg, 'uSize'),
      uColor: gl.getUniformLocation(ptProg, 'uColor'),
    };

    const buffers = {
      ptv: { vbo: gl.createBuffer(), nbo: gl.createBuffer(), ibo: gl.createBuffer(), count: 0, indexType: gl.UNSIGNED_SHORT },
      spheresPeak: { vbo: gl.createBuffer(), count: 0 },
      spheresWarm: { vbo: gl.createBuffer(), count: 0 },
      spheresCold: { vbo: gl.createBuffer(), count: 0 },
      sphereMeshPeak: { vbo: gl.createBuffer(), nbo: gl.createBuffer(), ibo: gl.createBuffer(), count: 0, indexType: gl.UNSIGNED_SHORT },
      sphereMeshWarm: { vbo: gl.createBuffer(), nbo: gl.createBuffer(), ibo: gl.createBuffer(), count: 0, indexType: gl.UNSIGNED_SHORT },
      sphereMeshCold: { vbo: gl.createBuffer(), nbo: gl.createBuffer(), ibo: gl.createBuffer(), count: 0, indexType: gl.UNSIGNED_SHORT },
    };

    let lastSpheres = [];

    const camera = {
      yaw: 0.8,
      pitch: 0.6,
      dist: DEFAULT_VIEW_DISTANCE_MM,
      dragging: false,
      lastX: 0,
      lastY: 0,
    };

    let model = mat4Identity();
    let center = [0, 0, 0];
    let boundsRadius = 100;

    function mat4MulVec4(m, v) {
      const x = v[0], y = v[1], z = v[2], w = v[3];
      return [
        m[0] * x + m[4] * y + m[8] * z + m[12] * w,
        m[1] * x + m[5] * y + m[9] * z + m[13] * w,
        m[2] * x + m[6] * y + m[10] * z + m[14] * w,
        m[3] * x + m[7] * y + m[11] * z + m[15] * w,
      ];
    }

    function makeUnitSphere(latSeg = 12, lonSeg = 16) {
      const lat = Math.max(6, Math.floor(latSeg));
      const lon = Math.max(8, Math.floor(lonSeg));
      const positions = [];
      const normals = [];
      const indices = [];
      for (let y = 0; y <= lat; y++) {
        const v = y / lat;
        const theta = v * Math.PI;
        const st = Math.sin(theta);
        const ct = Math.cos(theta);
        for (let x = 0; x <= lon; x++) {
          const u = x / lon;
          const phi = u * Math.PI * 2;
          const sp = Math.sin(phi);
          const cp = Math.cos(phi);
          const nx = cp * st;
          const ny = ct;
          const nz = sp * st;
          positions.push(nx, ny, nz);
          normals.push(nx, ny, nz);
        }
      }
      for (let y = 0; y < lat; y++) {
        for (let x = 0; x < lon; x++) {
          const a = y * (lon + 1) + x;
          const b = a + lon + 1;
          indices.push(a, b, a + 1);
          indices.push(b, b + 1, a + 1);
        }
      }
      return {
        positions: new Float32Array(positions),
        normals: new Float32Array(normals),
        indices: (positions.length / 3 > 65535 && canUint32) ? new Uint32Array(indices) : new Uint16Array(indices),
      };
    }

    const unitSphere = makeUnitSphere(12, 18);

    function resize() {
      gl.viewport(0, 0, canvas.width, canvas.height);
    }

    function setPtvMesh(meshBuffers, centerUvw) {
      if (!meshBuffers) return;
      const pos = meshBuffers.positions;
      const nor = meshBuffers.normals;
      const idx = meshBuffers.indices;
      center = Array.isArray(centerUvw) ? [centerUvw[0] || 0, centerUvw[1] || 0, centerUvw[2] || 0] : [0, 0, 0];

      // Compute radius in UVW coords for camera framing.
      let r = 0;
      for (let i = 0; i + 2 < pos.length; i += 3) {
        const dx = pos[i] - center[0];
        const dy = pos[i + 1] - center[1];
        const dz = pos[i + 2] - center[2];
        r = Math.max(r, Math.hypot(dx, dy, dz));
      }
      boundsRadius = Math.max(10, r);
      camera.dist = Math.max(DEFAULT_VIEW_DISTANCE_MM, boundsRadius * 2.2);

      // Center the mesh by subtracting center in the vertex shader by using uModel translate.
      model = [
        1, 0, 0, 0,
        0, 1, 0, 0,
        0, 0, 1, 0,
        -center[0], -center[1], -center[2], 1
      ];

      gl.bindBuffer(gl.ARRAY_BUFFER, buffers.ptv.vbo);
      gl.bufferData(gl.ARRAY_BUFFER, pos, gl.STATIC_DRAW);
      gl.bindBuffer(gl.ARRAY_BUFFER, buffers.ptv.nbo);
      gl.bufferData(gl.ARRAY_BUFFER, nor, gl.STATIC_DRAW);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, buffers.ptv.ibo);
      const wantUint32 = canUint32 && idx instanceof Uint32Array;
      buffers.ptv.indexType = wantUint32 ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT;
      buffers.ptv.count = idx.length;
      if (wantUint32) gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW);
      else gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, (idx instanceof Uint16Array) ? idx : new Uint16Array(idx), gl.STATIC_DRAW);
    }

    function setCenterUvw(centerUvw) {
      const c = Array.isArray(centerUvw) ? [Number(centerUvw[0]) || 0, Number(centerUvw[1]) || 0, Number(centerUvw[2]) || 0] : [0, 0, 0];
      center = c;
      model = [
        1, 0, 0, 0,
        0, 1, 0, 0,
        0, 0, 1, 0,
        -center[0], -center[1], -center[2], 1
      ];
      draw();
    }

    function getCameraFrameUvw() {
      const pitch = clamp(camera.pitch, -1.4, 1.4);
      const yaw = camera.yaw;
      const eye = [
        Math.cos(pitch) * Math.cos(yaw) * camera.dist,
        Math.sin(pitch) * camera.dist,
        Math.cos(pitch) * Math.sin(yaw) * camera.dist
      ];
      const dir = vec3Norm(vec3MulScalar(eye, -1));
      const up0 = [0, 1, 0];
      const right = vec3Norm(vec3Cross(dir, up0));
      const up = vec3Cross(right, dir);
      return { right, up, dir };
    }

    function setSpheres(spheres, centerUvw) {
      const c = Array.isArray(centerUvw) ? [centerUvw[0] || 0, centerUvw[1] || 0, centerUvw[2] || 0] : [0, 0, 0];
      const list = Array.isArray(spheres) ? spheres : [];
      buffers.spheresPeak.count = 0;
      buffers.spheresWarm.count = 0;
      buffers.spheresCold.count = 0;
      buffers.sphereMeshPeak.count = 0;
      buffers.sphereMeshWarm.count = 0;
      buffers.sphereMeshCold.count = 0;

      if (!list.length) return;

      lastSpheres = list.map((s) => ({
        id: s?.id ?? null,
        kind: s?.kind ?? 'peak',
        r: Number(s?.r) || 0,
        centerUvw: Array.isArray(s?.centerUvw) ? [Number(s.centerUvw[0]) || 0, Number(s.centerUvw[1]) || 0, Number(s.centerUvw[2]) || 0] : [0, 0, 0],
        centerRef: c,
      }));

      const peak = [];
      const warm = [];
      const cold = [];
      for (const s of list) {
        const kind = s?.kind === 'cold' ? 'cold' : (s?.kind === 'warm' ? 'warm' : 'peak');
        if (kind === 'cold') cold.push(s);
        else if (kind === 'warm') warm.push(s);
        else peak.push(s);
      }

      const build = (group, ptsBuf, meshBuf) => {
        if (!group.length) return;

        // If sphere count is huge, render as points for performance.
        const usePoints = group.length > 500;
        if (usePoints) {
          const pts = [];
          for (const s of group) {
            const p = s.centerUvw || [];
            pts.push((p[0] || 0), (p[1] || 0), (p[2] || 0));
          }
          gl.bindBuffer(gl.ARRAY_BUFFER, ptsBuf.vbo);
          gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(pts), gl.DYNAMIC_DRAW);
          ptsBuf.count = pts.length / 3;
          return;
        }

        const basePos = unitSphere.positions;
        const baseNor = unitSphere.normals;
        const baseIdx = unitSphere.indices;
        const vPer = basePos.length / 3;
        const iPer = baseIdx.length;
        const totalV = vPer * group.length;
        const totalI = iPer * group.length;

        const pos = new Float32Array(totalV * 3);
        const nor = new Float32Array(totalV * 3);
        const idx = (canUint32 && totalV > 65535) ? new Uint32Array(totalI) : new Uint16Array(totalI);
        let vOff = 0;
        let iOff = 0;
        for (let sIdx = 0; sIdx < group.length; sIdx++) {
          const s = group[sIdx];
          const p = s.centerUvw || [];
          const cx = (p[0] || 0);
          const cy = (p[1] || 0);
          const cz = (p[2] || 0);
          const r = Number(s.r) || 0;
          for (let i = 0; i < basePos.length; i += 3) {
            pos[vOff + i + 0] = basePos[i + 0] * r + cx;
            pos[vOff + i + 1] = basePos[i + 1] * r + cy;
            pos[vOff + i + 2] = basePos[i + 2] * r + cz;
            nor[vOff + i + 0] = baseNor[i + 0];
            nor[vOff + i + 1] = baseNor[i + 1];
            nor[vOff + i + 2] = baseNor[i + 2];
          }
          for (let i = 0; i < baseIdx.length; i++) {
            idx[iOff + i] = baseIdx[i] + (sIdx * vPer);
          }
          vOff += basePos.length;
          iOff += baseIdx.length;
        }

        gl.bindBuffer(gl.ARRAY_BUFFER, meshBuf.vbo);
        gl.bufferData(gl.ARRAY_BUFFER, pos, gl.STATIC_DRAW);
        gl.bindBuffer(gl.ARRAY_BUFFER, meshBuf.nbo);
        gl.bufferData(gl.ARRAY_BUFFER, nor, gl.STATIC_DRAW);
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, meshBuf.ibo);
        meshBuf.indexType = (idx instanceof Uint32Array) ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT;
        meshBuf.count = idx.length;
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW);
      };

      build(peak, buffers.spheresPeak, buffers.sphereMeshPeak);
      build(warm, buffers.spheresWarm, buffers.sphereMeshWarm);
      build(cold, buffers.spheresCold, buffers.sphereMeshCold);
    }

    function pickSphereAtClientXY(clientX, clientY) {
      if (!lastSpheres.length) return null;
      const rect = canvas.getBoundingClientRect();
      if (!rect.width || !rect.height) return null;
      const xCss = clientX - rect.left;
      const yCss = clientY - rect.top;

      const aspect = canvas.width / Math.max(1, canvas.height);
      const proj = mat4Perspective(45 * Math.PI / 180, aspect, 0.1, 5000);
      const pitch = clamp(camera.pitch, -1.4, 1.4);
      const yaw = camera.yaw;
      const eye = [
        Math.cos(pitch) * Math.cos(yaw) * camera.dist,
        Math.sin(pitch) * camera.dist,
        Math.cos(pitch) * Math.sin(yaw) * camera.dist
      ];
      const view = mat4LookAt(eye, [0, 0, 0], [0, 1, 0]);
      const mvp = mat4Mul(proj, mat4Mul(view, model));

      let best = null;
      let bestScore = Infinity;

      for (const s of lastSpheres) {
        const p = s.centerUvw;
        const clip = mat4MulVec4(mvp, [p[0], p[1], p[2], 1]);
        const w = clip[3];
        if (!Number.isFinite(w) || w <= 1e-6) continue;
        const ndcX = clip[0] / w;
        const ndcY = clip[1] / w;
        const ndcZ = clip[2] / w;
        if (ndcZ < -1 || ndcZ > 1) continue;

        const px = ((ndcX + 1) * 0.5) * rect.width;
        const py = ((1 - ndcY) * 0.5) * rect.height;

        // Approximate screen-space radius by projecting a point offset by r in +U direction.
        const r = Math.max(0, s.r || 0);
        const clipR = mat4MulVec4(mvp, [p[0] + r, p[1], p[2], 1]);
        const wR = clipR[3];
        let rPx = 10;
        if (Number.isFinite(wR) && wR > 1e-6) {
          const ndcXR = clipR[0] / wR;
          const pxR = ((ndcXR + 1) * 0.5) * rect.width;
          rPx = Math.max(8, Math.abs(pxR - px));
        }

        const dx = xCss - px;
        const dy = yCss - py;
        const d2 = dx * dx + dy * dy;
        const hitR = rPx * 1.15;
        if (d2 > hitR * hitR) continue;

        // Prefer closer-to-center clicks; tie-break by depth.
        const score = d2 + (ndcZ + 1) * 0.001;
        if (score < bestScore) {
          bestScore = score;
          best = { id: s.id, kind: s.kind, distPx: Math.sqrt(d2) };
        }
      }

      return best;
    }

    function draw() {
      resize();
      gl.enable(gl.DEPTH_TEST);
      gl.disable(gl.CULL_FACE);
      gl.clearColor(0, 0, 0, 1);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

      const aspect = canvas.width / Math.max(1, canvas.height);
      const proj = mat4Perspective(45 * Math.PI / 180, aspect, 0.1, 5000);
      const pitch = clamp(camera.pitch, -1.4, 1.4);
      const yaw = camera.yaw;
      const eye = [
        Math.cos(pitch) * Math.cos(yaw) * camera.dist,
        Math.sin(pitch) * camera.dist,
        Math.cos(pitch) * Math.sin(yaw) * camera.dist
      ];
      const view = mat4LookAt(eye, [0, 0, 0], [0, 1, 0]);
      const mvp = mat4Mul(proj, mat4Mul(view, model));

      // Draw PTV
      if (buffers.ptv.count > 0) {
        gl.useProgram(prog);
        gl.uniformMatrix4fv(loc.uMvp, false, new Float32Array(mvp));
        gl.uniformMatrix4fv(loc.uModel, false, new Float32Array(model));
        gl.uniform3f(loc.uEye, eye[0], eye[1], eye[2]);
        gl.uniform3f(loc.uLightDir, -0.4, 0.8, 0.2);
        gl.uniform4f(loc.uColor, 0.35, 0.95, 0.95, 0.22);
        gl.uniform1f(loc.uXray, 1.0);
        gl.enableVertexAttribArray(loc.aPos);
        gl.bindBuffer(gl.ARRAY_BUFFER, buffers.ptv.vbo);
        gl.vertexAttribPointer(loc.aPos, 3, gl.FLOAT, false, 0, 0);
        gl.enableVertexAttribArray(loc.aNor);
        gl.bindBuffer(gl.ARRAY_BUFFER, buffers.ptv.nbo);
        gl.vertexAttribPointer(loc.aNor, 3, gl.FLOAT, false, 0, 0);
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, buffers.ptv.ibo);
        // X-ray style: don't occlude spheres; emphasize edges.
        gl.disable(gl.DEPTH_TEST);
        gl.depthMask(false);
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
        gl.drawElements(gl.TRIANGLES, buffers.ptv.count, buffers.ptv.indexType, 0);
        gl.disable(gl.BLEND);
        gl.depthMask(true);
        gl.enable(gl.DEPTH_TEST);
      }

      const drawMesh = (meshBuf, r, g, b, a) => {
        if (meshBuf.count <= 0) return;
        gl.useProgram(prog);
        gl.uniformMatrix4fv(loc.uMvp, false, new Float32Array(mvp));
        gl.uniformMatrix4fv(loc.uModel, false, new Float32Array(model));
        gl.uniform3f(loc.uEye, eye[0], eye[1], eye[2]);
        gl.uniform3f(loc.uLightDir, -0.2, 0.9, 0.1);
        gl.uniform4f(loc.uColor, r, g, b, a);
        gl.uniform1f(loc.uXray, 0.0);
        gl.enableVertexAttribArray(loc.aPos);
        gl.bindBuffer(gl.ARRAY_BUFFER, meshBuf.vbo);
        gl.vertexAttribPointer(loc.aPos, 3, gl.FLOAT, false, 0, 0);
        gl.enableVertexAttribArray(loc.aNor);
        gl.bindBuffer(gl.ARRAY_BUFFER, meshBuf.nbo);
        gl.vertexAttribPointer(loc.aNor, 3, gl.FLOAT, false, 0, 0);
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, meshBuf.ibo);
        gl.disable(gl.BLEND);
        gl.drawElements(gl.TRIANGLES, meshBuf.count, meshBuf.indexType, 0);
      };

      const drawPoints = (ptsBuf, r, g, b) => {
        if (ptsBuf.count <= 0) return;
        gl.useProgram(ptProg);
        gl.uniformMatrix4fv(ptLoc.uMvp, false, new Float32Array(mvp));
        gl.uniform1f(ptLoc.uSize, clamp(Math.round(6 + boundsRadius / 50), 6, 16));
        gl.uniform4f(ptLoc.uColor, r, g, b, 0.78);
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        gl.enableVertexAttribArray(ptLoc.aPos);
        gl.bindBuffer(gl.ARRAY_BUFFER, ptsBuf.vbo);
        gl.vertexAttribPointer(ptLoc.aPos, 3, gl.FLOAT, false, 0, 0);
        gl.drawArrays(gl.POINTS, 0, ptsBuf.count);
        gl.disable(gl.BLEND);
      };

      // Solid surface spheres: red=peak, yellow=warm, blue=cold.
      drawMesh(buffers.sphereMeshPeak, 1.00, 0.00, 0.00, 1.00);
      drawMesh(buffers.sphereMeshWarm, 1.00, 0.86, 0.00, 1.00);
      drawMesh(buffers.sphereMeshCold, 0.00, 0.35, 1.00, 1.00);

      drawPoints(buffers.spheresPeak, 1.00, 0.00, 0.00);
      drawPoints(buffers.spheresWarm, 1.00, 0.86, 0.00);
      drawPoints(buffers.spheresCold, 0.00, 0.35, 1.0);

      try { canvas.dispatchEvent(new Event('viewer3dchange')); } catch {}
    }

    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      camera.dragging = true;
      camera.lastX = e.clientX;
      camera.lastY = e.clientY;
      canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!camera.dragging) return;
      const dx = e.clientX - camera.lastX;
      const dy = e.clientY - camera.lastY;
      camera.lastX = e.clientX;
      camera.lastY = e.clientY;
      camera.yaw += dx * 0.006;
      camera.pitch += dy * 0.006;
      draw();
    });
    canvas.addEventListener('pointerup', (e) => {
      camera.dragging = false;
      try { canvas.releasePointerCapture(e.pointerId); } catch {}
    });
    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const s = Math.exp((e.deltaY > 0 ? 1 : -1) * 0.08);
      camera.dist = clamp(camera.dist * s, 10, 10000);
      draw();
    }, { passive: false });

    return { gl, resize, setPtvMesh, setCenterUvw, getCameraFrameUvw, setSpheres, draw, pickSphereAtClientXY };
  }

  return { create };
});
