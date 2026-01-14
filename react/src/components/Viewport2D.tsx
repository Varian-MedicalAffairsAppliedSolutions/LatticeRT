import { useEffect, useRef, useState } from 'react';
import { useAppStore } from '../store/useAppStore';
import { CtRenderer2D } from '../lib/viewer/CtRenderer2D';
import { computeLayout, drawOverlay } from '../lib/viewer/overlayDraw';
import { extractSliceData } from '../lib/volume/mpr';

interface Viewport2DProps {
    viewType: 'axial' | 'coronal' | 'sagittal';
}

export function Viewport2D({ viewType }: Viewport2DProps) {
    const bgRef = useRef<HTMLCanvasElement>(null);
    const fgRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const renderer = useRef<CtRenderer2D | null>(null);

    const {
        volume, view, targetStruct, lattice,
        updateView
    } = useAppStore();

    // Resize Observer
    const [size, setSize] = useState({ w: 0, h: 0 });
    useEffect(() => {
        if (!containerRef.current) return;
        const ro = new ResizeObserver(entries => {
            const e = entries[0];
            setSize({ w: e.contentRect.width, h: e.contentRect.height });
        });
        ro.observe(containerRef.current);
        return () => ro.disconnect();
    }, []);

    // Init GL Renderer
    useEffect(() => {
        if (bgRef.current && !renderer.current) {
            renderer.current = new CtRenderer2D(bgRef.current);
        }
    }, []);

    // Render Loop
    useEffect(() => {
        if (!volume || !size.w || !size.h || !renderer.current) return;
        if (!bgRef.current || !fgRef.current) return;

        // Resize canvases
        const dpr = window.devicePixelRatio || 1;
        bgRef.current.width = size.w * dpr;
        bgRef.current.height = size.h * dpr;
        fgRef.current.width = size.w * dpr;
        fgRef.current.height = size.h * dpr;

        // Compute Layout
        const layout = computeLayout(view, volume, viewType, size.w, size.h);

        // 1. Render GL (Background)
        const sliceIdx = viewType === 'axial' ? view.k : (viewType === 'coronal' ? view.row : view.col);
        const sliceData = extractSliceData(volume, viewType, sliceIdx);

        if (sliceData) {
            renderer.current.render(
                sliceData.data, sliceData.width, sliceData.height,
                view.wlCenter - view.wlWidth / 2,
                view.wlCenter + view.wlWidth / 2,
                size.w * dpr, size.h * dpr,
                layout.offsetX * dpr, layout.offsetY * dpr,
                layout.mmW * layout.scalePxPerMm * dpr,
                layout.mmH * layout.scalePxPerMm * dpr,
                layout.invertX,
                layout.invertY
            );
        } else {
            // Clear black
            const gl = bgRef.current.getContext('webgl');
            gl?.clear(gl.COLOR_BUFFER_BIT);
        }

        // 2. Render Overlay (Foreground)
        const ctx = fgRef.current.getContext('2d');
        if (ctx) {
            drawOverlay(ctx, volume, view, layout, viewType, targetStruct, lattice.spheres);
        }

    }, [volume, view, targetStruct, lattice, size, viewType]);


    // User Input Handlers
    const isDragging = useRef(false);
    const dragStart = useRef({ x: 0, y: 0, btn: 0 });
    const viewStart = useRef({ ...view });

    const handleWheel = (e: React.WheelEvent) => {
        if (!volume) return;
        const delta = Math.sign(e.deltaY);
        if (viewType === 'axial') {
            const maxK = volume.depth - 1;
            const newK = Math.max(0, Math.min(maxK, view.k + delta));
            updateView({ k: newK });
        } else if (viewType === 'coronal') {
            const maxRow = volume.height - 1;
            const newRow = Math.max(0, Math.min(maxRow, view.row + delta));
            updateView({ row: newRow });
        } else if (viewType === 'sagittal') {
            const maxCol = volume.width - 1;
            const newCol = Math.max(0, Math.min(maxCol, view.col + delta));
            updateView({ col: newCol });
        }
    };

    const handleMouseDown = (e: React.MouseEvent) => {
        isDragging.current = true;
        dragStart.current = { x: e.clientX, y: e.clientY, btn: e.button };
        viewStart.current = { ...view };
        e.preventDefault();
    };

    const handleMouseMove = (e: React.MouseEvent) => {
        if (!isDragging.current) {
            // TODO: Update mouse hover pos for crosshair updates?
            return;
        }
        const dx = e.clientX - dragStart.current.x;
        const dy = e.clientY - dragStart.current.y;
        const btn = dragStart.current.btn;

        if (btn === 0) { // Left: Pan (Legacy style) or WL?
            // Let's implement WL on Left for standard medical, Pan on Middle?
            // Actually legacy was: ??
            // Let's do Left=WL (standard), Right=Zoom/Pan?
            // Let's do Left=WL.
            const wChange = dx * 2;
            const lChange = dy * 2;
            updateView({
                wlWidth: Math.max(1, viewStart.current.wlWidth + wChange),
                wlCenter: viewStart.current.wlCenter + lChange
            });
        } else if (btn === 1 || btn === 2) { // Middle or Right: Pan/Zoom
            // Use Right for Zoom (dy), Pan (dx)?
            // Or Zoom (dy), Pan (Middle).
            // Let's do Pan (Right/Middle).
            if (viewType === 'axial') {
                updateView({
                    panAxial: {
                        x: viewStart.current.panAxial.x + dx,
                        y: viewStart.current.panAxial.y + dy
                    }
                });
            } else if (viewType === 'coronal') {
                updateView({
                    panCoronal: {
                        x: viewStart.current.panCoronal.x + dx,
                        y: viewStart.current.panCoronal.y + dy
                    }
                });
            } else if (viewType === 'sagittal') {
                updateView({
                    panSagittal: {
                        x: viewStart.current.panSagittal.x + dx,
                        y: viewStart.current.panSagittal.y + dy
                    }
                });
            }
        }
    };

    const handleMouseUp = () => {
        isDragging.current = false;
    };


    return (
        <div
            ref={containerRef}
            className="viewport-container"
            style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden', backgroundColor: 'black' }}
            onWheel={handleWheel}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onContextMenu={e => e.preventDefault()}
        >
            <canvas
                ref={bgRef}
                style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }}
            />
            <canvas
                ref={fgRef}
                style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
            />
        </div>
    );
}
