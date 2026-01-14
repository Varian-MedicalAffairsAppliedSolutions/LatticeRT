import type { MeshBuffers } from '../geometry/layeredCake';
import type { Sphere } from '../../types';
import type { Bounds3D } from '../geometry/analysis';
import { mat4Identity, mat4LookAt, mat4Multiply, mat4Perspective } from '../math/mat4';

const PTV_VS = `
attribute vec3 aPos;
attribute vec3 aNorm;
uniform mat4 uMVP;
varying vec3 vNorm;
void main() {
    vNorm = aNorm;
    gl_Position = uMVP * vec4(aPos, 1.0);
}
`;

const PTV_FS = `
precision mediump float;
varying vec3 vNorm;
uniform vec3 uColor;
uniform float uAlpha;
void main() {
    vec3 light = normalize(vec3(0.5, 0.7, 1.0));
    float diff = max(dot(normalize(vNorm), light), 0.2);
    gl_FragColor = vec4(uColor * diff, uAlpha);
}
`;

const SPHERE_VS = `
attribute vec3 aPos;
attribute vec3 aNorm;
uniform mat4 uMVP;
uniform vec3 uCenter;
uniform float uRadius;
varying vec3 vNorm;
void main() {
    vNorm = aNorm;
    vec3 p = uCenter + aPos * uRadius;
    gl_Position = uMVP * vec4(p, 1.0);
}
`;

// Fragment shader reused

export class Viewer3D {
    private gl: WebGLRenderingContext;
    private ptvProg: WebGLProgram | null = null;
    private sphereProg: WebGLProgram | null = null;

    private ptvBuf: { pos: WebGLBuffer; norm: WebGLBuffer; idx: WebGLBuffer; count: number } | null = null;
    private unitSphere: { pos: WebGLBuffer; norm: WebGLBuffer; idx: WebGLBuffer; count: number } | null = null;

    private spheres: Sphere[] = [];
    private ptvColor: [number, number, number] = [0, 1.0, 1.0];
    // private bounds: Bounds3D | null = null;

    public yaw = 0;
    public pitch = 0;
    public dist = 300;
    public target: [number, number, number] = [0, 0, 0];

    constructor(canvas: HTMLCanvasElement) {
        const gl = canvas.getContext('webgl', { alpha: false, depth: true, antialias: true });
        if (!gl) throw new Error("WebGL not supported");
        this.gl = gl;

        this.ptvProg = this.createProgram(PTV_VS, PTV_FS);
        this.sphereProg = this.createProgram(SPHERE_VS, PTV_FS);

        this.initUnitSphere();

        gl.enable(gl.DEPTH_TEST);
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    }

    private createShader(src: string, type: number): WebGLShader | null {
        const gl = this.gl;
        const sh = gl.createShader(type);
        if (!sh) return null;
        gl.shaderSource(sh, src);
        gl.compileShader(sh);
        if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
            console.error(gl.getShaderInfoLog(sh));
            return null;
        }
        return sh;
    }

    private createProgram(vsSrc: string, fsSrc: string): WebGLProgram | null {
        const gl = this.gl;
        const vs = this.createShader(vsSrc, gl.VERTEX_SHADER);
        const fs = this.createShader(fsSrc, gl.FRAGMENT_SHADER);
        if (!vs || !fs) return null;
        const prog = gl.createProgram();
        if (!prog) return null;
        gl.attachShader(prog, vs);
        gl.attachShader(prog, fs);
        gl.linkProgram(prog);
        return prog;
    }

    private initUnitSphere() {
        // Simple lat/lon sphere
        const pos: number[] = [];
        const norm: number[] = [];
        const idx: number[] = [];
        const latB = 16, lonB = 24;
        for (let y = 0; y <= latB; y++) {
            const v = y / latB;
            const phi = v * Math.PI;
            for (let x = 0; x <= lonB; x++) {
                const u = x / lonB;
                const theta = u * 2 * Math.PI;
                const sy = Math.cos(phi);
                const r = Math.sin(phi);
                const sx = r * Math.cos(theta);
                const sz = r * Math.sin(theta);
                pos.push(sx, sy, sz);
                norm.push(sx, sy, sz);
            }
        }
        for (let y = 0; y < latB; y++) {
            for (let x = 0; x < lonB; x++) {
                const a = (y * (lonB + 1)) + x;
                const b = a + 1;
                const c = ((y + 1) * (lonB + 1)) + x;
                const d = c + 1;
                idx.push(a, c, b);
                idx.push(b, c, d);
            }
        }

        const gl = this.gl;
        const pb = gl.createBuffer()!; gl.bindBuffer(gl.ARRAY_BUFFER, pb); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(pos), gl.STATIC_DRAW);
        const nb = gl.createBuffer()!; gl.bindBuffer(gl.ARRAY_BUFFER, nb); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(norm), gl.STATIC_DRAW);
        const ib = gl.createBuffer()!; gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(idx), gl.STATIC_DRAW);

        this.unitSphere = { pos: pb, norm: nb, idx: ib, count: idx.length };
    }

    public updatePtv(mesh: MeshBuffers | null, bounds: Bounds3D | null) {
        const gl = this.gl;
        if (!mesh) {
            this.ptvBuf = null;
            return;
        }
        // this.bounds = bounds;

        // Auto center
        if (bounds) {
            // const cx = (bounds.uMin + bounds.uMax) / 2; 
            // Wait, viewer expects Patient Coords. bounds are UVW.
            // But mesh is generated from UVW ?? No, buildMeshFromLayeredCake (in layeredCake.ts)
            // It uses `layers.zCenter` (W) and `poly.outer` (UV).
            // So the mesh is in UVW coordinates. 
            // However, the spheres are in Patient coordinates (generated by flow.ts).

            // This is a mismatch from legacy.
            // Legacy app.js: buildMeshFromLayeredCake returns mesh in UVW.
            // Legacy draws PTV in UVW space?
            // Legacy viewer setup:
            // "Viewer operates in UVW or Patient?"
            // render() applies `state.volume.rowCos` etc?

            // Legacy viewer3d.js just draws what it gets.
            // If we mix PTV (UVW) and Spheres (Patient), we need to transform one or the other.
            // Or transform PTV to patient using `uvwToPatient`.
            // OR keep viewer in Patient Space.

            // Since `generateSpheresFlow` returns spheres in Patient Coords (I verified `uvwToPatient` call).
            // We should transform PTV to Patient Coords for rendering.
            // But `buildMeshFromLayeredCake` returns UVW coords (u,v,z).
            // We can pass `volume` to viewer and use Model Matrix to transform UVW->Patient.
            // Model Matrix = [rowCos, colCos, normal, origin].

            // I'll add `setVolumeOrientation` method.
        }

        const pb = gl.createBuffer()!; gl.bindBuffer(gl.ARRAY_BUFFER, pb); gl.bufferData(gl.ARRAY_BUFFER, mesh.positions, gl.STATIC_DRAW);
        const nb = gl.createBuffer()!; gl.bindBuffer(gl.ARRAY_BUFFER, nb); gl.bufferData(gl.ARRAY_BUFFER, mesh.normals, gl.STATIC_DRAW);
        const ib = gl.createBuffer()!; gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, mesh.indices, gl.STATIC_DRAW);
        this.ptvBuf = { pos: pb, norm: nb, idx: ib, count: mesh.indices.length };
    }

    public setSpheres(spheres: Sphere[]) {
        this.spheres = spheres;
    }

    private meshMat: Float32Array = mat4Identity();

    public setVolumeOrientation(row: number[], col: number[], n: number[]) {
        // Mat4 to transform UVW to Patient (used if we rendered volume texture)
        // PTV Mesh is already aligned to axes, just needs Rotation.
        // Wait, LayeredCake u = dot(P, r), v = dot(P, c).
        // P = u*r + v*c + z*n.
        // So P = [r c n] * [u v z]'.
        // So Model Matrix is just the rotation [r c n].
        const mm = new Float32Array(16);
        mm[0] = row[0]; mm[1] = row[1]; mm[2] = row[2]; mm[3] = 0;
        mm[4] = col[0]; mm[5] = col[1]; mm[6] = col[2]; mm[7] = 0;
        mm[8] = n[0]; mm[9] = n[1]; mm[10] = n[2]; mm[11] = 0;
        mm[12] = 0; mm[13] = 0; mm[14] = 0; mm[15] = 1;

        // One subtlety: `z` for layer is dot(P, n). Which could have origin offset?
        // extractCtSlices: s.z = dot3(s.ipp, s.normal).
        // Yes, these are projections from WORLD ORIGIN.
        // So P = u*r + v*c + z*n EXACTLY reconstructs P in World Space.
        // And `pos` contains (u, v, z).
        // So meshMat = [r c n 0; 0 0 0 1] is correct.
        this.meshMat = mm;
    }

    public render() {
        const gl = this.gl;
        gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
        gl.clearColor(0.1, 0.1, 0.1, 1);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

        const aspect = gl.drawingBufferWidth / gl.drawingBufferHeight;
        const proj = mat4Perspective(Math.PI / 4, aspect, 1, 5000);

        // Camera setup
        const cx = Math.cos(this.pitch) * Math.sin(this.yaw);
        const cz = Math.cos(this.pitch) * Math.cos(this.yaw);
        const cy = Math.sin(this.pitch);

        const eye = [
            this.target[0] + cx * this.dist,
            this.target[1] + cy * this.dist,
            this.target[2] + cz * this.dist
        ];

        const view = mat4LookAt(eye, this.target, [0, 0, 1]);
        const vp = mat4Multiply(proj, view);

        // Draw PTV (UVW -> Patient -> Clip)
        if (this.ptvBuf && this.ptvProg) {
            gl.useProgram(this.ptvProg);
            const mvp = mat4Multiply(vp, this.meshMat); // use meshMat (Rotation only)

            gl.uniformMatrix4fv(gl.getUniformLocation(this.ptvProg, 'uMVP'), false, mvp);
            gl.uniform3fv(gl.getUniformLocation(this.ptvProg, 'uColor'), this.ptvColor);
            gl.uniform1f(gl.getUniformLocation(this.ptvProg, 'uAlpha'), 0.3); // Transparent

            // Bind buffers
            gl.bindBuffer(gl.ARRAY_BUFFER, this.ptvBuf.pos);
            const locPos = gl.getAttribLocation(this.ptvProg, 'aPos');
            gl.vertexAttribPointer(locPos, 3, gl.FLOAT, false, 0, 0);
            gl.enableVertexAttribArray(locPos);

            gl.bindBuffer(gl.ARRAY_BUFFER, this.ptvBuf.norm);
            const locNorm = gl.getAttribLocation(this.ptvProg, 'aNorm');
            gl.vertexAttribPointer(locNorm, 3, gl.FLOAT, false, 0, 0);
            gl.enableVertexAttribArray(locNorm);

            gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.ptvBuf.idx);
            gl.drawElements(gl.TRIANGLES, this.ptvBuf.count, gl.UNSIGNED_INT, 0);

            // X-ray effect: draw backfaces then frontfaces?
            // Legacy did: gl.disable(gl.DEPTH_TEST) for X-ray like effect?
            // Actually legacy code line 557: gl.drawElements...
            // It used custom blending or depth func?
            // For now standard transparency is fine.
        }

        // Draw Spheres (Already in Patient space)
        if (this.spheres.length && this.unitSphere && this.sphereProg) {
            gl.useProgram(this.sphereProg);
            // Model = Identity (Spheres are in world/patient coords)
            gl.uniformMatrix4fv(gl.getUniformLocation(this.sphereProg, 'uMVP'), false, vp);
            gl.uniform1f(gl.getUniformLocation(this.sphereProg, 'uAlpha'), 0.8);

            gl.bindBuffer(gl.ARRAY_BUFFER, this.unitSphere.pos);
            const locPos = gl.getAttribLocation(this.sphereProg, 'aPos');
            gl.vertexAttribPointer(locPos, 3, gl.FLOAT, false, 0, 0);
            gl.enableVertexAttribArray(locPos);

            gl.bindBuffer(gl.ARRAY_BUFFER, this.unitSphere.norm);
            const locNorm = gl.getAttribLocation(this.sphereProg, 'aNorm');
            gl.vertexAttribPointer(locNorm, 3, gl.FLOAT, false, 0, 0);
            gl.enableVertexAttribArray(locNorm);

            gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.unitSphere.idx);

            for (const s of this.spheres) {
                let color = [1, 1, 1];
                if (s.kind === 'peak') color = [1, 0, 0];
                else if (s.kind === 'warm') color = [1, 0.5, 0];
                else color = [0, 0.5, 1];

                gl.uniform3fv(gl.getUniformLocation(this.sphereProg, 'uColor'), color);
                gl.uniform3fv(gl.getUniformLocation(this.sphereProg, 'uCenter'), [s.center[0], s.center[1], s.center[2]]);
                gl.uniform1f(gl.getUniformLocation(this.sphereProg, 'uRadius'), s.r);

                gl.drawElements(gl.TRIANGLES, this.unitSphere.count, gl.UNSIGNED_SHORT, 0);
            }
        }
    }
}
