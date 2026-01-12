# SFRT Sphere Lattice (Web)

Browser-based tool to:
- Load a CT series + RTSTRUCT from local DICOM files
- Select a target ROI (PTV)
- Generate SFRT sphere lattice centers (HCP / SC / AC / CVT3D) with centroid alignment
- Export a new RTSTRUCT with the generated sphere contours (same FrameOfReferenceUID, new UIDs)

This is research tooling and is not validated for clinical use.

## Run

Browsers often block local script loading from `file://`. Serve the folder:

```bash
cd /Users/taoran/Documents/SFRT/sfrt-sphere-lattice-web
python3 -m http.server 8000
```

Then open:
- `http://localhost:8000/`

## Standalone HTML (inline JS)

Generate a single HTML file with all scripts inlined:

```bash
python3 scripts/build-standalone.py
```

Or with Node:

```bash
node scripts/build-standalone.mjs
```

This writes `standalone.html`, which you can open directly.

## Usage

1. Drop/select CT slice DICOMs and an RTSTRUCT.
2. Pick the CT Series and RTSTRUCT (filtered by referenced Series when possible).
3. Pick the target ROI.
4. Configure lattice parameters and click **Generate Spheres**.
5. Click **Export RTSTRUCT** to download a derived RS DICOM.

Viewer interactions:
- Scroll wheel on a viewport changes its slice (Axial = Z, Coronal = Row, Sagittal = Col).
- Left-click in a viewport moves the crosshair (syncs the other views).
- 3D view: drag to orbit, wheel to zoom.

## Implementation notes

- Rendering: 4-up view (Axial/Sagittal/Coronal + 3D). CT planes are rendered via WebGL float textures; overlays are drawn in mm-space to preserve aspect.
- “Layered cake” structures: RTSTRUCT contours are interpreted as per-slice slabs (via `vendor/rt-layered-cake.js`) and used for point-in-ROI tests.
- “Full spheres only”: implemented as a sphere surface sampling test (not ESAPI margin erosion).
- Export: uses `vendor/dcmjs.js` to clone and write a new RTSTRUCT, preserving `FrameOfReferenceUID` and regenerating `SeriesInstanceUID` and `SOPInstanceUID`.
