class AudioEngine {
    constructor() {
        this.ctx = null;
        this.rotator = null;
        this.decoder = null;

        // Nodes
        this.sourceNode = null;
        this.convolverNode = null;
        this.gainNode = null;
        this.dryGainNode = null;
        this.wetGainNode = null;

        // Buffers
        this.currentIrBuffer = null;
        this.currentAudioBuffer = null;

        // State
        this.isPlaying = false;
        this.isWet = true;
        this.micStream = null;

        // Constants (First Order Ambisonics)
        this.order = 1;

        // Cache
        this.irCache = new Map(); // Stores decoded AudioBuffers: url -> AudioBuffer
    }

    // [taormina patch L] A context that does not run ('suspended'; on iOS and other WebKit browsers also 'interrupted', during a
    // call or another app's sound) is asked to run; the promise is not waited for: WebKit keeps a resume() made outside a user
    // gesture pending until the context runs, and a resume() during an interruption settles only when the interruption ends. A
    // source connects only once the context runs (whenRunning), and the Start button's press asks inside its own gesture (prime).
    askToRun(ctx) {
        if (ctx && ctx.state !== 'running' && ctx.state !== 'closed') ctx.resume().catch(() => { });
    }

    // [taormina patch L] Called synchronously by the Start button's press (main.js), before anything is awaited and before any
    // early return of the press: asks a suspended or interrupted AudioContext to run inside the press's user gesture, which is
    // what lets it run on WebKit (Safari, iOS), also when the press falls into a seat change or into the first response's load
    // and the Start itself runs later, outside the press (settleNavigation). The context is normally made by the first response
    // request at page load (loadIR, init), outside any gesture; a press that comes before it makes the context itself, here,
    // and init() then completes the engine with that context (primedCtx). A constructor that throws ends the press's Start
    // with a message (main.js).
    prime() {
        if (!this.ctx && !this.primedCtx) {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            if (AudioContext) this.primedCtx = new AudioContext();
        }
        this.askToRun(this.ctx || this.primedCtx);
    }

    // [taormina patch L] Playback starts only in a running AudioContext. A context made or asked to run in a press runs shortly
    // after it; one that stays suspended or interrupted (WebKit: a resume() made outside a user gesture, or one that never settles;
    // iOS: an interruption) is waited for at most 3 s (the wait ends at once when the context runs, by 'statechange'), then the
    // Start fails with an Error named 'AudioSuspendedError', which main.js shows below the Start/Stop buttons with Start enabled
    // (the next press asks the context to run again, prime). Returns false when the Start is or went stale: a newer Start, Stop, a
    // seat or source change or a failed response ends the wait at once (endStartWaits), and the caller releases what it holds (a
    // microphone stream) in the same task. A true result holds only when it is returned: a Stop, a source change or a newer Start
    // may run before the caller resumes, so each caller checks its own generation again right after its await, before it uses
    // anything.
    async whenRunning(startGen) {
        if (startGen !== this.startGeneration) return false;
        const ctx = this.ctx;
        if (ctx.state !== 'running') {
            if (!this.startWaits) this.startWaits = new Set();
            await new Promise(resolve => {
                const done = () => {
                    ctx.removeEventListener('statechange', onState);
                    clearTimeout(timer);
                    this.startWaits.delete(done);
                    resolve();
                };
                const onState = () => { if (ctx.state === 'running') done(); };
                ctx.addEventListener('statechange', onState);
                const timer = setTimeout(done, 3000);
                this.startWaits.add(done);
            });
        }
        if (startGen !== this.startGeneration) return false;
        if (ctx.state === 'running') return true;
        const err = new Error('The browser has not let the sound start yet. Press Start Audio to play.');
        err.name = 'AudioSuspendedError';
        throw err;
    }

    // [taormina patch L] ends every readiness wait at once (beginStart, cancelStart: each makes every waiting Start stale), so
    // each waiting Start returns false and releases what it holds
    endStartWaits() {
        if (this.startWaits) [...this.startWaits].forEach(done => done());
    }

    // [taormina patch L] with an engine, a context that does not run is asked to run and not waited for (askToRun): no call
    // waits for a resume() that the browser may keep pending; playback waits, bounded, in whenRunning()
    async init() {
        if (this.ctx) {
            this.askToRun(this.ctx);
            return;
        }

        console.log('🎵 Initializing Audio Engine...');

        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!AudioContext) {
            console.error('❌ Web Audio API not supported in this browser!');
            alert('Your browser does not support Web Audio API. Please use a modern browser.');
            return;
        }

        // [taormina patch L] the context that a Start's press made before the engine existed (prime), if any: that press has
        // already asked it to run inside its user gesture
        this.ctx = this.primedCtx || new AudioContext();
        this.primedCtx = null;
        console.log(`🔊 AudioContext created. State: ${this.ctx.state}`);

        // Initialize JSAmbisonics
        if (typeof ambisonics === 'undefined') {
            console.log("⏳ loading JSAmbisonics dynamically...");
            try {
                await this.loadScript('./JSAmbisonics/ambisonics.umd.js');
            } catch (e) {
                console.error("❌ Failed to load JSAmbisonics:", e);
                alert('Audio library failed to load. Please check internet connection or file paths.');
                return;
            }
        }

        try {
            this.rotator = new ambisonics.sceneRotator(this.ctx, this.order);
            this.decoder = new ambisonics.binDecoder(this.ctx, this.order);
            console.log('✅ JSAmbisonics initialized (Order:', this.order, ')');
        } catch (e) {
            console.error('❌ Failed to initialize JSAmbisonics:', e);
            alert('Audio processing initialization failed. Please refresh.');
            return;
        }

        // Output Gain
        this.gainNode = this.ctx.createGain();
        this.gainNode.gain.value = 1.0;
        this.gainNode.connect(this.ctx.destination);

        // Dry/Wet path setup
        this.dryGainNode = this.ctx.createGain();
        this.wetGainNode = this.ctx.createGain();

        // [taormina patch L] The shared dry and wet gains stay at 1: Ambisonic Mode is applied by each source's own mode
        // gains, made at the requested state before the source connects (connectSourceGraph), so the first wet Start plays
        // no unconvolved sound (a ramp from a new GainNode's value 1 once let it through) and a switch never reaches a
        // source that still fades or rings out
        this.wetGainNode.gain.value = 1;
        this.dryGainNode.gain.value = 1;

        // Connect Wet Path End
        // Rotator -> Decoder -> WetGain -> MasterGain
        this.rotator.out.connect(this.decoder.in);
        this.decoder.out.connect(this.wetGainNode);
        this.wetGainNode.connect(this.gainNode);

        // Dry path connects directly to master (mono/stereo)
        this.dryGainNode.connect(this.gainNode);

        console.log("✅ Audio Engine Initialized Successfully");
    }

    setDryWet(wet) {
        this.isWet = wet;
        this.updateDryWet();
    }

    // [taormina patch L] A switch acts on the playing source's own mode gains only (connectSourceGraph; the template does the
    // same since its own per-source mode gains): a source that still fades, or whose reverberation rings out after Stop (a
    // release, see stopSource), keeps its own, so the switch never steps, cuts or reshapes it. With no source nothing is
    // set; the next source starts at the requested state.
    updateDryWet() {
        if (!this.ctx || !this.voiceWetMode || !this.voiceDryMode) return;
        const rampTime = 0.1;
        const t = this.ctx.currentTime;
        const g = this.dryWetTargets();

        // [taormina patch L] smoothed only while the source plays in a running context; otherwise nothing of it is audible
        // and the requested state is set at once (an idle GainNode does not advance a ramp)
        if (this.ctx.state !== 'running' || !this.isPlaying) {
            this.setDryWetNow(g);
            return;
        }
        this.voiceWetMode.gain.setTargetAtTime(g.wet, t, rampTime);
        this.voiceDryMode.gain.setTargetAtTime(g.dry, t, rampTime);
    }

    // [taormina patch L] set the playing source's mode gains to the requested state at once, dropping any scheduled ramp
    setDryWetNow(g) {
        [[this.voiceWetMode, g.wet], [this.voiceDryMode, g.dry]].forEach(([node, v]) => {
            node.gain.cancelScheduledValues(0);
            node.gain.value = v;
        });
    }

    // [taormina patch J, L] requested gains: Ambisonic Mode on = wet 1, dry 0; off = wet 0, dry at the
    // tour's fixed dry gain (config.audio.dryGain, patch J)
    dryWetTargets() {
        const a = window.config && window.config.audio;
        const dryLevel = a && Number.isFinite(Number(a.dryGain)) && Number(a.dryGain) > 0 ? Number(a.dryGain) : 1.0;
        return this.isWet ? { wet: 1.0, dry: 0.0 } : { wet: 0.0, dry: dryLevel };
    }

    setVolume(value) {
        if (!this.gainNode) return;
        // value is 0-100, convert to 0-1
        const gain = value / 100;
        const rampTime = 0.05;
        const t = this.ctx.currentTime;
        this.gainNode.gain.setTargetAtTime(gain, t, rampTime);
    }

    // [taormina patch J] Scale a decoded IR by (IR file rate / buffer rate): the browser resamples the
    // IR to the context rate, and the convolution sum would otherwise grow with that rate.
    normaliseIrRate(buffer) {
        const a = window.config && window.config.audio;
        const native = a ? Number(a.irSampleRate) : NaN;
        if (!Number.isFinite(native) || native <= 0 || buffer.sampleRate === native) return buffer;
        const k = native / buffer.sampleRate;
        for (let c = 0; c < buffer.numberOfChannels; c++) {
            const d = buffer.getChannelData(c);
            for (let i = 0; i < d.length; i++) d[i] *= k;
        }
        buffer.__rateScale = k;
        return buffer;
    }

    // [taormina patch L] Every call is a new request (generation number). Only the newest request may
    // set the buffer and rotation: an older, slower completion is discarded (its decoded buffer stays
    // cached for its own URL). Returns true when applied, false when a newer request superseded it.
    // A failed or missing load of the newest request throws (see failIR): the previous seat's
    // response is never kept under the new label.
    async loadIR(url, rotationDegrees) {
        const gen = this.irGeneration = (this.irGeneration || 0) + 1;
        // [taormina patch L] a rejected initialisation fails this request only while it is the newest: an obsolete
        // request's rejection changes nothing, as after its other waits
        if (!this.ctx) await this.init().catch((e) => { if (gen === this.irGeneration) throw e; });
        if (gen !== this.irGeneration) return false;
        if (!url) return this.failIR(url, new Error('no impulse response for this seat and source'));

        let buffer = this.irCache.get(url);
        if (!buffer) {
            console.log(`📥 Loading IR: ${url}`);
            try {
                const response = await fetch(url);
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}${response.statusText ? ' ' + response.statusText : ''}`);
                }
                const arrayBuffer = await response.arrayBuffer();
                buffer = this.normaliseIrRate(await this.ctx.decodeAudioData(arrayBuffer)); // [taormina patch J]
                this.irCache.set(url, buffer);
            } catch (e) {
                if (gen !== this.irGeneration) return false; // an obsolete failure changes nothing
                return this.failIR(url, e);
            }
            if (gen !== this.irGeneration) {
                console.log(`↩️ IR discarded, a newer request superseded it: ${url.split('/').pop()}`);
                return false;
            }
        }

        this.currentIrBuffer = buffer;
        this.currentIrUrl = url;
        this.irRotationOffset = rotationDegrees || 0;
        this.irAppliedGeneration = gen;

        // If already playing, we need to update the convolver
        if (this.isPlaying && this.sourceNode) {
            this.setupConvolver();
        }
        console.log(`✅ IR ready: ${url.split('/').pop()}`);
        return true;
    }

    // [taormina patch L] A failed IR load: stop playback (stop(): a Start in flight is cancelled and never
    // connects; what sounds ends within stopSource's release), drop the previous response and its rotation,
    // and throw an error that names the file (main.js shows a message near the controls).
    failIR(url, cause) {
        this.stop();
        this.currentIrBuffer = null;
        this.currentIrUrl = null;
        this.irRotationOffset = 0;
        const name = url ? String(url).split('/').pop() : '(none)';
        const why = cause && cause.message ? cause.message : String(cause);
        console.error(`❌ Failed to load IR ${name}:`, cause);
        const err = new Error(`Impulse response not loaded: ${name} (${why})`);
        err.name = 'IrLoadError';
        err.irUrl = url || null;
        throw err;
    }

    // [taormina patch L] Start request generation. playSample, playFile and startMic each begin one;
    // stop() and a failed response cancel it. A Start whose generation is no longer the newest is
    // stale: it never connects its source. Both end every readiness wait at once (endStartWaits), so a
    // stale Start waiting for a running context releases what it holds without waiting.
    beginStart() {
        this.startGeneration = (this.startGeneration || 0) + 1;
        this.endStartWaits();
        return this.startGeneration;
    }

    cancelStart() {
        this.startGeneration = (this.startGeneration || 0) + 1;
        this.endStartWaits();
    }

    // [taormina patch L] a source connects only with the response of the newest IR request
    irReadyForStart() {
        const ok = !!this.currentIrBuffer && this.irAppliedGeneration === this.irGeneration;
        if (!ok) console.warn('⚠️ Start not connected: the response of the current seat and source is not loaded');
        return ok;
    }

    // [taormina patch L] connect and start a loaded buffer; an error of the audio graph disconnects the source
    // (stopSource) and throws an Error named 'AudioGraphError' (sampleName, cause) for main.js to show: it is not
    // a sound that could not be loaded (the microphone's graph error is patch J's MicStartError 'audio-graph')
    playOrGraphError(buffer, name) {
        try {
            this.playBuffer(buffer);
        } catch (e) {
            console.error(`❌ Sound could not be connected: ${name}`, e);
            this.stopSource();
            const err = new Error(`Audio graph failed: ${name} (${e && e.name ? e.name : 'Error'}${e && e.message ? ': ' + e.message : ''})`);
            err.name = 'AudioGraphError';
            err.sampleName = name;
            err.cause = e;
            throw err;
        }
    }

    async preloadIR(url) {
        if (!this.ctx) await this.init();
        if (!url || this.irCache.has(url)) return;

        try {
            // console.log(`🔄 Preloading IR: ${url}`);
            const response = await fetch(url);
            if (response.ok) {
                const arrayBuffer = await response.arrayBuffer();
                const decodedBuffer = this.normaliseIrRate(await this.ctx.decodeAudioData(arrayBuffer)); // [taormina patch J]
                this.irCache.set(url, decodedBuffer);
            }
        } catch (e) {
            // Silent fail for preload
        }
    }

    // [taormina patch K] per-sample playback gain (config.audio.samples[].gainDb, in dB), applied once
    // to the decoded sample, so the wet and the dry path carry the same gain.
    applySampleGain(url, buffer) {
        const a = window.config && window.config.audio;
        const name = String(url).split('/').pop();
        const s = a && Array.isArray(a.samples) ? a.samples.find((x) => x && x.filename === name) : null;
        const g = s ? Number(s.gainDb) : NaN;
        if (!Number.isFinite(g) || g === 0) return buffer;
        const k = Math.pow(10, g / 20);
        for (let c = 0; c < buffer.numberOfChannels; c++) {
            const d = buffer.getChannelData(c);
            for (let i = 0; i < d.length; i++) d[i] *= k;
        }
        buffer.__sampleGain = k;
        return buffer;
    }

    async playSample(url) {
        // [taormina patch L] this Start's own generation (beginStart): after every wait it is checked,
        // and a stale Start (a newer Start, Stop, a seat or source change, a failed response) returns
        // false without touching the playing source or connecting its own. Returns true once playing.
        const startGen = this.beginStart();
        if (!this.ctx) await this.init();
        if (startGen !== this.startGeneration) return false;

        // [taormina patch L] a context that does not run is asked to run, not waited for: the source connects only once it
        // runs (whenRunning, below), never after a resume() that the browser keeps pending (WebKit, outside a user gesture)
        this.askToRun(this.ctx);
        let loaded = null; // this Start's sample once loaded; named currentAudioBuffer only when it is about to play

        this.stopSource(); // Stop previous source

        console.log(`🎵 Playing sample: ${url}`);

        try {
            // [taormina patch J] decoded samples are cached per URL; the first decode of a URL stays the cached one, and a
            // Start whose own decode ends after another decode of that URL was cached uses the cached buffer
            if (!this.sampleCache) this.sampleCache = new Map();
            let buffer = this.sampleCache.get(url);
            if (!buffer) {
                const response = await fetch(url);
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                }
                const arrayBuffer = await response.arrayBuffer();
                buffer = this.applySampleGain(url, await this.ctx.decodeAudioData(arrayBuffer)); // [taormina patch K]
                if (!this.sampleCache.has(url)) this.sampleCache.set(url, buffer);
                buffer = this.sampleCache.get(url);
            }

            // [taormina patch L] the sample may have arrived after the Start went stale: never connect it, and
            // leave currentAudioBuffer naming the sample that plays
            if (startGen !== this.startGeneration) {
                console.log(`↩️ Start superseded, sample not connected: ${url.split('/').pop()}`);
                return false;
            }
            if (!this.irReadyForStart()) return false;
            loaded = buffer;
        } catch (e) {
            // [taormina patch L] no alert(): a stale Start's failure changes nothing; otherwise main.js
            // (patch M) shows the cause below the Start/Stop buttons
            if (startGen !== this.startGeneration) return false;
            console.error(`❌ Failed to play sample from ${url}:`, e);
            const err = new Error(`Sample not loaded: ${url.split('/').pop()} (${e && e.message ? e.message : e})`);
            err.name = 'SampleLoadError';
            err.sampleName = url.split('/').pop();
            throw err;
        }
        // [taormina patch L] playback is due: only in a running context (whenRunning, at most 3 s), never after a resume()
        // that only a user gesture could complete. The generation is checked again right after the wait (also when it
        // rejects): a Stop, a seat or source change or a newer Start that ran meanwhile makes this Start stale, and its
        // buffer is never connected or named
        let running;
        try {
            running = await this.whenRunning(startGen);
        } catch (e) {
            if (startGen !== this.startGeneration) return false; // stale: no message
            throw e;
        }
        if (!running || startGen !== this.startGeneration || !this.irReadyForStart()) return false;
        this.currentAudioBuffer = loaded;
        // [taormina patch L] the sample is loaded; its audio graph is connected after the load, and an error
        // there is reported as what it is
        this.playOrGraphError(this.currentAudioBuffer, url.split('/').pop());
        console.log(`✅ Sample playing: ${url.split('/').pop()}`);
        return true;
    }

    // [taormina patch L] an uploaded file: same Start generation rule as playSample; resolves true once
    // the source plays, false when the Start went stale; a file that cannot be read or decoded throws
    // 'SampleLoadError' (no alert)
    async playFile(fileBlob) {
        const startGen = this.beginStart();
        if (!this.ctx) await this.init();
        if (startGen !== this.startGeneration) return false;
        this.askToRun(this.ctx); // [taormina patch L] asked, not waited for (see playSample)
        this.stopSource();

        let buffer;
        try {
            buffer = await this.ctx.decodeAudioData(await fileBlob.arrayBuffer());
        } catch (e) {
            if (startGen !== this.startGeneration) return false;
            const name = fileBlob && fileBlob.name ? fileBlob.name : 'file';
            const err = new Error(`File not decoded: ${name} (${e && e.message ? e.message : e})`);
            err.name = 'SampleLoadError';
            err.sampleName = name;
            throw err;
        }
        if (startGen !== this.startGeneration || !this.irReadyForStart()) return false;
        // [taormina patch L] and again right after the wait for a running context, as in playSample
        let running;
        try {
            running = await this.whenRunning(startGen);
        } catch (e) {
            if (startGen !== this.startGeneration) return false; // stale: no message
            throw e;
        }
        if (!running || startGen !== this.startGeneration || !this.irReadyForStart()) return false;
        this.currentAudioBuffer = buffer;
        // [taormina patch L] an error of the audio graph is reported as such
        this.playOrGraphError(this.currentAudioBuffer, fileBlob && fileBlob.name ? fileBlob.name : 'file');
        return true;
    }

    async startMic() {
        const startGen = this.beginStart(); // [taormina patch L] see playSample
        if (!this.ctx) await this.init();
        if (startGen !== this.startGeneration) return false;
        this.askToRun(this.ctx); // [taormina patch L] asked, not waited for (see playSample)
        this.stopSource();

        console.log('🎤 Requesting microphone access...');

        // [taormina patch J] only the microphone request fails as a microphone error (named by its cause); the
        // audio graph is connected after it, and a graph error releases the stream and is reported as what it is.
        // Both throw 'MicStartError' (reason, cause) for main.js to show below the Start/Stop buttons and to reset
        // the Start button (no alert() dialog)
        let stream;
        try {
            stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        } catch (e) {
            if (startGen !== this.startGeneration) return false; // [taormina patch L] stale: no message
            const noDevice = e && (e.name === 'NotFoundError' || e.name === 'OverconstrainedError');
            const refused = e && (e.name === 'NotAllowedError' || e.name === 'SecurityError');
            console.error(noDevice ? "❌ No microphone found:" : refused ? "❌ Microphone access denied:"
                : "❌ Microphone not available:", e);
            const err = new Error(`Microphone not started: ${e && e.name ? e.name : 'Error'}${e && e.message ? ` (${e.message})` : ''}`);
            err.name = 'MicStartError';
            err.reason = noDevice ? 'no-device' : refused ? 'refused' : 'unavailable';
            err.cause = e;
            throw err;
        }
        // [taormina patch L] a Start that went stale while access was asked for: release this
        // stream at once and never connect it (no orphan microphone stream)
        if (startGen !== this.startGeneration || !this.irReadyForStart()) {
            stream.getTracks().forEach(track => track.stop());
            return false;
        }
        // [taormina patch L] then the stream waits for a running context (whenRunning, at most 3 s). It stays this Start's
        // own: a newer Start, Stop or a seat or source change ends the wait at once and the stream is released in the same
        // task, as when the context does not run within the bound; it is never connected then. The generation is checked
        // again right after the wait, before the stream is used
        let running;
        try {
            running = await this.whenRunning(startGen);
        } catch (e) {
            stream.getTracks().forEach(track => track.stop());
            if (startGen !== this.startGeneration) return false; // stale: no message
            throw e;
        }
        if (!running || startGen !== this.startGeneration || !this.irReadyForStart()) {
            stream.getTracks().forEach(track => track.stop());
            return false;
        }
        try {
            this.micStream = stream;
            this.sourceNode = this.ctx.createMediaStreamSource(stream);

            this.connectSourceGraph();
            this.isPlaying = true;
            console.log("✅ Microphone started");
            return true;
        } catch (e) {
            // [taormina patch J] access was granted but the sound could not be connected: stop every track of the
            // stream and disconnect the source (stopSource: sourceNode and micStream null, isPlaying false)
            console.error("❌ Microphone sound could not be connected:", e);
            stream.getTracks().forEach(track => track.stop());
            this.stopSource();
            const err = new Error(`Microphone audio graph failed: ${e && e.name ? e.name : 'Error'}${e && e.message ? ` (${e.message})` : ''}`);
            err.name = 'MicStartError';
            err.reason = 'audio-graph';
            err.cause = e;
            throw err;
        }
    }

    playBuffer(buffer) {
        if (!buffer) {
            console.error('❌ Cannot play: buffer is null');
            return;
        }

        this.sourceNode = this.ctx.createBufferSource();
        this.sourceNode.buffer = buffer;
        this.sourceNode.loop = true;

        this.connectSourceGraph();

        this.sourceNode.start();
        this.isPlaying = true;
        console.log(`▶️ Playback started (Duration: ${buffer.duration.toFixed(2)}s, Channels: ${buffer.numberOfChannels})`);
    }

    connectSourceGraph() {
        // Disconnect old nodes if any
        if (this.convolverNode) {
            this.convolverNode.disconnect();
            this.convolverNode = null;
        }

        // [taormina patch L] this source's own gains, in front of the shared dry and wet gains: per path a mode gain, made at
        // the requested state (a ramp left from an earlier switch or source cannot shape its first frames; a switch ramps
        // only the playing source's, updateDryWet), then a release gain, which stopSource fades. A source that starts, or a
        // switch made, while an earlier source still fades or rings out leaves that source's gains alone: its release is not
        // stepped, cut or restored
        [this.voiceDryMode, this.voiceWetMode, this.voiceDry, this.voiceWet].forEach(node => { if (node) node.disconnect(); });
        const g = this.dryWetTargets();
        this.voiceDryMode = this.ctx.createGain();
        this.voiceWetMode = this.ctx.createGain();
        this.voiceDryMode.gain.value = g.dry;
        this.voiceWetMode.gain.value = g.wet;
        this.voiceDry = this.ctx.createGain();
        this.voiceWet = this.ctx.createGain();
        this.voiceDryMode.connect(this.voiceDry);
        this.voiceWetMode.connect(this.voiceWet);
        this.voiceDry.connect(this.dryGainNode);
        this.voiceWet.connect(this.rotator.in);

        // Create Convolver for Wet Path
        this.setupConvolver();

        // Connect Source
        // 1. To Convolver (Wet Path)
        // 2. To Dry Gain (Dry Path), through this source's own dry gains

        this.sourceNode.connect(this.convolverNode);
        this.sourceNode.connect(this.voiceDryMode);
    }

    setupConvolver() {
        if (!this.currentIrBuffer) {
            console.warn('⚠️ No IR buffer loaded, cannot setup convolver');
            return;
        }

        // Re-create convolver node as buffer is immutable usually or just good practice
        if (this.convolverNode) {
            this.convolverNode.disconnect();
        }

        // [taormina patch E] One mono ConvolverNode per ambisonic channel, merged back to N channels.
        // A single ConvolverNode with a 4-channel buffer is Web Audio "true stereo" (2-channel output),
        // which does not carry an ambisonic field.
        if (this.foaConvolvers) {
            this.foaConvolvers.forEach(c => c.disconnect());
            this.foaConvolvers = null;
        }
        if (this.foaOut) {
            this.foaOut.disconnect();
            this.foaOut = null;
        }
        const ir = this.currentIrBuffer;
        const nCh = ir.numberOfChannels;
        this.convolverNode = this.ctx.createGain();
        this.convolverNode.channelCount = 1;
        this.convolverNode.channelCountMode = 'explicit';
        this.convolverNode.channelInterpretation = 'speakers';
        this.foaOut = this.ctx.createChannelMerger(nCh);
        this.foaConvolvers = [];
        for (let c = 0; c < nCh; c++) {
            const mono = this.ctx.createBuffer(1, ir.length, ir.sampleRate);
            mono.getChannelData(0).set(ir.getChannelData(c));
            const conv = this.ctx.createConvolver();
            conv.normalize = false;
            conv.buffer = mono;
            this.convolverNode.connect(conv);
            conv.connect(this.foaOut, 0, c);
            this.foaConvolvers.push(conv);
        }

        // Connect to Rotator (Input of Wet Chain), through the playing source's own wet gains
        // ([taormina patch L] connectSourceGraph)
        this.foaOut.connect(this.voiceWetMode || this.rotator.in);
        if (this.sourceNode) {
            this.sourceNode.connect(this.convolverNode);
        }
        console.log(`🔊 Convolver setup complete (IR channels: ${this.currentIrBuffer.numberOfChannels})`);
    }

    // [taormina patch L] The end of what sounds: stop() (Stop, a seat or source change's hold, a failed response or picture, a
    // failed Start) and every new source (stopSource) release
    // the source. Its own dry and wet release gains (connectSourceGraph) fall to 0 in a 25 ms linear ramp and a buffer source
    // stops at the end of the ramp; once the AudioContext has rendered the ramp (its clock, not a wall-clock delay) a
    // microphone's tracks are stopped, and the source, its convolvers and its gains are disconnected (finishRelease), so no
    // old tail can sound later; the next source builds new convolvers. The engine reads as stopped at once (no source, no
    // stream, isPlaying false). With ringOut (the visitor's Stop only; as the template since its commit 8d6301a594 of
    // 2026-10-29) only the dry path and the convolvers' input fade: the reverberation already in the four convolvers
    // rings out for the response's length, as it would in the room, and the release ends after it; the microphone is still
    // released at the end of the input fade. A later stop() without ringOut fades such a tail in 25 ms (cutRingingTails); a
    // new source leaves it ringing.
    stopSource({ ringOut = false } = {}) {
        const source = this.sourceNode;
        const input = this.convolverNode;
        const ringing = ringOut && !!input && !!this.voiceWet && !!this.foaConvolvers && this.foaConvolvers.length > 0;
        const tail = ringing ? this.foaConvolvers[0].buffer.duration : 0; // seconds: the response's length
        const fade = (ringing ? [this.voiceDry, input] : [this.voiceDry, this.voiceWet]).filter(Boolean);
        const release = {
            nodes: [source, this.convolverNode, this.foaOut, ...(this.foaConvolvers || []), this.voiceDryMode, this.voiceWetMode,
                this.voiceDry, this.voiceWet].filter(Boolean),
            stream: this.micStream,
            wet: ringing ? this.voiceWet : null // the release gain of a tail that rings out (cutRingingTails)
        };
        this.sourceNode = null;
        this.convolverNode = null;
        this.foaOut = null;
        this.foaConvolvers = null;
        this.voiceDryMode = null;
        this.voiceWetMode = null;
        this.voiceDry = null;
        this.voiceWet = null;
        this.micStream = null;
        this.isPlaying = false;
        if (!release.nodes.length && !release.stream) return;
        if (!this.releases) this.releases = new Set();
        this.releases.add(release);
        const ctx = this.ctx;
        if (!ctx || ctx.state !== 'running' || !fade.length) {
            this.finishRelease(release); // nothing is rendered, or nothing to fade: at once
            return;
        }
        const t = ctx.currentTime;
        const end = release.end = t + 0.025; // seconds: the end of the fade (with ringOut, of the input fade)
        release.endAt = end + tail; // the end of the release: the fade and, with ringOut, the tail
        fade.forEach(node => {
            node.gain.cancelScheduledValues(t);
            node.gain.setValueAtTime(node.gain.value, t);
            node.gain.linearRampToValueAtTime(0, end);
        });
        if (source && source.stop) {
            try {
                source.stop(end);
            } catch (e) { } // ignore if already stopped or never started
        }
        // The release ends by the context's clock: an output that renders in long periods renders the ramp (and a tail)
        // later. A microphone's tracks stop once the fade is rendered. It all ends at once when the context stops running,
        // and after at most 1 s past the tail in any case.
        const quantum = 128 / ctx.sampleRate;
        const until = Date.now() + 1000 * (1 + tail);
        release.check = () => {
            const off = ctx.state !== 'running';
            if (release.stream && (off || ctx.currentTime >= end + quantum)) {
                release.stream.getTracks().forEach(track => track.stop());
                release.stream = null;
                console.log("Mic stream stopped");
            }
            if (off || ctx.currentTime >= release.endAt + quantum || Date.now() > until) this.finishRelease(release);
            else release.timer = setTimeout(release.check, release.stream ? 10
                : Math.min(100, Math.max(10, (release.endAt + quantum - ctx.currentTime) * 1000)));
        };
        release.timer = setTimeout(release.check, 30);
    }

    // [taormina patch L] a reverberation tail left ringing by Stop fades in 25 ms and its release then ends (as the template's
    // commit 8d6301a594): stop() without ringOut calls it, so no tail sounds under another seat or source, after a
    // failure or after a message that says nothing is playing. Returns the number of tails faded.
    cutRingingTails() {
        if (!this.releases || !this.ctx) return 0;
        const t = this.ctx.currentTime;
        let n = 0;
        this.releases.forEach(release => {
            if (!release.wet) return;
            release.wet.gain.cancelScheduledValues(t);
            release.wet.gain.setValueAtTime(release.wet.gain.value, t);
            release.wet.gain.linearRampToValueAtTime(0, t + 0.025);
            release.wet = null;
            release.endAt = Math.min(release.endAt, t + 0.025);
            clearTimeout(release.timer);
            release.timer = setTimeout(release.check, 30);
            n++;
        });
        return n;
    }

    // [taormina patch L] true while a reverberation tail left ringing by Stop still sounds (not cut and not ended): it
    // passes through the shared rotator, so main.js keeps turning the sound field with the view
    hasRingingTail() {
        if (!this.releases) return false;
        for (const release of this.releases) {
            if (release.wet) return true;
        }
        return false;
    }

    // [taormina patch L] the end of a release: the stopped source, its convolvers and its gains are disconnected,
    // their tail with them, and a microphone's tracks are stopped if the release has not stopped them yet
    finishRelease(release) {
        if (!this.releases || !this.releases.delete(release)) return;
        clearTimeout(release.timer);
        release.nodes.forEach(node => {
            try {
                node.disconnect();
            } catch (e) { } // ignore a node that is already disconnected
        });
        if (release.stream) {
            release.stream.getTracks().forEach(track => track.stop());
            release.stream = null;
            console.log("Mic stream stopped");
        }
    }

    // [taormina patch L] ringOut: the visitor's Stop (see stopSource); without it every tail still ringing fades first
    stop({ ringOut = false } = {}) {
        this.cancelStart(); // [taormina patch L] a Start in flight is cancelled too: its source never connects
        if (!ringOut) this.cutRingingTails(); // [taormina patch L] a tail left ringing by Stop fades too
        this.stopSource({ ringOut });
    }

    loadScript(src) {
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = src;
            script.onload = () => {
                console.log(`✅ Script loaded: ${src}`);
                resolve();
            };
            script.onerror = () => reject(new Error(`Script load error: ${src}`));
            document.head.appendChild(script);
        });
    }

    updateRotation(yawDeg, pitchDeg, rollDeg) {
        if (!this.rotator) return;

        // Check if we need to apply the IR static offset
        // Assuming IR rotation offset means the IR was recorded at that angle, 
        // effectively rotating the sound field.
        // To correct it (align with North), we might need to subtract it or add it.
        // For now, let's just pass the camera rotation.

        // JSAmbisonics expects Yaw, Pitch, Roll in degrees.
        // Apply the static IR rotation offset (from CSV) to the dynamic camera yaw.
        this.rotator.yaw = yawDeg + (this.irRotationOffset || 0);
        this.rotator.pitch = pitchDeg;
        this.rotator.roll = rollDeg;
        this.rotator.updateRotMtx();
    }
}

window.AudioEngine = AudioEngine;
