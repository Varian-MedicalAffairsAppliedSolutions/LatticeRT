import { computeLayeredCakeBounds, computeLayeredCakeCentroid, isUvwInsideStructure } from '../geometry/analysis';
import { uvwToPatient } from '../geometry/coords';
import type { LayeredCakeStructure } from '../geometry/layeredCake';
import { add3, sub3, type Vec3 } from '../math';
import type { Volume, Sphere } from '../../types';
import { dedupPointsGrid, generateAcValleyCentersUvw, generateCvt3dCentersUvw, generateHcpValleyCentersUvw, generateLatticeCenters } from './generation';
import { meanPoint, sphereFullyInsideUvw } from './utils';

export interface GenerateParams {
    pattern: 'hcp' | 'sc' | 'ac' | 'cvt3d';
    spacing: number;
    radius: number;
    xShift: number;
    yShift: number;
    fullOnly: boolean;
    margin: number;
    sphereSet: 'peaks' | 'peaks_cold' | 'peaks_warm_cold';
}

export function generateSpheresFlow(
    targetStruct: LayeredCakeStructure,
    volume: Volume,
    params: GenerateParams
): Sphere[] {
    const { pattern, spacing, radius, xShift, yShift, fullOnly, margin, sphereSet } = params;

    // 1. Compute Geometrics
    const orientation = { rowCos: volume.rowCos, colCos: volume.colCos, normal: volume.normal };
    const centroid = computeLayeredCakeCentroid(targetStruct, orientation);
    const bounds = computeLayeredCakeBounds(targetStruct);

    if (!centroid || !bounds) throw new Error("Could not compute ROI centroid/bounds");

    // 2. Generate Base Points (SVG/Lattice space)
    let baseCentersUvw: Vec3[];
    if (pattern === 'cvt3d') {
        baseCentersUvw = generateCvt3dCentersUvw({ targetStruct, bounds, spacing });
    } else {
        baseCentersUvw = generateLatticeCenters({ pattern, spacing, bounds });
    }

    // 3. Filter inside for centroid alignment
    const insideCentersUvw = baseCentersUvw.filter(uvw => isUvwInsideStructure(targetStruct, uvw));
    if (!insideCentersUvw.length) throw new Error("No lattice points landed inside ROI");

    // 4. Align Centroids
    const latticeCentroidUvw = meanPoint(insideCentersUvw);
    if (!latticeCentroidUvw) throw new Error("Failed to compute lattice centroid");

    const offsetUvw = sub3([centroid.u, centroid.v, centroid.w], latticeCentroidUvw);
    const shiftUvw: Vec3 = [xShift, yShift, 0];

    // 5. Apply Alignment & Shifts
    // Combine base points with offset
    const alignedCentersUvw = baseCentersUvw.map(uvw => add3(add3(uvw, offsetUvw), shiftUvw));

    // 6. Filter Inside again (final position)
    const alignedInsideUvw = alignedCentersUvw.filter(uvw => isUvwInsideStructure(targetStruct, uvw));

    // 7. Margin / Radius check
    const radiusTest = fullOnly ? (radius + margin) : (margin > 0 ? margin : 0);
    let peakUvw = alignedInsideUvw;
    if (radiusTest > 0) {
        peakUvw = peakUvw.filter(uvw => sphereFullyInsideUvw(targetStruct, uvw, radiusTest));
    }

    // 8. Dedup
    peakUvw = dedupPointsGrid(peakUvw, Math.max(0.25, radius * 0.1));

    // 9. Build Peak Spheres
    let nextId = 1;
    const out: Sphere[] = peakUvw.map(uvw => ({
        id: nextId++,
        center: uvwToPatient(uvw, volume),
        r: radius,
        kind: 'peak'
    }));

    // 10. Valleys (if requested)
    if (sphereSet !== 'peaks' && (pattern === 'hcp' || pattern === 'ac')) {
        let valleys: { warm: Vec3[], cold: Vec3[] };

        if (pattern === 'hcp') {
            valleys = generateHcpValleyCentersUvw({ spacing, bounds }); // These are RELATIVE to origin? 
            // Wait, generateHcpValley... returns absolute coords in bounds? 
            // Yes it uses 'origin', 'a1', etc based on bounds.
            // BUT we shifted the peaks. Valleys must be aligned to the shifted peaks.
            // The legacy code generated valleys then applied 'offsetUvw' and 'shiftUvw'.
            // This implies valleys are generated in same 'base' space.

            // Re-generate valleys in base space (same origin/grid as baseCentersUvw)
            valleys = generateHcpValleyCentersUvw({ spacing, bounds });
        } else { // ac
            // AC valleys depend on peak positions.
            // We should use the aligned peaks? 
            // Legacy: passed 'peakUvw' (which are ALIGNED and FILTERED).
            valleys = generateAcValleyCentersUvw({ peakCentersUvw: peakUvw, spacing });
            // If AC valleys are derived from peaks, they are already aligned.
            // We don't need to apply offset again if input peaks are aligned.
            // CHECK LEGACY: 
            // if (pattern === 'ac') {
            //   const valleys = generateAcValleyCentersUvw({ peakCentersUvw: peakUvw, spacing });
            //   let warmUvw = valleys.warm; ...
            // }
            // Yes, for AC, inputs are aligned peaks, output is aligned valleys.
        }

        let warmUvw = valleys.warm;
        let coldUvw = valleys.cold;

        if (pattern === 'hcp') {
            // Apply offsets only for HCP (since AC used aligned peaks)
            warmUvw = warmUvw.map(uvw => add3(add3(uvw, offsetUvw), shiftUvw));
            coldUvw = coldUvw.map(uvw => add3(add3(uvw, offsetUvw), shiftUvw));
        }

        // Filter valleys
        warmUvw = warmUvw.filter(uvw => isUvwInsideStructure(targetStruct, uvw));
        coldUvw = coldUvw.filter(uvw => isUvwInsideStructure(targetStruct, uvw));

        if (radiusTest > 0) {
            warmUvw = warmUvw.filter(uvw => sphereFullyInsideUvw(targetStruct, uvw, radiusTest));
            coldUvw = coldUvw.filter(uvw => sphereFullyInsideUvw(targetStruct, uvw, radiusTest));
        }

        const minD = Math.max(0.25, radius * 0.1);
        warmUvw = dedupPointsGrid(warmUvw, minD);
        coldUvw = dedupPointsGrid(coldUvw, minD);

        if (sphereSet === 'peaks_warm_cold') {
            out.push(...warmUvw.map(uvw => ({ id: nextId++, center: uvwToPatient(uvw, volume), r: radius, kind: 'warm' as const })));
        }
        if (sphereSet === 'peaks_cold' || sphereSet === 'peaks_warm_cold') {
            out.push(...coldUvw.map(uvw => ({ id: nextId++, center: uvwToPatient(uvw, volume), r: radius, kind: 'cold' as const })));
        }
    }

    return out;
}
