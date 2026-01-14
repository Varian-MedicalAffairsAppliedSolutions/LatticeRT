import * as dcmjs from 'dcmjs';
import type { Volume, Sphere, SupportState, LatticeState } from '../../types';
import { makeCircleContourPoints, maskToEdgeLoops, simplifyGridLoop } from '../geometry/contours';
import { dot3 } from '../math';
import { getTagString } from './loader';

export function generateRtStruct(
    volume: Volume,
    lattice: LatticeState,
    support: SupportState
): ArrayBuffer | null {
    if (!volume || !volume.slices.length || !lattice.spheres.length) return null;

    // 1. Structure Definitions
    const rois: any[] = [];
    const roiObservations: any[] = [];
    const roiContours: any[] = [];

    let nextRoiNum = 1;

    // Helper to add ROI
    const addRoi = (name: string, color: [number, number, number], type = 'CONTROL') => {
        const num = nextRoiNum++;
        rois.push({
            img: {
                x30060022: num, // ROI Number
                x30060024: num, // Referenced ROI Number
                x30060026: name, // ROI Name
                x30060028: 'GENERATED_ROI' // ROI Description
            },
            color,
            num,
            type
        });

        roiObservations.push({
            x30060082: num, // Observation Number
            x30060084: num, // Referenced ROI Number
            x30060085: 'CONTROL', // RT ROI Interpreted Type
            x30060088: name // ROI Interpreter
        });

        return num;
    };

    // -- Spheres --
    // We group spheres into one ROI usually, or separate?
    // Project requirement: "Sphere Name (ROI)" input. Default "LatticeSpheres".
    // Legacy puts ALL spheres in one ROI if they are peaks?
    // Legacy `splitSpheresByKind` implies we want distinct ROIs for diff kinds?
    // Legacy code (Line 3977) iterates over `sphereGroups`: `peaks`, `warm`, `cold`.
    // And creates ROI for each if present.

    const roiNameBase = lattice.roiName || 'LatticeSpheres';
    const spheres = lattice.spheres;
    const groups: Record<string, Sphere[]> = { peak: [], warm: [], cold: [] };
    spheres.forEach(s => groups[s.kind] && groups[s.kind].push(s));

    const processSphereGroup = (kind: string, list: Sphere[]) => {
        if (!list.length) return;
        const name = kind === 'peak' ? roiNameBase : `${roiNameBase}_${kind}`;
        const color: [number, number, number] = kind === 'peak' ? [255, 0, 0] : (kind === 'warm' ? [255, 165, 0] : [0, 128, 255]);
        const roiNum = addRoi(name, color);

        const contourSequence: any[] = [];

        // Generate contours per slice
        // For each sphere, intersect with slices.
        // Optimization: Sort spheres by Z?
        // Or for each slice, find intersecting spheres?
        // Spheres are small. Better: Iterate spheres, find z-range, iterate slices in range.

        for (const s of list) {

            // w is slice index (approx) relative to origin?
            // No, w is dot(p, normal).
            // slice z positions are in `volume.positions` (or calculated from origin + k*spacing if uniform).
            // `volume.slices[k].z` (implied).
            // Lets iterate all slices? No, too slow (512 slices x 2000 spheres).
            // Use s.center and volume info to find relevant slices.

            // Project center to normal axis
            const wc = dot3(s.center, volume.normal);
            const r = s.r;

            // Find slices with |slice.z - wc| <= r
            // Slices are sorted? `buildCtVolumeFromSeries` sorts them.
            // We can binary search or just scan if efficiency needed.
            // Let's just scan for now or simplistic range mapping if uniform.
            // Assumption: Uniform spacing.
            // slice 0 z = wOrigin.
            // slice k z = wOrigin + k * sliceSpacing? Not always (depends on direction).
            // Use `slice.z` computed in loader.

            for (let k = 0; k < volume.slices.length; k++) {
                const slice = volume.slices[k];
                // slice.z is missing on type? Loader adds it but Type definition says `z: number`. Yes.
                const dz = Math.abs(slice.z - wc);
                if (dz > r) continue;

                const pts = makeCircleContourPoints(s.center, r, slice.z, volume.normal, volume.rowCos, volume.colCos, 32);
                if (pts && pts.length >= 3) {
                    // Flatten to [x,y,z, x,y,z...]
                    const data = [];
                    for (const p of pts) data.push(p[0], p[1], p[2]);

                    contourSequence.push({
                        x30060016: [{
                            x00081150: volume.slices[k].sopUID, // Ref SOP Class
                            x00081155: volume.slices[k].sopUID  // Ref SOP Instance
                        }],
                        x3006002a: data, // Contour Data
                        x30060042: 'CLOSED_PLANAR',
                        x30060046: data.length / 3 // Number of Points
                    });
                }
            }
        }

        if (contourSequence.length > 0) {
            roiContours.push({
                x30060084: roiNum, // Ref ROI Num
                x30060040: contourSequence, // Contour Sequence
                x3006002a: color.map(c => Math.round(c)).join('\\') // Color (weird tag reusing? No, Color is in ROIBlock usually)
                // Wait, colors are in x30060020 (ROI Contour Sequence) > Item > x3006002A (ROI Display Color)
            });
        }
    };

    processSphereGroup('peak', groups.peak);
    processSphereGroup('warm', groups.warm);
    processSphereGroup('cold', groups.cold);

    // -- Support --
    if (support && support.inner && support.box) {
        // Implement support contours
        // Similar to spheres but using `maskToEdgeLoops`.
        // Iterate volume slices inside box.
        // Inner
        const { box, inner, mid, outer } = support;

        const processMask = (mask: Uint8Array, nameSuffix: string, color: [number, number, number]) => {
            const name = `${roiNameBase}_${nameSuffix}`;
            const roiNum = addRoi(name, color);
            const contourSequence: any[] = [];

            for (let k = 0; k < box.bz; k++) {
                const sliceIdx = box.k0 + k;
                if (sliceIdx < 0 || sliceIdx >= volume.slices.length) continue;

                // Extract 2D mask for this slice from 3D flat array
                // mask is bx * by * bz
                const zOff = k * box.bx * box.by;
                const sliceMask = new Uint8Array(box.bx * box.by);
                sliceMask.set(mask.subarray(zOff, zOff + box.bx * box.by));

                const loops = maskToEdgeLoops(sliceMask, box.by, box.bx);
                const simpleLoops = loops.map(l => simplifyGridLoop(l));

                const slice = volume.slices[sliceIdx];
                // We need to map grid (c, r) -> Patient (x, y, z)
                // map(c,r,k) -> patient.
                // We have `patientToUvw` but we need `uvwToPatient`.
                // Or just: p = origin + (c+c0)*colStep*colCos + (r+r0)*rowStep*rowCos + (k+k0)*sliceStep*normal?
                // Wait, `box.c0` is relative to volume 0,0,0?
                // Yes, `box` indices are into the volume grid.

                // p(c,r) on slice k:
                // sliceOrigin = slice.ipp
                // p = sliceOrigin + c * colSpacing * colCos + r * rowSpacing * rowCos
                // Wait, loops are in (x,y) where x=col, y=row relative to BOX.
                // So actual col = box.c0 + x.
                // actual row = box.r0 + y.

                const sOrigin = slice.ipp;
                const cs = volume.colSpacing;
                const rs = volume.rowSpacing;

                for (const loop of simpleLoops) {
                    const data = [];
                    for (const pt of loop) { // pt is [col, row] in box
                        const c = box.c0 + pt[0];
                        const r = box.r0 + pt[1];

                        // P = sOrigin + c*cs*colCos + r*rs*rowCos
                        // Note: rowCos is Vector along Row (X)? 
                        // Dicom: ImageOrientationPatient [Xx, Xy, Xz, Yx, Yy, Yz]
                        // Row Cosine is first 3. Col Cosine is last 3.
                        // Pixel (c, r) -> ipp + c * ps[1] * ??
                        // Wait, Image Position Patient is center of top-left pixel?
                        // "The centre of the top left hand pixel".
                        // Row index increases along Column Cosine (Vector down).
                        // Col index increases along Row Cosine (Vector right).
                        // NO. 
                        // Row Axis (X) -> associated with Column Index.
                        // Column Axis (Y) -> associated with Row Index.
                        // So: P = ipp + col * colSpacing * rowCos + row * rowSpacing * colCos?
                        // "Row Cosine" is the vector of the ROWS (direction of increasing column index).
                        // "Column Cosine" is vector of COLUMNS (direction of increasing row index).
                        // So P = ipp + c * cs * volume.rowCos + r * rs * volume.colCos. Yes.

                        const px = sOrigin[0] + c * cs * volume.rowCos[0] + r * rs * volume.colCos[0];
                        const py = sOrigin[1] + c * cs * volume.rowCos[1] + r * rs * volume.colCos[1];
                        const pz = sOrigin[2] + c * cs * volume.rowCos[2] + r * rs * volume.colCos[2];
                        data.push(px, py, pz);
                    }

                    contourSequence.push({
                        x30060016: [{
                            x00081150: slice.sopUID,
                            x00081155: slice.sopUID
                        }],
                        x3006002a: data,
                        x30060042: 'CLOSED_PLANAR',
                        x30060046: data.length / 3
                    });
                }
            }

            if (contourSequence.length > 0) {
                roiContours.push({
                    x30060084: roiNum,
                    x30060040: contourSequence,
                    x3006002a: color.map(c => Math.round(c)).join('\\')
                });
            }
        };

        if (inner) processMask(inner, 'InnerSupport', [100, 255, 100]);
        if (mid) processMask(mid, 'MidSupport', [100, 255, 200]);
        if (outer) processMask(outer, 'OuterSupport', [100, 200, 255]);
    }

    // 2. Assemble Dataset
    const firstSlice = volume.slices[0].dataSet;
    const studyDate = dcmjs.data.DicomMetaDictionary.date();
    const studyTime = dcmjs.data.DicomMetaDictionary.time();

    // Copy patient tags
    const patientName = getTagString(firstSlice, 'x00100010') || 'ANONYMOUS';
    const patientId = getTagString(firstSlice, 'x00100020') || 'ANONYMOUS';
    const studyInstanceUid = getTagString(firstSlice, 'x0020000d');
    const studyId = getTagString(firstSlice, 'x00200010') || '';
    const otherPatientIds = getTagString(firstSlice, 'x00101000') || '';

    const dataset: any = {
        _vrMap: {
            PixelData: 'OW' // Just in case, though RTSTRUCT has no pixel data
        },
        x00080016: '1.2.840.10008.5.1.4.1.1.481.3',
        x00080018: dcmjs.data.DicomMetaDictionary.uid(),
        x00080020: studyDate,
        x00080030: studyTime,
        x00080050: '',
        x00080060: 'RTSTRUCT',
        x00080090: '',
        x00100010: patientName,
        x00100020: patientId,
        x00101000: otherPatientIds,
        x0020000d: studyInstanceUid,
        x00200010: studyId,
        x00200011: '',
        x00200052: volume.forUID,

        x30060002: '1.2.840.10008.5.1.4.1.1.2', // Referenced SOP Class (Msgt CT)
        x30060004: 'GENERATED_RT',
        x30060008: 'GENERATED_RT',

        // Structure Set ROI Sequence
        x30060020: rois,
        // ROI Contour Sequence
        x30060039: roiContours,
        // RT ROI Observations Sequence
        x30060080: roiObservations,
    };

    // Referenced Frame of Reference Sequence (3006,0010)
    // Needs to link to the CT Series
    const refSeriesUid = volume.slices[0].seriesUID;
    const contourImageSeq: any[] = [];

    // Collect all SOP Instance UIDs from volume
    // To match what happens in clinical systems, we list all slices 
    // or just the ones we reference?
    // Standard is to reference the SERIES and the instances used.
    // Let's reference the series.

    volume.slices.forEach(s => {
        contourImageSeq.push({
            x00081150: '1.2.840.10008.5.1.4.1.1.2',
            x00081155: s.sopUID
        });
    });

    dataset.x30060010 = [{
        x00200052: volume.forUID,
        x30060012: [{ // RT Referenced Study Sequence
            x00081150: '1.2.840.10008.3.1.2.3.1', // Detached Study Management? Or just Study Component?
            x00081155: studyInstanceUid,
            x30060014: [{ // RT Referenced Series Sequence
                x0020000e: refSeriesUid,
                x30060016: contourImageSeq // Contour Image Sequence (all slices)
            }]
        }]
    }];

    try {
        const buffer = dcmjs.data.datasetToBuffer(dataset);
        return buffer;
    } catch (e) {
        console.error('dcmjs export error', e);
        return null;
    }
}
