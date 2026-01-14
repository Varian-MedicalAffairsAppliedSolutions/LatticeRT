import type { Volume } from '../../types';

export function extractSliceData(volume: Volume, viewType: 'axial' | 'coronal' | 'sagittal', index: number): { data: Float32Array, width: number, height: number } | null {
    if (!volume.scalars) return null;

    const w = volume.width;
    const h = volume.height;
    const d = volume.depth;
    const len = volume.scalars.length;

    if (viewType === 'axial') {
        const k = Math.floor(index);
        if (k < 0 || k >= d) return null;
        const offset = k * w * h;
        if (offset + w * h > len) return null;
        return {
            data: volume.scalars.subarray(offset, offset + w * h), // Zero-copy subarray
            width: w,
            height: h
        };
    } else if (viewType === 'coronal') {
        // Coronal: Fix Y (row), Image is X (width) x Z (depth)
        // Or Z x X? Standard is usually Z is up/down, X is left/right.
        // If we map Z to image Y (rows), and X to image X (cols).
        // Result dim: width x depth
        const y = Math.floor(index);
        if (y < 0 || y >= h) return null;

        const outW = w;
        const outH = d;
        const out = new Float32Array(outW * outH);

        // Loop Z (rows of output), X (cols of output)
        // srcIdx = z * (w*h) + y * w + x
        for (let z = 0; z < d; z++) {
            const zOff = z * w * h;
            const yOff = y * w;
            const rowStart = zOff + yOff;

            // To make Z increase UP (standard view vs image rows down):
            // Image rows go 0..H (top to bottom).
            // Usually Z=0 is bottom (feet) or top (head).
            // If we want Z=0 at Bottom, we render row (d-1-z).
            // But let's export raw grid 0..d and handle flip in renderer invertY.

            for (let x = 0; x < w; x++) {
                // Flip Z (d-1-z) so Z=0 is at bottom (or top depending on convention)
                // If it is upside down now, flipping this index will flip it.
                // Current: z=0 -> row 0 (Top).
                // If Z=0 is Feet, it should be at Bottom.
                out[(d - 1 - z) * outW + x] = volume.scalars[rowStart + x];
            }
        }
        return { data: out, width: outW, height: outH };

    } else if (viewType === 'sagittal') {
        // Sagittal: Fix X (col), Image is Y (width??) x Z (depth)
        // Usually Y is A-P axis. Z is S-I.
        // Result dim: height (rows) x depth
        const x = Math.floor(index);
        if (x < 0 || x >= w) return null;

        const outW = h; // Y becomes X-axis of 2D image
        const outH = d; // Z becomes Y-axis of 2D image
        const out = new Float32Array(outW * outH);

        for (let z = 0; z < d; z++) {
            const zOff = z * w * h;
            // Row offset not needed as we iterate Y

            for (let y = 0; y < h; y++) {
                // srcIdx = z * w * h + y * w + x
                // Flip Z
                out[(d - 1 - z) * outW + y] = volume.scalars[zOff + y * w + x];
            }
        }
        return { data: out, width: outW, height: outH };
    }

    return null;
}
