
export function dt1dSquared(f: Float64Array, n: number, w2: number, v: Int32Array, z: Float64Array, out: Float64Array) {
    const nn = n | 0;
    if (nn <= 0) return;
    const ww2 = Math.max(1e-12, Number(w2) || 1);
    let k = 0;
    v[0] = 0;
    z[0] = -Infinity;
    z[1] = Infinity;

    for (let q = 1; q < nn; q++) {
        let s = 0;
        while (true) {
            const p = v[k];
            // Intersection of parabolas at p and q
            // s = ((f[q] + q^2) - (f[p] + p^2)) / (2*q - 2*p)
            // with spacing w: ((f[q] + (q*w)^2) - (f[p] + (p*w)^2)) / (2*q*w^2 - 2*p*w^2) ??
            // Legacy code: s = ((f[q] + ww2 * q * q) - (f[p] + ww2 * p * p)) / (2 * ww2 * (q - p));
            s = ((f[q] + ww2 * q * q) - (f[p] + ww2 * p * p)) / (2 * ww2 * (q - p));

            if (s <= z[k]) {
                k--;
                if (k < 0) { k = 0; break; }
                continue;
            }
            break;
        }
        k++;
        v[k] = q;
        z[k] = s;
        z[k + 1] = Infinity;
    }

    k = 0;
    for (let q = 0; q < nn; q++) {
        while (z[k + 1] < q) k++;
        const p = v[k];
        const d = q - p;
        out[q] = ww2 * d * d + f[p];
    }
}

export function edt3dSquaredFromMask(
    baseMask: Uint8Array,
    bx: number, by: number, bz: number,
    cs: number, rs: number, zs: number
): Float64Array | null {
    if (!baseMask || bx <= 0 || by <= 0 || bz <= 0) return null;
    const n = bx * by * bz;
    if (baseMask.length !== n) return null;

    const w2x = Math.max(1e-12, cs * cs);
    const w2y = Math.max(1e-12, rs * rs);
    const w2z = Math.max(1e-12, zs * zs);
    const INF = 1e20;

    const maxDim = Math.max(bx, by, bz);
    const f = new Float64Array(maxDim);
    const out = new Float64Array(maxDim);
    const v = new Int32Array(maxDim);
    const z = new Float64Array(maxDim + 1);

    const tmpX = new Float64Array(n);
    const tmpY = new Float64Array(n);
    const dt = new Float64Array(n);
    const idx3 = (x: number, y: number, zz: number) => x + bx * (y + by * zz);

    // Pass X
    for (let zz = 0; zz < bz; zz++) {
        for (let y = 0; y < by; y++) {
            const off = idx3(0, y, zz);
            for (let x = 0; x < bx; x++) f[x] = baseMask[off + x] ? 0 : INF;
            dt1dSquared(f, bx, w2x, v, z, out);
            for (let x = 0; x < bx; x++) tmpX[off + x] = out[x];
        }
    }

    // Pass Y
    for (let zz = 0; zz < bz; zz++) {
        for (let x = 0; x < bx; x++) {
            for (let y = 0; y < by; y++) f[y] = tmpX[idx3(x, y, zz)];
            dt1dSquared(f, by, w2y, v, z, out);
            for (let y = 0; y < by; y++) tmpY[idx3(x, y, zz)] = out[y];
        }
    }

    // Pass Z
    for (let y = 0; y < by; y++) {
        for (let x = 0; x < bx; x++) {
            for (let zz = 0; zz < bz; zz++) f[zz] = tmpY[idx3(x, y, zz)];
            dt1dSquared(f, bz, w2z, v, z, out);
            for (let zz = 0; zz < bz; zz++) dt[idx3(x, y, zz)] = out[zz];
        }
    }

    return dt;
}
