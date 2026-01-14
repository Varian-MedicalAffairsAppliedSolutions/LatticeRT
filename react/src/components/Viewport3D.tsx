import { useEffect, useRef } from 'react';
import { useAppStore } from '../store/useAppStore';
import { Viewer3D } from '../lib/viewer/Viewer3D';
import { buildMeshFromLayeredCake } from '../lib/geometry/layeredCake';
import { computeLayeredCakeBounds } from '../lib/geometry/analysis';

export function Viewport3D({ style }: { style?: React.CSSProperties }) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const viewerRef = useRef<Viewer3D | null>(null);
    const { targetStruct, lattice, volume } = useAppStore();

    useEffect(() => {
        if (!canvasRef.current) return;
        if (viewerRef.current) return;

        const v = new Viewer3D(canvasRef.current);
        viewerRef.current = v;

        let frame = 0;
        const loop = () => {
            v.render();
            frame = requestAnimationFrame(loop);
        };
        loop();

        const resize = () => {
            if (canvasRef.current && canvasRef.current.parentElement) {
                const { width, height } = canvasRef.current.parentElement.getBoundingClientRect();
                canvasRef.current.width = width;
                canvasRef.current.height = height;
            }
        }
        window.addEventListener('resize', resize);
        resize();

        return () => {
            cancelAnimationFrame(frame);
            window.removeEventListener('resize', resize);
        };
    }, []);

    useEffect(() => {
        if (!viewerRef.current || !volume) return;
        viewerRef.current.setVolumeOrientation(
            volume.rowCos as unknown as number[],
            volume.colCos as unknown as number[],
            volume.normal as unknown as number[]
        );
    }, [volume]);

    useEffect(() => {
        if (!viewerRef.current) return;
        if (targetStruct) {
            try {
                const mesh = buildMeshFromLayeredCake(targetStruct);
                const bounds = computeLayeredCakeBounds(targetStruct);

                viewerRef.current.updatePtv(mesh, bounds);
                console.log("Viewport3D: Updated PTV mesh", mesh, "bounds", bounds);

                // Auto-center camera if bounds exist
                if (bounds && volume) {
                    const uc = (bounds.uMin + bounds.uMax) / 2;
                    const vc = (bounds.vMin + bounds.vMax) / 2;
                    const wc = (bounds.wMin + bounds.wMax) / 2;

                    // UVW (Grid) -> Patient
                    // P = Origin + u*cs*Row + v*rs*Col + w*ss*Norm
                    const o = volume.origin;
                    const r = volume.rowCos;
                    const c = volume.colCos;
                    const n = volume.normal;
                    const cs = volume.colSpacing;
                    const rs = volume.rowSpacing;
                    const ss = volume.sliceSpacing;

                    const px = o[0] + uc * cs * r[0] + vc * rs * c[0] + wc * ss * n[0];
                    const py = o[1] + uc * cs * r[1] + vc * rs * c[1] + wc * ss * n[1];
                    const pz = o[2] + uc * cs * r[2] + vc * rs * c[2] + wc * ss * n[2];

                    // Estimate distance to fit
                    // diagonal of box
                    const du = (bounds.uMax - bounds.uMin) * cs;
                    const dv = (bounds.vMax - bounds.vMin) * rs;
                    const dw = (bounds.wMax - bounds.wMin) * ss;
                    const size = Math.sqrt(du * du + dv * dv + dw * dw);

                    console.log("Viewport3D: Auto-centering Camera. Target:", [px, py, pz], "Dist:", size);
                    viewerRef.current.target = [px, py, pz];
                    viewerRef.current.dist = size * 1.5;
                }
            } catch (e) {
                console.error("Failed to build mesh", e);
            }
        } else {
            viewerRef.current.updatePtv(null, null);
        }
    }, [targetStruct, volume]);

    useEffect(() => {
        if (!viewerRef.current) return;
        viewerRef.current.setSpheres(lattice.spheres);
    }, [lattice.spheres]);

    // Interactions
    const handleMouseDown = (e: React.MouseEvent) => {
        const v = viewerRef.current;
        if (!v) return;
        const startX = e.clientX;
        const startY = e.clientY;
        const startYaw = v.yaw;
        const startPitch = v.pitch;

        const move = (ev: MouseEvent) => {
            const dx = ev.clientX - startX;
            const dy = ev.clientY - startY;
            v.yaw = startYaw + dx * 0.01;
            v.pitch = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, startPitch + dy * 0.01));
        };
        const up = () => {
            window.removeEventListener('mousemove', move);
            window.removeEventListener('mouseup', up);
        };
        window.addEventListener('mousemove', move);
        window.addEventListener('mouseup', up);
    };

    const handleWheel = (e: React.WheelEvent) => {
        if (viewerRef.current) {
            viewerRef.current.dist *= (1 + e.deltaY * 0.001);
        }
    };

    return (
        <canvas
            ref={canvasRef}
            onMouseDown={handleMouseDown}
            onWheel={handleWheel}
            style={{ width: '100%', height: '100%', display: 'block', ...style }}
        />
    );
}
