
// Configuration (loaded from config.json)
let config = null;
let audio = null; // Will be initialized in initApp

// Global State
const appState = {
    locations: [], // Array of parsed location objects
    samples: [], // Array of sample objects
    currentLocIndex: 0,
    currentIrIndex: 0, // Maps to distance-select index
    currentSourceType: 'sample', // 'sample', 'mic', 'upload'
    isLoading: true,
    loadingProgress: 0,
    isNavigating: false, // Navigation Lock
};

// UI DOM Elements (Populated in initApp)
let ui = {};

// --- Global Variables for map.js Compatibility ---
// The original map.js relies on these globals to function.
window.json = new Map(); // Stores location data: Key=Loc_Name, Value=Object
window.currentValue = ''; // Current Location Name (string)
window.menuState = 2; // Arbitrary state integer used by map.js for resizing logic
window.locationElemnt = ui.locSelect; // map.js reads .value from this element
window.config = null; // Global config access for map.js and other scripts

// --- Initialization ---

async function initApp() {
    console.log("🚀 CAVERN App Starting...");

    // Safety Timeout: Force hide overlay after 10s if something hangs
    setTimeout(() => {
        if (appState.isLoading) {
            console.warn("⚠️ Loading took too long, forcing start.");
            appState.isLoading = false;
            hideLoadingOverlay();
        }
    }, 10000);

    // 0. Initialize Audio Engine & UI Refs
    audio = new AudioEngine();
    window.audio = audio; // Expose for debugging/map.js if needed

    // Initialize UI References
    ui = {
        // Sidebar
        sidebar: document.getElementById('sidebar'),
        toggleBtn: document.getElementById('btn-toggle-sidebar'),
        // Top Bar Navigation
        prevBtn: document.getElementById('btn-prev'),
        nextBtn: document.getElementById('btn-next'),
        locDisplay: document.getElementById('location-display'),
        // Settings Controls
        locSelect: document.getElementById('location-select'),
        distSelect: document.getElementById('distance-select'),
        // Audio Controls
        sampleSelect: document.getElementById('sample-select'),
        fileInput: document.getElementById('file-upload'),
        playBtn: document.getElementById('btn-play'),
        stopBtn: document.getElementById('btn-stop'),
        wetToggle: document.getElementById('toggle-wet'),
        volumeSlider: document.getElementById('volume-slider'),
        volumeValue: document.getElementById('volume-value'),
        sourceRadios: document.querySelectorAll('input[name="source-type"]'),
        ctrlSample: document.getElementById('ctrl-sample'),
        ctrlUpload: document.getElementById('ctrl-upload'),
        // A-Frame Elements
        sky: document.getElementById('sky'),
        camera: document.getElementById('cameraVR'),
        // Map Container (New)
        mapContainer: document.getElementById('mapContainer')
    };

    try {
        // 0. Load Configuration
        updateLoadingText('Loading configuration...');
        await loadConfig();
        applyProjectConfig();

        // 1. Load Data
        updateLoadingText('Loading location data...');
        await loadData();

        // 2. Setup DOM Event Listeners
        setupListeners();

        // 3. Initial Location Load (WAIT for texture)
        updateLoadingText('Loading first location...');

        // Force initial index to -1
        appState.currentLocIndex = -1;
        appState.currentIrIndex = requestedSourceIndex(); // [taormina patch I] ?src=

        if (appState.locations.length > 0) {
            // [taormina patch B] start seat from ?loc=<Loc_name>, else the first row
            const wantedLoc = requestedLocation();
            // [taormina patch I] seat names match without regard to letter case (?loc=5i03)
            let startIdx = wantedLoc ? appState.locations.findIndex(l => l.Loc_name.toUpperCase() === wantedLoc.toUpperCase()) : -1;
            if (startIdx === -1) startIdx = 0;
            await performLocationChange(startIdx);
        } else {
            updateUI();
        }

        // 4. Mark as ready & Hide Overlay
        appState.isLoading = false;
        hideLoadingOverlay();
        console.log("✅ CAVERN Ready (First Content Paint)");

        // 5. Initialize Map System
        if (typeof window.loadMapImage === 'function') {
            window.loadMapImage();
        }



        // 5c. [taormina patch I] no start-up preload of every panorama (neighbours only, after each
        // seat change); the preload progress bar is not used
        const pc = document.getElementById('progress-container');
        if (pc) pc.style.display = 'none';

        // 5d. Register Service Worker
        registerServiceWorker();

        // 6. Start Animation Loop
        requestAnimationFrame(animate);

    } catch (error) {
        console.error('❌ Failed to initialize app:', error);
        updateLoadingText('Error loading application. Please refresh.');
        // Force unlock if error
        appState.isLoading = false;
        hideLoadingOverlay();
    }
}

// Robust Entry Point
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
} else {
    initApp();
}

function updateLoadingText(text) {
    const loadingText = document.querySelector('.loading-text');
    if (loadingText) {
        loadingText.textContent = text;
    }
    console.log(`📍 ${text}`);
}

function showLoadingOverlay(text = 'Loading...') {
    // Safety check: Only show if explicitly allowed or during init
    // For now, simple log
    console.log(`Overlay Request: ${text}`);

    const overlay = document.getElementById('loading-overlay');
    if (overlay) {
        const loadingText = overlay.querySelector('.loading-text');
        if (loadingText) loadingText.textContent = text;

        overlay.style.display = 'flex';
        // Force reflow/repaint
        overlay.offsetHeight;
        overlay.classList.remove('hidden');
    }
}

function hideLoadingOverlay() {
    const overlay = document.getElementById('loading-overlay');
    if (overlay) {
        overlay.classList.add('hidden');
        // Remove from DOM after transition
        setTimeout(() => {
            if (overlay.classList.contains('hidden')) {
                overlay.style.display = 'none';
            }
        }, 500);
    }
}

// --- Configuration Loading ---

async function loadConfig() {
    try {
        const response = await fetch('config.json');
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        config = await response.json();
        window.config = config; // Make available globally
        console.log('✅ Configuration loaded:', config.project.name);

        // Update page title if config is loaded
        document.title = `${config.project.title} - ${config.project.name}`;
    } catch (e) {
        console.error('Failed to load config.json, using defaults:', e);
        // Fallback to default config
        config = {
            project: { // [taormina patch I] neutral fallback (config.json missing)
                name: "Virtual acoustics tour",
                title: "Tour",
                subtitle: "",
                aboutUrl: "../about.html"
            },
            map: {
                imagePath: "assets/plotting_website.svg",
                bounds: {
                    xmin: 812727.103,
                    xmax: 812833.709,
                    ymin: 6366452.372,
                    ymax: 6366688.656
                }
            },
            data: {
                imagesPath: "assets/images/",
                irsPath: "assets/irs/",
                audioPath: "assets/audio/"
            },
            audio: {
                ambisonicOrder: 1,
                defaultVolume: 100,
                samples: [
                    { "name": "Bear", "filename": "bear.wav" },
                    { "name": "Fire", "filename": "fire.wav" },
                    { "name": "Footsteps", "filename": "footsteps.mp3" }
                ]
            }
        };
        window.config = config; // Make fallback available globally too
    }

    // --- Trigger Map Image Load ---
    if (typeof window.loadMapImage === 'function') {
        const mapPath = config?.map?.imagePath || 'assets/plotting_website.png';
        window.loadMapImage(mapPath);
    }
}

function applyProjectConfig() {
    if (!config || !config.project) return;

    const p = config.project;

    // Title
    const titleEl = document.getElementById('app-title');
    if (titleEl && p.title) titleEl.textContent = p.title;

    // Subtitle
    const subEl = document.getElementById('app-subtitle');
    if (subEl && p.subtitle) subEl.textContent = p.subtitle;

    // About Link
    const aboutEl = document.getElementById('btn-about');
    if (aboutEl && p.aboutUrl) aboutEl.href = p.aboutUrl;

    // [taormina patch I] truth line (patch H) and the top-bar height for the panel position
    const truthText = document.getElementById('truth-text');
    if (truthText && p.truthLine) truthText.textContent = p.truthLine;
    const truthAbout = document.getElementById('truth-about');
    if (truthAbout && p.aboutUrl) truthAbout.href = p.aboutUrl;
    publishTopBarHeight();
    window.addEventListener('resize', publishTopBarHeight);
    const bar = document.querySelector('.top-bar');
    if (bar && window.ResizeObserver) new ResizeObserver(publishTopBarHeight).observe(bar); // label and font changes

    console.log("🎨 Project Config Applied to UI");
}

// --- Data Loading ---

async function loadData() {
    console.log("Loading data from CSV...");

    // 1. Load Location Data (CSV)
    try {
        const csvPath = config?.data?.csvPath || 'DataSet.csv';
        const response = await fetch(csvPath);

        if (!response.ok) {
            throw new Error(`Failed to load CSV: ${response.status} ${response.statusText}`);
        }

        const csvText = await response.text();
        appState.locations = parseCSV(csvText);

        // Populate global 'json' Map for map.js
        appState.locations.forEach(loc => {
            if (loc.Loc_name) {
                window.json.set(loc.Loc_name, loc);
            }
        });

        // Initialize 'currentValue' for map.js
        if (appState.locations.length > 0) {
            window.currentValue = appState.locations[0].Loc_name;
        }
        console.log(`✅ Locations loaded: ${appState.locations.length} locations`);
    } catch (e) {
        console.error("❌ Error loading CSV:", e);
        // Do not throw, allow app to load with empty state to avoid "stuck" loading screen
        appState.locations = [];
    }

    // 2. Load Audio Samples from config
    try {
        appState.samples = config?.audio?.samples || [];
        console.log(`✅ Audio samples loaded: ${appState.samples.length} samples`);
    } catch (e) {
        console.error("❌ Error loading audio data:", e);
        appState.samples = [];
    }
}

function parseCSV(csvText) {
    const lines = csvText.trim().split('\n');
    if (lines.length < 2) return [];

    const headers = lines[0].split(',').map(h => h.trim());
    const data = [];

    for (let i = 1; i < lines.length; i++) {
        // Handle CSV lines that might have commas inside quotes (basic handling, or split by simple comma)
        // For this template, we assume simple CSV.
        const values = lines[i].split(',').map(v => v.trim());

        // Skip empty lines
        if (values.length < 2) continue;

        const entry = {};

        headers.forEach((h, idx) => {
            entry[h] = values[idx] || "";
        });

        // Parse IRs - Dynamic Approach
        // Instead of hardcoding IR_Name_1, we look for columns starting with IR_Name_
        const irs = [];

        // Helper to find IR pairs
        // We scan for keys like "IR_Name_X"
        Object.keys(entry).forEach(key => {
            if (key.startsWith('IR_Name_')) {
                const suffix = key.replace('IR_Name_', '');
                const name = entry[key];
                const rotKey = `IR_Rotation_${suffix}`;
                const labelKey = `IR_Label_${suffix}`;
                const rotation = entry[rotKey];
                const label = entry[labelKey];

                if (name && name.length > 0) {
                    irs.push({
                        file: name,
                        label: label || name, // Fallback to name if label missing
                        rotation: parseFloat(rotation) || 0
                    });
                }
            }
        });

        // Sort IRs to maintain order if needed, though usually order depends on column order.
        // If no IR columns found, check for legacy hardcoded indices
        if (irs.length === 0) {
            const addIr = (name, rotation, label) => {
                if (name && name.length > 0) {
                    irs.push({ file: name, rotation: parseFloat(rotation) || 0, label: label || name });
                }
            };
            addIr(entry.IR_Name_1, entry.IR_Rotation_1, entry.IR_Label_1);
            addIr(entry.IR_Name_2, entry.IR_Rotation_2, entry.IR_Label_2);
            addIr(entry.IR_Name_3, entry.IR_Rotation_3, entry.IR_Label_3);
        }

        entry.IRs = irs;

        if (entry.Loc_name) {
            data.push(entry);
        }
    }
    return data;
}

// [taormina patch I] measured top-bar height as CSS variable --topbar-h (patch H positions the panel).
function publishTopBarHeight() {
    const bar = document.querySelector('.top-bar');
    if (bar) document.documentElement.style.setProperty('--topbar-h', `${Math.ceil(bar.getBoundingClientRect().height)}px`);
}

// [taormina patch I] ?src=<index> keeps the sound-source choice across seats and buildings.
function requestedSourceIndex() {
    try {
        const v = parseInt(new URLSearchParams(window.location.search).get('src'), 10);
        return Number.isInteger(v) && v >= 0 ? v : 0;
    } catch (e) {
        return 0;
    }
}

// [taormina patch B] Seat in the URL. ?loc=<Loc_name> selects the start seat; the address bar and
// the building switch link (config.project.switch = {label, title, url}) follow the current seat.
function requestedLocation() {
    try {
        return new URLSearchParams(window.location.search).get('loc') || '';
    } catch (e) {
        return '';
    }
}

function syncLocationLinks(locName) {
    try {
        const here = new URL(window.location.href);
        const srcIdx = String(appState.currentIrIndex || 0); // [taormina patch I]
        if (here.searchParams.get('loc') !== locName || here.searchParams.get('src') !== srcIdx) {
            here.searchParams.set('loc', locName);
            here.searchParams.set('src', srcIdx);
            window.history.replaceState(window.history.state, '', here.pathname + here.search + here.hash);
        }
    } catch (e) { }

    const link = document.getElementById('btn-switch');
    const sw = config && config.project ? config.project.switch : null;
    if (!link) return;
    if (!sw || !sw.url) {
        link.style.display = 'none';
        return;
    }
    try {
        const target = new URL(sw.url, window.location.href);
        target.searchParams.set('loc', locName);
        target.searchParams.set('src', String(appState.currentIrIndex || 0)); // [taormina patch I]
        link.href = target.href;
    } catch (e) {
        link.href = sw.url;
    }
    const text = document.getElementById('btn-switch-text');
    if (text && sw.label) text.textContent = sw.label;
    if (sw.title) {
        link.title = sw.title;
        link.setAttribute('aria-label', sw.title);
    }
    link.style.display = '';
}

// --- UI Logic ---

function setupListeners() {

    // Sidebar Toggle
    ui.toggleBtn.onclick = () => {
        ui.sidebar.classList.toggle('collapsed');

        // Trigger map resize if map.js is loaded
        if (typeof resizeMapCanvas === 'function') {
            // Delay slightly to match CSS transition or call immediately/repeatedly
            setTimeout(resizeMapCanvas, 310);
        }
    };

    // Navigation Buttons (Prev/Next)
    ui.prevBtn.onclick = () => navigate(-1);
    ui.nextBtn.onclick = () => navigate(1);

    // Location Dropdown Change
    ui.locSelect.onchange = async (e) => {
        const id = e.target.value;
        const index = appState.locations.findIndex(l => l.Loc_name === id);
        if (index !== -1) {
            await performLocationChange(index);
        }
    };

    // Distance Dropdown Change
    ui.distSelect.onchange = (e) => {
        appState.currentIrIndex = parseInt(e.target.value);
        const curLoc = appState.locations[appState.currentLocIndex]; // [taormina patch I]
        if (curLoc) syncLocationLinks(curLoc.Loc_name);

        // [taormina patch M] hold the sound (a playing source or a Start in flight is cancelled; Loading
        // while the visitor wants sound) and load this source's response; settleNavigation restarts once,
        // when no seat change is in progress and the newest response is in; a failure is shown by
        // loadCurrentIR
        holdForResponse();
        requestIR();
    };

    // [taormina patch M] a sound chosen in the sample menu while the visitor wants sound (playing, or a Start in
    // flight) holds what plays and restarts once with the chosen sound (settleNavigation; during a seat or source
    // change, that change's own restart plays it); the stock menu had no change handler, so the old sound kept
    // playing under the new name (round 9 repair 1, R9VP-2)
    ui.sampleSelect.onchange = () => {
        if (appState.currentSourceType !== 'sample') return;
        if (holdForResponse()) settleNavigation();
    };

    // [taormina patch M] a file chosen in Upload while the visitor wants sound restarts once with that file, as the sample menu
    // (round 10, R9R1VP-1; the stock file input had no change handler, so the old file kept playing under "Playing...")
    ui.fileInput.onchange = () => {
        if (appState.currentSourceType !== 'upload') return;
        if (holdForResponse()) settleNavigation();
    };

    // Source Type Radio
    ui.sourceRadios.forEach(radio => {
        radio.onchange = (e) => {
            if (e.target.checked) {
                // [taormina patch M] a new source type: stop what plays or is starting before the label changes
                // (handleStop(true): audio.stop without ring-out, so a tail left ringing by Stop fades too); a
                // microphone's tracks end with the 25 ms release, after the label changes (round 10, R9R1VC-2); an
                // explicit Start resumes
                const type = e.target.id.replace('src-', '');
                if (type !== appState.currentSourceType) handleStop(true);
                appState.currentSourceType = type;
                updateSourceUI();
            }
        };
    });

    // Audio Transport
    ui.playBtn.onclick = handlePlay;
    ui.stopBtn.onclick = handleStop;

    // Wet/Dry Toggle
    ui.wetToggle.onchange = (e) => {
        const isWet = e.target.checked;
        audio.setDryWet(isWet);

        // Apply grayscale filter when dry (not wet)
        // [taormina patch I] both sky elements of the double buffer
        ['sky', 'sky-buffer'].forEach((id) => {
            const el = document.getElementById(id);
            if (el) el.setAttribute('material', `shader: flat; color: ${isWet ? '#FFFFFF' : '#888888'}`);
        });
    };

    // [taormina patch I] arrow keys turn and tilt the view (stock wasd-controls are off, patch H)
    window.addEventListener('keydown', (e) => {
        const tag = (document.activeElement && document.activeElement.tagName) || '';
        if (/^(INPUT|SELECT|TEXTAREA)$/.test(tag)) return;
        const lc = ui.camera && ui.camera.components['look-controls'];
        if (!lc) return;
        const d = Math.PI / 180;
        if (e.key === 'ArrowLeft') lc.yawObject.rotation.y += 10 * d;
        else if (e.key === 'ArrowRight') lc.yawObject.rotation.y -= 10 * d;
        else if (e.key === 'ArrowUp') lc.pitchObject.rotation.x = Math.min(Math.PI / 2, lc.pitchObject.rotation.x + 5 * d);
        else if (e.key === 'ArrowDown') lc.pitchObject.rotation.x = Math.max(-Math.PI / 2, lc.pitchObject.rotation.x - 5 * d);
        else return;
        e.preventDefault();
    });

    // Volume Slider
    ui.volumeSlider.oninput = (e) => {
        const value = parseInt(e.target.value);
        ui.volumeValue.textContent = `${value}%`;
        audio.setVolume(value);
    };
}

// --- Combined Loading Logic ---

// --- Combined Loading Logic ---

// --- Combined Loading Logic ---

// function populateImageAssets() removed for lazy loading

function loadImageAsync(loc) {
    return new Promise((resolve) => {
        const imagesPath = config?.data?.imagesPath || 'assets/images/';
        const url = `${imagesPath}${loc.Photo_Name}`;

        const img = new Image();
        img.crossOrigin = 'anonymous'; // [taormina patch I] same request mode as A-Frame's texture load
        img.onload = () => {
            console.log(`🖼️ Image preloaded: ${loc.Photo_Name}`);
            resolve(img); // [taormina patch M] the loaded image itself: prepareSkybox makes the sky's texture from it
        };
        img.onerror = () => {
            console.warn(`⚠️ Failed to preload image: ${url}`);
            resolve(null); // [taormina patch M] a failure, never a loaded image (the seat change then fails)
        };
        img.src = url;
    });
}

function preloadAdjacentAssets(currentIndex) {
    // [taormina patch I] preload only the previous and next seats' panoramas, after a short pause
    const n = appState.locations.length;
    if (n < 2) return;
    setTimeout(() => {
        [currentIndex + 1, currentIndex - 1].forEach((i) => {
            const loc = appState.locations[(i + n) % n];
            if (loc) loadImageAsync(loc);
        });
    }, 1500);
}


async function navigate(direction) {
    if (appState.locations.length === 0) return;

    let newIndex = appState.currentLocIndex + direction;
    if (newIndex < 0) newIndex = appState.locations.length - 1;
    if (newIndex >= appState.locations.length) newIndex = 0;

    await performLocationChange(newIndex);
}

function updateUI() {
    const loc = appState.locations[appState.currentLocIndex];
    if (!loc) return;

    // 1. Update Top Bar Display
    ui.locDisplay.textContent = `${loc.Loc_name} - ${loc.Label}`;

    // 2. Populate Location Dropdown (if needed)
    if (ui.locSelect.options.length === 0) {
        appState.locations.forEach(l => {
            const opt = document.createElement('option');
            opt.value = l.Loc_name;
            opt.textContent = `${l.Loc_name} - ${l.Label}`;
            ui.locSelect.appendChild(opt);
        });
    }
    // Sync Location Dropdown Value
    ui.locSelect.value = loc.Loc_name;
    syncLocationLinks(loc.Loc_name); // [taormina patch B]

    // 3. Populate Sample Dropdown (if needed)
    if (ui.sampleSelect.options.length === 0) {
        appState.samples.forEach(s => {
            const opt = document.createElement('option');
            opt.value = s.filename;
            opt.textContent = s.name;
            ui.sampleSelect.appendChild(opt);
        });
    }

    // 4. Update Distance Dropdown
    ui.distSelect.innerHTML = '';
    if (loc.IRs) {
        loc.IRs.forEach((ir, idx) => {
            const opt = document.createElement('option');
            opt.value = idx;
            // Use Label from CSV if available, otherwise fallback (though migration ensures labels exist)
            opt.textContent = ir.label || ir.file;
            ui.distSelect.appendChild(opt);
        });
    }
    ui.distSelect.value = appState.currentIrIndex;

    // 5. Update Sky (360 Image) - Handled by swapSkybox (Double Buffering)
    // We do NOT touch the sky element here to prevent conflict with the swap logic.
    // const imagesPath = config?.data?.imagesPath || 'assets/images/';
    // const bgUrl = `${imagesPath}${loc.Photo_Name}`;
    // ui.sky.setAttribute('src', bgUrl); 

    // Logging for debug
    console.log(`ℹ️ UI Updated for ${loc.Loc_name}`);
}

function updateSourceUI() {
    ui.ctrlSample.style.display = 'none';
    ui.ctrlUpload.style.display = 'none';

    if (appState.currentSourceType === 'sample') {
        ui.ctrlSample.style.display = 'block';
    } else if (appState.currentSourceType === 'upload') {
        ui.ctrlUpload.style.display = 'block';
    }
}

// --- Double Buffering Logic ---

let currentSkyId = 'sky';

// Helper to get active/inactive elements
function getSkyElements() {
    const s1 = document.getElementById('sky');
    const s2 = document.getElementById('sky-buffer');
    if (currentSkyId === 'sky') return { active: s1, inactive: s2 };
    return { active: s2, inactive: s1 };
}

// [taormina patch M] the camera's look-controls once A-Frame has initialised it (its yaw and pitch
// objects exist), else null
function lookControlsNow(camera) {
    const lc = camera && camera.components ? camera.components['look-controls'] : null;
    return lc && lc.yawObject && lc.pitchObject ? lc : null;
}

// [taormina patch M] Resolves the camera's look-controls once it has initialised (the camera's
// componentinitialized or loaded event, or a 50 ms check), or null after ms. On a freshly opened page the
// first seat's panorama can be ready before A-Frame has initialised the camera (repair r6-2, R6VC-R1-1:
// with the texture made from the preloaded image the start yaw stayed 0 in 15 of 15 fresh loads).
function lookControlsReady(camera, ms) {
    const now = lookControlsNow(camera);
    if (now || !camera) return Promise.resolve(now);
    return new Promise((resolve) => {
        let done = false, tick = 0, bound = 0;
        const finish = () => {
            if (done) return;
            done = true;
            clearTimeout(tick);
            clearTimeout(bound);
            camera.removeEventListener('componentinitialized', onEvent);
            camera.removeEventListener('loaded', onEvent);
            resolve(lookControlsNow(camera));
        };
        const onEvent = () => { if (lookControlsNow(camera)) finish(); };
        const poll = () => {
            if (done) return;
            if (lookControlsNow(camera)) return finish();
            tick = setTimeout(poll, 50);
        };
        camera.addEventListener('componentinitialized', onEvent);
        camera.addEventListener('loaded', onEvent);
        tick = setTimeout(poll, 50);
        bound = setTimeout(finish, ms);
    });
}

// [taormina patch M] a start view whose look-controls wait ran out: applied as soon as look-controls
// initialises (the newest such seat's), unless a later seat change has applied its own start view first
const startView = { pending: null, waiting: false };
function applyStartViewWhenReady(camera, rotRad) {
    startView.pending = rotRad;
    console.warn('look-controls not initialised yet: the start view is applied when it is');
    if (startView.waiting || !camera) return;
    startView.waiting = true;
    const onEvent = () => {
        const lc = lookControlsNow(camera);
        if (!lc) return;
        camera.removeEventListener('componentinitialized', onEvent);
        camera.removeEventListener('loaded', onEvent);
        startView.waiting = false;
        if (startView.pending === null) return;
        lc.pitchObject.rotation.x = 0;
        lc.yawObject.rotation.y = startView.pending;
        startView.pending = null;
    };
    camera.addEventListener('componentinitialized', onEvent);
    camera.addEventListener('loaded', onEvent);
}

// [taormina patch M] what the sky's THREE material map holds for this seat: 'ready' (the seat's own
// file, an image with positive dimensions), 'failed' (the seat's file as a video element, which
// A-Frame makes after a failed HEAD request, or a broken image) or 'pending' (another or no image yet)
function skyImageState(el, loc) {
    const mesh = el && el.getObject3D && el.getObject3D('mesh');
    const map = mesh && mesh.material ? mesh.material.map : null;
    const img = map ? map.image : null;
    const src = img && typeof img.src === 'string' ? img.src : '';
    let name = '';
    try { name = decodeURIComponent(src.split(/[?#]/)[0].split('/').pop()); } catch (e) { name = ''; }
    if (!img || name !== loc.Photo_Name) return 'pending';
    if (typeof HTMLVideoElement !== 'undefined' && img instanceof HTMLVideoElement) return 'failed';
    if ((img.naturalWidth || img.width) > 0 && (img.naturalHeight || img.height) > 0 && img.complete !== false) return 'ready';
    return img.complete === true ? 'failed' : 'pending';
}

// [taormina patch M] Resolves the inactive sky once its material really holds this seat's panorama
// (skyImageState 'ready'), checked at once, on materialtextureloaded and on every animation frame (a
// 200 ms timer too, for a hidden tab). imageLoad is loadImageAsync's promise: the sky's texture is made
// from the loaded image itself (material src = the <img> element), so A-Frame makes no request of its
// own (no HEAD check, no second GET) and keeps no texture promise for a URL that can stay unsettled
// after a failed GET (A-Frame 1.4.2 caches one per src and its fetch-error callback only logs; clearing
// and setting the src attribute again in one task made no new request, Codex review r06 R6VC-1). Resolves
// null on a failed preload (imageLoad gives null), a failed texture, or 30 s after the image loaded
// (lead's bound, 2026-10-22; the preload itself stays unbounded, as before). No event or timer alone
// means ready. superseded(): a newer seat was chosen meanwhile; the wait then ends at once (null), also
// during the preload, and a late image is not put on the sky.
function prepareSkybox(loc, imageLoad, superseded) {
    return new Promise((resolve) => {
        const { active, inactive } = getSkyElements();
        let done = false, frame = 0, tick = 0, bound = 0, image = null;
        const finish = (ok) => {
            if (done) return;
            done = true;
            cancelAnimationFrame(frame);
            clearTimeout(tick);
            clearTimeout(bound);
            inactive.removeEventListener('materialtextureloaded', onEvent);
            resolve(ok ? inactive : null); // do NOT swap yet
        };
        const check = () => {
            if (done) return;
            cancelAnimationFrame(frame);
            clearTimeout(tick);
            if (superseded && superseded()) return finish(false);
            if (image) {
                const state = skyImageState(inactive, loc);
                if (state === 'ready') return finish(true);
                if (state === 'failed') return finish(false);
            }
            frame = requestAnimationFrame(check);
            tick = setTimeout(check, 200);
        };
        const onEvent = () => check();
        inactive.addEventListener('materialtextureloaded', onEvent);
        Promise.resolve(imageLoad).then((loaded) => {
            if (done) return;
            if (!loaded || typeof loaded !== 'object') return finish(false);
            image = loaded;
            bound = setTimeout(() => finish(false), 30000);
            // 1. Setup the INACTIVE sky (Hidden): the texture from the loaded image element
            inactive.setAttribute('material', 'src', loaded);
            // We do NOT rotate the sky anymore. We rotate the camera instead.
            inactive.setAttribute('rotation', `0 0 0`);
            check();
        }, () => finish(false));
        check();
    });
}

function revealSkybox() {
    const { active, inactive } = getSkyElements();

    // Swap Visibility
    inactive.setAttribute('visible', 'true');
    active.setAttribute('visible', 'false');

    // Update state
    currentSkyId = inactive.id;
    console.log(`👁️ Revealed Skybox: ${currentSkyId}`);
}

// --- Integration Functions for map.js ---

// Core logic for changing location (loading, switching, restarting audio)
async function performLocationChange(index, again) { /* [taormina patch M] again: load the current seat again */
    if (index === -1) return;

    // NAVIGATION LOCK
    if (appState.isNavigating) {
        // [taormina patch I] queue the latest request instead of dropping it
        // [taormina patch M] also when it names the seat now loading (the menu shows it; an older queued
        // seat is dropped); the sound is held at once and plays only after the newest seat's panorama
        // and response are both in (settleNavigation)
        appState.pendingNavIndex = index;
        holdForResponse();
        // [taormina patch M] the seat being loaded is chosen again while its response failure is held (it failed after another
        // seat had been queued, see loadCurrentIR): that failure now applies, nothing plays (round 9b, Codex review r04 F2)
        if (index === appState.currentLocIndex && navState.irHeld) {
            navState.irHeld = false;
            transportState.want = false;
            transportState.starting = 0;
            resetTransport();
        }
        // [taormina patch M] the loading status names the newest chosen seat (round 8 repair 1); a seat other than the one
        // loading, queued while a picture or response failure message of the loading seat stands, replaces that message at
        // once with the status naming the queued seat (showNavMessage; round 9, R8R1VP-1)
        if (navState.seatLoading || (index !== appState.currentLocIndex && (navState.pictureMessage || navState.irMessage))) {
            navState.seatLoading = `Loading the picture for ${appState.locations[index].Loc_name} ...`;
        }
        if (navState.seatLoading || navState.pictureMessage || navState.irMessage) showNavMessage();
        return;
    }
    if (index === appState.currentLocIndex && !again) return;
    appState.isNavigating = true;
    navState.panoramaShown = false; // [taormina patch M] until this seat's own panorama is displayed
    // [taormina patch M] a picture failure message belongs to its seat: choosing another seat clears it at once; that
    // seat's own response and panorama then write the message (round 8, R7VC-7); while it loads no sky is shown, so a
    // neutral status names the seat being loaded until its panorama is shown or fails (round 8 repair 1, R8VP-2)
    if (index !== appState.currentLocIndex && (navState.pictureMessage || navState.seatLoading)) {
        navState.pictureMessage = false;
        navState.irMessage = false; // that seat's response failure too (requestIR below; R8VC-3)
        navState.seatLoading = `Loading the picture for ${appState.locations[index].Loc_name} ...`;
        showNavMessage();
    }

    const targetLoc = appState.locations[index];

    // User requested to remove loading page.
    // We use cursor feedback instead for the split-second wait.
    document.body.style.cursor = 'wait';

    appState.currentLocIndex = index;
    // [taormina patch I] keep the chosen sound source when the new seat offers it
    const keepIr = appState.currentIrIndex;
    appState.currentIrIndex = (targetLoc.IRs && keepIr >= 0 && keepIr < targetLoc.IRs.length) ? keepIr : 0;

    // Sync globals for map.js
    window.currentValue = targetLoc.Loc_name;
    ui.locSelect.value = targetLoc.Loc_name;

    // Stop audio immediately? 
    // [taormina patch M] playing, or a Start in flight: cancel it (its source never connects) and show
    // Loading until this seat's panorama is shown and its response is in (settleNavigation)
    holdForResponse();

    // Parallel Load Phase:
    // 1. Preload Image into Browser Cache (using new Image)
    const imageLoad = loadImageAsync(targetLoc);

    // 2. Decode Audio (Background - Do NOT block visual transition)
    // We let this happen in parallel. If it finishes early, good. If late, audio updates when ready.
    // This restores the "Fast" feel of the visual transition.
    // [taormina patch M] tracked request: settleNavigation waits for it (a failure is shown by
    // loadCurrentIR, which has stopped playback; a source change during the load supersedes it)
    requestIR();

    // Wait ONLY for Image
    // [taormina patch M] the wait for the image (null: the preload failed) is part of prepareSkybox's
    // wait, which a newer seat ends at once

    // ATOMIC SWAP STRATEGY:
    // 1. Prepare Skybox (Load texture on hidden sphere)
    // [taormina patch M] shown: this seat's own panorama is ready; superseded: a newer seat was chosen
    // meanwhile (it runs next; this one is neither revealed, named, sounded nor reported)
    const newerSeat = () => {
        const queued = appState.pendingNavIndex;
        return queued !== undefined && queued !== null && queued !== index;
    };
    const shown = !!(await prepareSkybox(targetLoc, imageLoad, newerSeat));
    const superseded = newerSeat();

    // 2. Reset Camera to Initial Angle (WHILE hidden sphere is ready but not shown)
    // This blocks the user from seeing the rotation happen on the old or new image.
    if (ui.camera && shown && !superseded) { // [taormina patch M]
        const rotY = parseFloat(targetLoc.Photo_Rotation) || 0;
        // Convert to Radians for Three.js
        const rotRad = THREE.MathUtils.degToRad(rotY);

        // Reset A-Frame look-controls internal state if available
        // [taormina patch M] on a freshly opened page this seat's panorama (made from the preloaded image) can
        // be ready before A-Frame has initialised the camera's look-controls; the start view was then skipped
        // and faced yaw 0 (repair r6-2, R6VC-R1-1). Wait for look-controls (lookControlsReady) before the
        // reveal; if it is still absent after the bound, apply the start view when it initialises, never skip it
        let lookControls = lookControlsNow(ui.camera);
        if (!lookControls) lookControls = await lookControlsReady(ui.camera, 10000);
        if (lookControls) {
            startView.pending = null; // this seat's start view replaces any deferred one
            lookControls.pitchObject.rotation.x = 0;
            lookControls.yawObject.rotation.y = rotRad; // Apply Initial Angle Here
        } else {
            applyStartViewWhenReady(ui.camera, rotRad);
        }
    }

    // 3. Reveal Skybox (Instant Switch)
    // Now that camera is rotated, we show the new image.
    // [taormina patch M] reveal and name the seat only with its own panorama; a failure hides both skies
    // (no other seat's picture under this seat's name), stops and says so
    // [taormina patch M] a seat queued meanwhile, also during the look-controls wait above, supersedes this one:
    // checked again here (round 7, R6VC-R2-1)
    const supersededNow = superseded || newerSeat();
    if (shown && !supersededNow) {
        revealSkybox();
        navState.panoramaShown = true;
        if (navState.pictureMessage || navState.seatLoading) {
            navState.pictureMessage = false;
            navState.seatLoading = false;
            showNavMessage(); // [taormina patch M] a response failure stays shown
        }

        // 2. Update GUI Text
        updateUI();
    } else if (!supersededNow) {
        showPanoramaFailure(targetLoc);
    }

    // 3. Restart Audio (if it was playing)
    // If IR is still loading, playBuffer/convolver update will wait or handle it?
    // loadCurrentIR updates 'currentIrBuffer'.
    // If we call handlePlay() before IR is done, it might play Dry or play old IR?
    // We should probably wait for IR *before* restarting playback, BUT not before showing image.

    // [taormina patch M] no restart here: settleNavigation (below, or the queued seat change's own)
    // restarts once, when the newest seat's panorama is shown and its response is in

    document.body.style.cursor = 'default';
    appState.isNavigating = false; // RELEASE LOCK

    preloadAdjacentAssets(index);

    // [taormina patch I] run a seat change requested while this one was loading
    if (appState.pendingNavIndex !== undefined && appState.pendingNavIndex !== null) {
        const next = appState.pendingNavIndex;
        appState.pendingNavIndex = null;
        if (next !== appState.currentLocIndex) return performLocationChange(next); /* [taormina patch M] it settles */
    }
    settleNavigation(); // [taormina patch M]
}

// map.js expects this function to verify/trigger IR usage when map changes location
// map.js triggers this. We can delegate to our robust function.
window.changeIr = async () => {
    const pendingId = ui.locSelect.value;
    const index = appState.locations.findIndex(l => l.Loc_name === pendingId);
    if (index !== -1) {
        await performLocationChange(index);
    }
};

// map.js expects this to update the image
window.updateImage = () => {
    // Handled in updateUI(), so we can leave empty or ensure updateUI calls it.
    // updateUI() updates the a-sky src.
};


// --- Audio Engine Interactions ---

// [taormina patch M] Returns audio.loadIR's result (true: applied; false: a newer request superseded
// it; null: no seat yet). A failure of the newest request (patch L: playback stopped, a Start in
// flight cancelled, previous response cleared) ends in the stopped state, shows a message below the
// Start/Stop buttons and rethrows. A seat without an IR for the chosen source is a failure too, never
// a silent keep of the old one. A failure of a replaced request changes nothing (false); one of the seat being
// loaded while another seat is queued is held: the wish to listen stays (round 9b).
async function loadCurrentIR() {
    const loc = appState.locations[appState.currentLocIndex];
    if (!loc) return null;

    const irData = loc.IRs ? loc.IRs[appState.currentIrIndex] : null;
    const irsPath = config?.data?.irsPath || 'assets/irs/';
    const url = irData ? `${irsPath}${irData.file}` : null;
    // [taormina patch M] this request's generation: patch L numbers every loadIR call when it is made (round 9b, F1)
    const request = audio.loadIR(url, irData ? irData.rotation : 0);
    const requestGen = audio.irGeneration;
    try {
        const applied = await request;
        if (applied) { // [taormina patch M] a picture failure message stays until the panorama is shown (round 7, VP6-3)
            navState.irMessage = false;
            showNavMessage(); // [taormina patch M] and a seat's loading status stays (round 8 repair 1)
        }
        return applied;
    } catch (e) {
        // [taormina patch M] a request that a newer one has replaced (also by a late rejection of the initialisation it
        // waited for) changes nothing: not the buttons, the wish to listen or the message (round 9b, Codex review r04 F1)
        if (requestGen !== audio.irGeneration) return false;
        // [taormina patch M] another seat is queued: the visitor has left this seat, so its failure neither ends the wish to
        // listen nor shows under the queued seat (showNavMessage hides it); it is held and applies only if this seat is chosen
        // again (performLocationChange's queue branch); the queued seat's request clears it (round 9b, Codex review r04 F2)
        const queued = appState.pendingNavIndex;
        navState.irHeld = queued !== undefined && queued !== null && queued !== appState.currentLocIndex;
        if (!navState.irHeld) {
            transportState.want = false;
            transportState.starting = 0;
            resetTransport();
        }
        const what = irData ? (irData.label || irData.file) : 'the chosen sound source';
        navState.irMessage = `The acoustic response for ${loc.Loc_name} (${what}) could not be loaded, so nothing is playing. ` +
            'Press Start Audio to try again, or choose another seat or sound source.';
        // [taormina patch M] while a picture failure stands, both reasons are shown (round 7, VP6-3)
        showNavMessage();
        throw e;
    }
}

// [taormina patch M] Transport state. want: the visitor pressed Start and has not pressed Stop since
// (playing, starting, or held during a navigation); starting: the generation of the Start in flight
// (0: none).
const transportState = { want: false, starting: 0, last: 0 };

// [taormina patch M] Navigation state: irGen counts the IR requests of seat and source changes,
// irSettled is the newest one that has finished (applied or failed); panoramaShown: the current seat's
// own panorama is displayed (false during a seat change and after its picture failed); pictureMessage:
// the picture failure message while it stands (until the seat's panorama is shown or another seat is chosen,
// round 8), else false; irMessage
// (round 7, VP6-3): the newest response request's failure message, else false (hidden when a newer request starts,
// round 8 repair 1); seatLoading (round 8 repair 1, R8VP-2): the neutral status of a seat chosen after a picture
// failure, until its panorama is shown or fails, else false; irHeld (round 9b, F2): the response failure of the seat being
// loaded arrived while another seat was queued (the stop is held), else false.
const navState = { irGen: 0, irSettled: 0, panoramaShown: false, pictureMessage: false, irMessage: false, seatLoading: false, irHeld: false };

// [taormina patch M] the message below the Start/Stop buttons from the navigation state (round 8 repair 1): the
// standing picture and response failure messages, both when both stand (round 7, VP6-3); else the neutral status
// of a seat loading after a picture failure (R8VP-2); else none. While a seat other than the one loading is queued, the
// queued seat is the chosen one: the loading seat's picture and response failures are not shown under its name (the
// queued seat's change clears them; if the loading seat is chosen again they show again; round 9, R8R1VP-1)
function showNavMessage() {
    const queued = appState.pendingNavIndex;
    const otherQueued = queued !== undefined && queued !== null && queued !== appState.currentLocIndex;
    const failure = otherQueued ? '' : [navState.pictureMessage, navState.irMessage].filter(Boolean).join(' ');
    if (failure) showAudioMessage(failure);
    else showAudioMessage(navState.seatLoading || null, true);
}

// [taormina patch M] the current seat's panorama could not be shown: no other seat's picture stands under
// its name (both skies hidden), nothing plays (as a failed response in loadCurrentIR), and a message
// says so; Start loads the seat again (handlePlay)
function showPanoramaFailure(loc) {
    ['sky', 'sky-buffer'].forEach((id) => {
        const el = document.getElementById(id);
        if (el) el.setAttribute('visible', 'false');
    });
    updateUI();
    transportState.want = false;
    transportState.starting = 0;
    audio.stop();
    resetTransport();
    navState.pictureMessage = `The picture for ${loc.Loc_name} could not be loaded, so nothing is shown or playing. ` +
        'Press Start Audio to try again, or choose another seat.';
    navState.seatLoading = false; // [taormina patch M] this seat's own outcome replaces its loading status (round 8 repair 1)
    // [taormina patch M] this seat's response failure, if any, stays shown with it (round 7, VP6-3)
    showNavMessage();
}

// [taormina patch M] a seat or source change: cancel what plays or is starting (audio.stop makes a Start in
// flight stale, patch L) and fade a reverberation tail still ringing after Stop (audio.stop without ring-out:
// patch L's cutRingingTails, round 10), also when no sound is wanted; when the visitor wants sound, show Loading
// until settleNavigation restarts. Returns whether the visitor wants sound.
function holdForResponse() {
    audio.stop();
    if (!transportState.want) return false;
    transportState.starting = 0;
    setTransport('loading');
    return true;
}

// [taormina patch M] load the current seat's and source's response as a tracked request; when the
// newest tracked request finishes, settleNavigation decides
function requestIR() {
    const gen = ++navState.irGen;
    navState.irHeld = false; // [taormina patch M] a held failure belonged to the request this one replaces (round 9b)
    // [taormina patch M] an older request's failure no longer applies (round 7, VP6-3) and is no longer shown: it named
    // the seat or source before this change (round 8 repair 1, R8VP-1, R8VC-3)
    if (navState.irMessage) {
        navState.irMessage = false;
        showNavMessage();
    }
    const done = () => {
        if (gen !== navState.irGen) return; // superseded by a newer seat or source change
        navState.irSettled = gen;
        settleNavigation();
    };
    loadCurrentIR().then(done, done);
}

// [taormina patch M] true while a seat change runs (its panorama is not shown yet), the current seat's
// panorama is not displayed (it failed), a queued seat waits, or the newest seat or source change's
// response is still loading
function navigationBusy() {
    const pending = appState.pendingNavIndex;
    return appState.isNavigating || !navState.panoramaShown || navState.irSettled !== navState.irGen ||
        (pending !== undefined && pending !== null && pending !== appState.currentLocIndex);
}

// [taormina patch M] the one place that restarts after a navigation: once nothing is busy, when the
// visitor still wants sound and nothing plays or starts; seat, source, menu and display then agree
function settleNavigation() {
    if (navigationBusy()) return;
    if (transportState.want && !transportState.starting && !audio.isPlaying) startPlayback();
}

// --- UI Helpers ---

// [taormina patch M] Start/Stop buttons from the real state: 'stopped' (Start enabled), 'loading'
// (Start disabled, Stop enabled to cancel), 'playing' (Start disabled as "Playing...", Stop enabled)
function setTransport(state) {
    const btn = ui.playBtn;
    btn.disabled = state !== 'stopped';
    btn.innerHTML = state === 'loading'
        ? '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Loading...'
        : `<i class="bi bi-play-fill me-1"></i> ${state === 'playing' ? 'Playing...' : 'Start Audio'}`;
    ui.stopBtn.disabled = state === 'stopped';
}

// [taormina patch M] plain message right below the Start/Stop buttons (no alert() dialog);
// null hides it; neutral: a status, not an alert (round 8 repair 1)
function showAudioMessage(text, neutral) {
    let el = document.getElementById('audio-message');
    if (!text) {
        if (el) {
            el.hidden = true;
            el.textContent = '';
        }
        return;
    }
    if (!el) {
        el = document.createElement('p');
        el.id = 'audio-message';
        el.className = 'start-hint';
        el.setAttribute('role', 'alert');
        el.style.color = '#ffd0c8';
        el.style.fontWeight = '600';
        const row = ui.playBtn && ui.playBtn.parentElement;
        if (row && row.parentElement) row.parentElement.insertBefore(el, row.nextSibling);
        else document.body.appendChild(el);
    }
    el.textContent = text;
    // [taormina patch M] a neutral status (round 8 repair 1, R8VP-2) is plain text announced politely; every other
    // message is a highlighted alert
    el.setAttribute('role', neutral ? 'status' : 'alert');
    el.style.color = neutral ? '' : '#ffd0c8';
    el.style.fontWeight = neutral ? '' : '600';
    el.hidden = false;
}

// [taormina patch M] Start enabled, Stop disabled (nothing is playing)
function resetTransport() {
    setTransport('stopped');
}

function setAudioLoading(isLoading) {
    const btn = ui.playBtn;
    if (isLoading) {
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Loading...';
    } else {
        btn.disabled = false;
        btn.innerHTML = '<i class="bi bi-play-fill me-1"></i> Start Audio';
    }
}

// [taormina patch M] Start button: one Start at a time; a press while a Start is in flight is ignored.
// During a navigation (navigationBusy) it only records the wish and shows Loading: settleNavigation
// then starts once, with the newest seat's and source's response. When the current seat's panorama is
// not displayed (it failed) and no seat change runs, it loads that seat again, picture and response.
async function handlePlay() {
    if (transportState.starting) return;
    transportState.want = true;
    if (!navState.panoramaShown && !appState.isNavigating && appState.currentLocIndex >= 0) {
        setTransport('loading');
        await performLocationChange(appState.currentLocIndex, true);
        return;
    }
    if (navigationBusy()) {
        setTransport('loading');
        return;
    }
    await startPlayback();
}

// [taormina patch M] One Start with its own generation. It plays only the current seat's and source's
// response: a load that a newer request superseded is repeated (a failure throws; loadCurrentIR shows
// it). A seat or source change, Stop or a failed response makes it stale: it then returns without
// touching the buttons (whoever cancelled it has set them), and patch L never connects its source.
async function startPlayback() {
    const gen = transportState.starting = ++transportState.last;
    const current = () => transportState.starting === gen;
    setTransport('loading');

    try {
        await audio.init();
        for (let tries = 0; (await loadCurrentIR()) === false; tries++) {
            if (!current()) return;
            if (tries >= 3) {
                showAudioMessage('The seat or sound source changed while loading. Press Start Audio again.');
                const superseded = new Error('IR request superseded 4 times');
                superseded.name = 'IrSupersededError'; // [taormina patch M] its message is shown above (round 9 repair 1)
                throw superseded;
            }
        }
        if (!current()) return;

        let started = false;
        const type = appState.currentSourceType;
        if (type === 'sample') {
            const file = ui.sampleSelect.value;
            const audioPath = config?.data?.audioPath || 'assets/audio/';
            if (file) started = await audio.playSample(`${audioPath}${file}`);
        } else if (type === 'mic') {
            started = await audio.startMic();
        } else if (type === 'upload') {
            const files = ui.fileInput.files;
            if (files.length > 0) started = await audio.playFile(files[0]);
            else showAudioMessage('No file selected. Choose a sound file, then press Start Audio.');
        }
        if (!current()) return;
        if (started !== true) transportState.want = false;
        setTransport(started === true && audio.isPlaying ? 'playing' : 'stopped');
    } catch (e) {
        console.error("Audio playback failed:", e);
        if (!current()) return;
        transportState.want = false;
        // [taormina patch M] a failed Start ends every sound: a tail left ringing by an earlier Stop fades in 25 ms (audio.stop
        // without ring-out, patch L), so the message below that nothing is playing is true (round 10)
        audio.stop();
        if (e && e.name === 'SampleLoadError') {
            showAudioMessage(`The sound (${e.sampleName || 'sample'}) could not be loaded, so nothing is playing. ` +
                'Press Start Audio to try again, or choose another sound.');
        } else if (e && e.name === 'MicStartError') {
            // [taormina patch M] a microphone that could not be started (patch J: reason and cause; the stream is
            // released), shown below the buttons, no dialog (round 9)
            const what = e.cause && e.cause.name ? e.cause.name : 'Error';
            showAudioMessage(e.reason === 'no-device'
                ? 'No microphone was found on this device, so nothing is playing. Connect one and press Start Audio, ' +
                    'or choose Sample or Upload.'
                : e.reason === 'refused'
                    ? 'Microphone access was refused, so nothing is playing. Allow microphone access for this page and ' +
                        'press Start Audio again, or choose Sample or Upload.'
                    : e.reason === 'audio-graph'
                        ? `The microphone's sound could not be connected to the audio processing (${what}), so nothing is ` +
                            'playing and the microphone was released. Press Start Audio to try again, or choose Sample or Upload.'
                        : `The microphone could not be started (${what}), so nothing is playing. ` +
                            'Press Start Audio to try again, or choose Sample or Upload.');
        } else if (e && e.name === 'AudioGraphError') {
            // [taormina patch M] patch L: the sound was loaded but could not be connected to the audio processing; its
            // source is stopped (round 9 repair 1, R9VC-7)
            const what = e.cause && e.cause.name ? e.cause.name : 'Error';
            showAudioMessage(`The sound (${e.sampleName || 'sample'}) could not be connected to the audio processing (${what}), ` +
                'so nothing is playing. Press Start Audio to try again, or choose another sound.');
        } else if (!(e && (e.name === 'IrLoadError' || e.name === 'IrSupersededError'))) {
            // [taormina patch M] any other failure of the Start (for example the audio engine could not resume) is shown
            // too; a response failure (loadCurrentIR) and a superseded load have their own message (round 9 repair 1, R9VC-7)
            showAudioMessage(`The sound could not be started (${e && e.name ? e.name : 'Error'}), so nothing is playing. ` +
                'Press Start Audio to try again.');
        }
        setTransport('stopped');
    } finally {
        if (current()) transportState.starting = 0;
    }
}

// [taormina patch M] Stop also cancels a Start in flight, a held restart and a Start queued during a
// navigation; it stops every source and releases every microphone track (audio.stop). The Stop button (its
// click event is the argument) lets the response's reverberation ring out (patch L's ringOut; round 10, as the
// template since 2026-10-29): the buttons show the stopped state at once while the tail decays. A change of the
// source type passes cut = true: a ringing tail fades in 25 ms too.
function handleStop(cut) {
    transportState.want = false;
    transportState.starting = 0;
    audio.stop({ ringOut: cut !== true });
    setTransport('stopped');
}

// --- Main Animation Loop ---

function animate() {
    requestAnimationFrame(animate);

    // [taormina patch M] also while a reverberation left ringing by Stop sounds (patch L's hasRingingTail): it passes
    // through the shared rotator, and Stop has already set isPlaying false (round 10 repair 1, R10VC-5)
    if ((audio.isPlaying || audio.hasRingingTail()) && ui.camera) {
        const obj = ui.camera.object3D;

        // Convert A-Frame Rotation to Degrees
        const x = THREE.MathUtils.radToDeg(obj.rotation.x);
        const y = THREE.MathUtils.radToDeg(obj.rotation.y);
        const z = THREE.MathUtils.radToDeg(obj.rotation.z);

        // Update Ambisonic Rotator
        // [taormina patch F] Measured in the tour's browser check: the stock (-y, x, z) turned the sound
        // field against the picture. three.js yaw is about up (as JSAmbisonics); its pitch is about
        // the right axis and its roll about the back axis, JSAmbisonics' about left and front.
        audio.updateRotation(y, -x, -z);
    }
}

// --- Service Worker Registration ---

function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
        const register = () => {
            navigator.serviceWorker.register('./sw.js').then(registration => {
                console.log('SW registered: ', registration);
            }).catch(registrationError => {
                console.log('SW registration failed: ', registrationError);
            });
        };
        // [taormina patch M] this runs after the asynchronous first-seat load, often after the
        // window 'load' event: register at once then, else once on 'load'
        if (document.readyState === 'complete') register();
        else window.addEventListener('load', register, { once: true });
    }
}

// --- Background Loader ---

class BackgroundLoader {
    constructor(locations) {
        this.locations = locations;
        this.queue = [...locations]; // Copy
        // Remove current location (first one) if strictly needed, but browser cache handles duplicates
        this.total = this.queue.length;
        this.loadedCount = 0;
        this.isRunning = false;

        this.progressBar = document.getElementById('progress-bar');
        this.progressContainer = document.getElementById('progress-container');
    }

    start() {
        if (this.isRunning) return;
        this.isRunning = true;
        console.log("Starting Background Loader...");
        this.processQueue();
    }

    async processQueue() {
        if (this.queue.length === 0) {
            console.log("Background Loading Complete!");
            if (this.progressContainer) {
                setTimeout(() => {
                    this.progressContainer.style.opacity = '0';
                }, 1000);
            }
            this.isRunning = false;
            return;
        }

        const loc = this.queue.shift();

        // Load Image
        await loadImageAsync(loc);

        // Update Progress
        this.loadedCount++;
        this.updateUI();

        // Small delay to yield to main thread/render
        setTimeout(() => this.processQueue(), 50);
    }

    updateUI() {
        if (this.progressBar && this.total > 0) {
            const pct = (this.loadedCount / this.total) * 100;
            this.progressBar.style.width = `${pct}%`;
        }
    }
}
