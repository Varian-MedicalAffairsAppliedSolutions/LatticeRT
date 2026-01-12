/* global */
(function (root, factory) {
  root.OrientationWidget = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  function createOrientationWidgetProgram(gl) {
    const vsSource = `
      attribute vec3 aPosition;
      attribute vec3 aNormal;
      attribute vec3 aColor;
      uniform vec3 uFrameRight;
      uniform vec3 uFrameUp;
      uniform vec3 uFrameDir;
      uniform vec3 uAxisX;
      uniform vec3 uAxisY;
      uniform vec3 uAxisZ;
      uniform float uTilt;
      uniform float uScale;
      uniform float uAspect;
      uniform vec3 uLightDir;
      varying vec3 vColor;
      varying float vLighting;
      vec3 remapToPatient(vec3 local) {
        return local.x * uAxisX + local.y * uAxisY + local.z * uAxisZ;
      }
      vec3 rotateX(vec3 v, float angle) {
        float s = sin(angle);
        float c = cos(angle);
        return vec3(v.x, v.y * c - v.z * s, v.y * s + v.z * c);
      }
      vec3 projectToFrame(vec3 v) {
        return vec3(
          dot(v, uFrameRight),
          dot(v, uFrameUp),
          -dot(v, uFrameDir)
        );
      }
      void main() {
        vec3 patientPos = remapToPatient(aPosition);
        vec3 patientNormal = remapToPatient(aNormal);
        vec3 frameSpace = projectToFrame(patientPos);
        vec3 frameNormal = projectToFrame(patientNormal);
        frameSpace.y *= -1.0;
        frameNormal.y *= -1.0;
        vec3 viewPos = rotateX(frameSpace, uTilt);
        vec3 viewNormal = normalize(rotateX(frameNormal, uTilt));
        vColor = aColor;
        float lambert = max(dot(viewNormal, normalize(uLightDir)), 0.0);
        vLighting = 0.6 + 0.4 * lambert;
        vec2 scaled = vec2(viewPos.x / max(uAspect, 0.01), viewPos.y) * uScale;
        gl_Position = vec4(scaled, viewPos.z * 0.45 * uScale, 1.0);
      }
    `;
    const fsSource = `
      precision mediump float;
      varying vec3 vColor;
      varying float vLighting;
      void main() {
        gl_FragColor = vec4(vColor * vLighting, 1.0);
      }
    `;
    const vs = gl.createShader(gl.VERTEX_SHADER);
    gl.shaderSource(vs, vsSource);
    gl.compileShader(vs);
    if (!gl.getShaderParameter(vs, gl.COMPILE_STATUS)) return null;
    const fs = gl.createShader(gl.FRAGMENT_SHADER);
    gl.shaderSource(fs, fsSource);
    gl.compileShader(fs);
    if (!gl.getShaderParameter(fs, gl.COMPILE_STATUS)) return null;
    const program = gl.createProgram();
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return null;
    return program;
  }

  function createOrientationFigureMesh() {
    const mesh = { positions: [], normals: [], colors: [], indices: [] };
    const GREEN = [16 / 255, 185 / 255, 129 / 255];
    const RED = [220 / 255, 38 / 255, 38 / 255];
    const BLUE = [37 / 255, 99 / 255, 235 / 255];

    function addSphere(center, radius, color, latSteps = 12, lonSteps = 16) {
      const baseIndex = mesh.positions.length / 3;
      for (let lat = 0; lat <= latSteps; lat++) {
        const v = lat / latSteps;
        const phi = v * Math.PI;
        const sinPhi = Math.sin(phi);
        const cosPhi = Math.cos(phi);
        for (let lon = 0; lon <= lonSteps; lon++) {
          const u = lon / lonSteps;
          const theta = u * Math.PI * 2;
          const sinTheta = Math.sin(theta);
          const cosTheta = Math.cos(theta);
          const nx = cosTheta * sinPhi;
          const ny = cosPhi;
          const nz = sinTheta * sinPhi;
          mesh.positions.push(
            center[0] + radius * nx,
            center[1] + radius * ny,
            center[2] + radius * nz
          );
          mesh.normals.push(nx, ny, nz);
          mesh.colors.push(color[0], color[1], color[2]);
        }
      }
      for (let lat = 0; lat < latSteps; lat++) {
        for (let lon = 0; lon < lonSteps; lon++) {
          const first = baseIndex + lat * (lonSteps + 1) + lon;
          const second = first + lonSteps + 1;
          mesh.indices.push(first, second, first + 1);
          mesh.indices.push(second, second + 1, first + 1);
        }
      }
    }

    // Geometry is authored in RAS (+X right, +Y anterior, +Z superior); we remap to patient axes via uniforms.
    addSphere([0, 0, 0.1], 0.35, GREEN, 14, 20); // torso
    addSphere([0, 0, 0.55], 0.22, GREEN, 12, 18); // head
    addSphere([0, 0, -0.25], 0.28, GREEN, 12, 18); // hips
    addSphere([0.42, 0, 0.15], 0.16, GREEN); // patient-right elbow
    addSphere([-0.42, 0, 0.15], 0.16, GREEN); // patient-left elbow
    addSphere([-0.6, 0, 0.15], 0.12, RED); // left hand (patient left)
    addSphere([0.6, 0, 0.15], 0.12, GREEN); // right hand
    addSphere([0.18, 0, -0.45], 0.16, GREEN); // patient-right knee
    addSphere([-0.18, 0, -0.45], 0.16, GREEN); // patient-left knee
    addSphere([-0.18, 0, -0.72], 0.12, BLUE); // left foot
    addSphere([0.18, 0, -0.72], 0.12, BLUE); // right foot
    addSphere([0, 0.25, 0.55], 0.09, RED, 10, 16); // nose (anterior)

    return mesh;
  }

  function buildOrientationFigureGeometry(gl) {
    if (!gl) return null;
    const mesh = createOrientationFigureMesh();
    const positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(mesh.positions), gl.STATIC_DRAW);
    const normalBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, normalBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(mesh.normals), gl.STATIC_DRAW);
    const colorBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, colorBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(mesh.colors), gl.STATIC_DRAW);
    const indexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(mesh.indices), gl.STATIC_DRAW);
    return {
      position: positionBuffer,
      normal: normalBuffer,
      color: colorBuffer,
      index: indexBuffer,
      indexCount: mesh.indices.length,
    };
  }

  function isValidVec3(v) {
    return Array.isArray(v) && v.length >= 3 && v.every((n) => Number.isFinite(n));
  }

  function create(canvas) {
    if (!canvas) return null;
    let gl = null;
    try {
      gl = canvas.getContext('webgl', { alpha: true, antialias: true, premultipliedAlpha: false });
    } catch {}
    if (!gl) return null;

    const program = createOrientationWidgetProgram(gl);
    if (!program) return null;

    const attrib = {
      position: gl.getAttribLocation(program, 'aPosition'),
      normal: gl.getAttribLocation(program, 'aNormal'),
      color: gl.getAttribLocation(program, 'aColor'),
    };
    const uniform = {
      frameRight: gl.getUniformLocation(program, 'uFrameRight'),
      frameUp: gl.getUniformLocation(program, 'uFrameUp'),
      frameDir: gl.getUniformLocation(program, 'uFrameDir'),
      tilt: gl.getUniformLocation(program, 'uTilt'),
      scale: gl.getUniformLocation(program, 'uScale'),
      aspect: gl.getUniformLocation(program, 'uAspect'),
      lightDir: gl.getUniformLocation(program, 'uLightDir'),
      axisX: gl.getUniformLocation(program, 'uAxisX'),
      axisY: gl.getUniformLocation(program, 'uAxisY'),
      axisZ: gl.getUniformLocation(program, 'uAxisZ'),
    };
    const buffers = buildOrientationFigureGeometry(gl);
    if (!buffers) return null;

    // DICOM patient axes (LPS): +X=Left, +Y=Posterior, +Z=Head/Superior.
    // Remap local RAS (+X right, +Y anterior, +Z superior) into LPS.
    const axisX = new Float32Array([-1, 0, 0]); // local +X (right) -> patient right (-X)
    const axisY = new Float32Array([0, -1, 0]); // local +Y (anterior) -> patient anterior (-Y)
    const axisZ = new Float32Array([0, 0, 1]); // local +Z (superior) -> patient superior (+Z)

    function resize() {
      const widgetSize = Math.floor(Math.min(canvas.clientWidth || canvas.width || 140, canvas.clientHeight || canvas.height || 140));
      const size = Math.max(2, widgetSize || 140);
      if (canvas.width !== size || canvas.height !== size) {
        canvas.width = size;
        canvas.height = size;
      }
      gl.viewport(0, 0, canvas.width, canvas.height);
    }

    function draw(frame) {
      resize();
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.enable(gl.DEPTH_TEST);
      gl.enable(gl.CULL_FACE);
      gl.disable(gl.BLEND);
      gl.depthMask(true);

      const resolvedFrame = (frame && isValidVec3(frame.right) && isValidVec3(frame.up) && isValidVec3(frame.dir))
        ? frame
        : { right: [-1, 0, 0], up: [0, 0, 1], dir: [0, 1, 0] };

      gl.useProgram(program);
      gl.uniform3fv(uniform.frameRight, new Float32Array(resolvedFrame.right));
      gl.uniform3fv(uniform.frameUp, new Float32Array(resolvedFrame.up));
      gl.uniform3fv(uniform.frameDir, new Float32Array(resolvedFrame.dir));
      gl.uniform3fv(uniform.axisX, axisX);
      gl.uniform3fv(uniform.axisY, axisY);
      gl.uniform3fv(uniform.axisZ, axisZ);
      gl.uniform1f(uniform.tilt, 0);
      gl.uniform1f(uniform.scale, 0.85);
      gl.uniform1f(uniform.aspect, canvas.width / Math.max(1, canvas.height));
      gl.uniform3fv(uniform.lightDir, new Float32Array([0, 0, 1]));

      gl.bindBuffer(gl.ARRAY_BUFFER, buffers.position);
      gl.enableVertexAttribArray(attrib.position);
      gl.vertexAttribPointer(attrib.position, 3, gl.FLOAT, false, 0, 0);

      gl.bindBuffer(gl.ARRAY_BUFFER, buffers.normal);
      gl.enableVertexAttribArray(attrib.normal);
      gl.vertexAttribPointer(attrib.normal, 3, gl.FLOAT, false, 0, 0);

      gl.bindBuffer(gl.ARRAY_BUFFER, buffers.color);
      gl.enableVertexAttribArray(attrib.color);
      gl.vertexAttribPointer(attrib.color, 3, gl.FLOAT, false, 0, 0);

      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, buffers.index);
      gl.drawElements(gl.TRIANGLES, buffers.indexCount, gl.UNSIGNED_SHORT, 0);
    }

    return { draw };
  }

  return { create };
});
