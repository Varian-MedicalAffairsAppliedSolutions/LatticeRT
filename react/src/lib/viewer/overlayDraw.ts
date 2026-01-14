import type { Volume, Sphere, CtSlice, ViewState } from '../../types';
import type { LayeredCakeStructure } from '../geometry/layeredCake';
import { dot3, sub3, type Vec3 } from '../math';
import { parseImagePosition } from '../dicom/loader';

export interface OverlayLayout {
    width: number;
    height: number;
    offsetX: number;
    offsetY: number;
    scalePxPerMm: number;
    invertX: boolean;
    invertY: boolean;
    mmW: number;
    mmH: number;
    originX?: number; // Origin offset for pan
    originY?: number;
}

export function computeLayout(
    view: ViewState,
    volume: Volume,
    plane: 'axial' | 'coronal' | 'sagittal',
    width: number,
    height: number
): OverlayLayout {
    // Default fallback
    let zoom = 1;
    let panX = 0;
    let panY = 0;
    let mmW = 200;
    let mmH = 200;
    let invertX = false;
    let invertY = false;

    if (plane === 'axial') {
        zoom = view.zoomAxial;
        panX = view.panAxial.x;
        panY = view.panAxial.y;
        mmW = volume.width * volume.colSpacing;
        mmH = volume.height * volume.rowSpacing;
        // Standard Axial: looking from feet up.
        // Patient Right is Screen Left (invertX).
        // Anterior is Top. Posterior is Bottom.
        // In DICOM (HFS): +X=Left, +Y=Posterior.
        // We want +X(Left) to be Right side of screen -> InvertX logic depends on how we map data
        // Standard radiology: Right is Left.
        // If data[0] is Right, it should be on Left of screen.
        // Let's rely on standard DICOM orientation logic:
        // rowCos usually [1,0,0] (L) -> col 0 is Right (if origin is right).
        // Wait, standard HFS: 
        // X increases Left. Y increases Posterior.
        // Origin (0,0) is R-A-F (Right-Anterior-Feet) usually?
        // If rowCos=[1,0,0], col increases Left.
        // So col 0 is Right. col N is Left.
        // Screen 0 is Left. Screen W is Right.
        // We want col 0 (Right) on Screen Left? No, Right is Left.
        // We want Patient Right on Screen Left.
        // If col 0 is Right, we want it on Left.
        // So no invertX needed if we map 0->0?
        // Legacy app uses explicit `computeDesiredViewFrames` to decide.
        // We will simplistic defaults matching likely legacy behavior for now.
        // Legacy: Axial invertX: dot(X, right) < 0.
        // App defaults: Axial Right = [1,0,0]. Data Row = [1,0,0]. dot > 0.
        // So no invert?

        // Actually, let's just implement pan/zoom scaling first.
    } else if (plane === 'coronal') {
        zoom = view.zoomCoronal;
        panX = view.panCoronal.x;
        panY = view.panCoronal.y;
        mmW = volume.width * volume.colSpacing;
        mmH = volume.depth * volume.sliceSpacing;
    } else { // sagittal
        zoom = view.zoomSagittal;
        panX = view.panSagittal.x;
        panY = view.panSagittal.y;
        mmW = volume.height * volume.rowSpacing;
        mmH = volume.depth * volume.sliceSpacing;
    }

    // Fit logic: scale to fit mmW/mmH into width/height
    const scaleFit = Math.min(width / mmW, height / mmH) * 0.9;
    const scale = scaleFit * zoom;

    // Center it
    const drawW = mmW * scale;
    const drawH = mmH * scale;
    const offsetX = (width - drawW) / 2 + panX;
    const offsetY = (height - drawH) / 2 + panY;

    return {
        width, height,
        offsetX, offsetY,
        scalePxPerMm: scale,
        invertX, invertY,
        mmW, mmH
    };
}

export function drawOverlay(
    ctx: CanvasRenderingContext2D,
    volume: Volume,
    view: ViewState,
    layout: OverlayLayout,
    plane: 'axial' | 'coronal' | 'sagittal',
    targetStruct: LayeredCakeStructure | null,
    spheres: Sphere[]
) {
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, layout.width, layout.height);

    // Setup transform
    ctx.setTransform(dpr * layout.scalePxPerMm, 0, 0, dpr * layout.scalePxPerMm, dpr * layout.offsetX, dpr * layout.offsetY);


    // Draw content
    drawGrid(ctx, layout, 50); // Hardcoded 50mm grid for now

    if (plane === 'axial') {
        drawAxialContent(ctx, volume, view, targetStruct, spheres, layout);
    } else {
        // For Cor/Sag we don't draw struct yet, but we MUST draw spheres
        if (targetStruct) {
            drawStructureGeneric(ctx, volume, view, plane, targetStruct, layout.scalePxPerMm);
        }
        if (spheres.length) {
            drawSpheresGeneric(ctx, volume, view, plane, spheres, layout.scalePxPerMm);
        }
    }

    if (plane === 'axial') {
        drawCrosshair(ctx, volume, view, plane, layout);
    } else if (plane === 'coronal') {
        drawCrosshair(ctx, volume, view, plane, layout);
    } else if (plane === 'sagittal') {
        drawCrosshair(ctx, volume, view, plane, layout);
    }

    // Restore for overlaid text
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    drawOrientationLabels(ctx, layout.width, layout.height, plane);
}

function drawGrid(ctx: CanvasRenderingContext2D, layout: OverlayLayout, spacing: number) {
    ctx.save();
    ctx.strokeStyle = 'rgba(210,210,210,0.18)';
    ctx.lineWidth = 1 / layout.scalePxPerMm; // 1px equivalent
    ctx.beginPath();

    const countX = Math.floor(layout.mmW / spacing) + 1;
    const countY = Math.floor(layout.mmH / spacing) + 1;

    for (let i = 0; i < countX; i++) {
        const x = i * spacing;
        ctx.moveTo(x, 0);
        ctx.lineTo(x, layout.mmH);
    }
    for (let i = 0; i < countY; i++) {
        const y = i * spacing;
        ctx.moveTo(0, y);
        ctx.lineTo(layout.mmW, y);
    }
    ctx.stroke();
    ctx.restore();
}

function drawAxialContent(
    ctx: CanvasRenderingContext2D,
    volume: Volume,
    view: ViewState,
    targetStruct: LayeredCakeStructure | null,
    spheres: Sphere[],
    layout: OverlayLayout
) {
    const k = view.k;
    const slice = volume.slices[k];
    if (!slice) return;

    if (targetStruct) {
        drawStructureOnSlice(ctx, volume, slice, targetStruct, layout.scalePxPerMm);
    }

    if (spheres.length) {
        drawSpheresGeneric(ctx, volume, view, 'axial', spheres, layout.scalePxPerMm);
    }
}

function drawStructureGeneric(
    ctx: CanvasRenderingContext2D,
    volume: Volume,
    view: ViewState,
    plane: 'coronal' | 'sagittal',
    struct: LayeredCakeStructure,
    scale: number
) {
    // Intersect LayeredCake with plane.
    // Cake defined in Patient Coords (mm) projected on Slice (Axial).

    const o = volume.origin;
    const r = volume.rowCos as Vec3; // X dir
    const c = volume.colCos as Vec3; // Y dir
    const n = volume.normal as Vec3; // Z dir

    // Base offsets for the whole volume (Origin projected onto axes)
    const uInit = dot3(o, r);
    const vInit = dot3(o, c);

    const cutPosIndex = plane === 'coronal' ? view.row : view.col;
    const isCor = plane === 'coronal';
    const ss = volume.sliceSpacing;
    const depth = volume.depth;

    // Calculate cut position in mm (same coordinate space as p[0]/p[1])
    let cutValMm = 0;
    if (isCor) {
        // Coronal Cut: constant V (Y-axis index). 
        cutValMm = vInit + cutPosIndex * volume.rowSpacing;
    } else {
        // Sagittal Cut: constant U (X-axis index).
        cutValMm = uInit + cutPosIndex * volume.colSpacing;
    }

    ctx.save();
    ctx.strokeStyle = 'rgba(0,153,153,0.95)';
    ctx.lineWidth = 1.5 / scale;
    ctx.beginPath();

    const screenOffset = isCor ? uInit : vInit;

    struct.layers.forEach(layer => {
        const segments: number[] = [];

        const intersectPoly = (poly: number[][]) => {
            for (let i = 0; i < poly.length; i++) {
                const p1 = poly[i];
                const p2 = poly[(i + 1) % poly.length];

                // p[0] is U (Row axis mm), p[1] is V (Col axis mm).
                const val1 = isCor ? p1[1] : p1[0];
                const val2 = isCor ? p2[1] : p2[0];

                // Check if crossing cutValMm
                if ((val1 <= cutValMm && val2 > cutValMm) || (val2 <= cutValMm && val1 > cutValMm)) {
                    // Linear interpolate t
                    const t = (cutValMm - val1) / (val2 - val1);
                    // Find other coord (orthogonal to cut)
                    const o1 = isCor ? p1[0] : p1[1];
                    const o2 = isCor ? p2[0] : p2[1];
                    const inter = o1 + t * (o2 - o1);
                    segments.push(inter);
                }
            }
        };

        layer.polygons.forEach(p => {
            intersectPoly(p.outer);
            p.holes.forEach(h => intersectPoly(h));
        });

        //segments.sort((a, b) => a - b);
        // Draw horizontal lines between pairs? 
        // Simple visualization: just draw bounds or points.
        // If sorting works, we can draw lines.
        // But convexity might be complex. 
        // Let's just draw small ticks or lines for all segments.
        // Better: draw ticks at intersection. Or connect min/max?
        // If we connect min/max we might fill holes.
        // Let's sort and connect pairs.
        segments.sort((a, b) => a - b);

        // Z position on screen
        // zCenter is MM.
        // We want Screen Y (mm from Top).
        // Top is Max Z. Bottom is Min Z.
        // Z_rel = zCenter - origin_z.
        // Screen Y = (Depth_mm) - Z_rel.
        const zOrigin = dot3(o, n);
        const zVal = layer.zCenter;
        const volumeHeightMm = depth * ss;
        const sy = volumeHeightMm - (zVal - zOrigin);

        for (let i = 0; i < segments.length; i += 2) {
            if (i + 1 >= segments.length) break;

            // segments[i] is mm coordinate.
            // Screen X = segment - screenOffset.
            const x1 = segments[i] - screenOffset;
            const x2 = segments[i + 1] - screenOffset;

            // Draw ticks (vertical boundary markers)
            const h = 4 / scale;
            ctx.moveTo(x1, sy - h); ctx.lineTo(x1, sy + h);
            ctx.moveTo(x2, sy - h); ctx.lineTo(x2, sy + h);
        }
    });

    ctx.stroke();
    ctx.restore();
}

function drawStructureOnSlice(
    ctx: CanvasRenderingContext2D,
    volume: Volume,
    slice: CtSlice,
    struct: LayeredCakeStructure,
    scale: number
) {
    // Find layer
    const wSlice = dot3(parseImagePosition(slice.dataSet), volume.normal as Vec3);
    const layers = struct.layers;

    // Simple binary search or scan for layer
    // TODO: Use efficient find like legacy
    const layer = layers.find(l => Math.abs(l.zCenter - wSlice) < (l.thickness / 2 + 0.1));

    if (!layer) return;

    const u0 = dot3(parseImagePosition(slice.dataSet), volume.rowCos as Vec3);
    const v0 = dot3(parseImagePosition(slice.dataSet), volume.colCos as Vec3);

    ctx.save();
    ctx.strokeStyle = 'rgba(0,153,153,0.95)';
    ctx.lineWidth = 1.5 / scale;

    const drawPoly = (poly: number[][]) => {
        ctx.beginPath();
        poly.forEach((p, i) => {
            const x = p[0] - u0;
            const y = p[1] - v0;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        });
        ctx.closePath();
        ctx.stroke();
    };

    layer.polygons.forEach(p => {
        drawPoly(p.outer);
        p.holes.forEach(h => drawPoly(h));
    });
    ctx.restore();
}

function drawSpheresGeneric(
    ctx: CanvasRenderingContext2D,
    volume: Volume,
    view: ViewState,
    plane: 'axial' | 'coronal' | 'sagittal',
    spheres: Sphere[],
    scale: number
) {
    const o = volume.origin;
    const r = volume.rowCos as Vec3; // X dir
    const c = volume.colCos as Vec3; // Y dir
    const n = volume.normal as Vec3; // Z dir
    const rss = volume.rowSpacing;
    const css = volume.colSpacing;
    const sss = volume.sliceSpacing;

    let planeNormal: Vec3;
    let planeDist: number; // distance from origin along normal

    // Axes for projection on screen (horizontal, vertical)
    let uAxis: Vec3;
    let vAxis: Vec3;
    // Offsets
    console.log(`drawSpheresGeneric: plane=${plane}`); // Debug
    if (plane === 'axial') {
        planeNormal = n;
        // dist is k * sss. Wait, slice Z positions are non-uniform?
        // Let's assume uniform or use specific slice Z.
        // For generic fit, k * sss is approx.
        // Better: use volume.slices[k].z?
        // But volume.origin[2] + k*sss is safer for geometry math if we treat standard grid.
        planeDist = view.k * sss;
        uAxis = r; // Screen X is Patient X
        vAxis = c; // Screen Y is Patient Y
    } else if (plane === 'coronal') {
        // Fix Y (row). Normal is ColCos (Y direction).
        planeNormal = c;
        planeDist = view.row * rss;
        uAxis = r; // Screen X is Patient X (row index? No, Col index. X axis)
        vAxis = n; // Screen Y is Patient Z (Vertical)

        // Note: For Coronal, Z is flipped in display (d-1-k).
        // Our draw logic for spheres should match the image flip.
        // Image Y=0 -> Z=Max. Image Y=Max -> Z=0.
        // We draw in Screen Coords (0..mmH).
        // If we map project Z -> Screen Y.
        // origin[2] is Z=0.
        // Screen Y should be (depth*sss - z).
        // Let's handle flip manually below.
    } else { // sagittal
        // Fix X (col). Normal is RowCos (X direction).
        planeNormal = r;
        planeDist = view.col * css;
        uAxis = c; // Screen X is Patient Y (Row index)
        vAxis = n; // Screen Y is Patient Z
    }

    ctx.lineWidth = 1.25 / scale;

    for (const s of spheres) {
        // Center relative to origin
        const v = sub3(s.center, o);

        // Dist to plane
        const d = dot3(v, planeNormal) - planeDist;
        if (Math.abs(d) > s.r) continue;

        ctx.strokeStyle = getSphereColor(s.kind);
        const rad = Math.sqrt(Math.max(0, s.r * s.r - d * d));

        // Project center to screen axes
        let xMm = dot3(v, uAxis);
        let yMm = dot3(v, vAxis);

        // Adjust for Z-flip in Cor/Sag
        if (plane !== 'axial') {
            // In MPR we export Z reversed: out[(d-1-z)...]
            // So pixel 0 is Z_Max. Pixel H is Z_0.
            // yMm calculated above is distance from Z_0 (Origin).
            // We want distance from Top of Screen (Z_Max).
            // ScreenY = (VolumeDepth - z)
            const volumeHeightMm = volume.depth * sss;
            yMm = volumeHeightMm - yMm;
        }

        ctx.beginPath();
        ctx.ellipse(xMm, yMm, rad, rad, 0, 0, Math.PI * 2);
        ctx.stroke();
    }
}

function getSphereColor(kind: string) {
    if (kind === 'peak') return 'rgba(255,0,0,0.8)';
    if (kind === 'warm') return 'rgba(255,165,0,0.8)';
    return 'rgba(0,128,255,0.8)';
}

function drawCrosshair(
    ctx: CanvasRenderingContext2D,
    volume: Volume,
    view: ViewState,
    plane: string,
    layout: OverlayLayout
) {
    const scale = layout.scalePxPerMm;
    ctx.save();
    ctx.strokeStyle = 'rgba(236,102,2,0.6)';
    ctx.lineWidth = 1.5 / scale;
    ctx.beginPath();

    // Line lengths
    const maxX = layout.mmW;
    const maxY = layout.mmH;

    let lx = 0, ly = 0;

    if (plane === 'axial') {
        lx = view.col * volume.colSpacing;
        ly = view.row * volume.rowSpacing;
    } else if (plane === 'coronal') {
        lx = view.col * volume.colSpacing;
        // Z is inverted in view? No, render logic handled inversion?
        // In MPR we flipped Z. So 0 is Top (Head). k increases effectively down visually?
        // Wait, MPR Z=0 is at bottom of array. 
        // If we want to show k on this flipped image:
        // Image Y=0 corresponds to max Z?
        // We flipped Z logic in mpr.ts: `out[(d - 1 - z) * outW + x]`. 
        // So row `r` in image corresponds to `d - 1 - z`.
        // `z = d - 1 - r`.
        // So given `k`, where is it?
        // `r = d - 1 - k`.
        // So pixel Y = (depth - 1 - k) * spacing.
        lx = view.col * volume.colSpacing;
        ly = (volume.depth - 1 - view.k) * volume.sliceSpacing;
    } else if (plane === 'sagittal') {
        // X-axis is Row index (Y-axis of volume).
        // Y-axis is Z (k).
        // Image X = row index.
        // Image Y = flipped k.
        lx = view.row * volume.rowSpacing;
        ly = (volume.depth - 1 - view.k) * volume.sliceSpacing;
    }

    ctx.moveTo(lx, 0);
    ctx.lineTo(lx, maxY);
    ctx.moveTo(0, ly);
    ctx.lineTo(maxX, ly);
    ctx.stroke();
    ctx.restore();
}

function drawOrientationLabels(ctx: CanvasRenderingContext2D, w: number, h: number, plane: string) {
    const dpr = window.devicePixelRatio || 1;
    const pad = 12 * dpr;

    ctx.save();
    ctx.fillStyle = 'white';
    ctx.font = `bold ${14 * dpr}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Simplistic labels for HFS Axial
    // Top: A, Bottom: P, Left: R, Right: L (Radiological convention)
    // Legacy mapping:
    // Left: R
    // Right: L
    // Top: A
    // Bottom: P
    if (plane === 'axial') {
        ctx.fillText('A', w / 2, pad);
        ctx.fillText('P', w / 2, h - pad);
        ctx.fillText('R', pad, h / 2);
        ctx.fillText('L', w - pad, h / 2);
    }
    // Coronal: Top=H, Btm=F, Left=R, Right=L
    if (plane === 'coronal') {
        ctx.fillText('H', w / 2, pad);
        ctx.fillText('F', w / 2, h - pad);
        ctx.fillText('R', pad, h / 2);
        ctx.fillText('L', w - pad, h / 2);
    }
    // Sagittal: Top=H, Btm=F, Left=A, Right=P
    if (plane === 'sagittal') {
        ctx.fillText('H', w / 2, pad);
        ctx.fillText('F', w / 2, h - pad);
        ctx.fillText('A', pad, h / 2);
        ctx.fillText('P', w - pad, h / 2);
    }

    ctx.restore();
}
