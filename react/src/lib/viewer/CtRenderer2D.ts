export interface RenderParams {
    width: number;
    height: number;
    data: Float32Array;
    wlMin: number;
    wlMax: number;
    // Normalized device coordinates or layout params?
    // The legacy renderer took displayW, displayH... but handled viewport logic itself.
    // For simplicity, we will let the GL render to the full canvas, 
    // and handle zoom/pan via the vertex shader or simpler:
    // Update: Legacy `createCtGlRenderer` handled letterboxing/zoom via vertex positions.
    // We should replicate that or just render a full-quad and rely on CSS/Canvas scaling?
    // Better to handle it in shader/verts so we can have sub-pixel precision for "zoom".

    // Actually, legacy render() took:
    // displayW, displayH, drawW, drawH, offsetX, offsetY, invertX, invertY

    // We will stick to a simpler approach:
    // The Canvas size is the viewport size.
    // We pass the texture coordinates and vertex positions to map the image to the canvas.

    // Let's pass the "geometry" that defines where the image lands on the canvas.
    // x0, y0, x1, y1 (normalized device coords -1..1)
    // u0, v0, u1, v1 (texture coords 0..1)
}

const VS_SRC = `
    attribute vec2 aPos;
    attribute vec2 aTex;
    varying vec2 vTex;
    void main(){
        gl_Position = vec4(aPos, 0.0, 1.0);
        vTex = aTex;
    }
`;

const FS_SRC = `
    precision mediump float;
    varying vec2 vTex;
    uniform sampler2D uTex;
    uniform float uMin;
    uniform float uMax;
    float clamp01(float x){ return clamp(x, 0.0, 1.0); }
    void main(){
        float v = texture2D(uTex, vTex).r;
        float t = clamp01((v - uMin) / max(1e-6, (uMax - uMin)));
        gl_FragColor = vec4(vec3(t), 1.0);
    }
`;

export class CtRenderer2D {
    private gl: WebGLRenderingContext | null = null;
    private prog: WebGLProgram | null = null;
    private tex: WebGLTexture | null = null;
    private buf: WebGLBuffer | null = null;

    private locPos: number = -1;
    private locTex: number = -1;
    private locMin: WebGLUniformLocation | null = null;
    private locMax: WebGLUniformLocation | null = null;

    constructor(canvas: HTMLCanvasElement) {
        let gl = canvas.getContext('webgl', { premultipliedAlpha: false, alpha: false });
        if (!gl) gl = canvas.getContext('experimental-webgl', { premultipliedAlpha: false, alpha: false }) as WebGLRenderingContext;

        if (!gl) {
            console.error('WebGL unavailable for CT renderer');
            return;
        }

        // Ensure float support
        if (!gl.getExtension('OES_texture_float')) {
            console.error('OES_texture_float missing');
            return; // TODO: Fallback to Uint8??
        }

        this.gl = gl;
        this.initShaders();
        this.initBuffers();
    }

    private initShaders() {
        const gl = this.gl!;
        const vs = this.compile(gl.VERTEX_SHADER, VS_SRC);
        const fs = this.compile(gl.FRAGMENT_SHADER, FS_SRC);
        if (!vs || !fs) return;

        const prog = gl.createProgram();
        if (!prog) return;
        gl.attachShader(prog, vs);
        gl.attachShader(prog, fs);
        gl.linkProgram(prog);

        if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
            console.error('Program link failed:', gl.getProgramInfoLog(prog));
            return;
        }

        this.prog = prog;
        this.locPos = gl.getAttribLocation(prog, 'aPos');
        this.locTex = gl.getAttribLocation(prog, 'aTex');
        this.locMin = gl.getUniformLocation(prog, 'uMin');
        this.locMax = gl.getUniformLocation(prog, 'uMax');
    }

    private compile(type: number, src: string) {
        const gl = this.gl!;
        const sh = gl.createShader(type);
        if (!sh) return null;
        gl.shaderSource(sh, src);
        gl.compileShader(sh);
        if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
            console.error('Shader compile failed:', gl.getShaderInfoLog(sh));
            return null;
        }
        return sh;
    }

    private initBuffers() {
        const gl = this.gl!;
        this.buf = gl.createBuffer();
        this.tex = gl.createTexture();

        gl.bindTexture(gl.TEXTURE_2D, this.tex);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    }

    public render(
        data: Float32Array,
        dataW: number,
        dataH: number,
        wlMin: number,
        wlMax: number,
        // Layout params
        viewW: number, // canvas visible width (px)
        viewH: number, // canvas visible height (px)
        dstX: number, // where to draw X (px)
        dstY: number, // where to draw Y (px)
        dstW: number, // drawn width (px)
        dstH: number, // drawn height (px)
        invertX: boolean = false,
        invertY: boolean = false
    ) {
        if (!this.gl || !this.prog) return;
        const gl = this.gl;

        gl.viewport(0, 0, viewW, viewH); // Assume render to whole canvas
        gl.useProgram(this.prog);

        // Update Texture
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.tex);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0);
        gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);

        // Re-upload texture only if needed? For now upload every frame (simpler, optimization later)
        // Actually, if tracking changes is hard, upload.
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, dataW, dataH, 0, gl.LUMINANCE, gl.FLOAT, data);

        gl.uniform1f(this.locMin, wlMin);
        gl.uniform1f(this.locMax, wlMax);

        // Calculate Normalized Device Coordinates (-1 to 1)
        // Canvas space: 0,0 top-left, W,H bottom-right
        // GL space: -1,1 top-left, 1,-1 bottom-right

        const x0 = (dstX / viewW) * 2 - 1;
        const x1 = ((dstX + dstW) / viewW) * 2 - 1;

        // Y in canvas is 0 at top. GL is 1 at top.
        const yTop = 1 - (dstY / viewH) * 2;
        const yBot = 1 - ((dstY + dstH) / viewH) * 2;

        // Texture Coords (0..1)
        // Sample centers
        const u0 = 0.5 / dataW;
        const v0 = 0.5 / dataH;
        const u1 = 1 - u0;
        const v1 = 1 - v0;

        const uL = invertX ? u1 : u0;
        const uR = invertX ? u0 : u1;
        // InvertY: false => row 0 at top. GL tex coords 0 is bottom? 
        // Logic from legacy:
        // "gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0);" -> Data row 0 is at v=0 (bottom of texture).
        // If we want row 0 at top of screen:
        // vTop should be v=0 (bottom of tex)?
        // Wait, Texture space: (0,0) is bottom-left. (1,1) is top-right.
        // Data row 0 is bottom row if UNPACK_FLIP is 0.
        // Usually CT data row 0 is top-left in memory (dicom-parser/dcmjs).
        // So row 0 is mapped to v=0 (bottom).
        // If we want row 0 at TOP of screen, we map v=0 to y=1 (top).

        // Legacy: vTop = invertY ? v1 : v0;
        // invY = false. vTop = v0 (approx 0).
        // The verts use yTop. So yTop gets vTop=0.
        // yTop is +1. So +1 (top) gets v=0 (data row 0). 
        // This puts row 0 at top. Correct.

        const vTop = invertY ? v1 : v0;
        const vBot = invertY ? v0 : v1;

        const verts = new Float32Array([
            x0, yBot, uL, vBot, // BL
            x1, yBot, uR, vBot, // BR
            x0, yTop, uL, vTop, // TL
            x1, yTop, uR, vTop  // TR
        ]);

        gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
        gl.bufferData(gl.ARRAY_BUFFER, verts, gl.DYNAMIC_DRAW);

        const stride = 4 * 4;
        gl.enableVertexAttribArray(this.locPos);
        gl.vertexAttribPointer(this.locPos, 2, gl.FLOAT, false, stride, 0);

        gl.enableVertexAttribArray(this.locTex);
        gl.vertexAttribPointer(this.locTex, 2, gl.FLOAT, false, stride, 8);

        gl.clearColor(0, 0, 0, 1);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
}
