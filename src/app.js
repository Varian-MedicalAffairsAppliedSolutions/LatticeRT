/* global dicomParser, dcmjs, RtLayeredCake */
(function () {
  'use strict';

  const els = {
    statusDot: document.getElementById('statusDot'),
    statusText: document.getElementById('statusText'),
    forUidText: document.getElementById('forUidText'),
    dropzone: document.getElementById('dropzone'),
    fileInput: document.getElementById('fileInput'),
    importPills: document.getElementById('importPills'),
    importLog: document.getElementById('importLog'),
    ctSeriesSelect: document.getElementById('ctSeriesSelect'),
    rsSelect: document.getElementById('rsSelect'),
    targetRoiSelect: document.getElementById('targetRoiSelect'),
    patternSelect: document.getElementById('patternSelect'),
    sphereSetSelect: document.getElementById('sphereSetSelect'),
    radiusInput: document.getElementById('radiusInput'),
    spacingInput: document.getElementById('spacingInput'),
    xShiftInput: document.getElementById('xShiftInput'),
    yShiftInput: document.getElementById('yShiftInput'),
    fullOnlyCheck: document.getElementById('fullOnlyCheck'),
    marginInput: document.getElementById('marginInput'),
    sphereRoiName: document.getElementById('sphereRoiName'),
    circleSegInput: document.getElementById('circleSegInput'),
    btnGenerate: document.getElementById('btnGenerate'),
    btnClear: document.getElementById('btnClear'),
    genLog: document.getElementById('genLog'),
    showGridCheck: document.getElementById('showGridCheck'),
    gridSpacingInput: document.getElementById('gridSpacingInput'),
    showCursorCheck: document.getElementById('showCursorCheck'),
    cursorRadiusInput: document.getElementById('cursorRadiusInput'),
    btnExport: document.getElementById('btnExport'),
    exportLog: document.getElementById('exportLog'),
    supportEnableCheck: document.getElementById('supportEnableCheck'),
    supportInnerMm: document.getElementById('supportInnerMm'),
    supportMidMm: document.getElementById('supportMidMm'),
    supportOuterMm: document.getElementById('supportOuterMm'),
    btnSupportPreview: document.getElementById('btnSupportPreview'),
    supportLog: document.getElementById('supportLog'),
    axialCanvas: document.getElementById('axialCanvas'),
    axialOverlay: document.getElementById('axialOverlay'),
    axialViewport: document.getElementById('axialViewport'),
    sagittalCanvas: document.getElementById('sagittalCanvas'),
    sagittalOverlay: document.getElementById('sagittalOverlay'),
    sagittalViewport: document.getElementById('sagittalViewport'),
    coronalCanvas: document.getElementById('coronalCanvas'),
    coronalOverlay: document.getElementById('coronalOverlay'),
    coronalViewport: document.getElementById('coronalViewport'),
    threeCanvas: document.getElementById('threeCanvas'),
    threeViewport: document.getElementById('threeViewport'),
    sphereMenu: document.getElementById('sphereMenu'),
    sphereMenuTitle: document.getElementById('sphereMenuTitle'),
    sphereMenuKind: document.getElementById('sphereMenuKind'),
    sphereMoveStep: document.getElementById('sphereMoveStep'),
    sphereMoveXp: document.getElementById('sphereMoveXp'),
    sphereMoveXm: document.getElementById('sphereMoveXm'),
    sphereMoveYp: document.getElementById('sphereMoveYp'),
    sphereMoveYm: document.getElementById('sphereMoveYm'),
    sphereMoveZp: document.getElementById('sphereMoveZp'),
    sphereMoveZm: document.getElementById('sphereMoveZm'),
    sphereDelete: document.getElementById('sphereDelete'),
    sliceLabel: document.getElementById('sliceLabel'),
    wlLabel: document.getElementById('wlLabel'),
    roiInfo: document.getElementById('roiInfo'),
    btnMeasure: document.getElementById('btnMeasure'),
    btnClearMeasure: document.getElementById('btnClearMeasure'),
    measureLabel: document.getElementById('measureLabel'),
    launchDisclaimerModal: document.getElementById('launchDisclaimerModal'),
    launchDisclaimerAccept: document.getElementById('launchDisclaimerAccept'),
    exportDisclaimerModal: document.getElementById('exportDisclaimerModal'),
    exportDisclaimerCancel: document.getElementById('exportDisclaimerCancel'),
    exportDisclaimerConfirm: document.getElementById('exportDisclaimerConfirm'),
    btnAbout: document.getElementById('btnAbout'),
    btnHelp: document.getElementById('btnHelp'),
    infoModal: document.getElementById('infoModal'),
    infoModalTitle: document.getElementById('infoModalTitle'),
    infoModalBody: document.getElementById('infoModalBody'),
    infoModalOk: document.getElementById('infoModalOk'),
    infoModalClose: document.getElementById('infoModalClose'),
    infoModalCopy: document.getElementById('infoModalCopy'),
    infoTabHelp: document.getElementById('infoTabHelp'),
    infoTabAbout: document.getElementById('infoTabAbout'),
    infoTabLicense: document.getElementById('infoTabLicense'),
    infoTabThirdParty: document.getElementById('infoTabThirdParty'),
  };

  const state = {
    files: [],
    ctSeriesMap: new Map(), // seriesUID -> { seriesUID, desc, forUID, slices: CtSlice[] }
    rsFiles: [], // { file, arrayBuffer, byteArray, dataSet, refSeriesUID, forUID }
    chosenSeriesUID: null,
    chosenRsIdx: null,
    volume: null, // { slices, width,height,depth,rowSpacing,colSpacing,sliceSpacing,rowCos,colCos,normal,origin,positions,slope,intercept, scalars, forUID }
    layeredCake: null, // array of structures
    targetStruct: null,
    targetName: null,
    view: {
      k: 0,
      row: 0,
      col: 0,
      zoomAxial: 1,
      zoomCoronal: 1,
      zoomSagittal: 1,
      panAxial: { x: 0, y: 0 }, // css px
      panCoronal: { x: 0, y: 0 }, // css px
      panSagittal: { x: 0, y: 0 }, // css px
      panDrag: null, // { view:'axial'|'coronal'|'sagittal', pointerId, startX, startY, startPanX, startPanY }
      wlCenter: 40,
      wlWidth: 400,
      draggingWL: false,
      lastX: 0,
      lastY: 0,
    },
    gl: {
      renderer: null,
      sagittal: null,
      coronal: null,
    },
    measure: {
      enabled: false,
      view: null, // 'axial' | 'coronal' | 'sagittal'
      start: null, // { xMm, yMm }
      end: null, // { xMm, yMm }
      preview: null, // { xMm, yMm }
    },
    cursor: {
      enabled: false,
      view: null, // 'axial' | 'coronal' | 'sagittal'
      pos: null, // { xMm, yMm }
    },
    three: {
      renderer: null,
      ptvMesh: null,
      sphereMesh: null,
      centerUvw: [0, 0, 0],
    },
    cache: {
      sagPlane: null,
      sagCol: null,
      corPlane: null,
      corRow: null,
      sliceWs: null,
      roiMask: null,
    },
    generated: {
      spheres: [], // { id:number, center:[x,y,z], r:number, kind:'peak'|'warm'|'cold' }
      mode: 'peaks', // 'peaks' | 'peaks_cold' | 'peaks_warm_cold'
      nextId: 1,
      roiName: 'LatticeSpheres',
      autoRoiName: null,
      circleSegments: 64,
      lastParams: null,
      gridCentersUvw: null, // aligned lattice centers in UVW (for optional grid display)
      gridParamsKey: null,
      minCtcPairPeaks: null, // { idA, idB, dMm }
      minCtcPairAll: null, // { idA, idB, dMm }
    },
    edit: {
      selectedSphereId: null,
    },
    support: {
      rings: null, // { key, box:{r0,c0,k0,bx,by,bz}, inner, mid, outer, volumesCc:{inner,mid,outer} }
    },
  };

  function getGeneratedSphereStrokeStyle(kind = 'peak') {
    if (kind === 'cold') return 'rgba(0, 90, 255, 0.90)';
    if (kind === 'warm') return 'rgba(255, 220, 0, 0.90)';
    return 'rgba(255, 0, 0, 0.85)';
  }

  function setStatus(text, ok = true) {
    els.statusText.textContent = text || '—';
    els.statusDot.style.background = ok ? 'var(--success)' : 'var(--error)';
  }

  function log(el, msg) {
    el.textContent = String(msg || '');
  }

  function appendLog(el, msg) {
    const prev = el.textContent ? `${el.textContent}\n` : '';
    el.textContent = prev + String(msg || '');
  }

  function clearNode(node) {
    while (node.firstChild) node.removeChild(node.firstChild);
  }

  function setModalOpen(modalEl, open) {
    if (!modalEl) return;
    modalEl.classList.toggle('show', !!open);
  }

  const EMBEDDED_DOCS = {
    readme: "# SFRT Sphere Lattice (Web)\n\nBrowser-based, local-only research tool to:\n- Load a CT series + RTSTRUCT from local DICOM files (no uploads)\n- Select a target ROI (typically PTV)\n- Generate a sphere lattice (HCP / SC / AC / CVT3D) aligned to the ROI centroid\n- Export a derived RTSTRUCT containing generated sphere contours (same FrameOfReferenceUID, new UIDs)\n\nThis is research tooling and is not validated for clinical use.\n\n## Primary Reference (Upstream Inspiration)\n\nThis project is essentially a web-based reimplementation of the methodology in:\n- https://github.com/Varian-MedicalAffairsAppliedSolutions/MAAS-SFRThelper\n\nIt adds enhancements in visualization and workflow (multi-viewport + 3D view, interactive tools, and additional generation/export features).\n\nThis repository does not include or distribute upstream source code, datasets, or any local reference/test folders; if you use upstream materials separately, ensure you comply with their license and terms.\n\n## Safety / Disclaimer\n\n- Not validated for clinical use: do not use for diagnosis or treatment planning.\n- You assume full responsibility for any use and for reviewing/verifying any exported DICOM.\n- The app shows acknowledgement prompts on launch and again before RTSTRUCT export.\n\n## Open\n\nBrowsers often block local script loading from `file://`. Serve this folder with any static file server, for example:\n\n```bash\npython3 -m http.server 8000\n```\n\nThen open:\n- `http://localhost:8000/`\n\n## Usage\n\n1. Drop/select CT slice DICOMs and an RTSTRUCT.\n2. Pick the CT Series and RTSTRUCT (filtered by referenced Series when possible).\n3. Pick the target ROI.\n4. Configure lattice parameters and click **Generate Spheres**.\n5. Click **Export RTSTRUCT** to download a derived RS DICOM.\n\nViewer interactions:\n- Scroll wheel on a viewport changes its slice (Axial = Z, Coronal = Row, Sagittal = Col).\n- Left-click in a viewport moves the crosshair (syncs the other views).\n- 3D view: drag to orbit, wheel to zoom.\n\n## Methodology (high level)\n\n- Import and geometry\n  - CT slices are grouped by `SeriesInstanceUID` and used to reconstruct volume geometry (spacing, orientation, origin).\n  - RTSTRUCT contours are parsed and associated to the selected CT series when references are present.\n- ROI representation and inclusion tests\n  - The target ROI is interpreted as per-slice filled regions (\u201clayered cake\u201d slabs) for point-in-ROI testing.\n  - Sphere placement checks support:\n    - Center-in-ROI (with optional boundary margin)\n    - \u201cFull spheres only\u201d via sphere surface sampling (approximate; not a TPS margin/erosion)\n- Lattice generation\n  - Candidate sphere centers are generated in 3D using the selected pattern and spacing.\n  - The lattice is translated so its centroid aligns to the target ROI centroid, with optional user shifts.\n  - Spheres are classified (Peak/Warm/Cold) depending on the selected sphere set.\n- Rendering\n  - 4-up view: Axial/Sagittal/Coronal + 3D.\n  - CT planes are rendered via WebGL; overlays are drawn in mm-space to preserve aspect.\n- Export (derived RTSTRUCT)\n  - A new RTSTRUCT is created by cloning metadata and writing new contour sequences for generated ROIs.\n  - `FrameOfReferenceUID` is preserved; new `SeriesInstanceUID` and `SOPInstanceUID` values are generated.\n\n## References\n\n- MAAS-SFRThelper (primary reference): https://github.com/Varian-MedicalAffairsAppliedSolutions/MAAS-SFRThelper\n- DICOM standard (RT Structure Set IOD and coordinate systems).\n- Sphere-lattice patterns: Simple Cubic (SC), Hexagonal Closest Packed (HCP), and related packing / sampling concepts.\n\n## License\n\nNoncommercial use is permitted under the Polyform Noncommercial License 1.0.0:\n- `LICENSE`\n- `NOTICE`\n\nCommercial use requires a separate license from the licensor:\n- `COMMERCIAL-LICENSE.md`\n\nThird-party components under `vendor/` are licensed by their respective authors (see file headers).\n",
    license: "# Polyform Noncommercial License 1.0.0\n\n<https://polyformproject.org/licenses/noncommercial/1.0.0>\n\n## Acceptance\n\nIn order to get any license under these terms, you must agree to them as both strict obligations and conditions to all your licenses.\n\n## Copyright License\n\nThe licensor grants you a copyright license for the software to do everything you might do with the software that would otherwise infringe the licensor's copyright in it for any permitted purpose.  However, you may only distribute the software according to [Distribution License](#distribution-license) and make changes or new works based on the software according to [Changes and New Works License](#changes-and-new-works-license).\n\n## Distribution License\n\nThe licensor grants you an additional copyright license to distribute copies of the software.  Your license to distribute covers distributing the software with changes and new works permitted by [Changes and New Works License](#changes-and-new-works-license).\n\n## Notices\n\nYou must ensure that anyone who gets a copy of any part of the software from you also gets a copy of these terms or the URL for them above, as well as copies of any plain-text lines beginning with `Required Notice:` that the licensor provided with the software.  For example:\n\n> Required Notice: Copyright Yoyodyne, Inc. (http://example.com)\n\n## Changes and New Works License\n\nThe licensor grants you an additional copyright license to make changes and new works based on the software for any permitted purpose.\n\n## Patent License\n\nThe licensor grants you a patent license for the software that covers patent claims the licensor can license, or becomes able to license, that you would infringe by using the software.\n\n## Noncommercial Purposes\n\nAny noncommercial purpose is a permitted purpose.\n\n## Personal Uses\n\nPersonal use for research, experiment, and testing for the benefit of public knowledge, personal study, private entertainment, hobby projects, amateur pursuits, or religious observance, without any anticipated commercial application, is use for a permitted purpose.\n\n## Noncommercial Organizations\n\nUse by any charitable organization, educational institution, public research organization, public safety or health organization, environmental protection organization, or government institution is use for a permitted purpose regardless of the source of funding or obligations resulting from the funding.\n\n## Fair Use\n\nYou may have \"fair use\" rights for the software under the law. These terms do not limit them.\n\n## No Other Rights\n\nThese terms do not allow you to sublicense or transfer any of your licenses to anyone else, or prevent the licensor from granting licenses to anyone else.  These terms do not imply any other licenses.\n\n## Patent Defense\n\nIf you make any written claim that the software infringes or contributes to infringement of any patent, your patent license for the software granted under these terms ends immediately. If your company makes such a claim, your patent license ends immediately for work on behalf of your company.\n\n## Violations\n\nThe first time you are notified in writing that you have violated any of these terms, or done anything with the software not covered by your licenses, your licenses can nonetheless continue if you come into full compliance with these terms, and take practical steps to correct past violations, within 32 days of receiving notice.  Otherwise, all your licenses end immediately.\n\n## No Liability\n\n***As far as the law allows, the software comes as is, without any warranty or condition, and the licensor will not be liable to you for any damages arising out of these terms or the use or nature of the software, under any kind of legal claim.***\n\n## Definitions\n\nThe **licensor** is the individual or entity offering these terms, and the **software** is the software the licensor makes available under these terms.\n\n**You** refers to the individual or entity agreeing to these terms.\n\n**Your company** is any legal entity, sole proprietorship, or other kind of organization that you work for, plus all organizations that have control over, are under the control of, or are under common control with that organization.  **Control** means ownership of substantially all the assets of an entity, or the power to direct its management and policies by vote, contract, or otherwise.  Control can be direct or indirect.\n\n**Your licenses** are all the licenses granted to you for the software under these terms.\n\n**Use** means anything you do with the software requiring one of your licenses.\n",
    notice: "Required Notice: Copyright (c) 2026 Taoran\n",
    commercial: "# Commercial Licensing\n\nThis project is made available under the Polyform Noncommercial License 1.0.0 (see `LICENSE`), which permits noncommercial use and prohibits commercial use.\n\nIf you want to use this software for a commercial purpose (including internal use at a for-profit company, embedding into a paid product, or providing it as part of a paid service), you must obtain a separate commercial license from the licensor.\n\nTo request commercial licensing terms, contact the project owner/maintainer.\n",
    thirdPartyNotices: "# Third-Party Notices\n+\n+This project bundles third-party software components (primarily under `vendor/`). These components are licensed by their respective authors under the terms referenced below.\n+\n+## Bundled Components\n+\n+### dcmjs\n+\n+- Source: https://github.com/dcmjs-org/dcmjs\n+- License: Mozilla Public License 2.0 (MPL-2.0)\n+- Files: `vendor/dcmjs.js`\n+- Full license text: `licenses/MPL-2.0.txt`\n+\n+Note: `vendor/dcmjs.js` includes additional third-party subcomponents; their copyright and license notices are included within the file headers/comments where applicable.\n+\n+### dicom-parser (dicomParser)\n+\n+- Source: https://github.com/cornerstonejs/dicomParser\n+- License: MIT\n+- Files: `vendor/dicom-parser.min.js`\n+- Full license text: `licenses/MIT-dicom-parser.txt`\n+\n+### Mapbox earcut (embedded/trimmed)\n+\n+- Source: https://github.com/mapbox/earcut\n+- License: ISC\n+- Used in: `vendor/rt-layered-cake.js` (a trimmed/embedded earcut implementation is included in this file)\n+- Full license text: `licenses/ISC-earcut.txt`\n+",
  };

  async function fetchTextOrNull(path) {
    try {
      const res = await fetch(path, { cache: 'no-store' });
      if (!res.ok) return null;
      return await res.text();
    } catch (_e) {
      return null;
    }
  }

  function setInfoModalActiveTab(tab) {
    const tabs = [
      { key: 'help', el: els.infoTabHelp, title: 'Help' },
      { key: 'about', el: els.infoTabAbout, title: 'About' },
      { key: 'license', el: els.infoTabLicense, title: 'Licensing' },
      { key: 'third_party', el: els.infoTabThirdParty, title: 'Third-Party' },
    ];
    for (const t of tabs) {
      if (!t.el) continue;
      t.el.classList.toggle('active', t.key === tab);
    }
    if (els.infoModalTitle) {
      const t = tabs.find((x) => x.key === tab);
      els.infoModalTitle.textContent = t ? t.title : 'Info';
    }
  }

  async function loadInfoModalTab(tab) {
    if (!els.infoModalBody) return;
    setInfoModalActiveTab(tab);

    if (tab === 'help') {
      const readme = (await fetchTextOrNull('README.md')) || EMBEDDED_DOCS.readme;
      els.infoModalBody.textContent = readme || 'Could not load README.md.';
      return;
    }

    if (tab === 'license') {
      const lic = (await fetchTextOrNull('LICENSE')) || EMBEDDED_DOCS.license;
      const notice = (await fetchTextOrNull('NOTICE')) || EMBEDDED_DOCS.notice;
      const commercial = (await fetchTextOrNull('COMMERCIAL-LICENSE.md')) || EMBEDDED_DOCS.commercial;
      const parts = [];
      parts.push('== LICENSE ==');
      parts.push(lic || '(Could not load LICENSE)');
      parts.push('\n== NOTICE ==');
      parts.push(notice || '(Could not load NOTICE)');
      parts.push('\n== COMMERCIAL-LICENSE.md ==');
      parts.push(commercial || '(Could not load COMMERCIAL-LICENSE.md)');
      els.infoModalBody.textContent = parts.join('\n');
      return;
    }

    if (tab === 'third_party') {
      const notices = (await fetchTextOrNull('THIRD_PARTY_NOTICES.md')) || EMBEDDED_DOCS.thirdPartyNotices;
      els.infoModalBody.textContent = notices || 'Could not load THIRD_PARTY_NOTICES.md.';
      return;
    }

    // about
    els.infoModalBody.textContent = [
      'SFRT Sphere Lattice (Web)',
      'Version: 0.1.0',
      '',
      'Primary reference (upstream inspiration):',
      'https://github.com/Varian-MedicalAffairsAppliedSolutions/MAAS-SFRThelper',
      '',
      'Research tool — not validated for clinical use.',
      'You assume full responsibility for use and for verifying any exported DICOM.',
      '',
      'Licensing:',
      '- Noncommercial use permitted (see LICENSE + NOTICE).',
      '- Commercial use requires a separate license (see COMMERCIAL-LICENSE.md).',
      '',
      'Third-party components under vendor/ are licensed by their respective authors (see file headers).',
    ].join('\n');
  }

  function openInfoModal(tab) {
    if (!els.infoModal) return;
    setModalOpen(els.infoModal, true);
    loadInfoModalTab(tab);
  }

  function closeInfoModal() {
    if (!els.infoModal) return;
    setModalOpen(els.infoModal, false);
  }

  function showLaunchDisclaimerModal() {
    if (!els.launchDisclaimerModal) return;
    setModalOpen(els.launchDisclaimerModal, true);
    if (els.launchDisclaimerAccept) els.launchDisclaimerAccept.focus();
  }

  function withExportDisclaimer(doExport) {
    if (!els.exportDisclaimerModal || !els.exportDisclaimerConfirm || !els.exportDisclaimerCancel) {
      doExport();
      return;
    }

    setModalOpen(els.exportDisclaimerModal, true);
    els.exportDisclaimerConfirm.focus();

    const cleanup = () => {
      setModalOpen(els.exportDisclaimerModal, false);
      els.exportDisclaimerConfirm.removeEventListener('click', onConfirm);
      els.exportDisclaimerCancel.removeEventListener('click', onCancel);
      els.exportDisclaimerModal.removeEventListener('click', onBackdrop);
      window.removeEventListener('keydown', onKeydown, true);
    };
    const onConfirm = () => { cleanup(); doExport(); };
    const onCancel = () => { cleanup(); };
    const onBackdrop = (e) => { if (e.target === els.exportDisclaimerModal) onCancel(); };
    const onKeydown = (e) => { if (e.key === 'Escape') onCancel(); };

    els.exportDisclaimerConfirm.addEventListener('click', onConfirm);
    els.exportDisclaimerCancel.addEventListener('click', onCancel);
    els.exportDisclaimerModal.addEventListener('click', onBackdrop);
    window.addEventListener('keydown', onKeydown, true);
  }

  function createPill(text) {
    const pill = document.createElement('span');
    pill.className = 'pill';
    pill.textContent = text;
    return pill;
  }

  function clamp(v, lo, hi) {
    return Math.max(lo, Math.min(hi, v));
  }

  function dot3(a, b) {
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  }

  function sub3(a, b) {
    return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  }

  function add3(a, b) {
    return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
  }

  function mul3(v, s) {
    return [v[0] * s, v[1] * s, v[2] * s];
  }

  function cross3(a, b) {
    return [
      a[1] * b[2] - a[2] * b[1],
      a[2] * b[0] - a[0] * b[2],
      a[0] * b[1] - a[1] * b[0],
    ];
  }

  function norm3(v) {
    const L = Math.hypot(v[0], v[1], v[2]) || 1;
    return [v[0] / L, v[1] / L, v[2] / L];
  }

  function fmtUid(uid) {
    if (!uid) return '';
    const s = String(uid);
    return s.length > 18 ? `${s.slice(0, 10)}…${s.slice(-6)}` : s;
  }

  function uidFromRandom() {
    // 2.25.x is a valid UID root based on a 128-bit integer.
    const bytes = new Uint8Array(16);
    (self.crypto || window.crypto).getRandomValues(bytes);
    let hex = '';
    for (const b of bytes) hex += b.toString(16).padStart(2, '0');
    const bigint = BigInt('0x' + hex);
    return '2.25.' + bigint.toString(10);
  }

  function getTagString(ds, tag) {
    try {
      if (!ds || typeof ds.string !== 'function') return null;
      return ds.string(tag) || null;
    } catch {
      return null;
    }
  }

  function getTagFloat(ds, tag) {
    try {
      if (!ds || typeof ds.floatString !== 'function') return null;
      const v = ds.floatString(tag);
      return Number.isFinite(v) ? v : null;
    } catch {
      return null;
    }
  }

  function getTagUint16(ds, tag) {
    try {
      if (!ds || typeof ds.uint16 !== 'function') return null;
      const v = ds.uint16(tag);
      return Number.isFinite(v) ? v : null;
    } catch {
      return null;
    }
  }

  function parseBackslashNumbers(s, expectedLen = null) {
    if (s == null) return null;
    const parts = String(s)
      .split('\\')
      .map((x) => Number(x))
      .filter((x) => Number.isFinite(x));
    if (expectedLen != null && parts.length < expectedLen) return null;
    return parts;
  }

  function parseImagePosition(ds) {
    const ipp = parseBackslashNumbers(getTagString(ds, 'x00200032'), 3);
    return ipp || [0, 0, 0];
  }

  function parseImageOrientation(ds) {
    const iop = parseBackslashNumbers(getTagString(ds, 'x00200037'), 6);
    return iop || [1, 0, 0, 0, 1, 0];
  }

  function parsePixelSpacing(ds) {
    const ps = parseBackslashNumbers(getTagString(ds, 'x00280030'), 2);
    return ps || [1, 1];
  }

  function extractReferencedSeriesUIDFromRtstruct(dataSet) {
    // Based on EthosROIOverride: ReferencedFrameOfReferenceSequence -> RTReferencedStudySequence -> RTReferencedSeriesSequence -> SeriesInstanceUID
    try {
      const rfor = dataSet?.elements?.x30060010?.items?.[0]?.dataSet;
      const rtStudy = rfor?.elements?.x30060012?.items?.[0]?.dataSet;
      const rtSeries = rtStudy?.elements?.x30060014?.items?.[0]?.dataSet;
      const seriesUID = rtSeries?.string?.call(rtSeries, 'x0020000e') || null;
      return seriesUID;
    } catch {
      return null;
    }
  }

  async function readFileAsArrayBuffer(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error || new Error('File read failed'));
      reader.readAsArrayBuffer(file);
    });
  }

  async function ingestDicomFiles(fileList) {
    setStatus('Importing…', true);
    log(els.importLog, '');
    log(els.genLog, '');
    log(els.exportLog, '');
    clearNode(els.importPills);

    state.files = [];
    state.ctSeriesMap = new Map();
    state.rsFiles = [];
    state.chosenSeriesUID = null;
    state.chosenRsIdx = null;
    state.volume = null;
    state.layeredCake = null;
    state.targetStruct = null;
    state.targetName = null;
    state.generated.spheres = [];
    state.gl.renderer = null;

    const files = Array.from(fileList || []).filter((f) => f && f.size > 0);
    if (!files.length) {
      setStatus('Idle', true);
      return;
    }

    let ctCount = 0;
    let rsCount = 0;
    let otherCount = 0;

    for (const file of files) {
      let arrayBuffer;
      try {
        arrayBuffer = await readFileAsArrayBuffer(file);
      } catch (e) {
        appendLog(els.importLog, `Failed to read ${file.name}: ${e?.message || e}`);
        continue;
      }
      const byteArray = new Uint8Array(arrayBuffer);
      let dataSet;
      try {
        dataSet = dicomParser.parseDicom(byteArray);
      } catch (e) {
        otherCount++;
        continue;
      }
      const modality = (getTagString(dataSet, 'x00080060') || '').trim().toUpperCase();
      const sopClassUID = (getTagString(dataSet, 'x00080016') || '').trim();
      const isCt =
        modality === 'CT' ||
        sopClassUID === '1.2.840.10008.5.1.4.1.1.2' || // CT Image Storage
        sopClassUID === '1.2.840.10008.5.1.4.1.1.2.1'; // Enhanced CT Image Storage
      const isRtstruct =
        modality === 'RTSTRUCT' ||
        sopClassUID === '1.2.840.10008.5.1.4.1.1.481.3'; // RT Structure Set Storage

      if (isCt) {
        ctCount++;
        const seriesUID = getTagString(dataSet, 'x0020000e') || 'UNKNOWN_SERIES';
        const seriesDesc = getTagString(dataSet, 'x0008103e') || '';
        const sopUID = getTagString(dataSet, 'x00080018') || null;
        const forUID = getTagString(dataSet, 'x00200052') || null;
        const inst = Number(getTagString(dataSet, 'x00200013') || '') || 0;
        const ipp = parseImagePosition(dataSet);
        const iop = parseImageOrientation(dataSet);
        const ps = parsePixelSpacing(dataSet);
        const rows = getTagUint16(dataSet, 'x00280010') || 0;
        const cols = getTagUint16(dataSet, 'x00280011') || 0;

        const entry = { file, arrayBuffer, byteArray, dataSet, seriesUID, seriesDesc, sopUID, forUID, inst, ipp, iop, ps, rows, cols };
        if (!state.ctSeriesMap.has(seriesUID)) {
          state.ctSeriesMap.set(seriesUID, { seriesUID, desc: seriesDesc, forUID, slices: [] });
        }
        state.ctSeriesMap.get(seriesUID).slices.push(entry);
      } else if (isRtstruct) {
        rsCount++;
        const refSeriesUID = extractReferencedSeriesUIDFromRtstruct(dataSet);
        const forUID = getTagString(dataSet, 'x00200052') || null;
        state.rsFiles.push({ file, arrayBuffer, byteArray, dataSet, refSeriesUID, forUID });
      } else {
        otherCount++;
      }
    }

    els.importPills.appendChild(createPill(`CT: ${ctCount}`));
    els.importPills.appendChild(createPill(`RTSTRUCT: ${rsCount}`));
    if (otherCount) els.importPills.appendChild(createPill(`Other: ${otherCount}`));

    if (!state.ctSeriesMap.size) {
      setStatus('No CT found', false);
      appendLog(els.importLog, 'No CT slices found in selection.');
      return;
    }
    if (!state.rsFiles.length) {
      setStatus('No RTSTRUCT found', false);
      appendLog(els.importLog, 'No RTSTRUCT found in selection.');
      return;
    }

    setStatus('Select series', true);
    appendLog(els.importLog, `Found ${state.ctSeriesMap.size} CT series and ${state.rsFiles.length} RTSTRUCT(s).`);

    populateSeriesSelect();
  }

  function sortSlicesByPosition(series) {
    if (!series || !series.slices?.length) return;
    const first = series.slices[0]?.dataSet;
    const iop = parseImageOrientation(first);
    const rowCos = norm3(iop.slice(0, 3));
    const colCos = norm3(iop.slice(3, 6));
    const normal = norm3(cross3(rowCos, colCos));
    series.slices.forEach((s) => {
      s._w = dot3(s.ipp, normal);
    });
    series.slices.sort((a, b) => (a._w - b._w) || (a.inst - b.inst));
    series._rowCos = rowCos;
    series._colCos = colCos;
    series._normal = normal;
  }

  function buildCtVolumeFromSeries(series) {
    sortSlicesByPosition(series);
    const slices = series.slices;
    const first = slices[0].dataSet;
    const patientPosition = (getTagString(first, 'x00185100') || '').trim().toUpperCase() || null; // PatientPosition (e.g., HFS/FFS/HFP/FFP)
    const width = getTagUint16(first, 'x00280011') || 512;
    const height = getTagUint16(first, 'x00280010') || 512;
    const ps = parsePixelSpacing(first);
    const rowSpacing = ps[0] || 1;
    const colSpacing = ps[1] || 1;
    const iop = parseImageOrientation(first);
    const rowCos = norm3(iop.slice(0, 3));
    const colCos = norm3(iop.slice(3, 6));
    const normal = norm3(cross3(rowCos, colCos));
    const positions = slices.map((s) => parseImagePosition(s.dataSet));

    const sliceThickness = getTagFloat(first, 'x00180050') || 1.0;
    const sliceSpacing = computeSliceSpacing(positions, normal, sliceThickness);

    const slope = getTagFloat(first, 'x00281053') ?? 1; // RescaleSlope
    const intercept = getTagFloat(first, 'x00281052') ?? 0; // RescaleIntercept

    const scalars = new Float32Array(width * height * slices.length);
    let offset = 0;
    for (const s of slices) {
      const ds = s.dataSet;
      const elem = ds.elements?.x7fe00010;
      if (!elem) {
        offset += width * height;
        continue;
      }
      const raw = new Int16Array(s.byteArray.buffer, elem.dataOffset, elem.length / 2);
      const len = Math.min(raw.length, width * height);
      for (let i = 0; i < len; i++) scalars[offset + i] = raw[i] * slope + intercept;
      offset += width * height;
    }

    return {
      slices,
      width,
      height,
      depth: slices.length,
      rowSpacing,
      colSpacing,
      sliceSpacing,
      rowCos,
      colCos,
      normal,
      origin: positions[0],
      positions,
      slope,
      intercept,
      scalars,
      forUID: series.forUID,
      patientPosition,
    };
  }

  function computeSliceSpacing(positions, normal, fallback = 1.0) {
    if (!positions || positions.length < 2) return fallback || 1.0;
    const deltas = [];
    for (let i = 1; i < positions.length; i++) {
      const prev = positions[i - 1];
      const curr = positions[i];
      const diff = [curr[0] - prev[0], curr[1] - prev[1], curr[2] - prev[2]];
      const dist = Math.abs(dot3(diff, normal));
      if (Number.isFinite(dist) && dist > 0) deltas.push(dist);
    }
    if (!deltas.length) return fallback || 1.0;
    return deltas.reduce((a, b) => a + b, 0) / deltas.length;
  }

  function populateSeriesSelect() {
    els.ctSeriesSelect.disabled = false;
    els.ctSeriesSelect.innerHTML = '';
    const seriesList = Array.from(state.ctSeriesMap.values());
    seriesList.forEach((s) => sortSlicesByPosition(s));
    seriesList.sort((a, b) => (a.desc || '').localeCompare(b.desc || '') || a.seriesUID.localeCompare(b.seriesUID));
    seriesList.forEach((s, idx) => {
      const opt = document.createElement('option');
      const label = s.desc ? `${s.desc} (${s.slices.length} slices)` : `${s.seriesUID} (${s.slices.length} slices)`;
      opt.value = s.seriesUID;
      opt.textContent = label;
      els.ctSeriesSelect.appendChild(opt);
      if (idx === 0) state.chosenSeriesUID = s.seriesUID;
    });
    els.ctSeriesSelect.value = state.chosenSeriesUID;

    els.ctSeriesSelect.onchange = () => {
      state.chosenSeriesUID = els.ctSeriesSelect.value;
      onChooseCtSeries();
    };

    onChooseCtSeries();
  }

  function populateRtstructSelect() {
    els.rsSelect.disabled = false;
    els.rsSelect.innerHTML = '';
    const seriesUID = state.chosenSeriesUID;
    const candidates = state.rsFiles
      .map((r, idx) => ({ r, idx }))
      .filter(({ r }) => !r.refSeriesUID || r.refSeriesUID === seriesUID);

    if (!candidates.length) {
      els.rsSelect.disabled = true;
      appendLog(els.importLog, 'No RTSTRUCT references selected CT series; showing all RTSTRUCTs.');
    }

    const list = candidates.length ? candidates : state.rsFiles.map((r, idx) => ({ r, idx }));
    list.forEach(({ r, idx }, n) => {
      const opt = document.createElement('option');
      const name = r.file?.name || `RTSTRUCT_${idx + 1}.dcm`;
      const ref = r.refSeriesUID ? `ref ${fmtUid(r.refSeriesUID)}` : 'ref ?';
      opt.value = String(idx);
      opt.textContent = `${name} — ${ref}`;
      els.rsSelect.appendChild(opt);
      if (n === 0) state.chosenRsIdx = idx;
    });

    els.rsSelect.value = String(state.chosenRsIdx ?? list[0]?.idx ?? 0);
    els.rsSelect.onchange = () => {
      state.chosenRsIdx = Number(els.rsSelect.value);
      onChooseRtstruct();
    };

    onChooseRtstruct();
  }

  function onChooseCtSeries() {
    const series = state.ctSeriesMap.get(state.chosenSeriesUID);
    if (!series) return;

    setStatus('Building volume…', true);
    state.volume = buildCtVolumeFromSeries(series);
    state.view.k = clamp(Math.floor(state.volume.depth / 2), 0, state.volume.depth - 1);
    state.view.row = clamp(Math.floor(state.volume.height / 2), 0, state.volume.height - 1);
    state.view.col = clamp(Math.floor(state.volume.width / 2), 0, state.volume.width - 1);
    state.view.wlCenter = 40;
    state.view.wlWidth = 400;
    state.measure.view = null;
    state.measure.start = null;
    state.measure.end = null;
    state.measure.preview = null;
    updateMeasureUi();
    state.generated.spheres = [];
    state.layeredCake = null;
    state.targetStruct = null;
    state.targetName = null;
    state.cache.sagPlane = null;
    state.cache.sagCol = null;
    state.cache.corPlane = null;
    state.cache.corRow = null;
    state.cache.roiMask = null;
    state.three.ptvMesh = null;
    state.three.sphereMesh = null;
    state.three.centerUvw = [0, 0, 0];

    els.forUidText.textContent = state.volume?.forUID ? `FOR ${fmtUid(state.volume.forUID)}` : '';

    populateRtstructSelect();
    enableLatticeControls(false);
    enableExportControls(false);
    initViewerIfNeeded();
    renderAll();

    setStatus('CT ready', true);
  }

  function onChooseRtstruct() {
    if (state.chosenRsIdx == null) return;
    const rs = state.rsFiles[state.chosenRsIdx];
    if (!rs) return;
    if (state.volume?.forUID && rs.forUID && state.volume.forUID !== rs.forUID) {
      appendLog(els.importLog, `WARNING: CT FOR (${fmtUid(state.volume.forUID)}) ≠ RS FOR (${fmtUid(rs.forUID)}).`);
    }

    setStatus('Parsing RTSTRUCT…', true);
    try {
      const roiDefs = rs.dataSet?.elements?.x30060020?.items?.length || 0;
      const roiContours = rs.dataSet?.elements?.x30060039?.items?.length || 0;
      appendLog(els.importLog, `RS summary: StructureSetROISequence=${roiDefs} ROIContourSequence=${roiContours}`);
      if (!roiContours) {
        appendLog(els.importLog, 'WARNING: RS is missing ROIContourSequence (3006,0039) or it has no items.');
      }
    } catch {}
    try {
      state.layeredCake = RtLayeredCake.parseRtToLayeredCake(rs.dataSet, state.volume.slices.map((s) => s.dataSet));
    } catch (e) {
      setStatus('RTSTRUCT parse failed', false);
      appendLog(els.importLog, `RTSTRUCT parse failed: ${e?.message || e}`);
      return;
    }
    if (!state.layeredCake || !state.layeredCake.length) {
      appendLog(els.importLog, 'WARNING: Parsed 0 ROIs from RTSTRUCT. Check RS references and whether contours are present.');
    }

    const names = (state.layeredCake || []).map((s) => s.name).filter(Boolean).sort((a, b) => a.localeCompare(b));
    els.targetRoiSelect.disabled = false;
    els.targetRoiSelect.innerHTML = '';
    names.forEach((name, idx) => {
      const opt = document.createElement('option');
      opt.value = name;
      opt.textContent = name;
      els.targetRoiSelect.appendChild(opt);
      if (idx === names.length - 1) state.targetName = name; // mimic "last TV" behavior in SFRTHelper
    });
    if (state.targetName && names.includes(state.targetName)) els.targetRoiSelect.value = state.targetName;
    else if (names.length) {
      state.targetName = names[0];
      els.targetRoiSelect.value = state.targetName;
    }
    els.targetRoiSelect.onchange = () => {
      state.targetName = els.targetRoiSelect.value;
      state.targetStruct = (state.layeredCake || []).find((s) => s.name === state.targetName) || null;
      state.cache.roiMask = null;
      state.three.ptvMesh = null;
      renderAll();
      updateRoiInfo();
      enableLatticeControls(!!state.targetStruct);
      enableExportControls(!!state.generated.spheres.length);
    };

    state.targetStruct = (state.layeredCake || []).find((s) => s.name === state.targetName) || null;
    updateRoiInfo();
    enableLatticeControls(!!state.targetStruct);
    enableExportControls(!!state.generated.spheres.length);
    state.cache.roiMask = null;
    state.three.ptvMesh = null;
    renderAll();
    setStatus('RTSTRUCT ready', true);
  }

  function enableLatticeControls(on) {
    const controls = [
      els.patternSelect,
      els.sphereSetSelect,
      els.radiusInput,
      els.spacingInput,
      els.xShiftInput,
      els.yShiftInput,
      els.fullOnlyCheck,
      els.marginInput,
      els.sphereRoiName,
      els.circleSegInput,
      els.btnGenerate,
      els.btnClear,
    ];
    controls.forEach((c) => (c.disabled = !on));
    if (els.supportEnableCheck) els.supportEnableCheck.disabled = !on;
    if (els.btnSupportPreview) els.btnSupportPreview.disabled = !on;
    if (els.supportInnerMm) els.supportInnerMm.disabled = !on;
    if (els.supportMidMm) els.supportMidMm.disabled = !on;
    if (els.supportOuterMm) els.supportOuterMm.disabled = !on;
  }

  function enableExportControls(on) {
    els.btnExport.disabled = !on;
  }

  function hideSphereMenu() {
    if (!els.sphereMenu) return;
    els.sphereMenu.style.display = 'none';
    state.edit.selectedSphereId = null;
  }

  function focusAllViewsOnSphereId(id) {
    if (!state.volume || id == null) return;
    const sph = state.generated.spheres.find((s) => s.id === id);
    if (!sph) return;
    const uvw = patientToUvw(sph.center);
    const originUvw = patientToUvw(state.volume.origin);
    const uRel = uvw[0] - originUvw[0];
    const vRel = uvw[1] - originUvw[1];
    const wRel = uvw[2] - originUvw[2];
    state.view.col = clamp(Math.round(uRel / state.volume.colSpacing), 0, state.volume.width - 1);
    state.view.row = clamp(Math.round(vRel / state.volume.rowSpacing), 0, state.volume.height - 1);
    state.view.k = clamp(Math.round(wRel / state.volume.sliceSpacing), 0, state.volume.depth - 1);
    state.cache.sagPlane = null;
    state.cache.corPlane = null;
    state.cache.sagCol = null;
    state.cache.corRow = null;
    if (state.three.renderer && typeof state.three.renderer.setCenterUvw === 'function') {
      state.three.renderer.setCenterUvw(uvw);
    }
    renderAll();
  }

  function showSphereMenuAt(clientX, clientY, sphere) {
    if (!els.sphereMenu) return;
    const id = sphere?.id;
    const kind = sphere?.kind || 'peak';
    state.edit.selectedSphereId = id;
    if (els.sphereMenuTitle) els.sphereMenuTitle.textContent = `Sphere #${id}`;
    if (els.sphereMenuKind) els.sphereMenuKind.textContent = kind;

    const pad = 8;
    const w = els.sphereMenu.offsetWidth || 260;
    const h = els.sphereMenu.offsetHeight || 200;
    const x = Math.max(pad, Math.min(clientX, window.innerWidth - w - pad));
    const y = Math.max(pad, Math.min(clientY, window.innerHeight - h - pad));
    els.sphereMenu.style.left = `${x}px`;
    els.sphereMenu.style.top = `${y}px`;
    els.sphereMenu.style.display = 'block';

    if (id != null) focusAllViewsOnSphereId(id);
  }

  function moveSelectedSpherePatient(dPatient) {
    const id = state.edit.selectedSphereId;
    if (id == null) return;
    const sph = state.generated.spheres.find((s) => s.id === id);
    if (!sph) { hideSphereMenu(); return; }
    sph.center = add3(sph.center, dPatient);
    state.three.sphereMesh = null;
    focusAllViewsOnSphereId(id);
  }

  function deleteSelectedSphere() {
    const id = state.edit.selectedSphereId;
    if (id == null) return;
    state.generated.spheres = state.generated.spheres.filter((s) => s.id !== id);
    enableExportControls(state.generated.spheres.length > 0);
    state.three.sphereMesh = null;
    hideSphereMenu();
    renderAll();
  }

  function onPatternChanged() {
    const v = String(els.patternSelect.value || 'hcp');
    const isCvt = v === 'cvt3d';
    // Valley definitions are implemented for HCP and Alternating Cubic (AC).
    if (els.sphereSetSelect) {
      const latticeDisabled = !!els.patternSelect.disabled;
      els.sphereSetSelect.disabled = latticeDisabled || (v !== 'hcp' && v !== 'ac');
      if (els.sphereSetSelect.disabled) els.sphereSetSelect.value = 'peaks';
    }
  }

  function initViewerIfNeeded() {
    if (state.gl.renderer && state.gl.sagittal && state.gl.coronal) return;
    state.gl.renderer = createCtGlRenderer(els.axialCanvas);
    state.gl.sagittal = createCtGlRenderer(els.sagittalCanvas);
    state.gl.coronal = createCtGlRenderer(els.coronalCanvas);
    if (els.threeCanvas && typeof window.Viewer3D === 'object' && typeof window.Viewer3D.create === 'function') {
      state.three.renderer = window.Viewer3D.create(els.threeCanvas);
      if (!state.three.renderer) appendLog(els.importLog, '3D view unavailable (WebGL context creation failed).');
    }
    if (els.threeCanvas) {
      els.threeCanvas.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        if (!state.three.renderer || typeof state.three.renderer.pickSphereAtClientXY !== 'function') return;
        const hit = state.three.renderer.pickSphereAtClientXY(e.clientX, e.clientY);
        if (!hit || hit.id == null) {
          hideSphereMenu();
          return;
        }
        showSphereMenuAt(e.clientX, e.clientY, hit);
      });
    }

    const pickSphereInAxialAtMm = (k, xMm, yMm) => {
      if (!state.volume || !state.generated.spheres.length) return null;
      const slice = state.volume.slices?.[k];
      const ds = slice?.dataSet;
      if (!ds) return null;
      const ipp = parseImagePosition(ds);
      const wSlice = getSliceW(k);
      if (wSlice == null) return null;
      let best = null;
      let bestD2 = Infinity;
      for (const sph of state.generated.spheres) {
        const wc = dot3(sph.center, state.volume.normal);
        const dz = Math.abs(wSlice - wc);
        if (dz > sph.r) continue;
        const rz = Math.sqrt(Math.max(0, sph.r * sph.r - dz * dz));
        const centerProj = add3(sph.center, mul3(state.volume.normal, (wSlice - wc)));
        const v = sub3(centerProj, ipp);
        const cx = dot3(v, state.volume.rowCos);
        const cy = dot3(v, state.volume.colCos);
        const dx = xMm - cx;
        const dy = yMm - cy;
        const d2 = dx * dx + dy * dy;
        if (d2 > (rz * 1.06) * (rz * 1.06)) continue;
        if (d2 < bestD2) {
          bestD2 = d2;
          best = { id: sph.id, kind: sph.kind };
        }
      }
      return best;
    };

    const pickSphereInCoronalAtMm = (rowIdx, xMm, yMm) => {
      if (!state.volume || !state.generated.spheres.length) return null;
      const originUvw = patientToUvw(state.volume.origin);
      const vPlane = clamp(rowIdx, 0, state.volume.height - 1) * state.volume.rowSpacing;
      let best = null;
      let bestD2 = Infinity;
      for (const sph of state.generated.spheres) {
        const uvw = patientToUvw(sph.center);
        const u = uvw[0] - originUvw[0];
        const v = uvw[1] - originUvw[1];
        const w = uvw[2] - originUvw[2];
        const dv = v - vPlane;
        if (Math.abs(dv) > sph.r) continue;
        const rz = Math.sqrt(Math.max(0, sph.r * sph.r - dv * dv));
        const dx = xMm - u;
        const dy = yMm - w;
        const d2 = dx * dx + dy * dy;
        if (d2 > (rz * 1.06) * (rz * 1.06)) continue;
        if (d2 < bestD2) {
          bestD2 = d2;
          best = { id: sph.id, kind: sph.kind };
        }
      }
      return best;
    };

    const pickSphereInSagittalAtMm = (colIdx, xMm, yMm) => {
      if (!state.volume || !state.generated.spheres.length) return null;
      const originUvw = patientToUvw(state.volume.origin);
      const uPlane = clamp(colIdx, 0, state.volume.width - 1) * state.volume.colSpacing;
      let best = null;
      let bestD2 = Infinity;
      for (const sph of state.generated.spheres) {
        const uvw = patientToUvw(sph.center);
        const u = uvw[0] - originUvw[0];
        const v = uvw[1] - originUvw[1];
        const w = uvw[2] - originUvw[2];
        const du = u - uPlane;
        if (Math.abs(du) > sph.r) continue;
        const rz = Math.sqrt(Math.max(0, sph.r * sph.r - du * du));
        const dx = xMm - v;
        const dy = yMm - w;
        const d2 = dx * dx + dy * dy;
        if (d2 > (rz * 1.06) * (rz * 1.06)) continue;
        if (d2 < bestD2) {
          bestD2 = d2;
          best = { id: sph.id, kind: sph.kind };
        }
      }
      return best;
    };

    els.axialViewport.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      if (!state.volume || !state.generated.spheres.length) { hideSphereMenu(); return; }
      const layout = computeAxialLayoutCssPx();
      const { xMm, yMm } = pickMmFromClient(els.axialViewport, layout, e.clientX, e.clientY);
      const hit = pickSphereInAxialAtMm(state.view.k, xMm, yMm);
      if (!hit) { hideSphereMenu(); return; }
      showSphereMenuAt(e.clientX, e.clientY, hit);
    });
	    els.coronalViewport.addEventListener('contextmenu', (e) => {
	      e.preventDefault();
	      if (!state.volume || !state.generated.spheres.length) { hideSphereMenu(); return; }
	      const cols = state.volume.width;
	      const depth = state.volume.depth;
	      const mmW = cols * state.volume.colSpacing;
	      const mmH = depth * state.volume.sliceSpacing;
	      const layout = computeCoronalLayoutCssPx();
	      if (!layout) return;
	      const { xMm, yMm } = pickMmFromClient(els.coronalViewport, layout, e.clientX, e.clientY);
	      const hit = pickSphereInCoronalAtMm(state.view.row, xMm, yMm);
	      if (!hit) { hideSphereMenu(); return; }
	      showSphereMenuAt(e.clientX, e.clientY, hit);
	    });
	    els.sagittalViewport.addEventListener('contextmenu', (e) => {
	      e.preventDefault();
	      if (!state.volume || !state.generated.spheres.length) { hideSphereMenu(); return; }
	      const rows = state.volume.height;
	      const depth = state.volume.depth;
	      const mmW = rows * state.volume.rowSpacing;
	      const mmH = depth * state.volume.sliceSpacing;
	      const layout = computeSagittalLayoutCssPx();
	      if (!layout) return;
	      const { xMm, yMm } = pickMmFromClient(els.sagittalViewport, layout, e.clientX, e.clientY);
	      const hit = pickSphereInSagittalAtMm(state.view.col, xMm, yMm);
	      if (!hit) { hideSphereMenu(); return; }
	      showSphereMenuAt(e.clientX, e.clientY, hit);
	    });

    window.addEventListener('pointerdown', (e) => {
      if (!els.sphereMenu || els.sphereMenu.style.display !== 'block') return;
      if (e.target && els.sphereMenu.contains(e.target)) return;
      hideSphereMenu();
    });
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') hideSphereMenu();
    });
    const bindBtn = (btn, fn) => { if (btn) btn.addEventListener('click', (e) => { e.preventDefault(); fn(); }); };
    const stepMm = () => clamp(Number(els.sphereMoveStep?.value) || 1.0, 0.1, 9999);
    bindBtn(els.sphereMoveXp, () => moveSelectedSpherePatient([stepMm(), 0, 0]));
    bindBtn(els.sphereMoveXm, () => moveSelectedSpherePatient([-stepMm(), 0, 0]));
    bindBtn(els.sphereMoveYp, () => moveSelectedSpherePatient([0, stepMm(), 0]));
    bindBtn(els.sphereMoveYm, () => moveSelectedSpherePatient([0, -stepMm(), 0]));
    bindBtn(els.sphereMoveZp, () => moveSelectedSpherePatient([0, 0, stepMm()]));
    bindBtn(els.sphereMoveZm, () => moveSelectedSpherePatient([0, 0, -stepMm()]));
    bindBtn(els.sphereDelete, () => deleteSelectedSphere());

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const sizeCanvasPair = (viewport, base, overlay) => {
        const rect = viewport.getBoundingClientRect();
        const w = Math.max(2, Math.floor(rect.width));
        const h = Math.max(2, Math.floor(rect.height));
        base.style.width = `${w}px`;
        base.style.height = `${h}px`;
        base.width = Math.round(w * dpr);
        base.height = Math.round(h * dpr);
        if (overlay) {
          overlay.style.width = `${w}px`;
          overlay.style.height = `${h}px`;
          overlay.width = Math.round(w * dpr);
          overlay.height = Math.round(h * dpr);
        }
      };
      sizeCanvasPair(els.axialViewport, els.axialCanvas, els.axialOverlay);
      sizeCanvasPair(els.sagittalViewport, els.sagittalCanvas, els.sagittalOverlay);
      sizeCanvasPair(els.coronalViewport, els.coronalCanvas, els.coronalOverlay);
      if (els.threeCanvas && els.threeViewport) {
        const rect = els.threeViewport.getBoundingClientRect();
        const w = Math.max(2, Math.floor(rect.width));
        const h = Math.max(2, Math.floor(rect.height));
        els.threeCanvas.style.width = `${w}px`;
        els.threeCanvas.style.height = `${h}px`;
        els.threeCanvas.width = Math.round(w * dpr);
        els.threeCanvas.height = Math.round(h * dpr);
        state.three.renderer && state.three.renderer.resize();
      }
      renderAll();
    };
    window.addEventListener('resize', resize);
    resize();

    const zoomMul = (delta) => Math.exp((delta > 0 ? 1 : -1) * -0.12);
    const attachWheel = (viewport, onSliceDelta, onZoomDelta) => {
      viewport.addEventListener('wheel', (e) => {
        if (!state.volume) return;
        e.preventDefault();
        const d = e.deltaY > 0 ? 1 : -1;
        if (e.ctrlKey && typeof onZoomDelta === 'function') onZoomDelta(d);
        else onSliceDelta(d);
      }, { passive: false });
    };
    attachWheel(els.axialViewport, (delta) => {
      state.view.k = clamp(state.view.k + delta, 0, state.volume.depth - 1);
      state.cache.sagPlane = null;
      state.cache.corPlane = null;
      renderAll();
    }, (delta) => {
      state.view.zoomAxial = clamp((state.view.zoomAxial || 1) * zoomMul(delta), 0.25, 8);
      renderAll();
    });
    attachWheel(els.coronalViewport, (delta) => {
      state.view.row = clamp(state.view.row + delta, 0, state.volume.height - 1);
      state.cache.corPlane = null;
      renderAll();
    }, (delta) => {
      state.view.zoomCoronal = clamp((state.view.zoomCoronal || 1) * zoomMul(delta), 0.25, 8);
      renderAll();
    });
    attachWheel(els.sagittalViewport, (delta) => {
      state.view.col = clamp(state.view.col + delta, 0, state.volume.width - 1);
      state.cache.sagPlane = null;
      renderAll();
    }, (delta) => {
      state.view.zoomSagittal = clamp((state.view.zoomSagittal || 1) * zoomMul(delta), 0.25, 8);
      renderAll();
    });

	    els.axialViewport.addEventListener('pointerdown', (e) => {
	      if (!state.volume || e.button !== 0) return;
	      if (e.ctrlKey) {
	        e.preventDefault();
	        e.stopPropagation();
	        state.view.panDrag = {
	          view: 'axial',
	          pointerId: e.pointerId,
	          startX: e.clientX,
	          startY: e.clientY,
	          startPanX: Number(state.view.panAxial?.x) || 0,
	          startPanY: Number(state.view.panAxial?.y) || 0,
	        };
	        els.axialViewport.setPointerCapture?.(e.pointerId);
	        return;
	      }
	      const layout = computeAxialLayoutCssPx();
	      const { xMm, yMm } = pickMmFromClient(els.axialViewport, layout, e.clientX, e.clientY);
	      if (state.measure.enabled) setMeasurePoint('axial', { xMm, yMm });
	      state.view.col = clamp(Math.round(xMm / state.volume.colSpacing), 0, state.volume.width - 1);
	      state.view.row = clamp(Math.round(yMm / state.volume.rowSpacing), 0, state.volume.height - 1);
      state.cache.sagPlane = null;
      state.cache.corPlane = null;
      renderAll();
    });
	    els.axialViewport.addEventListener('pointermove', (e) => {
	      if (state.view.panDrag?.view === 'axial' && state.view.panDrag.pointerId === e.pointerId) {
	        e.preventDefault();
	        e.stopPropagation();
	        const dx = e.clientX - state.view.panDrag.startX;
	        const dy = e.clientY - state.view.panDrag.startY;
	        state.view.panAxial.x = state.view.panDrag.startPanX + dx;
	        state.view.panAxial.y = state.view.panDrag.startPanY + dy;
	        renderAll();
	        return;
	      }
	      if (!state.volume || (!state.measure.enabled && !state.cursor.enabled)) return;
	      const layout = computeAxialLayoutCssPx();
	      const pt = pickMmFromClient(els.axialViewport, layout, e.clientX, e.clientY);
	      const changedMeasure = updateMeasurePreview('axial', pt);
	      const changedCursor = updateCursorPreview('axial', pt);
	      if (changedMeasure || changedCursor) renderAll();
	    });
    els.axialViewport.addEventListener('pointerleave', () => {
      const changedMeasure = updateMeasurePreview('axial', null);
      const changedCursor = updateCursorPreview('axial', null);
      if (changedMeasure || changedCursor) renderAll();
    });

	    els.coronalViewport.addEventListener('pointerdown', (e) => {
	      if (!state.volume || e.button !== 0) return;
	      if (e.ctrlKey) {
	        e.preventDefault();
	        e.stopPropagation();
	        state.view.panDrag = {
	          view: 'coronal',
	          pointerId: e.pointerId,
	          startX: e.clientX,
	          startY: e.clientY,
	          startPanX: Number(state.view.panCoronal?.x) || 0,
	          startPanY: Number(state.view.panCoronal?.y) || 0,
	        };
	        els.coronalViewport.setPointerCapture?.(e.pointerId);
	        return;
	      }
	      const cols = state.volume.width;
	      const depth = state.volume.depth;
	      const mmW = cols * state.volume.colSpacing;
	      const mmH = depth * state.volume.sliceSpacing;
	      const layout = computeCoronalLayoutCssPx();
	      if (!layout) return;
	      const { xMm, yMm } = pickMmFromClient(els.coronalViewport, layout, e.clientX, e.clientY);
	      if (state.measure.enabled) setMeasurePoint('coronal', { xMm, yMm });
	      state.view.col = clamp(Math.round(xMm / state.volume.colSpacing), 0, cols - 1);
	      state.view.k = clamp(Math.round(yMm / state.volume.sliceSpacing), 0, depth - 1);
      state.cache.sagPlane = null;
      state.cache.corPlane = null;
      renderAll();
    });
	    els.coronalViewport.addEventListener('pointermove', (e) => {
	      if (state.view.panDrag?.view === 'coronal' && state.view.panDrag.pointerId === e.pointerId) {
	        e.preventDefault();
	        e.stopPropagation();
	        const dx = e.clientX - state.view.panDrag.startX;
	        const dy = e.clientY - state.view.panDrag.startY;
	        state.view.panCoronal.x = state.view.panDrag.startPanX + dx;
	        state.view.panCoronal.y = state.view.panDrag.startPanY + dy;
	        renderAll();
	        return;
	      }
	      if (!state.volume || (!state.measure.enabled && !state.cursor.enabled)) return;
	      const layout = computeCoronalLayoutCssPx();
	      if (!layout) return;
	      const pt = pickMmFromClient(els.coronalViewport, layout, e.clientX, e.clientY);
	      const changedMeasure = updateMeasurePreview('coronal', pt);
	      const changedCursor = updateCursorPreview('coronal', pt);
	      if (changedMeasure || changedCursor) renderAll();
	    });
    els.coronalViewport.addEventListener('pointerleave', () => {
      const changedMeasure = updateMeasurePreview('coronal', null);
      const changedCursor = updateCursorPreview('coronal', null);
      if (changedMeasure || changedCursor) renderAll();
    });

	    els.sagittalViewport.addEventListener('pointerdown', (e) => {
	      if (!state.volume || e.button !== 0) return;
	      if (e.ctrlKey) {
	        e.preventDefault();
	        e.stopPropagation();
	        state.view.panDrag = {
	          view: 'sagittal',
	          pointerId: e.pointerId,
	          startX: e.clientX,
	          startY: e.clientY,
	          startPanX: Number(state.view.panSagittal?.x) || 0,
	          startPanY: Number(state.view.panSagittal?.y) || 0,
	        };
	        els.sagittalViewport.setPointerCapture?.(e.pointerId);
	        return;
	      }
	      const rows = state.volume.height;
	      const depth = state.volume.depth;
	      const mmW = rows * state.volume.rowSpacing;
	      const mmH = depth * state.volume.sliceSpacing;
	      const layout = computeSagittalLayoutCssPx();
	      if (!layout) return;
	      const { xMm, yMm } = pickMmFromClient(els.sagittalViewport, layout, e.clientX, e.clientY);
	      if (state.measure.enabled) setMeasurePoint('sagittal', { xMm, yMm });
	      state.view.row = clamp(Math.round(xMm / state.volume.rowSpacing), 0, rows - 1);
	      state.view.k = clamp(Math.round(yMm / state.volume.sliceSpacing), 0, depth - 1);
      state.cache.sagPlane = null;
      state.cache.corPlane = null;
      renderAll();
    });
	    els.sagittalViewport.addEventListener('pointermove', (e) => {
	      if (state.view.panDrag?.view === 'sagittal' && state.view.panDrag.pointerId === e.pointerId) {
	        e.preventDefault();
	        e.stopPropagation();
	        const dx = e.clientX - state.view.panDrag.startX;
	        const dy = e.clientY - state.view.panDrag.startY;
	        state.view.panSagittal.x = state.view.panDrag.startPanX + dx;
	        state.view.panSagittal.y = state.view.panDrag.startPanY + dy;
	        renderAll();
	        return;
	      }
	      if (!state.volume || (!state.measure.enabled && !state.cursor.enabled)) return;
	      const layout = computeSagittalLayoutCssPx();
	      if (!layout) return;
	      const pt = pickMmFromClient(els.sagittalViewport, layout, e.clientX, e.clientY);
	      const changedMeasure = updateMeasurePreview('sagittal', pt);
	      const changedCursor = updateCursorPreview('sagittal', pt);
	      if (changedMeasure || changedCursor) renderAll();
	    });
	    els.sagittalViewport.addEventListener('pointerleave', () => {
      const changedMeasure = updateMeasurePreview('sagittal', null);
      const changedCursor = updateCursorPreview('sagittal', null);
      if (changedMeasure || changedCursor) renderAll();
    });

	    // Right-click reserved for sphere select/menu (Shift+RMB preserves WL drag).
	    els.axialViewport.addEventListener('mousedown', (e) => {
      if (e.button === 2 && e.shiftKey) {
        state.view.draggingWL = true;
        state.view.lastX = e.clientX;
        state.view.lastY = e.clientY;
      }
    });
    window.addEventListener('mouseup', () => { state.view.draggingWL = false; });
	    window.addEventListener('mousemove', (e) => {
	      if (!state.view.draggingWL) return;
	      const dx = e.clientX - state.view.lastX;
	      const dy = e.clientY - state.view.lastY;
	      state.view.lastX = e.clientX;
	      state.view.lastY = e.clientY;
	      state.view.wlCenter = state.view.wlCenter + dx * 0.5;
	      state.view.wlWidth = clamp(state.view.wlWidth + (-dy) * 2.0, 1, 5000);
	      renderAll();
	    });

	    const endPan = (e) => {
	      if (!state.view.panDrag) return;
	      if (e && state.view.panDrag.pointerId != null && e.pointerId != null && e.pointerId !== state.view.panDrag.pointerId) return;
	      state.view.panDrag = null;
	    };
	    window.addEventListener('pointerup', endPan);
	    window.addEventListener('pointercancel', endPan);
	  }

  function getSliceW(k) {
    const ds = state.volume?.slices?.[k]?.dataSet;
    if (!ds) return null;
    const ipp = parseImagePosition(ds);
    return dot3(ipp, state.volume.normal);
  }

  function renderAll() {
    renderAxial();
    renderCoronal();
    renderSagittal();
    renderThree();
  }

  function fmtMm(v) {
    if (!Number.isFinite(v)) return '—';
    const abs = Math.abs(v);
    if (abs >= 100) return `${v.toFixed(1)} mm`;
    return `${v.toFixed(2)} mm`;
  }

  function formatMmToken(v) {
    const n = Math.max(0, Number(v) || 0);
    let s = (Math.round(n * 100) / 100).toFixed(2);
    s = s.replace(/\.00$/, '').replace(/(\.\d)0$/, '$1');
    return s.replace('.', 'p');
  }

  function buildAutoSphereRoiName(pattern, sphereSet, radius, spacing) {
    const patternMap = { hcp: 'HCP', sc: 'SC', ac: 'AC', cvt3d: 'CVT3D' };
    const setMap = { peaks: 'Peak', peaks_cold: 'PeakCold', peaks_warm_cold: 'PeakWarmCold' };
    const p = patternMap[String(pattern || '').toLowerCase()] || String(pattern || 'Lattice').toUpperCase();
    const s = setMap[String(sphereSet || '').toLowerCase()] || 'Peak';
    const rTok = formatMmToken(radius);
    const cTok = formatMmToken(spacing);
    return `${s}_${p}_r${rTok}mm_ctc${cTok}mm`;
  }

  function measureDistanceMm() {
    const a = state.measure.start;
    const b = state.measure.end;
    if (!a || !b) return null;
    return Math.hypot((b.xMm - a.xMm), (b.yMm - a.yMm));
  }

  function updateMeasureUi() {
    if (els.btnMeasure) els.btnMeasure.classList.toggle('active', !!state.measure.enabled);
    if (!els.measureLabel) return;
    const a = state.measure.start;
    const b = state.measure.end;
    const view = state.measure.view || '—';
    if (!a) {
      els.measureLabel.textContent = 'Measure: —';
      if (els.btnClearMeasure) els.btnClearMeasure.disabled = true;
      return;
    }
    if (!b) {
      els.measureLabel.textContent = `Measure (${view}): pick end point…`;
      if (els.btnClearMeasure) els.btnClearMeasure.disabled = false;
      return;
    }
    const d = measureDistanceMm();
    els.measureLabel.textContent = `Measure (${view}): ${fmtMm(d)}`;
    if (els.btnClearMeasure) els.btnClearMeasure.disabled = false;
  }

  function clearMeasure() {
    state.measure.view = null;
    state.measure.start = null;
    state.measure.end = null;
    state.measure.preview = null;
    updateMeasureUi();
    renderAll();
  }

  function setMeasurePoint(view, pt) {
    if (!pt) return;
    const p = { xMm: Number(pt.xMm) || 0, yMm: Number(pt.yMm) || 0 };
    if (state.measure.view !== view) {
      state.measure.view = view;
      state.measure.start = p;
      state.measure.end = null;
      state.measure.preview = null;
      updateMeasureUi();
      return;
    }
    if (!state.measure.start || state.measure.end) {
      state.measure.start = p;
      state.measure.end = null;
      state.measure.preview = null;
      updateMeasureUi();
      return;
    }
    state.measure.end = p;
    state.measure.preview = null;
    updateMeasureUi();
  }

  function updateMeasurePreview(view, pt) {
    if (!state.measure.enabled) return false;
    if (!state.measure.start || state.measure.end) return false;
    if (state.measure.view !== view) return false;
    state.measure.preview = pt ? { xMm: Number(pt.xMm) || 0, yMm: Number(pt.yMm) || 0 } : null;
    return true;
  }

  function updateCursorPreview(view, pt) {
    if (!state.cursor.enabled) return false;
    if (!pt) {
      if (state.cursor.view === view || state.cursor.pos) {
        state.cursor.view = null;
        state.cursor.pos = null;
        return true;
      }
      return false;
    }
    state.cursor.view = view;
    state.cursor.pos = { xMm: Number(pt.xMm) || 0, yMm: Number(pt.yMm) || 0 };
    return true;
  }

  function drawCircularCursor(ctx, layout, view) {
    if (!state.cursor.enabled || state.cursor.view !== view || !state.cursor.pos) return;
    const radiusMm = Math.max(0, Number(els.cursorRadiusInput?.value) || 0);
    if (!radiusMm) return;
    const dpr = window.devicePixelRatio || 1;
    const pxToMm = 1 / (dpr * Math.max(1e-6, Number(layout.scalePxPerMm) || 1));
    ctx.save();
    ctx.strokeStyle = 'rgba(236,102,2,0.75)';
    ctx.lineWidth = Math.max(1.8 * pxToMm, 0.25);
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.arc(state.cursor.pos.xMm, state.cursor.pos.yMm, radiusMm, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  function drawMeasurementInCurrentMmTransform(ctx, layout, view) {
    if (!ctx || !layout) return;
    if (state.measure.view !== view) return;
    const a = state.measure.start;
    const b = state.measure.end || state.measure.preview;
    if (!a || !b) return;

    const dpr = window.devicePixelRatio || 1;
    const s = Math.max(1e-6, Number(layout.scalePxPerMm) || 1);
    const pxToMm = 1 / (dpr * s);

    const dx = b.xMm - a.xMm;
    const dy = b.yMm - a.yMm;
    const dist = Math.hypot(dx, dy);
    const label = fmtMm(dist);
    const mx = (a.xMm + b.xMm) / 2;
    const my = (a.yMm + b.yMm) / 2;

    const mmToDevicePx = (xMm, yMm) => {
      const mmW = Math.max(0, Number(layout.mmW) || 0);
      const mmH = Math.max(0, Number(layout.mmH) || 0);
      const xData = layout.invertX ? (mmW - xMm) : xMm;
      const yData = layout.invertY ? (mmH - yMm) : yMm;
      const xCss = (Number(layout.offsetX) || 0) + xData * (Number(layout.scalePxPerMm) || 1);
      const yCss = (Number(layout.offsetY) || 0) + yData * (Number(layout.scalePxPerMm) || 1);
      return { x: xCss * dpr, y: yCss * dpr };
    };

    ctx.save();
    ctx.setLineDash(state.measure.end ? [] : [6 * pxToMm, 6 * pxToMm]);
    ctx.strokeStyle = 'rgba(255,255,255,0.90)';
    ctx.lineWidth = Math.max(2.0 * pxToMm, 0.6 * pxToMm);
    ctx.beginPath();
    ctx.moveTo(a.xMm, a.yMm);
    ctx.lineTo(b.xMm, b.yMm);
    ctx.stroke();

    const r = 4.5 * pxToMm;
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(236,102,2,0.95)';
    ctx.beginPath();
    ctx.arc(a.xMm, a.yMm, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(b.xMm, b.yMm, r, 0, Math.PI * 2);
    ctx.fill();

    // Draw text in screen space so it doesn't mirror when the view is flipped.
    const pMid = mmToDevicePx(mx, my);
    const fontPx = 12;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.font = `800 ${Math.round(fontPx * dpr)}px system-ui, -apple-system, Segoe UI, Roboto, Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.lineWidth = Math.max(2, Math.round(3 * dpr));
    ctx.strokeStyle = 'rgba(0,0,0,0.75)';
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.strokeText(label, pMid.x, pMid.y - Math.round(10 * dpr));
    ctx.fillText(label, pMid.x, pMid.y - Math.round(10 * dpr));
    ctx.restore();
  }


  function renderAxial() {
    if (!state.volume || !state.gl.renderer) return;
    const { width, height } = state.volume;
    const k = clamp(state.view.k, 0, state.volume.depth - 1);
    state.view.k = k;
    const sliceOffset = k * width * height;
    const slice = state.volume.scalars.subarray(sliceOffset, sliceOffset + width * height);

    const wlMin = state.view.wlCenter - state.view.wlWidth / 2;
    const wlMax = state.view.wlCenter + state.view.wlWidth / 2;
    els.sliceLabel.textContent =
      `Slice: ${k + 1} / ${state.volume.depth}  •  Row: ${state.view.row + 1}/${state.volume.height}  •  Col: ${state.view.col + 1}/${state.volume.width}` +
      `  •  PP: ${normalizePatientPosition(state.volume.patientPosition)}`;
    els.wlLabel.textContent = `WL: C=${Math.round(state.view.wlCenter)} W=${Math.round(state.view.wlWidth)}`;

    const layout = computeAxialLayoutCssPx();
    state.gl.renderer.render({
      width,
      height,
      data: slice,
      wlMin,
      wlMax,
      ...layout,
    });

    drawAxialOverlay(k, layout);
  }

  function extractCoronalPlane(rowIndex) {
    const { width: cols, height: rows, depth } = state.volume;
    const r = clamp(rowIndex, 0, rows - 1);
    if (state.cache.corPlane && state.cache.corRow === r) return state.cache.corPlane;
    const out = new Float32Array(cols * depth);
    for (let k = 0; k < depth; k++) {
      const base = k * rows * cols + r * cols;
      const dst = k * cols;
      out.set(state.volume.scalars.subarray(base, base + cols), dst);
    }
    state.cache.corPlane = out;
    state.cache.corRow = r;
    return out;
  }

  function extractSagittalPlane(colIndex) {
    const { width: cols, height: rows, depth } = state.volume;
    const c = clamp(colIndex, 0, cols - 1);
    if (state.cache.sagPlane && state.cache.sagCol === c) return state.cache.sagPlane;
    const out = new Float32Array(rows * depth);
    for (let k = 0; k < depth; k++) {
      const base = k * rows * cols + c;
      const dst = k * rows;
      for (let r = 0; r < rows; r++) out[dst + r] = state.volume.scalars[base + r * cols];
    }
    state.cache.sagPlane = out;
    state.cache.sagCol = c;
    return out;
  }

  function computeMprLayoutCssPx(viewportEl, widthPx, heightPx, mmW, mmH, zoom = 1) {
    const rect = viewportEl.getBoundingClientRect();
    const displayW = Math.max(2, rect.width || widthPx || 512);
    const displayH = Math.max(2, rect.height || heightPx || 512);
    const dataAspect = (mmH || 1) / (mmW || 1);
    const viewAspect = displayH / (displayW || 1);
    const pad = 0.96;
    let drawW, drawH;
    if (dataAspect > viewAspect) {
      drawH = displayH * pad;
      drawW = drawH / dataAspect;
    } else {
      drawW = displayW * pad;
      drawH = drawW * dataAspect;
    }
    const z = Math.max(0.05, Number(zoom) || 1);
    drawW *= z;
    drawH *= z;
    const offsetX = (displayW - drawW) / 2;
    const offsetY = (displayH - drawH) / 2;
    const scalePxPerMm = Math.max(1e-6, Math.min(drawW / (mmW || 1), drawH / (mmH || 1)));
    return { displayW, displayH, drawW, drawH, offsetX, offsetY, scalePxPerMm, mmW, mmH };
  }

  function computeCoronalLayoutCssPx() {
    if (!state.volume) return null;
    const orient = getViewOrientation();
    const cols = state.volume.width;
    const depth = state.volume.depth;
    const mmW = cols * state.volume.colSpacing;
    const mmH = depth * state.volume.sliceSpacing;
    const layout = computeMprLayoutCssPx(els.coronalViewport, cols, depth, mmW, mmH, state.view.zoomCoronal || 1);
    const pan = state.view.panCoronal || { x: 0, y: 0 };
    layout.offsetX += Number(pan.x) || 0;
    layout.offsetY += Number(pan.y) || 0;
    layout.invertX = orient.coronal.invertX;
    layout.invertY = orient.coronal.invertY;
    return layout;
  }

  function computeSagittalLayoutCssPx() {
    if (!state.volume) return null;
    const orient = getViewOrientation();
    const rows = state.volume.height;
    const depth = state.volume.depth;
    const mmW = rows * state.volume.rowSpacing;
    const mmH = depth * state.volume.sliceSpacing;
    const layout = computeMprLayoutCssPx(els.sagittalViewport, rows, depth, mmW, mmH, state.view.zoomSagittal || 1);
    const pan = state.view.panSagittal || { x: 0, y: 0 };
    layout.offsetX += Number(pan.x) || 0;
    layout.offsetY += Number(pan.y) || 0;
    layout.invertX = orient.sagittal.invertX;
    layout.invertY = orient.sagittal.invertY;
    return layout;
  }

  function pickMmFromClient(viewportEl, layout, clientX, clientY) {
    const rect = viewportEl.getBoundingClientRect();
    const xCss = clientX - rect.left;
    const yCss = clientY - rect.top;
    const scale = Number(layout?.scalePxPerMm) || 1;
    const offsetX = Number(layout?.offsetX) || 0;
    const offsetY = Number(layout?.offsetY) || 0;
    const mmW = Math.max(0, Number(layout?.mmW) || 0);
    const mmH = Math.max(0, Number(layout?.mmH) || 0);
    let xMm = (xCss - offsetX) / Math.max(1e-6, scale);
    let yMm = (yCss - offsetY) / Math.max(1e-6, scale);
    if (layout?.invertX) xMm = mmW - xMm;
    if (layout?.invertY) yMm = mmH - yMm;
    xMm = clamp(xMm, 0, mmW);
    yMm = clamp(yMm, 0, mmH);
    return { xMm, yMm };
  }

	  function renderCoronal() {
	    if (!state.volume || !state.gl.coronal) return;
	    const cols = state.volume.width;
	    const depth = state.volume.depth;
	    const row = clamp(state.view.row, 0, state.volume.height - 1);
	    state.view.row = row;
	    const plane = extractCoronalPlane(row);
	    const mmW = cols * state.volume.colSpacing;
	    const mmH = depth * state.volume.sliceSpacing;
	    const layout = computeCoronalLayoutCssPx();
	    if (!layout) return;
	    state.gl.coronal.render({
	      width: cols,
	      height: depth,
	      data: plane,
      wlMin: state.view.wlCenter - state.view.wlWidth / 2,
      wlMax: state.view.wlCenter + state.view.wlWidth / 2,
      invertX: layout.invertX,
      invertY: layout.invertY,
      ...layout,
    });
    drawCoronalOverlay(layout);
  }

	  function renderSagittal() {
	    if (!state.volume || !state.gl.sagittal) return;
	    const rows = state.volume.height;
	    const depth = state.volume.depth;
	    const col = clamp(state.view.col, 0, state.volume.width - 1);
	    state.view.col = col;
	    const plane = extractSagittalPlane(col);
	    const mmW = rows * state.volume.rowSpacing;
	    const mmH = depth * state.volume.sliceSpacing;
	    const layout = computeSagittalLayoutCssPx();
	    if (!layout) return;
	    state.gl.sagittal.render({
	      width: rows,
	      height: depth,
	      data: plane,
      wlMin: state.view.wlCenter - state.view.wlWidth / 2,
      wlMax: state.view.wlCenter + state.view.wlWidth / 2,
      invertX: layout.invertX,
      invertY: layout.invertY,
      ...layout,
    });
    drawSagittalOverlay(layout);
  }

  function ensureRoiMask() {
    if (!state.volume || !state.targetStruct) return null;
    if (state.cache.roiMask && state.cache.roiMask.name === state.targetStruct.name) return state.cache.roiMask;
    // Minimal axial-slab rasterization for reslice display (not used for export).
    const cols = state.volume.width;
    const rows = state.volume.height;
    const depth = state.volume.depth;
    const masks = new Array(depth);
    for (let k = 0; k < depth; k++) {
      const slice = state.volume.slices[k];
      const ds = slice?.dataSet;
      if (!ds) { masks[k] = null; continue; }
      const ipp = parseImagePosition(ds);
      const wSlice = dot3(ipp, state.volume.normal);
      const layer = findLayerForW(state.targetStruct, wSlice);
      if (!layer) { masks[k] = null; continue; }
      const u0 = dot3(ipp, state.volume.rowCos);
      const v0 = dot3(ipp, state.volume.colCos);
      const mask = new Uint8Array(rows * cols);
      for (const poly of layer.polygons || []) {
        const outer = poly.outer || [];
        if (outer.length < 3) continue;
        const toLocalMm = (p) => [p[0] - u0, p[1] - v0];
        const outerLocal = outer.map(toLocalMm);
        const holesLocal = (poly.holes || []).map((h) => h.map(toLocalMm));
        // Bounding box in pixel indices
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const p of outerLocal) {
          minX = Math.min(minX, p[0]); maxX = Math.max(maxX, p[0]);
          minY = Math.min(minY, p[1]); maxY = Math.max(maxY, p[1]);
        }
        const c0 = clamp(Math.floor(minX / state.volume.colSpacing) - 1, 0, cols - 1);
        const c1 = clamp(Math.ceil(maxX / state.volume.colSpacing) + 1, 0, cols - 1);
        const r0 = clamp(Math.floor(minY / state.volume.rowSpacing) - 1, 0, rows - 1);
        const r1 = clamp(Math.ceil(maxY / state.volume.rowSpacing) + 1, 0, rows - 1);
        for (let rr = r0; rr <= r1; rr++) {
          const yMm = rr * state.volume.rowSpacing;
          for (let cc = c0; cc <= c1; cc++) {
            const xMm = cc * state.volume.colSpacing;
            if (!pointInLoop2D([xMm, yMm], outerLocal)) continue;
            let inHole = false;
            for (const hole of holesLocal) {
              if (hole.length >= 3 && pointInLoop2D([xMm, yMm], hole)) { inHole = true; break; }
            }
            if (!inHole) mask[rr * cols + cc] = 1;
          }
        }
      }
      masks[k] = mask;
    }
    state.cache.roiMask = { name: state.targetStruct.name, masks, rows, cols, depth };
    return state.cache.roiMask;
  }

  function drawMaskResliceOutline(ctx, plane, idx, layout) {
    const roiMask = ensureRoiMask();
    if (!roiMask) return;
    const { masks, rows, cols, depth } = roiMask;
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    ctx.setTransform(dpr * layout.scalePxPerMm, 0, 0, dpr * layout.scalePxPerMm, dpr * layout.offsetX, dpr * layout.offsetY);
    if (layout.invertX || layout.invertY) {
      const mmW = layout.mmW || 0;
      const mmH = layout.mmH || 0;
      ctx.translate(layout.invertX ? mmW : 0, layout.invertY ? mmH : 0);
      ctx.scale(layout.invertX ? -1 : 1, layout.invertY ? -1 : 1);
    }
    ctx.strokeStyle = 'rgba(0,153,153,0.95)';
    ctx.lineWidth = 1.0 / Math.max(1e-6, layout.scalePxPerMm);

    drawGridLines(ctx, layout);
    drawSupportRingsReslice(ctx, plane, idx, layout);

    // Simple edge draw (pixel boundary); good enough for navigation overlays.
    const drawRectMm = (x, y, w, h) => { ctx.strokeRect(x, y, w, h); };
    if (plane === 'coronal') {
      const r = clamp(idx, 0, rows - 1);
      for (let k = 0; k < depth; k++) {
        const m = masks[k]; if (!m) continue;
        const zMm = k * state.volume.sliceSpacing;
        for (let c = 0; c < cols; c++) {
          const v = m[r * cols + c];
          if (!v) continue;
          const left = c === 0 ? 0 : m[r * cols + (c - 1)];
          const right = c === cols - 1 ? 0 : m[r * cols + (c + 1)];
          const up = k === 0 ? 0 : (masks[k - 1] ? masks[k - 1][r * cols + c] : 0);
          const down = k === depth - 1 ? 0 : (masks[k + 1] ? masks[k + 1][r * cols + c] : 0);
          if (left && right && up && down) continue;
          drawRectMm(c * state.volume.colSpacing, zMm, state.volume.colSpacing, state.volume.sliceSpacing);
        }
      }
    } else if (plane === 'sagittal') {
      const cIdx = clamp(idx, 0, cols - 1);
      for (let k = 0; k < depth; k++) {
        const m = masks[k]; if (!m) continue;
        const zMm = k * state.volume.sliceSpacing;
        for (let r = 0; r < rows; r++) {
          const v = m[r * cols + cIdx];
          if (!v) continue;
          const left = r === 0 ? 0 : m[(r - 1) * cols + cIdx];
          const right = r === rows - 1 ? 0 : m[(r + 1) * cols + cIdx];
          const up = k === 0 ? 0 : (masks[k - 1] ? masks[k - 1][r * cols + cIdx] : 0);
          const down = k === depth - 1 ? 0 : (masks[k + 1] ? masks[k + 1][r * cols + cIdx] : 0);
          if (left && right && up && down) continue;
          drawRectMm(r * state.volume.rowSpacing, zMm, state.volume.rowSpacing, state.volume.sliceSpacing);
        }
      }
    }

    // Generated spheres (intersection circles in this reslice plane)
    if (state.generated.spheres.length && state.volume) {
      const originUvw = patientToUvw(state.volume.origin);
      ctx.save();
      ctx.lineWidth = 1.25 / Math.max(1e-6, layout.scalePxPerMm);

      if (plane === 'coronal') {
        // Coronal: fixed row index -> fixed V (along colCos); axes are U (x) and W (y)
        const vPlane = clamp(idx, 0, rows - 1) * state.volume.rowSpacing;
        for (const sph of state.generated.spheres) {
          ctx.strokeStyle = getGeneratedSphereStrokeStyle(sph.kind);
          const uvw = patientToUvw(sph.center);
          const u = uvw[0] - originUvw[0];
          const v = uvw[1] - originUvw[1];
          const w = uvw[2] - originUvw[2];
          const dv = v - vPlane;
          if (Math.abs(dv) > sph.r) continue;
          const rz = Math.sqrt(Math.max(0, sph.r * sph.r - dv * dv));
          ctx.beginPath();
          ctx.arc(u, w, rz, 0, Math.PI * 2);
          ctx.stroke();
        }
      } else if (plane === 'sagittal') {
        // Sagittal: fixed col index -> fixed U (along rowCos); axes are V (x) and W (y)
        const uPlane = clamp(idx, 0, cols - 1) * state.volume.colSpacing;
        for (const sph of state.generated.spheres) {
          ctx.strokeStyle = getGeneratedSphereStrokeStyle(sph.kind);
          const uvw = patientToUvw(sph.center);
          const u = uvw[0] - originUvw[0];
          const v = uvw[1] - originUvw[1];
          const w = uvw[2] - originUvw[2];
          const du = u - uPlane;
          if (Math.abs(du) > sph.r) continue;
          const rz = Math.sqrt(Math.max(0, sph.r * sph.r - du * du));
          ctx.beginPath();
          ctx.arc(v, w, rz, 0, Math.PI * 2);
          ctx.stroke();
        }
      }

      ctx.restore();
    }

    // Crosshair
    ctx.save();
    ctx.strokeStyle = 'rgba(236,102,2,0.6)';
    ctx.lineWidth = 1.5 / Math.max(1e-6, layout.scalePxPerMm);
    if (plane === 'coronal') {
      const x = state.view.col * state.volume.colSpacing;
      const y = state.view.k * state.volume.sliceSpacing;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, depth * state.volume.sliceSpacing);
      ctx.moveTo(0, y);
      ctx.lineTo(state.volume.width * state.volume.colSpacing, y);
      ctx.stroke();
    } else if (plane === 'sagittal') {
      const x = state.view.row * state.volume.rowSpacing;
      const y = state.view.k * state.volume.sliceSpacing;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, depth * state.volume.sliceSpacing);
      ctx.moveTo(0, y);
      ctx.lineTo(state.volume.height * state.volume.rowSpacing, y);
      ctx.stroke();
    }
    ctx.restore();

    drawCircularCursor(ctx, layout, plane);
    drawMeasurementInCurrentMmTransform(ctx, layout, plane);

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    drawCtcLegend(ctx, layout);
  }

  function drawCoronalOverlay(layout) {
    const ctx = els.coronalOverlay.getContext('2d');
    if (!ctx || !state.volume) return;
    drawMaskResliceOutline(ctx, 'coronal', state.view.row, layout);
    drawOrientationEdgeLabels(ctx, computeDesiredViewFrames().coronal);
  }

  function drawSagittalOverlay(layout) {
    const ctx = els.sagittalOverlay.getContext('2d');
    if (!ctx || !state.volume) return;
    drawMaskResliceOutline(ctx, 'sagittal', state.view.col, layout);
    drawOrientationEdgeLabels(ctx, computeDesiredViewFrames().sagittal);
  }

  function renderThree() {
    if (!state.three.renderer || !state.volume || !state.targetStruct) return;
    // Build PTV mesh once per target ROI.
    if (!state.three.ptvMesh || state.three.ptvMesh.name !== state.targetStruct.name) {
      const mesh = RtLayeredCake.buildMeshFromLayeredCake(state.targetStruct);
      state.three.ptvMesh = { name: state.targetStruct.name, mesh };
      // Center in UVW space.
      const c = computeLayeredCakeCentroid(state.targetStruct);
      state.three.centerUvw = c ? [c.u, c.v, c.w] : [0, 0, 0];
      state.three.renderer.setPtvMesh(mesh, state.three.centerUvw);
    }
    if (state.generated.spheres.length) {
      const spheres = state.generated.spheres.map((s) => {
        const uvw = patientToUvw(s.center);
        return { id: s.id, centerUvw: uvw, r: s.r, kind: s.kind };
      });
      state.three.renderer.setSpheres(spheres, state.three.centerUvw);
    } else {
      state.three.renderer.setSpheres([], state.three.centerUvw);
    }
    state.three.renderer.draw();
  }

	  function computeAxialLayoutCssPx() {
	    const rect = els.axialViewport.getBoundingClientRect();
	    const displayW = Math.max(2, rect.width || els.axialViewport.clientWidth || 512);
	    const displayH = Math.max(2, rect.height || els.axialViewport.clientHeight || 512);
    const rows = state.volume.height;
    const cols = state.volume.width;
    const psR = state.volume.rowSpacing;
    const psC = state.volume.colSpacing;
    const heightMm = rows * psR;
    const widthMm = cols * psC;
    const dataAspect = heightMm / (widthMm || 1);
    const viewAspect = displayH / (displayW || 1);
    const pad = 0.96;
    let drawW, drawH;
    if (dataAspect > viewAspect) {
      drawH = displayH * pad;
      drawW = drawH / dataAspect;
    } else {
      drawW = displayW * pad;
      drawH = drawW * dataAspect;
    }
    const z = Math.max(0.05, Number(state.view.zoomAxial) || 1);
	    drawW *= z;
	    drawH *= z;
	    const pan = state.view.panAxial || { x: 0, y: 0 };
	    const offsetX = (displayW - drawW) / 2 + (Number(pan.x) || 0);
	    const offsetY = (displayH - drawH) / 2 + (Number(pan.y) || 0);
	    const scalePxPerMm = Math.max(1e-6, Math.min(drawW / (widthMm || 1), drawH / (heightMm || 1)));
	    const orient = getViewOrientation();
	    return {
	      displayW,
      displayH,
      drawW,
      drawH,
      offsetX,
      offsetY,
      scalePxPerMm,
      mmW: widthMm,
      mmH: heightMm,
      invertX: orient.axial.invertX,
      invertY: orient.axial.invertY,
    };
  }

  function getViewOrientation() {
    const frames = computeDesiredViewFrames();
    if (!state.volume) {
      return {
        axial: { invertX: false, invertY: false },
        coronal: { invertX: false, invertY: false },
        sagittal: { invertX: false, invertY: false },
      };
    }

    // Base axes per viewport (patient coords): x increases to the right on screen, y increases downward.
    const baseAxialX = state.volume.rowCos;
    const baseAxialY = state.volume.colCos;
    const baseCorX = state.volume.rowCos;
    const baseCorY = state.volume.normal;
    const baseSagX = state.volume.colCos;
    const baseSagY = state.volume.normal;

    const axial = {
      invertX: dot3(baseAxialX, frames.axial.right) < 0,
      invertY: dot3(baseAxialY, frames.axial.up) > 0,
    };
    const coronal = {
      invertX: dot3(baseCorX, frames.coronal.right) < 0,
      invertY: dot3(baseCorY, frames.coronal.up) > 0,
    };
    const sagittal = {
      invertX: dot3(baseSagX, frames.sagittal.right) < 0,
      invertY: dot3(baseSagY, frames.sagittal.up) > 0,
    };
    return { axial, coronal, sagittal };
  }

  function normalizePatientPosition(pp) {
    const s = String(pp || '').trim().toUpperCase();
    // Common CT positions: HFS/HFP/FFS/FFP, plus HFDL/HFDR/FFDL/FFDR.
    if (/^(HF|FF)(S|P|DL|DR)$/.test(s)) return s;
    return 'HFS';
  }

  function computeScannerAxesPatient(ppRaw) {
    // Patient axes (DICOM LPS): +X=Left, +Y=Posterior, +Z=Head/Superior.
    const X = [1, 0, 0];
    const Y = [0, 1, 0];
    const Z = [0, 0, 1];
    const pp = normalizePatientPosition(ppRaw);
    const headFirst = pp.startsWith('HF');
    // Scanner "into bore" (outside -> inside), expressed in patient coords:
    // - Head-first: outside is at head end, inside is towards feet (inferior) => -Z.
    // - Feet-first: outside is at feet end, inside is towards head (superior) => +Z.
    const inDir = headFirst ? mul3(Z, -1) : Z;
    let upDir = mul3(Y, -1); // default: supine => anterior is up
    if (pp.endsWith('P')) upDir = Y; // prone => posterior is up
    else if (pp.endsWith('DL')) upDir = mul3(X, -1); // left decubitus => right side up
    else if (pp.endsWith('DR')) upDir = X; // right decubitus => left side up
    const leftDir = norm3(cross3(upDir, inDir)); // ensure right-handed: left × up = in
    return { left: leftDir, up: norm3(upDir), in: norm3(inDir) };
  }

  function chooseSignedAxis(axis, desired) {
    const s = dot3(axis, desired);
    return s >= 0 ? axis : mul3(axis, -1);
  }

  function projectToPlane(v, n) {
    // Remove component along n.
    const d = dot3(v, n);
    return sub3(v, mul3(n, d));
  }

  function orthonormalizeFrame(dir, upHint) {
    const d = norm3(dir);
    let u = projectToPlane(upHint, d);
    const lenU = Math.hypot(u[0], u[1], u[2]);
    if (lenU < 1e-6) {
      // Fallback: pick an axis not parallel to dir.
      const fallback = Math.abs(dot3(d, [0, 0, 1])) < 0.9 ? [0, 0, 1] : [0, 1, 0];
      u = projectToPlane(fallback, d);
    }
    u = norm3(u);
    const r = norm3(cross3(d, u));
    const u2 = norm3(cross3(r, d));
    return { right: r, up: u2, dir: d };
  }

	  function computeDesiredViewFrames() {
	    if (!state.volume) {
	      return {
	        // Patient axes (DICOM LPS): +X=Left, +Y=Posterior, +Z=Head/Superior.
	        // Fixed camera locations (do not change with PatientPosition):
	        // - Axial: look from feet -> head, anterior at top.
	        // - Coronal: look from anterior -> posterior (face view), head at top.
	        // - Sagittal: look from patient-right -> patient-left, head at top (A on right edge).
	        axial: { right: [1, 0, 0], up: [0, -1, 0], dir: [0, 0, 1] },
	        coronal: { right: [1, 0, 0], up: [0, 0, 1], dir: [0, 1, 0] },
	        sagittal: { right: [0, -1, 0], up: [0, 0, 1], dir: [1, 0, 0] },
	      };
	    }

	    // Patient axes (DICOM LPS): +X=Left, +Y=Posterior, +Z=Head/Superior.
	    // Fixed camera locations (do not change with PatientPosition):
	    // - Axial: look from feet -> head, anterior at top.
	    // - Coronal: look from anterior -> posterior (face view), head at top.
	    // - Sagittal: look from patient-right -> patient-left, head at top (A on right edge).
	    const dirAxialGlobal = [0, 0, 1];
	    const upAxialGlobal = [0, -1, 0];
	    const dirCorGlobal = [0, 1, 0];
	    const upCorGlobal = [0, 0, 1];
	    const dirSagGlobal = [1, 0, 0];
	    const upSagGlobal = [0, 0, 1];

	    // Keep each view's camera direction perpendicular to its reslice plane, but choose the sign
	    // that matches the fixed global camera definition above.
	    const dirAxial = chooseSignedAxis(state.volume.normal, dirAxialGlobal);
	    const dirCor = chooseSignedAxis(state.volume.colCos, dirCorGlobal);
	    const dirSag = chooseSignedAxis(state.volume.rowCos, dirSagGlobal);

	    const axial = orthonormalizeFrame(dirAxial, upAxialGlobal);
	    const coronal = orthonormalizeFrame(dirCor, upCorGlobal);
	    const sagittal = orthonormalizeFrame(dirSag, upSagGlobal);
	    return { axial, coronal, sagittal };
	  }

  function bestPatientAxisLabel(dirPatient) {
    const v = norm3(dirPatient);
    const axes = [
      { label: 'L', vec: [1, 0, 0] },
      { label: 'R', vec: [-1, 0, 0] },
      { label: 'P', vec: [0, 1, 0] },
      { label: 'A', vec: [0, -1, 0] },
      { label: 'H', vec: [0, 0, 1] },
      { label: 'F', vec: [0, 0, -1] },
    ];
    let best = axes[0].label;
    let bestDot = -Infinity;
    for (const a of axes) {
      const d = dot3(v, a.vec);
      if (d > bestDot) {
        bestDot = d;
        best = a.label;
      }
    }
    return best;
  }

  function drawOrientationEdgeLabels(ctx, frame) {
    if (!ctx || !frame) return;
    const dpr = window.devicePixelRatio || 1;
    const w = ctx.canvas.width || 0;
    const h = ctx.canvas.height || 0;
    if (!w || !h) return;

    const top = bestPatientAxisLabel(frame.up);
    const bottom = bestPatientAxisLabel(mul3(frame.up, -1));
    const right = bestPatientAxisLabel(frame.right);
    const left = bestPatientAxisLabel(mul3(frame.right, -1));

    const pad = Math.round(12 * dpr);
    const fontSize = Math.round(14 * dpr);

    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.font = `700 ${fontSize}px system-ui, -apple-system, Segoe UI, Roboto, Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = Math.max(2, Math.round(3 * dpr));
    ctx.strokeStyle = 'rgba(0,0,0,0.75)';
    ctx.fillStyle = 'rgba(255,255,255,0.9)';

    const draw = (label, x, y) => {
      ctx.strokeText(label, x, y);
      ctx.fillText(label, x, y);
    };
    draw(top, w / 2, pad);
    draw(bottom, w / 2, h - pad);
    draw(left, pad, h / 2);
    draw(right, w - pad, h / 2);
    ctx.restore();
  }

  function drawCtcLegend(ctx, layout) {
    if (!ctx || !layout) return;
    const dpr = window.devicePixelRatio || 1;
    const cw = ctx.canvas.width || 0;
    const ch = ctx.canvas.height || 0;
    if (!cw || !ch) return;
    const ctc = Math.max(0, Number(els.spacingInput?.value) || 0);
    if (!ctc) return;
    const measuredPeaks = state.generated.minCtcPairPeaks?.dMm;
    const measuredAll = state.generated.minCtcPairAll?.dMm;

    const pad = 10 * dpr;
    const x0 = pad;
    // Bottom-left to avoid the plane label pill at top-left.
    let yLine = ch - pad - 22 * dpr;
    let yTitle = yLine - 28 * dpr;
    let yNote = yLine + 6 * dpr;
    if (yTitle < pad) {
      // Very small viewports: fall back to top-left.
      yTitle = pad;
      yLine = pad + 18 * dpr;
      yNote = yLine + 6 * dpr;
    }
    const rawLen = ctc * (Number(layout.scalePxPerMm) || 1) * dpr;
    const lenPx = clamp(rawLen, 24 * dpr, 170 * dpr);
    const r = 4 * dpr;

    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.lineWidth = 3 * dpr;
    ctx.strokeStyle = 'rgba(0,0,0,0.65)';
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.font = `700 ${Math.round(11 * dpr)}px system-ui, -apple-system, Segoe UI, Roboto, Arial`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';

    const title = measuredPeaks != null
      ? `CTC(min peak-to-peak): ${measuredPeaks.toFixed(1)} mm`
      : `CTC(min peak-to-peak): ${ctc.toFixed(1)} mm`;
    ctx.strokeText(title, x0, yTitle);
    ctx.fillText(title, x0, yTitle);

    // Example pair
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 2 * dpr;
    ctx.beginPath();
    ctx.moveTo(x0, yLine);
    ctx.lineTo(x0 + lenPx, yLine);
    ctx.stroke();
    ctx.fillStyle = 'rgba(236,102,2,0.95)';
    ctx.beginPath();
    ctx.arc(x0, yLine, r, 0, Math.PI * 2);
    ctx.arc(x0 + lenPx, yLine, r, 0, Math.PI * 2);
    ctx.fill();

    const sub = rawLen > 170 * dpr
      ? 'Spacing = minimum peak-to-peak CTC (legend scaled)'
      : 'Spacing = minimum peak-to-peak CTC';
    noteText(ctx, sub, x0, yNote, dpr);
    if (measuredAll != null && (measuredPeaks == null || measuredAll < measuredPeaks - 0.25)) {
      noteText(ctx, `Closest (any sphere): ${measuredAll.toFixed(1)} mm`, x0, yNote + 14 * dpr, dpr);
    }
    ctx.restore();
  }

  function noteText(ctx, s, x, y, dpr) {
    ctx.save();
    ctx.font = `600 ${Math.round(10 * dpr)}px system-ui, -apple-system, Segoe UI, Roboto, Arial`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.lineWidth = 3 * dpr;
    ctx.strokeStyle = 'rgba(0,0,0,0.65)';
    ctx.fillStyle = 'rgba(255,255,255,0.78)';
    ctx.strokeText(s, x, y);
    ctx.fillText(s, x, y);
    ctx.restore();
  }

  function drawGridLines(ctx, layout) {
    if (!els.showGridCheck?.checked || !layout) return;
    const spacing = Math.max(1, Number(els.gridSpacingInput?.value) || 0);
    if (!Number.isFinite(spacing) || spacing <= 0) return;

    const mmW = Math.max(0, Number(layout.mmW) || 0);
    const mmH = Math.max(0, Number(layout.mmH) || 0);
    if (!mmW || !mmH) return;

    const dpr = window.devicePixelRatio || 1;
    const pxToMm = 1 / (dpr * Math.max(1e-6, Number(layout.scalePxPerMm) || 1));
    const lineMm = Math.max(0.6 * pxToMm, 0.15);
    const maxLines = 600;
    const vCount = Math.min(maxLines, Math.floor(mmW / spacing) + 1);
    const hCount = Math.min(maxLines, Math.floor(mmH / spacing) + 1);

    ctx.save();
    ctx.strokeStyle = 'rgba(210,210,210,0.18)';
    ctx.lineWidth = lineMm;
    ctx.setLineDash([]);
    ctx.beginPath();
    for (let i = 0; i < vCount; i++) {
      const x = i * spacing;
      ctx.moveTo(x, 0);
      ctx.lineTo(x, mmH);
    }
    for (let j = 0; j < hCount; j++) {
      const y = j * spacing;
      ctx.moveTo(0, y);
      ctx.lineTo(mmW, y);
    }
    ctx.stroke();
    ctx.restore();
  }

  function drawAxialOverlay(k, layout) {
    const ctx = els.axialOverlay.getContext('2d');
    if (!ctx || !state.volume) return;
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, els.axialOverlay.width, els.axialOverlay.height);

    const { offsetX, offsetY, scalePxPerMm } = layout || computeAxialLayoutCssPx();
    // Work in millimeters: canvas transform maps mm -> device pixels.
    ctx.setTransform(dpr * scalePxPerMm, 0, 0, dpr * scalePxPerMm, dpr * offsetX, dpr * offsetY);
    if (layout?.invertX || layout?.invertY) {
      const mmW = layout?.mmW || (state.volume.width * state.volume.colSpacing);
      const mmH = layout?.mmH || (state.volume.height * state.volume.rowSpacing);
      ctx.translate(layout.invertX ? mmW : 0, layout.invertY ? mmH : 0);
      ctx.scale(layout.invertX ? -1 : 1, layout.invertY ? -1 : 1);
    }

    drawGridLines(ctx, layout || computeAxialLayoutCssPx());

    const slice = state.volume.slices[k];
    if (slice && state.targetStruct) {
      const targetStroke = 'rgba(0,153,153,0.95)';
      drawStructureOnSlice(ctx, state.targetStruct, slice, {
        strokeStyle: targetStroke,
        lineWidth: 1.5 / Math.max(1e-6, scalePxPerMm),
      });
    }

    drawSupportRingsAxial(ctx, k, layout || computeAxialLayoutCssPx());

    if (state.generated.spheres.length) {
      const wSlice = getSliceW(k);
      if (wSlice != null) {
        ctx.lineWidth = 1.25 / Math.max(1e-6, scalePxPerMm);
        for (const s of state.generated.spheres) {
          const wc = dot3(s.center, state.volume.normal);
          const dz = Math.abs(wSlice - wc);
          if (dz > s.r) continue;
          ctx.strokeStyle = getGeneratedSphereStrokeStyle(s.kind);
          const rz = Math.sqrt(Math.max(0, s.r * s.r - dz * dz));
          const centerProj = add3(s.center, mul3(state.volume.normal, (wSlice - wc)));
          drawCircleOnSlice(ctx, slice, centerProj, rz);
        }
      }
    }

    // Crosshair (slice-local mm coords)
    {
      const cx = state.view.col * state.volume.colSpacing;
      const cy = state.view.row * state.volume.rowSpacing;
      ctx.save();
      ctx.strokeStyle = 'rgba(236,102,2,0.6)';
      ctx.lineWidth = 1.5 / Math.max(1e-6, scalePxPerMm);
      ctx.beginPath();
      ctx.moveTo(cx, 0);
      ctx.lineTo(cx, state.volume.height * state.volume.rowSpacing);
      ctx.moveTo(0, cy);
      ctx.lineTo(state.volume.width * state.volume.colSpacing, cy);
      ctx.stroke();
      ctx.restore();
    }

    drawCircularCursor(ctx, layout || computeAxialLayoutCssPx(), 'axial');
    drawMeasurementInCurrentMmTransform(ctx, layout || computeAxialLayoutCssPx(), 'axial');

    // Restore to identity for any subsequent UI drawing.
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    drawCtcLegend(ctx, layout || computeAxialLayoutCssPx());
    drawOrientationEdgeLabels(ctx, computeDesiredViewFrames().axial);
  }

  function drawCircleOnSlice(ctx, slice, centerPatient, radiusMm) {
    const ds = slice?.dataSet;
    if (!ds) return;
    const ipp = parseImagePosition(ds);
    const v = sub3(centerPatient, ipp);
    // DICOM: columns advance along rowCos with spacing psC; rows advance along colCos with spacing psR.
    // Here we work in mm, so project onto the unit vectors directly.
    const xMm = dot3(v, state.volume.rowCos);
    const yMm = dot3(v, state.volume.colCos);
    ctx.beginPath();
    ctx.ellipse(xMm, yMm, radiusMm, radiusMm, 0, 0, Math.PI * 2);
    ctx.stroke();
  }

  function drawStructureOnSlice(ctx, struct, slice, opts) {
    const ds = slice?.dataSet;
    if (!ds || !struct?.layers?.length) return;
    const ipp = parseImagePosition(ds);
    const wSlice = dot3(ipp, state.volume.normal);
    const layer = findLayerForW(struct, wSlice);
    if (!layer) return;

    const u0 = dot3(ipp, state.volume.rowCos);
    const v0 = dot3(ipp, state.volume.colCos);
    ctx.save();
    ctx.strokeStyle = opts?.strokeStyle || 'rgba(0,153,153,0.95)';
    ctx.lineWidth = opts?.lineWidth || 1;

    for (const poly of layer.polygons || []) {
      strokeUvLoop(ctx, poly.outer, u0, v0);
      for (const hole of poly.holes || []) strokeUvLoop(ctx, hole, u0, v0);
    }

    ctx.restore();
  }

  function strokeUvLoop(ctx, loop, u0, v0) {
    if (!Array.isArray(loop) || loop.length < 2) return;
    ctx.beginPath();
    for (let i = 0; i < loop.length; i++) {
      const p = loop[i];
      if (!p) continue;
      const u = p[0];
      const v = p[1];
      // Layered-cake uses (u,v) = (dot(p,rowCos), dot(p,colCos)) in mm-space.
      // Convert to slice-local mm offsets for drawing.
      const xMm = u - u0;
      const yMm = v - v0;
      if (i === 0) ctx.moveTo(xMm, yMm);
      else ctx.lineTo(xMm, yMm);
    }
    ctx.closePath();
    ctx.stroke();
  }

  function findLayerForW(struct, w) {
    const layers = struct?.layers || [];
    if (!layers.length) return null;
    let lo = 0;
    let hi = layers.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const z = layers[mid].zCenter;
      if (z < w) lo = mid + 1;
      else hi = mid - 1;
    }
    const candidates = [];
    if (lo < layers.length) candidates.push(layers[lo]);
    if (lo - 1 >= 0) candidates.push(layers[lo - 1]);
    let best = null;
    let bestDist = Infinity;
    for (const l of candidates) {
      const half = (l.thickness || 1) / 2;
      const dist = Math.abs(w - l.zCenter);
      if (dist <= half + 1e-3 && dist < bestDist) {
        best = l;
        bestDist = dist;
      }
    }
    return best;
  }

  function createCtGlRenderer(canvas) {
    if (!canvas) return null;
    let gl = canvas.getContext('webgl', { premultipliedAlpha: false, alpha: false });
    if (!gl) gl = canvas.getContext('experimental-webgl', { premultipliedAlpha: false, alpha: false });
    if (!gl) {
      appendLog(els.importLog, 'WebGL unavailable; CT rendering will fail.');
      return null;
    }
    const floatExt = gl.getExtension('OES_texture_float');
    if (!floatExt) {
      appendLog(els.importLog, 'WebGL float textures unsupported (OES_texture_float missing).');
      return null;
    }
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);

    const vsSource = `
      attribute vec2 aPos;
      attribute vec2 aTex;
      varying vec2 vTex;
      void main(){
        gl_Position = vec4(aPos, 0.0, 1.0);
        vTex = aTex;
      }
    `;
    const fsSource = `
      precision mediump float;
      varying vec2 vTex;
      uniform sampler2D uTex;
      uniform float uMin;
      uniform float uMax;
      float clamp01(float x){ return clamp(x, 0.0, 1.0); }
      void main(){
        float v = texture2D(uTex, vTex).r;
        float t = clamp01((v - uMin) / max(1e-6, (uMax - uMin)));
        gl_FragColor = vec4(vec3(t), 1.0);
      }
    `;
    function compile(type, src) {
      const sh = gl.createShader(type);
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      return sh;
    }
    const vs = compile(gl.VERTEX_SHADER, vsSource);
    const fs = compile(gl.FRAGMENT_SHADER, fsSource);
    const prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);

    const buf = gl.createBuffer();
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    const locPos = gl.getAttribLocation(prog, 'aPos');
    const locTex = gl.getAttribLocation(prog, 'aTex');
    const locMin = gl.getUniformLocation(prog, 'uMin');
    const locMax = gl.getUniformLocation(prog, 'uMax');

    return {
      render({ width, height, data, wlMin, wlMax, displayW, displayH, drawW, drawH, offsetX, offsetY, invertX, invertY }) {
        if (!data || !width || !height) return;
        gl.viewport(0, 0, canvas.width, canvas.height);
        gl.useProgram(prog);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, tex);
        // Do NOT rely on UNPACK_FLIP_Y_WEBGL for float textures; some browsers ignore it for OES_texture_float.
        // We handle the vertical mapping explicitly via texture coordinates so overlays and pixel picking match.
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, width, height, 0, gl.LUMINANCE, gl.FLOAT, data);
        gl.uniform1f(locMin, wlMin);
        gl.uniform1f(locMax, wlMax);

        const dW = Number.isFinite(displayW) ? displayW : (canvas.clientWidth || 512);
        const dH = Number.isFinite(displayH) ? displayH : (canvas.clientHeight || 512);
        const oX = Number.isFinite(offsetX) ? offsetX : 0;
        const oY = Number.isFinite(offsetY) ? offsetY : 0;
        const drW = Number.isFinite(drawW) ? drawW : dW;
        const drH = Number.isFinite(drawH) ? drawH : dH;
        // NDC quad for letterboxed region
        const x0 = (oX / dW) * 2 - 1;
        const x1 = ((oX + drW) / dW) * 2 - 1;
        const yTop = 1 - (oY / dH) * 2;
        const yBot = 1 - ((oY + drH) / dH) * 2;
        // Sample at texel centers to avoid half-texel misalignment with overlays.
        const u0 = 0.5 / Math.max(1, width);
        const v0 = 0.5 / Math.max(1, height);
        const u1 = 1 - u0;
        const v1 = 1 - v0;
        const invX = !!invertX;
        const invY = !!invertY;
        const uLeft = invX ? u1 : u0;
        const uRight = invX ? u0 : u1;
        // With UNPACK_FLIP_Y_WEBGL disabled, row 0 of the typed array maps to the bottom of the texture.
        // We want row 0 to appear at the top of the viewport when invertY is false.
        const vTop = invY ? v1 : v0;
        const vBottom = invY ? v0 : v1;
        const verts = new Float32Array([
          x0, yBot, uLeft, vBottom,
          x1, yBot, uRight, vBottom,
          x0, yTop, uLeft, vTop,
          x1, yTop, uRight, vTop,
        ]);

        gl.bindBuffer(gl.ARRAY_BUFFER, buf);
        gl.bufferData(gl.ARRAY_BUFFER, verts, gl.DYNAMIC_DRAW);
        const stride = 4 * 4;
        gl.enableVertexAttribArray(locPos);
        gl.vertexAttribPointer(locPos, 2, gl.FLOAT, false, stride, 0);
        gl.enableVertexAttribArray(locTex);
        gl.vertexAttribPointer(locTex, 2, gl.FLOAT, false, stride, 8);
        gl.clearColor(0, 0, 0, 1);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      },
    };
  }

  function updateRoiInfo() {
    if (!state.targetStruct) {
      els.roiInfo.textContent = 'ROI: —';
      return;
    }
    const volMm3 = computeLayeredCakeVolumeMm3(state.targetStruct);
    const volCc = volMm3 / 1000.0;
    els.roiInfo.textContent = `ROI: ${state.targetStruct.name}  •  ${volCc.toFixed(2)} cc`;
  }

  function computeLayeredCakeVolumeMm3(struct) {
    if (!struct?.layers) return 0;
    let vol = 0;
    for (const layer of struct.layers) {
      const th = layer.thickness || 0;
      for (const poly of layer.polygons || []) {
        const aOuter = Math.abs(polygonArea(poly.outer));
        const aHoles = (poly.holes || []).reduce((s, h) => s + Math.abs(polygonArea(h)), 0);
        const area = Math.max(0, aOuter - aHoles);
        vol += area * th;
      }
    }
    return vol;
  }

  function polygonArea(loop) {
    if (!Array.isArray(loop) || loop.length < 3) return 0;
    let area2 = 0;
    for (let i = 0, j = loop.length - 1; i < loop.length; j = i++) {
      const xi = loop[i][0], yi = loop[i][1];
      const xj = loop[j][0], yj = loop[j][1];
      area2 += (xj - xi) * (yi + yj);
    }
    return area2 / 2;
  }

  function polygonCentroid(loop) {
    // Returns centroid for simple polygon (may be CW/CCW), ignoring any repeated last point.
    if (!Array.isArray(loop) || loop.length < 3) return { x: 0, y: 0, area: 0 };
    const n = loop.length;
    let A = 0;
    let Cx = 0;
    let Cy = 0;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const xi = loop[i][0], yi = loop[i][1];
      const xj = loop[j][0], yj = loop[j][1];
      const cross = xi * yj - xj * yi;
      A += cross;
      Cx += (xi + xj) * cross;
      Cy += (yi + yj) * cross;
    }
    A *= 0.5;
    const denom = 6 * (A || 1e-12);
    return { x: Cx / denom, y: Cy / denom, area: A };
  }

  function computeLayeredCakeCentroid(struct) {
    if (!struct?.layers?.length) return null;
    let vol = 0;
    let sumU = 0;
    let sumV = 0;
    let sumW = 0;
    for (const layer of struct.layers) {
      const th = layer.thickness || 0;
      for (const poly of layer.polygons || []) {
        const out = polygonCentroid(poly.outer);
        const holeStats = (poly.holes || []).map((h) => polygonCentroid(h));
        const aOuter = out.area;
        let aEff = aOuter;
        let cu = out.x * aOuter;
        let cv = out.y * aOuter;
        for (const hs of holeStats) {
          aEff -= hs.area;
          cu -= hs.x * hs.area;
          cv -= hs.y * hs.area;
        }
        if (!Number.isFinite(aEff) || Math.abs(aEff) < 1e-6) continue;
        const areaAbs = Math.abs(aEff);
        const uCent = cu / aEff;
        const vCent = cv / aEff;
        const dV = areaAbs * th;
        vol += dV;
        sumU += uCent * dV;
        sumV += vCent * dV;
        sumW += layer.zCenter * dV;
      }
    }
    if (vol <= 0) return null;
    const u = sumU / vol;
    const v = sumV / vol;
    const w = sumW / vol;
    const p = add3(add3(mul3(state.volume.rowCos, u), mul3(state.volume.colCos, v)), mul3(state.volume.normal, w));
    return { u, v, w, patient: p, vol };
  }

  function computeLayeredCakeBounds(struct) {
    let uMin = Infinity, uMax = -Infinity;
    let vMin = Infinity, vMax = -Infinity;
    let wMin = Infinity, wMax = -Infinity;
    for (const layer of struct?.layers || []) {
      const half = (layer.thickness || 0) / 2;
      wMin = Math.min(wMin, layer.zCenter - half);
      wMax = Math.max(wMax, layer.zCenter + half);
      for (const poly of layer.polygons || []) {
        for (const p of poly.outer || []) {
          if (!p) continue;
          uMin = Math.min(uMin, p[0]);
          uMax = Math.max(uMax, p[0]);
          vMin = Math.min(vMin, p[1]);
          vMax = Math.max(vMax, p[1]);
        }
      }
    }
    if (!Number.isFinite(uMin)) return null;
    return { uMin, uMax, vMin, vMax, wMin, wMax };
  }

  function pointInLoop2D(pt, loop) {
    // Ray casting in (u,v)
    let inside = false;
    const x = pt[0];
    const y = pt[1];
    for (let i = 0, j = loop.length - 1; i < loop.length; j = i++) {
      const xi = loop[i][0], yi = loop[i][1];
      const xj = loop[j][0], yj = loop[j][1];
      const intersect = (yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / ((yj - yi) || 1e-12) + xi;
      if (intersect) inside = !inside;
    }
    return inside;
  }

  function isPointInsideStructure(struct, pPatient) {
    if (!struct?.layers?.length || !state.volume) return false;
    const u = dot3(pPatient, state.volume.rowCos);
    const v = dot3(pPatient, state.volume.colCos);
    const w = dot3(pPatient, state.volume.normal);
    const layer = findLayerForW(struct, w);
    if (!layer) return false;
    const pt = [u, v];
    for (const poly of layer.polygons || []) {
      if (!pointInLoop2D(pt, poly.outer || [])) continue;
      let inHole = false;
      for (const hole of poly.holes || []) {
        if (pointInLoop2D(pt, hole)) {
          inHole = true;
          break;
        }
      }
      if (!inHole) return true;
    }
    return false;
  }

  function isUvwInsideStructure(struct, uvw) {
    if (!struct?.layers?.length) return false;
    const w = uvw[2];
    const layer = findLayerForW(struct, w);
    if (!layer) return false;
    const pt = [uvw[0], uvw[1]];
    for (const poly of layer.polygons || []) {
      if (!pointInLoop2D(pt, poly.outer || [])) continue;
      let inHole = false;
      for (const hole of poly.holes || []) {
        if (pointInLoop2D(pt, hole)) { inHole = true; break; }
      }
      if (!inHole) return true;
    }
    return false;
  }

  function fibonacciSphereDirs(n) {
    const dirs = [];
    const m = Math.max(8, Math.floor(n || 64));
    const phi = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < m; i++) {
      const y = 1 - (i / (m - 1)) * 2;
      const r = Math.sqrt(Math.max(0, 1 - y * y));
      const theta = phi * i;
      const x = Math.cos(theta) * r;
      const z = Math.sin(theta) * r;
      dirs.push([x, y, z]);
    }
    return dirs;
  }

  function sphereFullyInside(struct, center, radiusMm) {
    const dirs = fibonacciSphereDirs(64);
    const eps = 0.25; // mm inward bias for numerical robustness
    const rEff = Math.max(0, radiusMm - eps);
    for (const d of dirs) {
      const p = add3(center, mul3(d, rEff));
      if (!isPointInsideStructure(struct, p)) return false;
    }
    return true;
  }

  function sphereFullyInsideUvw(struct, centerUvw, radiusMm) {
    const dirs = fibonacciSphereDirs(64);
    const eps = 0.25; // mm inward bias for numerical robustness
    const rEff = Math.max(0, radiusMm - eps);
    for (const d of dirs) {
      const p = add3(centerUvw, mul3(d, rEff));
      if (!isUvwInsideStructure(struct, p)) return false;
    }
    return true;
  }

  function dedupPointsGrid(points, minD) {
    const pts = Array.isArray(points) ? points : [];
    const d = Math.max(1e-6, Number(minD) || 0);
    if (pts.length <= 1 || d <= 0) return pts.slice();
    const cell = d;
    const grid = new Map(); // key -> indices into uniq
    const uniq = [];

    const keyOf = (p) => {
      const ix = Math.floor(p[0] / cell);
      const iy = Math.floor(p[1] / cell);
      const iz = Math.floor(p[2] / cell);
      return `${ix},${iy},${iz}`;
    };

    for (const p of pts) {
      if (!p) continue;
      const ix = Math.floor(p[0] / cell);
      const iy = Math.floor(p[1] / cell);
      const iz = Math.floor(p[2] / cell);
      let ok = true;
      for (let dx = -1; dx <= 1 && ok; dx++) {
        for (let dy = -1; dy <= 1 && ok; dy++) {
          for (let dz = -1; dz <= 1 && ok; dz++) {
            const key = `${ix + dx},${iy + dy},${iz + dz}`;
            const arr = grid.get(key);
            if (!arr) continue;
            for (const j of arr) {
              if (distance(p, uniq[j]) < d) { ok = false; break; }
            }
          }
        }
      }
      if (!ok) continue;
      const idx = uniq.length;
      uniq.push(p);
      const key = keyOf(p);
      if (!grid.has(key)) grid.set(key, []);
      grid.get(key).push(idx);
    }
    return uniq;
  }

  function generateLatticeCenters(params) {
    const { pattern, spacing, bounds } = params;
    const centers = [];

    const uSpan = bounds.uMax - bounds.uMin;
    const vSpan = bounds.vMax - bounds.vMin;
    const wSpan = bounds.wMax - bounds.wMin;

    if (pattern === 'hcp') {
      const ipA = spacing;
      const c = Math.sqrt(8 / 3) * ipA;
      const a1 = [ipA, 0, 0];
      const a2 = [-0.5 * ipA, (Math.sqrt(3) / 2) * ipA, 0];
      const a3 = [0, 0, c];
      const atomFrac = [
        [0, 0, 0],
        [1 / 3, 2 / 3, 0.5],
      ];
      const fracToCart = (f) => add3(add3(mul3(a1, f[0]), mul3(a2, f[1])), mul3(a3, f[2]));

      const nx = Math.ceil(uSpan / ipA) + 3;
      const ny = Math.ceil(vSpan / ((Math.sqrt(3) / 2) * ipA)) + 3;
      const nz = Math.ceil(wSpan / c) + 3;

      const origin = [bounds.uMin - ipA, bounds.vMin - ipA, bounds.wMin - c];

      for (let i = 0; i < nx; i++) {
        for (let j = 0; j < ny; j++) {
          for (let k = 0; k < nz; k++) {
            const cellShift = add3(add3(add3(origin, mul3(a1, i)), mul3(a2, j)), mul3(a3, k));
            for (const f of atomFrac) {
              const p = add3(cellShift, fracToCart(f));
              centers.push(p);
            }
          }
        }
      }
      return centers;
    }

    // For SC, step = center-to-center spacing directly.
    // For AC (alternating cubic), we keep only (iu+iv+iw) even positions; nearest neighbors become diagonal.
    // To make the *nearest* center-to-center distance equal to the user input spacing, we scale the base steps by 1/sqrt(2).
    const acScale = pattern === 'ac' ? (1 / Math.sqrt(2)) : 1;
    const stepU = spacing * acScale;
    const stepV = spacing * acScale;
    const stepW = spacing * acScale;

    const nu = Math.ceil(uSpan / stepU) + 3;
    const nv = Math.ceil(vSpan / stepV) + 3;
    const nw = Math.ceil(wSpan / stepW) + 3;

    const u0 = bounds.uMin - stepU;
    const v0 = bounds.vMin - stepV;
    const w0 = bounds.wMin - stepW;

    for (let iu = 0; iu < nu; iu++) {
      for (let iv = 0; iv < nv; iv++) {
        for (let iw = 0; iw < nw; iw++) {
          if (pattern === 'ac') {
            if ((iu + iv + iw) % 2 !== 0) continue;
          }
          centers.push([u0 + iu * stepU, v0 + iv * stepV, w0 + iw * stepW]);
        }
      }
    }
    return centers;
  }

  function generateHcpValleyCentersUvw({ spacing, bounds }) {
    const ipA = spacing;
    const c = Math.sqrt(8 / 3) * ipA;
    const a1 = [ipA, 0, 0];
    const a2 = [-0.5 * ipA, (Math.sqrt(3) / 2) * ipA, 0];
    const a3 = [0, 0, c];

    const uSpan = bounds.uMax - bounds.uMin;
    const vSpan = bounds.vMax - bounds.vMin;
    const wSpan = bounds.wMax - bounds.wMin;
    const nx = Math.ceil(uSpan / ipA) + 3;
    const ny = Math.ceil(vSpan / ((Math.sqrt(3) / 2) * ipA)) + 3;
    const nz = Math.ceil(wSpan / c) + 3;

    const origin = [bounds.uMin - ipA, bounds.vMin - ipA, bounds.wMin - c];

    const warm = [];
    const cold = [];

    // Warm (intra-planar): centroids of the two triangle orientations within each layer (A and B).
    const warmOff1 = mul3(add3(mul3(a1, 2), a2), 1 / 3); // (2/3)a1 + (1/3)a2
    const warmOff2 = mul3(add3(a1, mul3(a2, 2)), 1 / 3); // (1/3)a1 + (2/3)a2
    const bOff = warmOff2; // Layer B sits over (1/3,2/3) triangle holes

    // Cold (inter-planar): octahedral voids at fractional positions (2/3,1/3,0.25) and (2/3,1/3,0.75)
    // matching the MAAS-SFRThelper reference implementation.
    const octaPlanar = warmOff1; // (2/3)a1 + (1/3)a2
    const octaZ1 = mul3(a3, 0.25);
    const octaZ2 = mul3(a3, 0.75);

    for (let i = 0; i < nx; i++) {
      for (let j = 0; j < ny; j++) {
        for (let k = 0; k < nz; k++) {
          const cellShift = add3(add3(add3(origin, mul3(a1, i)), mul3(a2, j)), mul3(a3, k));

          // Layer A warm valleys
          warm.push(add3(cellShift, warmOff1));
          warm.push(add3(cellShift, warmOff2));

          // Layer B warm valleys (same offsets on the B lattice plane)
          const bShift = add3(add3(cellShift, bOff), mul3(a3, 0.5));
          warm.push(add3(bShift, warmOff1));
          warm.push(add3(bShift, warmOff2));

          // Cold valleys between layers
          cold.push(add3(add3(cellShift, octaPlanar), octaZ1));
          cold.push(add3(add3(cellShift, octaPlanar), octaZ2));
        }
      }
    }

    return { warm, cold };
  }

  function collectMidpointsNearDistanceUvw(points, targetD, tol, maxPairs = 300000) {
    const pts = Array.isArray(points) ? points : [];
    if (pts.length < 2) return [];
    const d0 = Math.max(1e-6, Number(targetD) || 0);
    const t = Math.max(0, Number(tol) || 0);
    if (!(d0 > 0)) return [];
    const cell = d0; // coarse grid; neighbor search expands as needed
    const keyOf = (p) => {
      const ix = Math.floor(p[0] / cell);
      const iy = Math.floor(p[1] / cell);
      const iz = Math.floor(p[2] / cell);
      return `${ix},${iy},${iz}`;
    };
    const grid = new Map();
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      if (!p) continue;
      const k = keyOf(p);
      if (!grid.has(k)) grid.set(k, []);
      grid.get(k).push(i);
    }

    const out = [];
    const reach = Math.max(1, Math.ceil((d0 + t) / cell));
    let pairs = 0;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i];
      if (!a) continue;
      const ix = Math.floor(a[0] / cell);
      const iy = Math.floor(a[1] / cell);
      const iz = Math.floor(a[2] / cell);
      for (let dx = -reach; dx <= reach; dx++) {
        for (let dy = -reach; dy <= reach; dy++) {
          for (let dz = -reach; dz <= reach; dz++) {
            const arr = grid.get(`${ix + dx},${iy + dy},${iz + dz}`);
            if (!arr) continue;
            for (const j of arr) {
              if (j <= i) continue;
              const b = pts[j];
              if (!b) continue;
              const d = Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
              if (Math.abs(d - d0) > t) continue;
              out.push([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2]);
              pairs++;
              if (pairs >= maxPairs) return out;
            }
          }
        }
      }
    }
    return out;
  }

  function generateAcValleyCentersUvw({ peakCentersUvw, spacing }) {
    const peaks = Array.isArray(peakCentersUvw) ? peakCentersUvw : [];
    const s = Math.max(0, Number(spacing) || 0);
    if (!peaks.length || !s) return { warm: [], cold: [] };

    // AC lattice is FCC; after internal scaling, the nearest peak-to-peak distance is `spacing`,
    // and the next-nearest (longer) distance is `sqrt(2) * spacing`.
    const dShort = s;
    const dLong = Math.SQRT2 * s;
    const tolShort = Math.max(0.75, 0.08 * s);
    const tolLong = Math.max(1.0, 0.10 * s);

    const warm = collectMidpointsNearDistanceUvw(peaks, dShort, tolShort);
    const cold = collectMidpointsNearDistanceUvw(peaks, dLong, tolLong);
    return { warm, cold };
  }

  function generateCvt3dCentersUvw({ targetStruct, bounds, spacing, maxIters = 15, samplesPerIter = 3500 }) {
    // Seed count from HCP inside target (center test), then Lloyd relax in UVW space.
    const init = generateLatticeCenters({ pattern: 'hcp', spacing, bounds });
    let gens = init.filter((uvw) => isUvwInsideStructure(targetStruct, uvw));
    if (!gens.length) return [];

    const rnd = (a, b) => a + Math.random() * (b - a);
    const sampleInside = () => {
      for (let tries = 0; tries < 20000; tries++) {
        const u = rnd(bounds.uMin, bounds.uMax);
        const v = rnd(bounds.vMin, bounds.vMax);
        const w = rnd(bounds.wMin, bounds.wMax);
        const p = [u, v, w];
        if (isUvwInsideStructure(targetStruct, p)) return p;
      }
      return null;
    };

    const k = gens.length;
    const m = Math.max(1500, Math.floor(samplesPerIter));

    for (let iter = 0; iter < maxIters; iter++) {
      const sumU = new Float64Array(k);
      const sumV = new Float64Array(k);
      const sumW = new Float64Array(k);
      const cnt = new Uint32Array(k);

      for (let s = 0; s < m; s++) {
        const p = sampleInside();
        if (!p) continue;
        let best = 0;
        let bestD = Infinity;
        for (let i = 0; i < k; i++) {
          const g = gens[i];
          const du = p[0] - g[0];
          const dv = p[1] - g[1];
          const dw = p[2] - g[2];
          const d2 = du * du + dv * dv + dw * dw;
          if (d2 < bestD) { bestD = d2; best = i; }
        }
        sumU[best] += p[0];
        sumV[best] += p[1];
        sumW[best] += p[2];
        cnt[best] += 1;
      }

      let avgMove = 0;
      for (let i = 0; i < k; i++) {
        if (!cnt[i]) continue;
        const nu = sumU[i] / cnt[i];
        const nv = sumV[i] / cnt[i];
        const nw = sumW[i] / cnt[i];
        const old = gens[i];
        const moved = [nu, nv, nw];
        // Keep inside (try jitter if centroid landed outside due to sampling noise).
        if (!isUvwInsideStructure(targetStruct, moved)) {
          let ok = false;
          for (let j = 0; j < 40; j++) {
            const jitter = spacing * 0.15;
            const cand = [nu + rnd(-jitter, jitter), nv + rnd(-jitter, jitter), nw + rnd(-jitter, jitter)];
            if (isUvwInsideStructure(targetStruct, cand)) { moved[0] = cand[0]; moved[1] = cand[1]; moved[2] = cand[2]; ok = true; break; }
          }
          if (!ok) continue;
        }
        avgMove += distance(old, moved);
        gens[i] = moved;
      }
      avgMove /= Math.max(1, k);
      if (avgMove < 0.25) break;
    }

    // Enforce minimum spacing by dropping points that are too close (greedy).
    const kept = [];
    const minD = Math.max(spacing, 0.1);
    for (const g of gens) {
      let ok = true;
      for (let i = 0; i < kept.length; i++) {
        if (distance(g, kept[i]) < minD) { ok = false; break; }
      }
      if (ok) kept.push(g);
    }
    return kept;
  }

  function uvwToPatient(uvw) {
    return add3(add3(mul3(state.volume.rowCos, uvw[0]), mul3(state.volume.colCos, uvw[1])), mul3(state.volume.normal, uvw[2]));
  }

  function patientToUvw(p) {
    return [dot3(p, state.volume.rowCos), dot3(p, state.volume.colCos), dot3(p, state.volume.normal)];
  }

  function meanPoint(points) {
    if (!points.length) return null;
    let sx = 0, sy = 0, sz = 0;
    for (const p of points) {
      sx += p[0];
      sy += p[1];
      sz += p[2];
    }
    return [sx / points.length, sy / points.length, sz / points.length];
  }

  function distance(a, b) {
    return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  }

  function splitSpheresByKind(spheres) {
    const peak = [];
    const warm = [];
    const cold = [];
    for (const s of spheres || []) {
      const kind = s?.kind === 'cold' ? 'cold' : (s?.kind === 'warm' ? 'warm' : 'peak');
      if (kind === 'cold') cold.push(s);
      else if (kind === 'warm') warm.push(s);
      else peak.push(s);
    }
    return { peak, warm, cold };
  }

  function computeMinCtcPair(spheres) {
    const list = Array.isArray(spheres) ? spheres : [];
    if (list.length < 2) return null;
    // Avoid O(n^2) if extreme; fall back to first 2000.
    const maxN = 2000;
    const n = Math.min(list.length, maxN);
    let best = Infinity;
    let idA = null;
    let idB = null;
    for (let i = 0; i < n; i++) {
      const a = list[i];
      const ca = a?.center;
      if (!Array.isArray(ca) || ca.length < 3) continue;
      for (let j = i + 1; j < n; j++) {
        const b = list[j];
        const cb = b?.center;
        if (!Array.isArray(cb) || cb.length < 3) continue;
        const d = Math.hypot(ca[0] - cb[0], ca[1] - cb[1], ca[2] - cb[2]);
        if (d < best) {
          best = d;
          idA = a.id ?? null;
          idB = b.id ?? null;
        }
      }
    }
    return Number.isFinite(best) ? { idA, idB, dMm: best } : null;
  }

  function computeMinCtcPairPeaks(spheres) {
    const { peak } = splitSpheresByKind(spheres);
    return computeMinCtcPair(peak);
  }

  function gridParamsKeyFromUi() {
    if (!state.targetStruct) return null;
    const pattern = String(els.patternSelect?.value || 'hcp');
    const spacing = Math.max(0, Number(els.spacingInput?.value) || 0);
    const xShift = Number(els.xShiftInput?.value) || 0;
    const yShift = Number(els.yShiftInput?.value) || 0;
    const name = String(state.targetStruct.name || '');
    return `${name}|${pattern}|${spacing.toFixed(3)}|${xShift.toFixed(3)}|${yShift.toFixed(3)}`;
  }

  function computeAlignedGridCentersUvwFromUi() {
    if (!state.volume || !state.targetStruct) return null;
    const pattern = String(els.patternSelect?.value || 'hcp');
    const spacing = Math.max(0, Number(els.spacingInput?.value) || 0);
    const xShift = Number(els.xShiftInput?.value) || 0;
    const yShift = Number(els.yShiftInput?.value) || 0;
    if (spacing <= 0) return null;

    const centroid = computeLayeredCakeCentroid(state.targetStruct);
    const bounds = computeLayeredCakeBounds(state.targetStruct);
    if (!centroid || !bounds) return null;

    let baseCentersUvw;
    if (pattern === 'cvt3d') {
      // Keep this cheaper than full generation; still respects minimum spacing.
      baseCentersUvw = generateCvt3dCentersUvw({ targetStruct: state.targetStruct, bounds, spacing, maxIters: 10, samplesPerIter: 2500 });
    } else {
      baseCentersUvw = generateLatticeCenters({ pattern, spacing, bounds });
    }
    const insideCentersUvw = baseCentersUvw.filter((uvw) => isUvwInsideStructure(state.targetStruct, uvw));
    if (!insideCentersUvw.length) return null;

    const latticeCentroidUvw = meanPoint(insideCentersUvw);
    const offsetUvw = sub3([centroid.u, centroid.v, centroid.w], latticeCentroidUvw);
    const shiftUvw = [xShift, yShift, 0];
    return baseCentersUvw.map((uvw) => add3(add3(uvw, offsetUvw), shiftUvw));
  }

  function ensureGridCentersUvw() {
    if (!els.showGridCheck?.checked) return;
    const key = gridParamsKeyFromUi();
    if (!key) return;
    if (state.generated.gridCentersUvw && state.generated.gridParamsKey === key) return;
    const centers = computeAlignedGridCentersUvwFromUi();
    if (!centers) return;
    state.generated.gridCentersUvw = centers;
    state.generated.gridParamsKey = key;
  }

  function invalidateGridCentersUvw() {
    state.generated.gridCentersUvw = null;
    state.generated.gridParamsKey = null;
  }

  async function generateSpheres() {
    if (!state.volume || !state.targetStruct) return;
    log(els.genLog, '');
    setStatus('Generating…', true);
    hideSphereMenu();

    const pattern = els.patternSelect.value;
    const sphereSet = String(els.sphereSetSelect?.value || 'peaks');
    const radius = Math.max(0, Number(els.radiusInput.value) || 0);
    const spacing = Math.max(0, Number(els.spacingInput.value) || 0);
    const xShift = Number(els.xShiftInput.value) || 0;
    const yShift = Number(els.yShiftInput.value) || 0;
    const fullOnly = !!els.fullOnlyCheck.checked;
    const margin = Math.max(0, Number(els.marginInput?.value) || 0);
    const circleSegments = clamp(Math.round(Number(els.circleSegInput.value) || 64), 12, 720);
    const autoRoiName = buildAutoSphereRoiName(pattern, sphereSet, radius, spacing);
    const currentName = String(els.sphereRoiName.value || '').trim();
    let roiName = autoRoiName;
    if (currentName && currentName !== 'LatticeSpheres' && !currentName.includes(autoRoiName)) {
      roiName = `${currentName}_${autoRoiName}`;
    }
    els.sphereRoiName.value = roiName;

    if (radius <= 0 || spacing <= 0) {
      setStatus('Invalid params', false);
      appendLog(els.genLog, 'Radius and Spacing must be > 0.');
      return;
    }
    if (spacing < 1.1 * (radius * 2)) {
      appendLog(els.genLog, `WARNING: center-to-center spacing (${spacing}mm) < 1.1×diameter (${(2 * radius).toFixed(1)}mm). Spheres may overlap.`);
    }
    if (pattern === 'ac') {
      appendLog(els.genLog, 'NOTE: Alternating Cubic uses a diagonal-neighbor lattice; internal grid steps are scaled so the nearest CTC matches Spacing.');
    }

    const centroid = computeLayeredCakeCentroid(state.targetStruct);
    const bounds = computeLayeredCakeBounds(state.targetStruct);
    if (!centroid || !bounds) {
      setStatus('ROI invalid', false);
      appendLog(els.genLog, 'Could not compute target ROI centroid/bounds.');
      return;
    }

    if (sphereSet !== 'peaks' && pattern !== 'hcp' && pattern !== 'ac') {
      appendLog(els.genLog, 'Valley spheres are currently supported for HCP and AC only; generating peaks only.');
      els.sphereSetSelect && (els.sphereSetSelect.value = 'peaks');
    }

    // Generate lattice in (u,v,w) basis, then align to ROI centroid.
    let baseCentersUvw;
    if (pattern === 'cvt3d') {
      // CVT3D uses UVW space directly; lateral scaling is ignored.
      baseCentersUvw = generateCvt3dCentersUvw({ targetStruct: state.targetStruct, bounds, spacing, maxIters: 18, samplesPerIter: 4000 });
    } else {
      baseCentersUvw = generateLatticeCenters({ pattern, spacing, bounds });
    }

    const insideCentersUvw = baseCentersUvw.filter((uvw) => isUvwInsideStructure(state.targetStruct, uvw));
    if (!insideCentersUvw.length) {
      setStatus('No seeds', false);
      appendLog(els.genLog, 'No lattice points landed inside the target ROI (center test).');
      return;
    }

    const latticeCentroidUvw = meanPoint(insideCentersUvw);
    const offsetUvw = sub3([centroid.u, centroid.v, centroid.w], latticeCentroidUvw);
    const shiftUvw = [xShift, yShift, 0];

    const alignedCentersUvw = baseCentersUvw.map((uvw) => add3(add3(uvw, offsetUvw), shiftUvw));
    state.generated.gridCentersUvw = alignedCentersUvw;
    state.generated.gridParamsKey = gridParamsKeyFromUi();
    const alignedInsideUvw = alignedCentersUvw.filter((uvw) => isUvwInsideStructure(state.targetStruct, uvw));

    const radiusTest = fullOnly ? (radius + margin) : (margin > 0 ? margin : 0);
    let peakUvw = alignedInsideUvw;
    if (radiusTest > 0) {
      peakUvw = peakUvw.filter((uvw) => sphereFullyInsideUvw(state.targetStruct, uvw, radiusTest));
    }

    peakUvw = dedupPointsGrid(peakUvw, Math.max(0.25, radius * 0.1));

    state.generated.nextId = 1;
    const nextId = () => (state.generated.nextId++);
    const out = peakUvw.map((uvw) => ({ id: nextId(), center: uvwToPatient(uvw), r: radius, kind: 'peak' }));

    const wantCold = sphereSet === 'peaks_cold' || sphereSet === 'peaks_warm_cold';
    const wantWarm = sphereSet === 'peaks_warm_cold';
    if (wantCold || wantWarm) {
      if (pattern === 'hcp') {
        const valleys = generateHcpValleyCentersUvw({ spacing, bounds });
        let warmUvw = valleys.warm.map((uvw) => add3(add3(uvw, offsetUvw), shiftUvw));
        let coldUvw = valleys.cold.map((uvw) => add3(add3(uvw, offsetUvw), shiftUvw));

        warmUvw = warmUvw.filter((uvw) => isUvwInsideStructure(state.targetStruct, uvw));
        coldUvw = coldUvw.filter((uvw) => isUvwInsideStructure(state.targetStruct, uvw));

        if (radiusTest > 0) {
          warmUvw = warmUvw.filter((uvw) => sphereFullyInsideUvw(state.targetStruct, uvw, radiusTest));
          coldUvw = coldUvw.filter((uvw) => sphereFullyInsideUvw(state.targetStruct, uvw, radiusTest));
        }

        const minD = Math.max(0.25, radius * 0.1);
        warmUvw = dedupPointsGrid(warmUvw, minD);
        coldUvw = dedupPointsGrid(coldUvw, minD);

        if (wantWarm) out.push(...warmUvw.map((uvw) => ({ id: nextId(), center: uvwToPatient(uvw), r: radius, kind: 'warm' })));
        if (wantCold) out.push(...coldUvw.map((uvw) => ({ id: nextId(), center: uvwToPatient(uvw), r: radius, kind: 'cold' })));
      } else if (pattern === 'ac') {
        const valleys = generateAcValleyCentersUvw({ peakCentersUvw: peakUvw, spacing });
        let warmUvw = valleys.warm;
        let coldUvw = valleys.cold;

        warmUvw = warmUvw.filter((uvw) => isUvwInsideStructure(state.targetStruct, uvw));
        coldUvw = coldUvw.filter((uvw) => isUvwInsideStructure(state.targetStruct, uvw));

        if (radiusTest > 0) {
          warmUvw = warmUvw.filter((uvw) => sphereFullyInsideUvw(state.targetStruct, uvw, radiusTest));
          coldUvw = coldUvw.filter((uvw) => sphereFullyInsideUvw(state.targetStruct, uvw, radiusTest));
        }

        const minD = Math.max(0.25, radius * 0.1);
        warmUvw = dedupPointsGrid(warmUvw, minD);
        coldUvw = dedupPointsGrid(coldUvw, minD);

        if (wantWarm) out.push(...warmUvw.map((uvw) => ({ id: nextId(), center: uvwToPatient(uvw), r: radius, kind: 'warm' })));
        if (wantCold) out.push(...coldUvw.map((uvw) => ({ id: nextId(), center: uvwToPatient(uvw), r: radius, kind: 'cold' })));
      } else {
        appendLog(els.genLog, 'Valley spheres require HCP or AC; skipping valleys.');
      }
    }

    state.generated.mode = sphereSet;
    state.generated.spheres = out;
    state.generated.minCtcPairPeaks = computeMinCtcPairPeaks(out);
    state.generated.minCtcPairAll = computeMinCtcPair(out);
    state.generated.roiName = roiName;
    state.generated.autoRoiName = autoRoiName;
    state.generated.circleSegments = circleSegments;
    state.generated.lastParams = { pattern, sphereSet, radius, spacing, xShift, yShift, fullOnly, margin, roiName, circleSegments };

    appendLog(els.genLog, `Target centroid offset applied: du=${offsetUvw[0].toFixed(2)} dv=${offsetUvw[1].toFixed(2)} dw=${offsetUvw[2].toFixed(2)} (UVW mm)`);
    if (margin > 0) appendLog(els.genLog, `Target boundary margin: ${margin.toFixed(1)} mm (effective test radius=${radiusTest.toFixed(1)} mm)`);
    const counts = splitSpheresByKind(state.generated.spheres);
    appendLog(els.genLog, `Generated spheres: peak=${counts.peak.length} warm=${counts.warm.length} cold=${counts.cold.length} total=${state.generated.spheres.length}`);
    if (state.generated.minCtcPairPeaks?.dMm != null) appendLog(els.genLog, `Measured min CTC (peak-to-peak): ${state.generated.minCtcPairPeaks.dMm.toFixed(2)} mm`);
    if (
      state.generated.minCtcPairAll?.dMm != null &&
      (state.generated.minCtcPairPeaks?.dMm == null || state.generated.minCtcPairAll.dMm < state.generated.minCtcPairPeaks.dMm - 0.25)
    ) {
      appendLog(els.genLog, `Measured min CTC (any sphere): ${state.generated.minCtcPairAll.dMm.toFixed(2)} mm`);
    }

    enableExportControls(state.generated.spheres.length > 0);
    state.three.sphereMesh = null;
    renderAll();
    setStatus('Generated', true);
  }

  function clearGenerated() {
    state.generated.spheres = [];
    state.generated.mode = 'peaks';
    state.generated.nextId = 1;
    state.generated.gridCentersUvw = null;
    state.generated.gridParamsKey = null;
    state.generated.minCtcPairPeaks = null;
    state.generated.minCtcPairAll = null;
    state.support.rings = null;
    enableExportControls(false);
    log(els.genLog, '');
    state.three.sphereMesh = null;
    hideSphereMenu();
    renderAll();
  }

  function makeCircleContourPoints(center, radiusMm, planeW, segCount) {
    const wc = dot3(center, state.volume.normal);
    const dz = planeW - wc;
    const abs = Math.abs(dz);
    if (abs > radiusMm) return null;
    const rz = Math.sqrt(Math.max(0, radiusMm * radiusMm - dz * dz));
    const centerProj = add3(center, mul3(state.volume.normal, dz));
    const pts = [];
    const n = Math.max(12, segCount | 0);
    const inc = (Math.PI * 2) / n;
    for (let i = 0; i < n; i++) {
      const t = i * inc;
      const a = Math.cos(t) * rz;
      const b = Math.sin(t) * rz;
      const p = add3(add3(centerProj, mul3(state.volume.rowCos, a)), mul3(state.volume.colCos, b));
      pts.push(p);
    }
    // Close loop (repeat first)
    pts.push(pts[0]);
    return pts;
  }

  function dt1dSquared(f, n, w2, v, z, out) {
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
        // Intersection of parabolas at p and q in index coordinates.
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

  function dilate2dMaskThree(baseMask, rows, cols, colSpacingMm, rowSpacingMm, r1, r2, r3) {
    const n = (rows | 0) * (cols | 0);
    const base = baseMask instanceof Uint8Array ? baseMask : null;
    if (!base || n <= 0) return { d1: null, d2: null, d3: null };

    const rr1 = Math.max(0, Number(r1) || 0);
    const rr2 = Math.max(0, Number(r2) || 0);
    const rr3 = Math.max(0, Number(r3) || 0);
    const t1 = rr1 * rr1;
    const t2 = rr2 * rr2;
    const t3 = rr3 * rr3;
    if (t3 <= 0) return { d1: base.slice(), d2: base.slice(), d3: base.slice() };

    const INF = 1e20;
    const tmp = new Float64Array(n);

    const maxDim = Math.max(rows | 0, cols | 0);
    const f = new Float64Array(maxDim);
    const out = new Float64Array(maxDim);
    const v = new Int32Array(maxDim);
    const z = new Float64Array(maxDim + 1);

    const w2x = Math.max(1e-12, (Number(colSpacingMm) || 1) ** 2);
    const w2y = Math.max(1e-12, (Number(rowSpacingMm) || 1) ** 2);

    // Row pass
    for (let y = 0; y < rows; y++) {
      const rowOff = y * cols;
      for (let x = 0; x < cols; x++) f[x] = base[rowOff + x] ? 0 : INF;
      dt1dSquared(f, cols, w2x, v, z, out);
      for (let x = 0; x < cols; x++) tmp[rowOff + x] = out[x];
    }

    // Column pass + threshold
    const d1 = new Uint8Array(n);
    const d2 = new Uint8Array(n);
    const d3 = new Uint8Array(n);
    for (let x = 0; x < cols; x++) {
      for (let y = 0; y < rows; y++) f[y] = tmp[y * cols + x];
      dt1dSquared(f, rows, w2y, v, z, out);
      for (let y = 0; y < rows; y++) {
        const d2mm = out[y];
        const idx = y * cols + x;
        if (d2mm <= t1) d1[idx] = 1;
        if (d2mm <= t2) d2[idx] = 1;
        if (d2mm <= t3) d3[idx] = 1;
      }
    }
    return { d1, d2, d3 };
  }

  function maskToEdgeLoops(mask, rows, cols) {
    const m = mask instanceof Uint8Array ? mask : null;
    if (!m) return [];
    const edges = new Map(); // startKey -> endKey[]
    const used = new Set(); // "x0,y0|x1,y1"
    const pushEdge = (x0, y0, x1, y1) => {
      const k0 = `${x0},${y0}`;
      const k1 = `${x1},${y1}`;
      if (!edges.has(k0)) edges.set(k0, []);
      edges.get(k0).push(k1);
      used.add(`${k0}|${k1}`);
    };

    const at = (r, c) => (r >= 0 && r < rows && c >= 0 && c < cols) ? m[r * cols + c] : 0;
    for (let r = 0; r < rows; r++) {
      const off = r * cols;
      for (let c = 0; c < cols; c++) {
        if (!m[off + c]) continue;
        if (!at(r - 1, c)) pushEdge(c, r, c + 1, r); // top
        if (!at(r, c + 1)) pushEdge(c + 1, r, c + 1, r + 1); // right
        if (!at(r + 1, c)) pushEdge(c + 1, r + 1, c, r + 1); // bottom
        if (!at(r, c - 1)) pushEdge(c, r + 1, c, r); // left
      }
    }

    const edgeUnused = new Set(used);
    const loops = [];
    const parseKey = (k) => k.split(',').map((x) => parseInt(x, 10));

    for (const edgeKey of used) {
      if (!edgeUnused.has(edgeKey)) continue;
      const [k0, k1] = edgeKey.split('|');
      const start = k0;
      let curr = k0;
      let next = k1;
      edgeUnused.delete(edgeKey);
      const loop = [parseKey(curr)];

      let guard = 0;
      while (next !== start && guard++ < 200000) {
        loop.push(parseKey(next));
        const outs = edges.get(next);
        if (!outs || !outs.length) break;
        let found = null;
        for (const cand of outs) {
          const ek = `${next}|${cand}`;
          if (edgeUnused.has(ek)) { found = cand; edgeUnused.delete(ek); break; }
        }
        if (!found) break;
        curr = next;
        next = found;
      }
      if (loop.length >= 4 && next === start) loops.push(loop);
    }
    return loops;
  }

  function simplifyGridLoop(loop) {
    if (!Array.isArray(loop) || loop.length < 4) return loop;
    const pts = loop;
    const out = [];
    const n = pts.length;
    for (let i = 0; i < n; i++) {
      const prev = pts[(i - 1 + n) % n];
      const curr = pts[i];
      const next = pts[(i + 1) % n];
      const dx1 = Math.sign(curr[0] - prev[0]);
      const dy1 = Math.sign(curr[1] - prev[1]);
      const dx2 = Math.sign(next[0] - curr[0]);
      const dy2 = Math.sign(next[1] - curr[1]);
      if (dx1 === dx2 && dy1 === dy2) continue;
      out.push(curr);
    }
    if (out.length > 4000) {
      const step = Math.ceil(out.length / 4000);
      const slim = [];
      for (let i = 0; i < out.length; i += step) slim.push(out[i]);
      return slim.length >= 4 ? slim : out;
    }
    return out.length >= 4 ? out : loop;
  }

  function supportRingsKeyFromUi() {
    const enabled = !!els.supportEnableCheck?.checked;
    if (!enabled) return null;
    const inner = Math.max(0, Number(els.supportInnerMm?.value) || 0);
    const mid = Math.max(0, Number(els.supportMidMm?.value) || 0);
    const outer = Math.max(0, Number(els.supportOuterMm?.value) || 0);
    const peaks = (state.generated.spheres || []).filter((s) => (s?.kind || 'peak') === 'peak');
    if (!peaks.length) return `${inner}|${mid}|${outer}|nopeaks`;
    const parts = [];
    for (const s of peaks) {
      const c = s.center || [0, 0, 0];
      parts.push(`${s.id}:${Number(s.r).toFixed(3)}:${Number(c[0]).toFixed(2)},${Number(c[1]).toFixed(2)},${Number(c[2]).toFixed(2)}`);
    }
    return `${inner}|${mid}|${outer}|${parts.join(';')}`;
  }

  function computeSphereUnionBaseMaskBox(peaks, distMaxMm) {
    if (!state.volume) return null;
    const rows = state.volume.height | 0;
    const cols = state.volume.width | 0;
    const depth = state.volume.depth | 0;
    if (!rows || !cols || !depth) return null;
    if (!Array.isArray(peaks) || !peaks.length) return null;

    const originUvw = patientToUvw(state.volume.origin);
    const cs = state.volume.colSpacing;
    const rs = state.volume.rowSpacing;
    const zs = state.volume.sliceSpacing;
    const padMm = Math.max(0, Number(distMaxMm) || 0);

    let cMin = Infinity, cMax = -Infinity;
    let rMin = Infinity, rMax = -Infinity;
    let kMin = Infinity, kMax = -Infinity;

    const centers = [];
    for (const s of peaks) {
      const uvw = patientToUvw(s.center);
      const uRel = uvw[0] - originUvw[0];
      const vRel = uvw[1] - originUvw[1];
      const wRel = uvw[2] - originUvw[2];
      const c0 = uRel / cs;
      const r0 = vRel / rs;
      const k0 = wRel / zs;
      const rMm = Math.max(0, Number(s.r) || 0);
      centers.push({ c: c0, r: r0, k: k0, rMm });

      const radC = (rMm + padMm) / cs;
      const radR = (rMm + padMm) / rs;
      const radK = (rMm + padMm) / zs;
      cMin = Math.min(cMin, c0 - radC);
      cMax = Math.max(cMax, c0 + radC);
      rMin = Math.min(rMin, r0 - radR);
      rMax = Math.max(rMax, r0 + radR);
      kMin = Math.min(kMin, k0 - radK);
      kMax = Math.max(kMax, k0 + radK);
    }

    const c0 = clamp(Math.floor(cMin) - 2, 0, cols - 1);
    const c1 = clamp(Math.ceil(cMax) + 2, 0, cols - 1);
    const r0 = clamp(Math.floor(rMin) - 2, 0, rows - 1);
    const r1 = clamp(Math.ceil(rMax) + 2, 0, rows - 1);
    const k0 = clamp(Math.floor(kMin) - 1, 0, depth - 1);
    const k1 = clamp(Math.ceil(kMax) + 1, 0, depth - 1);

    const bx = (c1 - c0 + 1) | 0;
    const by = (r1 - r0 + 1) | 0;
    const bz = (k1 - k0 + 1) | 0;
    if (bx <= 0 || by <= 0 || bz <= 0) return null;

    const n = bx * by * bz;
    const base = new Uint8Array(n);
    const idx3 = (x, y, z) => x + bx * (y + by * z);

    for (const s of centers) {
      const rMm = s.rMm;
      if (rMm <= 0) continue;
      const radC = rMm / cs;
      const radR = rMm / rs;
      const radK = rMm / zs;

      const x0 = clamp(Math.floor(s.c - radC) - c0 - 1, 0, bx - 1);
      const x1 = clamp(Math.ceil(s.c + radC) - c0 + 1, 0, bx - 1);
      const y0 = clamp(Math.floor(s.r - radR) - r0 - 1, 0, by - 1);
      const y1 = clamp(Math.ceil(s.r + radR) - r0 + 1, 0, by - 1);
      const z0 = clamp(Math.floor(s.k - radK) - k0 - 1, 0, bz - 1);
      const z1 = clamp(Math.ceil(s.k + radK) - k0 + 1, 0, bz - 1);

      const r2 = rMm * rMm;
      for (let z = z0; z <= z1; z++) {
        const dk = (k0 + z) - s.k;
        const dz = dk * zs;
        const dz2 = dz * dz;
        if (dz2 > r2) continue;
        for (let y = y0; y <= y1; y++) {
          const dr = (r0 + y) - s.r;
          const dy = dr * rs;
          const dy2 = dy * dy;
          if (dy2 + dz2 > r2) continue;
          for (let x = x0; x <= x1; x++) {
            const dc = (c0 + x) - s.c;
            const dx = dc * cs;
            const d2 = dx * dx + dy2 + dz2;
            if (d2 <= r2) base[idx3(x, y, z)] = 1;
          }
        }
      }
    }

    return { base, box: { r0, c0, k0, bx, by, bz } };
  }

  function edt3dSquaredFromMask(baseMask, box) {
    const base = baseMask instanceof Uint8Array ? baseMask : null;
    const bx = box?.bx | 0;
    const by = box?.by | 0;
    const bz = box?.bz | 0;
    if (!base || bx <= 0 || by <= 0 || bz <= 0) return null;
    const n = bx * by * bz;
    if (base.length !== n) return null;

    const cs = state.volume.colSpacing;
    const rs = state.volume.rowSpacing;
    const zs = state.volume.sliceSpacing;
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
    const idx3 = (x, y, zz) => x + bx * (y + by * zz);

    // Pass X (columns)
    for (let zz = 0; zz < bz; zz++) {
      for (let y = 0; y < by; y++) {
        const off = idx3(0, y, zz);
        for (let x = 0; x < bx; x++) f[x] = base[off + x] ? 0 : INF;
        dt1dSquared(f, bx, w2x, v, z, out);
        for (let x = 0; x < bx; x++) tmpX[off + x] = out[x];
      }
    }

    // Pass Y (rows)
    for (let zz = 0; zz < bz; zz++) {
      for (let x = 0; x < bx; x++) {
        for (let y = 0; y < by; y++) f[y] = tmpX[idx3(x, y, zz)];
        dt1dSquared(f, by, w2y, v, z, out);
        for (let y = 0; y < by; y++) tmpY[idx3(x, y, zz)] = out[y];
      }
    }

    // Pass Z (slices)
    for (let y = 0; y < by; y++) {
      for (let x = 0; x < bx; x++) {
        for (let zz = 0; zz < bz; zz++) f[zz] = tmpY[idx3(x, y, zz)];
        dt1dSquared(f, bz, w2z, v, z, out);
        for (let zz = 0; zz < bz; zz++) dt[idx3(x, y, zz)] = out[zz];
      }
    }

    return dt;
  }

  function computeSupportRingMasksFromSpheres(innerMm, midMm, outerMm) {
    const inner = Math.max(0, Number(innerMm) || 0);
    const mid = Math.max(0, Number(midMm) || 0);
    const outer = Math.max(0, Number(outerMm) || 0);
    const dist1 = inner;
    const dist2 = inner + mid;
    const dist3 = inner + mid + outer;
    if (dist3 <= 0) return null;

    const peaks = (state.generated.spheres || []).filter((s) => (s?.kind || 'peak') === 'peak');
    if (!peaks.length) return null;

    const baseInfo = computeSphereUnionBaseMaskBox(peaks, dist3);
    if (!baseInfo) return null;
    const { base, box } = baseInfo;
    const dt = edt3dSquaredFromMask(base, box);
    if (!dt) return null;

    const n = base.length;
    const t1 = dist1 * dist1;
    const t2 = dist2 * dist2;
    const t3 = dist3 * dist3;
    const innerMask = new Uint8Array(n);
    const midMask = new Uint8Array(n);
    const outerMask = new Uint8Array(n);

    let cntInner = 0;
    let cntMid = 0;
    let cntOuter = 0;
    for (let i = 0; i < n; i++) {
      if (base[i]) continue; // shells exclude the sphere union
      const d2 = dt[i];
      if (d2 <= t1) { innerMask[i] = 1; cntInner++; }
      else if (d2 <= t2) { midMask[i] = 1; cntMid++; }
      else if (d2 <= t3) { outerMask[i] = 1; cntOuter++; }
    }

    const voxelMm3 = state.volume.rowSpacing * state.volume.colSpacing * state.volume.sliceSpacing;
    const volumesCc = {
      inner: (cntInner * voxelMm3) / 1000,
      mid: (cntMid * voxelMm3) / 1000,
      outer: (cntOuter * voxelMm3) / 1000,
    };

    return { box, inner: innerMask, mid: midMask, outer: outerMask, volumesCc };
  }

  function ensureSupportRingsComputed() {
    const key = supportRingsKeyFromUi();
    if (!key) { state.support.rings = null; return null; }
    if (state.support.rings && state.support.rings.key === key) return state.support.rings.ready ? state.support.rings : null;
    const inner = Math.max(0, Number(els.supportInnerMm?.value) || 0);
    const mid = Math.max(0, Number(els.supportMidMm?.value) || 0);
    const outer = Math.max(0, Number(els.supportOuterMm?.value) || 0);
    const out = computeSupportRingMasksFromSpheres(inner, mid, outer);
    state.support.rings = out ? { key, ready: true, ...out } : { key, ready: false };
    return out ? state.support.rings : null;
  }

  function drawSupportRingsAxial(ctx, k, layout) {
    if (!ctx || !state.volume) return;
    if (!els.supportEnableCheck?.checked) return;
    const rings = ensureSupportRingsComputed();
    if (!rings) return;
    const { box, inner, mid, outer } = rings;
    const zLocal = (k - box.k0) | 0;
    if (zLocal < 0 || zLocal >= box.bz) return;
    const sliceN = box.bx * box.by;

    const extractSlice = (mask3d) => {
      const slice = new Uint8Array(sliceN);
      const baseOff = sliceN * zLocal;
      for (let i = 0; i < sliceN; i++) slice[i] = mask3d[baseOff + i];
      return slice;
    };

    const drawMaskLoops = (mask2d, strokeStyle) => {
      if (!mask2d) return;
      const loops = maskToEdgeLoops(mask2d, box.by, box.bx);
      if (!loops.length) return;
      ctx.save();
      ctx.strokeStyle = strokeStyle;
      ctx.lineWidth = 1.6 / Math.max(1e-6, Number(layout.scalePxPerMm) || 1);
      for (const raw of loops) {
        const loop = simplifyGridLoop(raw);
        if (!loop || loop.length < 3) continue;
        ctx.beginPath();
        for (let i = 0; i < loop.length; i++) {
          const p = loop[i];
          const vx = p[0] + box.c0;
          const vy = p[1] + box.r0;
          const xMm = (vx - 0.5) * state.volume.colSpacing;
          const yMm = (vy - 0.5) * state.volume.rowSpacing;
          if (i === 0) ctx.moveTo(xMm, yMm);
          else ctx.lineTo(xMm, yMm);
        }
        ctx.closePath();
        ctx.stroke();
      }
      ctx.restore();
    };

    drawMaskLoops(extractSlice(inner), 'rgba(0,255,0,0.75)');
    drawMaskLoops(extractSlice(mid), 'rgba(0,200,255,0.70)');
    drawMaskLoops(extractSlice(outer), 'rgba(255,0,255,0.65)');
  }

  function drawSupportRingsReslice(ctx, plane, idx, layout) {
    if (!ctx || !state.volume) return;
    if (!els.supportEnableCheck?.checked) return;
    const rings = ensureSupportRingsComputed();
    if (!rings) return;
    const { box, inner, mid, outer } = rings;
    const bx = box.bx, by = box.by, bz = box.bz;
    const sliceN = bx * by;
    const idx3 = (x, y, z) => x + bx * (y + by * z);

    const drawEdgesForMask = (mask3d, strokeStyle) => {
      ctx.save();
      ctx.strokeStyle = strokeStyle;
      ctx.lineWidth = 1.2 / Math.max(1e-6, Number(layout.scalePxPerMm) || 1);
      if (plane === 'coronal') {
        const r = clamp(idx, 0, state.volume.height - 1);
        if (r < box.r0 || r >= box.r0 + by) { ctx.restore(); return; }
        const yLocal = r - box.r0;
        for (let z = 0; z < bz; z++) {
          const zMm = (box.k0 + z) * state.volume.sliceSpacing;
          for (let x = 0; x < bx; x++) {
            const v = mask3d[idx3(x, yLocal, z)];
            if (!v) continue;
            const left = x === 0 ? 0 : mask3d[idx3(x - 1, yLocal, z)];
            const right = x === bx - 1 ? 0 : mask3d[idx3(x + 1, yLocal, z)];
            const up = z === 0 ? 0 : mask3d[idx3(x, yLocal, z - 1)];
            const down = z === bz - 1 ? 0 : mask3d[idx3(x, yLocal, z + 1)];
            if (left && right && up && down) continue;
            const xMm = (box.c0 + x) * state.volume.colSpacing;
            ctx.strokeRect(xMm, zMm, state.volume.colSpacing, state.volume.sliceSpacing);
          }
        }
      } else if (plane === 'sagittal') {
        const c = clamp(idx, 0, state.volume.width - 1);
        if (c < box.c0 || c >= box.c0 + bx) { ctx.restore(); return; }
        const xLocal = c - box.c0;
        for (let z = 0; z < bz; z++) {
          const zMm = (box.k0 + z) * state.volume.sliceSpacing;
          for (let y = 0; y < by; y++) {
            const v = mask3d[idx3(xLocal, y, z)];
            if (!v) continue;
            const left = y === 0 ? 0 : mask3d[idx3(xLocal, y - 1, z)];
            const right = y === by - 1 ? 0 : mask3d[idx3(xLocal, y + 1, z)];
            const up = z === 0 ? 0 : mask3d[idx3(xLocal, y, z - 1)];
            const down = z === bz - 1 ? 0 : mask3d[idx3(xLocal, y, z + 1)];
            if (left && right && up && down) continue;
            const xMm = (box.r0 + y) * state.volume.rowSpacing;
            ctx.strokeRect(xMm, zMm, state.volume.rowSpacing, state.volume.sliceSpacing);
          }
        }
      }
      ctx.restore();
    };

    drawEdgesForMask(inner, 'rgba(0,255,0,0.55)');
    drawEdgesForMask(mid, 'rgba(0,200,255,0.50)');
    drawEdgesForMask(outer, 'rgba(255,0,255,0.45)');
  }

  function exportRtstruct() {
    if (!state.volume || state.chosenRsIdx == null || !state.generated.spheres.length) return;
    log(els.exportLog, '');
    setStatus('Exporting…', true);

    const rsIn = state.rsFiles[state.chosenRsIdx];
    const outName = `${(rsIn.file?.name || 'RTSTRUCT').replace(/\\.dcm$/i, '')}__${state.generated.roiName}.dcm`;

    let inData;
    try {
      inData = dcmjs.data.DicomMessage.readFile(rsIn.arrayBuffer);
    } catch (e) {
      setStatus('Export failed', false);
      appendLog(els.exportLog, `dcmjs read failed: ${e?.message || e}`);
      return;
    }
    let dataset;
    try {
      dataset = dcmjs.data.DicomMetaDictionary.naturalizeDataset(inData.dict);
      dataset._meta = dcmjs.data.DicomMetaDictionary.naturalizeDataset(inData.meta);
    } catch (e) {
      setStatus('Export failed', false);
      appendLog(els.exportLog, `dcmjs naturalize failed: ${e?.message || e}`);
      return;
    }

    const outDataset = deepClonePreserveBinary(dataset);

    // UIDs: keep StudyInstanceUID + FrameOfReferenceUID; new Series/SOP UID.
    const newSeriesUID = uidFromRandom();
    const newSopUID = uidFromRandom();

    outDataset.SeriesInstanceUID = newSeriesUID;
    outDataset.SOPInstanceUID = newSopUID;
    outDataset.SeriesDescription = `${outDataset.SeriesDescription || 'RTSTRUCT'} (SFRT spheres)`;
    outDataset.InstanceCreationDate = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    outDataset.InstanceCreationTime = new Date().toISOString().slice(11, 19).replace(/:/g, '');

    if (outDataset._meta) {
      outDataset._meta.MediaStorageSOPInstanceUID = newSopUID;
      outDataset._meta.MediaStorageSOPClassUID = outDataset.SOPClassUID || outDataset._meta.MediaStorageSOPClassUID;
    }

    const sphereRoiName = state.generated.roiName;
    const { peak: peakSpheres, warm: warmSpheres, cold: coldSpheres } = splitSpheresByKind(state.generated.spheres);

    const sroiSeq = Array.isArray(outDataset.StructureSetROISequence) ? outDataset.StructureSetROISequence : [];
    const roiContourSeq = Array.isArray(outDataset.ROIContourSequence) ? outDataset.ROIContourSequence : [];
    const obsSeq = Array.isArray(outDataset.RTROIObservationsSequence) ? outDataset.RTROIObservationsSequence : [];

    const existingNums = sroiSeq.map((x) => Number(x.ROINumber)).filter(Number.isFinite);
    let nextRoiNum = existingNums.length ? Math.max(...existingNums) + 1 : 1;
    const nextObsNum = obsSeq.map((x) => Number(x.ObservationNumber)).filter(Number.isFinite);
    let obsNum = nextObsNum.length ? Math.max(...nextObsNum) + 1 : nextRoiNum;

    // Ensure contour image refs exist for all CT slices we might reference.
    ensureRtstructReferencesAllCtSlices(outDataset, state.volume.slices);

	    const segCount = clamp(state.generated.circleSegments | 0, 12, 720);
	    const ctSopClassUID = getTagString(state.volume.slices[0]?.dataSet, 'x00080016') || '1.2.840.10008.5.1.4.1.1.2';
	    const sliceWs = state.volume.slices.map((s) => dot3(parseImagePosition(s.dataSet), state.volume.normal));

	    const pushContourRoi = (name, colorRgb, interpretedType, contourItems) => {
	      const roiNum = nextRoiNum++;
	      const oNum = obsNum++;

	      sroiSeq.push({
        ROINumber: roiNum,
        ROIName: name,
        ROIGenerationAlgorithm: 'MANUAL',
        ReferencedFrameOfReferenceUID: outDataset.FrameOfReferenceUID || state.volume.forUID || undefined,
      });
	      obsSeq.push({
	        ObservationNumber: oNum,
	        ReferencedROINumber: roiNum,
	        ROIObservationLabel: name,
	        RTROIInterpretedType: interpretedType || 'PTV',
	      });

	      roiContourSeq.push({
	        ReferencedROINumber: roiNum,
	        ROIDisplayColor: colorRgb,
	        ContourSequence: contourItems || [],
	      });
	    };

	    const pushSphereRoi = (name, colorRgb, spheres) => {
	      if (!spheres.length) return;
	      const contourItems = [];
	      for (let k = 0; k < state.volume.depth; k++) {
	        const wSlice = sliceWs[k];
	        const sopUID = getTagString(state.volume.slices[k]?.dataSet, 'x00080018');
	        if (!sopUID) continue;
	        for (const sph of spheres) {
	          const pts = makeCircleContourPoints(sph.center, sph.r, wSlice, segCount);
	          if (!pts) continue;
	          const flat = [];
	          for (const p of pts) flat.push(
	            formatDicomDs(p[0]),
	            formatDicomDs(p[1]),
	            formatDicomDs(p[2])
	          );
	          contourItems.push({
	            ContourImageSequence: [{ ReferencedSOPClassUID: ctSopClassUID, ReferencedSOPInstanceUID: sopUID }],
	            ContourGeometricType: 'CLOSED_PLANAR',
	            NumberOfContourPoints: pts.length,
	            ContourData: flat,
	          });
	        }
	      }
	      pushContourRoi(name, colorRgb, 'PTV', contourItems);
	    };

	    const hasPeak = peakSpheres.length > 0;
	    const hasWarm = warmSpheres.length > 0;
	    const hasCold = coldSpheres.length > 0;

    if (hasWarm || hasCold) {
      // If valleys exist, export as separate ROIs for clarity.
      if (hasPeak) pushSphereRoi(`${sphereRoiName}_Peak`, [255, 0, 0], peakSpheres);
      if (hasWarm) pushSphereRoi(`${sphereRoiName}_ValleyWarm`, [255, 220, 0], warmSpheres);
      if (hasCold) pushSphereRoi(`${sphereRoiName}_ValleyCold`, [0, 90, 255], coldSpheres);
	    } else {
	      pushSphereRoi(sphereRoiName, [255, 0, 0], peakSpheres);
	    }

	    // Supporting shells: true 3D expansions from the union of Peak spheres (distance from sphere surface).
	    const supportEnabled = !!els.supportEnableCheck?.checked;
	    if (supportEnabled) {
	      const inner = Math.max(0, Number(els.supportInnerMm?.value) || 0);
	      const mid = Math.max(0, Number(els.supportMidMm?.value) || 0);
	      const outer = Math.max(0, Number(els.supportOuterMm?.value) || 0);
	      const total = inner + mid + outer;
	      if (total > 0) {
	        const rings = ensureSupportRingsComputed();
	        if (!rings) {
	          appendLog(els.exportLog, 'Supporting shells enabled but could not be generated (need Peak spheres + valid volume).');
	        } else {
	          const { box, inner: mIn, mid: mMid, outer: mOut } = rings;
	          const bx = box.bx, by = box.by, bz = box.bz;
	          const sliceN = bx * by;
	          const idx3 = (x, y, z) => x + bx * (y + by * z);

	          const buildContourItemsForMask = (mask3d) => {
	            const items = [];
	            for (let z = 0; z < bz; z++) {
	              const k = box.k0 + z;
	              if (k < 0 || k >= state.volume.depth) continue;
	              const ds = state.volume.slices[k]?.dataSet;
	              const sopUID = getTagString(ds, 'x00080018');
	              if (!ds || !sopUID) continue;
	              const ipp = parseImagePosition(ds);
	              const slice2d = new Uint8Array(sliceN);
	              let any = false;
	              for (let y = 0; y < by; y++) {
	                for (let x = 0; x < bx; x++) {
	                  const v = mask3d[idx3(x, y, z)] ? 1 : 0;
	                  slice2d[y * bx + x] = v;
	                  if (v) any = true;
	                }
	              }
	              if (!any) continue;
	              const loops = maskToEdgeLoops(slice2d, by, bx);
	              for (const raw of loops) {
	                const loop = simplifyGridLoop(raw);
	                if (!loop || loop.length < 4) continue;
	                const pts = [];
	                for (const [vx, vy] of loop) {
	                  const gvx = vx + box.c0;
	                  const gvy = vy + box.r0;
	                  const xMm = (gvx - 0.5) * state.volume.colSpacing;
	                  const yMm = (gvy - 0.5) * state.volume.rowSpacing;
	                  const p = add3(add3(ipp, mul3(state.volume.rowCos, xMm)), mul3(state.volume.colCos, yMm));
	                  pts.push(p);
	                }
	                pts.push(pts[0]);
	                const flat = [];
	                for (const p of pts) flat.push(formatDicomDs(p[0]), formatDicomDs(p[1]), formatDicomDs(p[2]));
	                items.push({
	                  ContourImageSequence: [{ ReferencedSOPClassUID: ctSopClassUID, ReferencedSOPInstanceUID: sopUID }],
	                  ContourGeometricType: 'CLOSED_PLANAR',
	                  NumberOfContourPoints: pts.length,
	                  ContourData: flat,
	                });
	              }
	            }
	            return items;
	          };

	          const end1 = inner;
	          const end2 = inner + mid;
	          const end3 = inner + mid + outer;
	          const prefix = `${sphereRoiName}_Shell`;
	          const innerItems = buildContourItemsForMask(mIn);
	          const midItems = buildContourItemsForMask(mMid);
	          const outerItems = buildContourItemsForMask(mOut);
	          if (innerItems.length) pushContourRoi(`${prefix}_0_${end1}mm`, [0, 255, 0], 'AVOIDANCE', innerItems);
	          if (midItems.length) pushContourRoi(`${prefix}_${end1}_${end2}mm`, [0, 200, 255], 'AVOIDANCE', midItems);
	          if (outerItems.length) pushContourRoi(`${prefix}_${end2}_${end3}mm`, [255, 0, 255], 'AVOIDANCE', outerItems);
	          appendLog(els.exportLog, `Added supporting shells (from Peak sphere surface): 0-${end1}mm, ${end1}-${end2}mm, ${end2}-${end3}mm`);
	        }
	      } else {
	        appendLog(els.exportLog, 'Supporting shells enabled but all thickness values are 0 mm; skipping.');
	      }
	    }

	    outDataset.StructureSetROISequence = sroiSeq;
	    outDataset.ROIContourSequence = roiContourSeq;
	    outDataset.RTROIObservationsSequence = obsSeq;

    let outBuffer;
    try {
      const denat = dcmjs.data.DicomMetaDictionary.denaturalizeDataset(outDataset);
      const meta = dcmjs.data.DicomMetaDictionary.denaturalizeDataset(outDataset._meta || {});
      normalizeDenatBinaryInPlace(denat);
      normalizeDenatBinaryInPlace(meta);
      const dicomDict = new dcmjs.data.DicomDict(meta);
      dicomDict.dict = denat;
      outBuffer = dicomDict.write();
    } catch (e) {
      setStatus('Export failed', false);
      appendLog(els.exportLog, `dcmjs write failed: ${e?.message || e}`);
      return;
    }

    downloadArrayBuffer(outBuffer, outName, 'application/dicom');
    appendLog(els.exportLog, `Wrote ${outName}`);
    appendLog(els.exportLog, `New SeriesInstanceUID: ${newSeriesUID}`);
    appendLog(els.exportLog, `New SOPInstanceUID: ${newSopUID}`);
    setStatus('Exported', true);
  }

  function ensureRtstructReferencesAllCtSlices(rsDataset, ctSlices) {
    const rfor = rsDataset.ReferencedFrameOfReferenceSequence?.[0];
    const rtStudy = rfor?.RTReferencedStudySequence?.[0];
    const rtSeries = rtStudy?.RTReferencedSeriesSequence?.[0];
    if (!rtSeries) return;
    const contourImgSeq = Array.isArray(rtSeries.ContourImageSequence) ? rtSeries.ContourImageSequence : [];
    const existing = new Set(contourImgSeq.map((x) => x.ReferencedSOPInstanceUID).filter(Boolean));
    const sopClass = getTagString(ctSlices?.[0]?.dataSet, 'x00080016') || '1.2.840.10008.5.1.4.1.1.2';
    for (const s of ctSlices || []) {
      const sop = getTagString(s.dataSet, 'x00080018');
      if (!sop || existing.has(sop)) continue;
      contourImgSeq.push({ ReferencedSOPClassUID: sopClass, ReferencedSOPInstanceUID: sop });
      existing.add(sop);
    }
    rtSeries.ContourImageSequence = contourImgSeq;
  }

  function downloadArrayBuffer(buffer, filename, mime) {
    const blob = new Blob([buffer], { type: mime || 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  function deepClonePreserveBinary(x) {
    if (x == null || typeof x !== 'object') return x;
    if (x instanceof ArrayBuffer) return x.slice(0);
    if (ArrayBuffer.isView(x)) return new x.constructor(x);
    if (x instanceof Date) return new Date(x.getTime());
    if (Array.isArray(x)) return x.map(deepClonePreserveBinary);
    const out = {};
    for (const k of Object.keys(x)) out[k] = deepClonePreserveBinary(x[k]);
    return out;
  }

  function toArrayBufferExact(v) {
    if (v == null) return null;
    if (v instanceof ArrayBuffer) return v;
    if (ArrayBuffer.isView(v)) {
      return v.buffer.slice(v.byteOffset, v.byteOffset + v.byteLength);
    }
    return null;
  }

  function normalizeDenatBinaryInPlace(denat) {
    if (!denat || typeof denat !== 'object') return;
    for (const tag of Object.keys(denat)) {
      const item = denat[tag];
      if (!item || typeof item !== 'object') continue;
      const vr = item.vr;
      const val = item.Value;
      if (vr === 'SQ' && Array.isArray(val)) {
        for (const nested of val) normalizeDenatBinaryInPlace(nested);
        continue;
      }
      if (vr === 'OB' || vr === 'OW' || vr === 'UN' || vr === 'OF' || vr === 'OD' || vr === 'OL' || vr === 'OV') {
        if (!Array.isArray(val) || !val.length) continue;
        const conv = val.map((entry) => toArrayBufferExact(entry) ?? entry);
        item.Value = conv;
      }
    }
  }

  function formatDicomDs(v, maxLen = 16) {
    const x = Number(v);
    if (!Number.isFinite(x)) return '0';
    const clean = (s) => {
      // Avoid "-0" and trim trailing zeros.
      if (s === '-0') return '0';
      if (s.includes('.')) s = s.replace(/\.?0+$/, '');
      return s;
    };
    // Start with sub-mm precision, then back off until it fits.
    for (let decimals = 6; decimals >= 0; decimals--) {
      const s = clean(x.toFixed(decimals));
      if (s.length <= maxLen) return s;
    }
    const s0 = clean(String(Math.round(x)));
    return s0.length <= maxLen ? s0 : s0.slice(0, maxLen);
  }

  // UI wiring
  els.dropzone.addEventListener('click', () => els.fileInput.click());
  els.fileInput.addEventListener('change', (e) => ingestDicomFiles(e.target.files));

  function setupDropzone() {
    const dz = els.dropzone;
    dz.addEventListener('dragover', (e) => {
      e.preventDefault();
      dz.style.borderColor = 'var(--accent-primary)';
    });
    dz.addEventListener('dragleave', () => {
      dz.style.borderColor = 'var(--input-border)';
    });
    dz.addEventListener('drop', (e) => {
      e.preventDefault();
      dz.style.borderColor = 'var(--input-border)';
      const files = e.dataTransfer?.files;
      if (files?.length) ingestDicomFiles(files);
    });
  }
  setupDropzone();

  function attachWheelNudge(inputEl, stepMm, opts) {
    if (!inputEl) return;
    const step = Number(stepMm) || 1;
    const min = Number.isFinite(opts?.min) ? opts.min : null;
    const max = Number.isFinite(opts?.max) ? opts.max : null;
    inputEl.addEventListener('wheel', (e) => {
      if (inputEl.disabled) return;
      e.preventDefault();
      e.stopPropagation();
      const dir = e.deltaY < 0 ? 1 : -1; // wheel up => increase
      const curr = Number(inputEl.value) || 0;
      let next = curr + dir * step;
      if (min != null) next = Math.max(min, next);
      if (max != null) next = Math.min(max, next);
      // Keep compact formatting while allowing decimals.
      inputEl.value = String(Math.round(next * 1000) / 1000);
    }, { passive: false });
  }

  function loadViewerPrefs() {
    try {
      const raw = localStorage.getItem('sfrt_viewer_prefs_v1');
      if (!raw) return;
      const prefs = JSON.parse(raw);
      if (typeof prefs.showGrid === 'boolean' && els.showGridCheck) els.showGridCheck.checked = prefs.showGrid;
      if (typeof prefs.gridSpacing === 'number' && Number.isFinite(prefs.gridSpacing) && els.gridSpacingInput) {
        els.gridSpacingInput.value = String(Math.max(1, Math.round(prefs.gridSpacing)));
      }
      if (typeof prefs.radius === 'number' && Number.isFinite(prefs.radius) && els.radiusInput) {
        els.radiusInput.value = String(Math.max(0, prefs.radius));
      }
      if (typeof prefs.spacing === 'number' && Number.isFinite(prefs.spacing) && els.spacingInput) {
        els.spacingInput.value = String(Math.max(0, prefs.spacing));
      }
      if (typeof prefs.showCursor === 'boolean' && els.showCursorCheck) els.showCursorCheck.checked = prefs.showCursor;
      if (typeof prefs.cursorRadius === 'number' && Number.isFinite(prefs.cursorRadius) && els.cursorRadiusInput) {
        els.cursorRadiusInput.value = String(Math.max(0.5, prefs.cursorRadius));
      }
    } catch {}
  }

  function saveViewerPrefs() {
    try {
      const prefs = {
        showGrid: !!els.showGridCheck?.checked,
        gridSpacing: Number(els.gridSpacingInput?.value) || 0,
        radius: Number(els.radiusInput?.value) || 0,
        spacing: Number(els.spacingInput?.value) || 0,
        showCursor: !!els.showCursorCheck?.checked,
        cursorRadius: Number(els.cursorRadiusInput?.value) || 0,
      };
      localStorage.setItem('sfrt_viewer_prefs_v1', JSON.stringify(prefs));
    } catch {}
  }

  loadViewerPrefs();

  attachWheelNudge(els.radiusInput, 1, { min: 0 });
  attachWheelNudge(els.spacingInput, 5, { min: 0 });
  attachWheelNudge(els.marginInput, 1, { min: 0 });
  attachWheelNudge(els.gridSpacingInput, 1, { min: 1 });
  attachWheelNudge(els.cursorRadiusInput, 1, { min: 0.5 });
  if (els.showGridCheck) {
    els.showGridCheck.addEventListener('change', () => {
      saveViewerPrefs();
      renderAll();
    });
  }
  if (els.gridSpacingInput) {
    const onGridSpacingChange = () => {
      saveViewerPrefs();
      if (els.showGridCheck?.checked) renderAll();
    };
    els.gridSpacingInput.addEventListener('change', onGridSpacingChange);
    els.gridSpacingInput.addEventListener('input', onGridSpacingChange);
  }
  if (els.radiusInput) {
    const onRadiusChange = () => { saveViewerPrefs(); };
    els.radiusInput.addEventListener('change', onRadiusChange);
    els.radiusInput.addEventListener('input', onRadiusChange);
  }
  if (els.spacingInput) {
    const onSpacingChange = () => { saveViewerPrefs(); };
    els.spacingInput.addEventListener('change', onSpacingChange);
    els.spacingInput.addEventListener('input', onSpacingChange);
  }
  if (els.showCursorCheck) {
    state.cursor.enabled = !!els.showCursorCheck.checked;
    els.showCursorCheck.addEventListener('change', () => {
      state.cursor.enabled = !!els.showCursorCheck.checked;
      saveViewerPrefs();
      if (!state.cursor.enabled) {
        state.cursor.view = null;
        state.cursor.pos = null;
      }
      renderAll();
    });
  }
  state.cursor.enabled = !!els.showCursorCheck?.checked;
  if (els.cursorRadiusInput) {
    const onCursorRadiusChange = () => {
      saveViewerPrefs();
      if (state.cursor.enabled) renderAll();
    };
    els.cursorRadiusInput.addEventListener('change', onCursorRadiusChange);
    els.cursorRadiusInput.addEventListener('input', onCursorRadiusChange);
  }

  // Keep grid lines in sync with UI inputs.
  const gridInvalidateEls = [els.patternSelect, els.spacingInput, els.xShiftInput, els.yShiftInput, els.targetRoiSelect];
  const handleGridInvalidate = () => {
    invalidateGridCentersUvw();
    if (els.showGridCheck?.checked) renderAll();
  };
  for (const el of gridInvalidateEls) {
    if (!el) continue;
    el.addEventListener('change', handleGridInvalidate);
    el.addEventListener('input', handleGridInvalidate);
  }

  const supportInvalidateEls = [els.supportEnableCheck, els.supportInnerMm, els.supportMidMm, els.supportOuterMm];
  for (const el of supportInvalidateEls) {
    if (!el) continue;
    el.addEventListener('change', () => { state.support.rings = null; renderAll(); });
    el.addEventListener('input', () => { state.support.rings = null; renderAll(); });
  }

  if (els.btnSupportPreview) {
    els.btnSupportPreview.addEventListener('click', () => {
      log(els.supportLog, '');
      const enabled = !!els.supportEnableCheck?.checked;
      if (!enabled) {
        appendLog(els.supportLog, 'Enable supporting structure first.');
        return;
      }
      const inner = Math.max(0, Number(els.supportInnerMm?.value) || 0);
      const mid = Math.max(0, Number(els.supportMidMm?.value) || 0);
      const outer = Math.max(0, Number(els.supportOuterMm?.value) || 0);
      appendLog(els.supportLog, `Supporting structure config: inner=${inner}mm mid=${mid}mm outer=${outer}mm`);

      const total = inner + mid + outer;
      if (total <= 0) {
        appendLog(els.supportLog, 'All thickness values are 0 mm; nothing to generate.');
        return;
      }
      const peaks = (state.generated.spheres || []).filter((s) => (s?.kind || 'peak') === 'peak');
      if (!peaks.length) {
        appendLog(els.supportLog, 'No Peak spheres are generated yet. Generate spheres first (rings are defined from sphere surface).');
        return;
      }

      appendLog(els.supportLog, 'Computing true 3D shells from the union of Peak spheres (anisotropic spacing-aware)…');
      const rings = ensureSupportRingsComputed();
      if (!rings) {
        appendLog(els.supportLog, 'Ring generation failed (no voxels or invalid volume).');
        return;
      }
      const v = rings.volumesCc || {};
      appendLog(els.supportLog, `Approx volumes (cc): inner=${(v.inner || 0).toFixed(1)} mid=${(v.mid || 0).toFixed(1)} outer=${(v.outer || 0).toFixed(1)}`);
      renderAll();
    });
  }

  els.btnGenerate.addEventListener('click', () => generateSpheres());
  els.btnClear.addEventListener('click', () => clearGenerated());
  els.btnExport.addEventListener('click', () => withExportDisclaimer(() => exportRtstruct()));
  els.patternSelect.addEventListener('change', onPatternChanged);
  onPatternChanged();

  if (els.btnMeasure) {
    els.btnMeasure.addEventListener('click', () => {
      state.measure.enabled = !state.measure.enabled;
      if (!state.measure.enabled) state.measure.preview = null;
      updateMeasureUi();
      renderAll();
    });
  }
  if (els.btnClearMeasure) els.btnClearMeasure.addEventListener('click', () => clearMeasure());
  updateMeasureUi();

  if (els.launchDisclaimerAccept && els.launchDisclaimerModal) {
    els.launchDisclaimerAccept.addEventListener('click', () => setModalOpen(els.launchDisclaimerModal, false));
    els.launchDisclaimerModal.addEventListener('click', (e) => {
      if (e.target === els.launchDisclaimerModal) setModalOpen(els.launchDisclaimerModal, false);
    });
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') setModalOpen(els.launchDisclaimerModal, false);
    }, true);
  }

  if (els.btnHelp) els.btnHelp.addEventListener('click', () => openInfoModal('help'));
  if (els.btnAbout) els.btnAbout.addEventListener('click', () => openInfoModal('about'));
  if (els.infoModalOk) els.infoModalOk.addEventListener('click', () => closeInfoModal());
  if (els.infoModalClose) els.infoModalClose.addEventListener('click', () => closeInfoModal());
  if (els.infoTabHelp) els.infoTabHelp.addEventListener('click', () => loadInfoModalTab('help'));
  if (els.infoTabAbout) els.infoTabAbout.addEventListener('click', () => loadInfoModalTab('about'));
  if (els.infoTabLicense) els.infoTabLicense.addEventListener('click', () => loadInfoModalTab('license'));
  if (els.infoTabThirdParty) els.infoTabThirdParty.addEventListener('click', () => loadInfoModalTab('third_party'));
  if (els.infoModalCopy && els.infoModalBody) {
    els.infoModalCopy.addEventListener('click', async () => {
      const text = els.infoModalBody.textContent || '';
      try {
        await navigator.clipboard.writeText(text);
        appendLog(els.importLog, 'Copied info text to clipboard.');
      } catch (_e) {
        appendLog(els.importLog, 'Copy failed (clipboard permissions).');
      }
    });
  }
  if (els.infoModal) {
    els.infoModal.addEventListener('click', (e) => {
      if (e.target === els.infoModal) closeInfoModal();
    });
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeInfoModal();
    }, true);
  }

  setStatus('Idle', true);
  showLaunchDisclaimerModal();
})();
