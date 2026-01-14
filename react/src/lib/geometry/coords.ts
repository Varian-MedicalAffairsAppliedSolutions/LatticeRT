import type { Volume } from '../../types';
import { add3, dot3, mul3, type Vec3 } from '../math';

export function patientToUvw(p: Vec3, vol: Volume): Vec3 {
    return [
        dot3(p, vol.rowCos),
        dot3(p, vol.colCos),
        dot3(p, vol.normal)
    ];
}

export function uvwToPatient(uvw: Vec3, vol: Volume): Vec3 {
    return add3(
        add3(mul3(vol.rowCos, uvw[0]), mul3(vol.colCos, uvw[1])),
        mul3(vol.normal, uvw[2])
    );
}
