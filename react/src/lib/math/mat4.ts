export type Mat4 = Float32Array;

export function mat4Identity(): Mat4 {
    const out = new Float32Array(16);
    out[0] = 1; out[5] = 1; out[10] = 1; out[15] = 1;
    return out;
}

export function mat4Perspective(fovy: number, aspect: number, near: number, far: number): Mat4 {
    const out = new Float32Array(16);
    const f = 1.0 / Math.tan(fovy / 2);
    const nf = 1 / (near - far);
    out[0] = f / aspect;
    out[5] = f;
    out[10] = (far + near) * nf;
    out[11] = -1;
    out[14] = (2 * far * near) * nf;
    return out;
}

export function mat4LookAt(eye: number[], center: number[], up: number[]): Mat4 {
    const out = new Float32Array(16);
    const x0 = eye[0], x1 = eye[1], x2 = eye[2];
    const y0 = center[0], y1 = center[1], y2 = center[2];
    const z0 = up[0], z1 = up[1], z2 = up[2];
    let len: number;

    let eyex = x0 - y0;
    let eyey = x1 - y1;
    let eyez = x2 - y2;

    if (Math.abs(eyex) < 1e-6 && Math.abs(eyey) < 1e-6 && Math.abs(eyez) < 1e-6) {
        return mat4Identity();
    }

    len = 1 / Math.hypot(eyex, eyey, eyez);
    eyex *= len; eyey *= len; eyez *= len;

    let upx = z0;
    let upy = z1;
    let upz = z2;

    let xx = upy * eyez - upz * eyey;
    let xy = upz * eyex - upx * eyez;
    let xz = upx * eyey - upy * eyex;
    len = Math.hypot(xx, xy, xz);
    if (!len) {
        xx = 0; xy = 0; xz = 0;
    } else {
        len = 1 / len;
        xx *= len; xy *= len; xz *= len;
    }

    let yx = eyey * xz - eyez * xy;
    let yy = eyez * xx - eyex * xz;
    let yz = eyex * xy - eyey * xx;
    len = Math.hypot(yx, yy, yz);
    if (!len) {
        yx = 0; yy = 0; yz = 0;
    } else {
        len = 1 / len;
        yx *= len; yy *= len; yz *= len;
    }

    out[0] = xx; out[1] = yx; out[2] = eyex;
    out[4] = xy; out[5] = yy; out[6] = eyey;
    out[8] = xz; out[9] = yz; out[10] = eyez;
    out[12] = -(xx * x0 + xy * x1 + xz * x2);
    out[13] = -(yx * x0 + yy * x1 + yz * x2);
    out[14] = -(eyex * x0 + eyey * x1 + eyez * x2);
    out[15] = 1;
    return out;
}

export function mat4Multiply(a: Mat4, b: Mat4): Mat4 {
    const out = new Float32Array(16);
    const a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3];
    const a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7];
    const a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11];
    const a30 = a[12], a31 = a[13], a32 = a[14], a33 = a[15];

    let b0 = b[0], b1 = b[1], b2 = b[2], b3 = b[3];
    out[0] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
    out[1] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
    out[2] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
    out[3] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;

    b0 = b[4]; b1 = b[5]; b2 = b[6]; b3 = b[7];
    out[4] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
    out[5] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
    out[6] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
    out[7] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;

    b0 = b[8]; b1 = b[9]; b2 = b[10]; b3 = b[11];
    out[8] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
    out[9] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
    out[10] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
    out[11] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;

    b0 = b[12]; b1 = b[13]; b2 = b[14]; b3 = b[15];
    out[12] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
    out[13] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
    out[14] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
    out[15] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;
    return out;
}
