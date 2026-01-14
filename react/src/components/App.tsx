import { Sidebar } from './Sidebar';
import { Viewport3D } from './Viewport3D';
import { Viewport2D } from './Viewport2D';
import { useAppStore } from '../store/useAppStore';
import '../App.css';

function App() {
    const { view, lattice, volume } = useAppStore();

    return (
        <div className="app-container">
            <div className="header">
                <div className="header-content">
                    <div className="logo-section">
                        <div className="logo">SFRT</div>
                        <div className="app-title">Sphere Lattice (React Migration)</div>
                    </div>
                    <div className="header-status">
                        <div className="status-item">
                            {/* About/Help buttons */}
                        </div>
                    </div>
                </div>
            </div>

            <div className="main-layout">
                <Sidebar />

                <div className="viewer">
                    <div className="viewer-topbar">
                        <div>
                            <span className="mono">Slice: {view.k} / {volume?.depth ?? '-'}</span>
                        </div>
                        <div className="topbar-actions">
                            <div className="mono">Lattice: {lattice.spheres.length} spheres</div>
                        </div>
                    </div>

                    <div className="viewport-grid">
                        <div className="viewport">
                            <div className="overlay-label"><strong>Axial</strong></div>
                            <Viewport2D viewType="axial" />
                        </div>
                        <div className="viewport">
                            <div className="overlay-label"><strong>Sagittal</strong></div>
                            <Viewport2D viewType="sagittal" />
                        </div>
                        <div className="viewport">
                            <div className="overlay-label"><strong>Coronal</strong></div>
                            <Viewport2D viewType="coronal" />
                        </div>
                        <div className="viewport">
                            <div className="overlay-label"><strong>3D</strong></div>
                            <Viewport3D />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default App;
