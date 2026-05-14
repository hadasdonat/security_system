// ==========================================
// CAMERA HANDLER
// ==========================================
class CameraHandler {
    constructor(videoElement) {
        this.videoElement = videoElement;
        this.currentStream = null;
        this.currentObjectURL = null;
    }

    async startWebcam() {
        this.stop();
        // getUserMedia requires HTTPS or localhost. If running via file:// it might fail.
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        this.currentStream = stream;
        this.videoElement.srcObject = stream;
        this.videoElement.muted = true;
        await this.videoElement.play();
    }

    loadFile(file) {
        this.stop();
        const url = URL.createObjectURL(file);
        this.currentObjectURL = url;
        this.videoElement.srcObject = null;
        this.videoElement.src = url;
        this.videoElement.muted = true;
        this.videoElement.loop = true;
        this.videoElement.play();
    }

    loadURL(url) {
        this.stop();
        this.videoElement.srcObject = null;
        this.videoElement.src = url;
        this.videoElement.muted = true;
        this.videoElement.loop = true;
        this.videoElement.crossOrigin = 'anonymous';
        this.videoElement.play();
    }

    stop() {
        if (this.currentStream) {
            this.currentStream.getTracks().forEach(t => t.stop());
            this.currentStream = null;
        }
        if (this.currentObjectURL) {
            URL.revokeObjectURL(this.currentObjectURL);
            this.currentObjectURL = null;
        }
        this.videoElement.srcObject = null;
        this.videoElement.src = '';
        this.videoElement.load();
    }
}

// ==========================================
// FRAMES
// ==========================================
const canvas = document.createElement('canvas');
canvas.width = 640;
canvas.height = 480;
const ctx = canvas.getContext('2d');

function capture(videoElement) {
    if (!videoElement.videoWidth) return null;
    ctx.drawImage(videoElement, 0, 0, 640, 480);
    const dataURL = canvas.toDataURL('image/jpeg', 0.7);
    return dataURL.split(',')[1];
}

// ==========================================
// OLLAMA
// ==========================================
const BASE = 'http://localhost:11434';
const MODEL = 'moondream';

async function checkConnection() {
    try {
        const res = await fetch(`${BASE}/api/tags`);
        if (!res.ok) return { ok: false, error: 'Ollama responded with an error' };
        const data = await res.json();
        const hasModel = data.models?.some(m => m.name.startsWith('moondream'));
        return {
            ok: true,
            hasModel,
            models: data.models?.map(m => m.name) || []
        };
    } catch {
        return { ok: false, error: 'Cannot reach Ollama at localhost:11434' };
    }
}

async function describe(base64Image, prompt, onChunk) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort('Inference took too long (>120s)'), 120000);

    onChunk("DEBUG: Fetching...", "DEBUG: Fetching...");

    try {
        const res = await fetch(`${BASE}/api/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: MODEL,
                messages: [{
                    role: 'user',
                    content: prompt,
                    images: [base64Image]
                }],
                stream: false
            }),
            signal: controller.signal
        });

        onChunk("DEBUG: Fetched HTTP " + res.status, "DEBUG: Fetched HTTP " + res.status);

        if (!res.ok) {
            const text = await res.text();
            throw new Error(`Ollama HTTP Error (${res.status}): ${text}`);
        }

        const data = await res.json();
        
        if (data.error) {
            throw new Error("Ollama JSON Error: " + data.error);
        }

        const text = data.response || data.message?.content || '';
        if (text) {
            onChunk(text, text);
        } else {
            onChunk("Model returned no text. (No detection)", "Model returned no text. (No detection)");
        }
        
        return text;
    } catch (err) {
        onChunk(`DEBUG EXCEPTION: ${err.message}`, `DEBUG EXCEPTION: ${err.message}`);
        throw err;
    } finally {
        clearTimeout(timeout);
    }
}

// ==========================================
// MAIN APP LOGIC
// ==========================================

const globalConnectionStatus = document.getElementById('global-connection-status');
const globalStatusText = document.getElementById('global-status-text');

let ollamaReady = false;

// Notification Setup
const notifBanner = document.getElementById('notification-permission-banner');
const enableNotifBtn = document.getElementById('enable-notifications-btn');

if ('Notification' in window && Notification.permission === 'default') {
    notifBanner.classList.remove('hidden');
}

if (enableNotifBtn) {
    enableNotifBtn.addEventListener('click', () => {
        Notification.requestPermission().then(perm => {
            if (perm === 'granted') {
                notifBanner.classList.add('hidden');
            }
        });
    });
}

async function initOllama() {
    if (!globalConnectionStatus) return; // safety
    globalConnectionStatus.className = 'status checking';
    globalStatusText.textContent = 'INITIALIZING VLM...';

    const result = await checkConnection();

    if (!result.ok) {
        globalConnectionStatus.className = 'status disconnected';
        globalStatusText.textContent = 'VLM OFFLINE';
        return;
    }
    if (!result.hasModel) {
        globalConnectionStatus.className = 'status disconnected';
        globalStatusText.textContent = 'MODEL MISSING (run: ollama pull moondream)';
        return;
    }
    globalConnectionStatus.className = 'status connected';
    globalStatusText.textContent = 'VLM ONLINE';
    ollamaReady = true;
    
    // Enable all start buttons if streams are ready
    if (window.streams) {
        window.streams.forEach(stream => stream.updateButtons());
    }
}

// Setup Streams
class StreamController {
    constructor(panelId) {
        this.panel = document.getElementById(panelId);
        this.video = this.panel.querySelector('.video');
        this.camera = new CameraHandler(this.video);
        
        // UI Elements
        this.tabs = this.panel.querySelectorAll('.tab');
        this.fileInputArea = this.panel.querySelector('.file-input-area');
        this.urlInputArea = this.panel.querySelector('.url-input-area');
        this.videoFile = this.panel.querySelector('.video-file');
        this.videoUrl = this.panel.querySelector('.video-url');
        this.loadUrlBtn = this.panel.querySelector('.load-url-btn');
        
        this.promptInput = this.panel.querySelector('.prompt-input');
        this.startBtn = this.panel.querySelector('.start-btn');
        this.stopBtn = this.panel.querySelector('.stop-btn');
        this.processText = this.panel.querySelector('.process-text');
        this.processStatus = this.panel.querySelector('.process-status');
        this.responseHistory = this.panel.querySelector('.response-history');
        this.clearHistoryBtn = this.panel.querySelector('.clear-history-btn');
        
        // Timestamp Element
        this.tsElement = this.panel.querySelector('.timestamp');
        setInterval(() => this.updateTimestamp(), 1000);
        
        this.currentMode = 'webcam';
        this.intervalId = null;
        this.processing = false;
        this.captureInterval = 3000;
        
        // Video recording buffers
        this.mediaRecorder = null;
        this.preBuffer = []; 
        this.postBuffer = [];
        this.recordingThreat = false;
        
        // Setup a persistent canvas for recording to avoid loop freezing and add text
        this.recordingCanvas = document.createElement('canvas');
        this.recordingCanvas.width = 640;
        this.recordingCanvas.height = 480;
        this.recordingCtx = this.recordingCanvas.getContext('2d');
        this.camTitle = this.panel.querySelector('.cam-title').textContent.split('//')[0].trim();
        
        let lastDraw = 0;
        const drawLoop = (timestamp) => {
            if (!timestamp) timestamp = performance.now();
            
            // Limit to ~30 FPS to save CPU, but use rAF for smoothness
            if (timestamp - lastDraw >= 33) {
                lastDraw = timestamp;
                if (this.video && !this.video.paused && !this.video.ended && this.video.videoWidth) {
                    this.recordingCtx.drawImage(this.video, 0, 0, 640, 480);
                } else {
                    this.recordingCtx.fillStyle = '#000';
                    this.recordingCtx.fillRect(0, 0, 640, 480);
                }
                
                // Overlay camera title on top right
                this.recordingCtx.fillStyle = 'rgba(0, 0, 0, 0.7)';
                this.recordingCtx.fillRect(530, 10, 100, 30);
                this.recordingCtx.fillStyle = '#00ff41';
                this.recordingCtx.font = '16px "Share Tech Mono", monospace, sans-serif';
                this.recordingCtx.fillText(this.camTitle, 535, 30);

                // Force pixel update to prevent stream freezing in some browsers
                this.recordingCtx.fillStyle = Math.random() > 0.5 ? 'rgba(0,0,0,0.01)' : 'rgba(0,0,0,0)';
                this.recordingCtx.fillRect(0,0,1,1);
            }
            requestAnimationFrame(drawLoop);
        };
        requestAnimationFrame(drawLoop);
        
        // Fallback for background tabs
        setInterval(() => {
            if (performance.now() - lastDraw > 100) drawLoop(performance.now());
        }, 100);

        this.setupRecorder();
        
        this.bindEvents();
        // Start in file mode to make it easier as requested
        this.switchMode('file');
    }
    
    startRecorder(index) {
        if (this.recorders[index]) {
            try { this.recorders[index].stop(); } catch(e){}
        }
        
        let stream;
        if (this.recordingCanvas.captureStream) stream = this.recordingCanvas.captureStream(25);
        else if (this.recordingCanvas.mozCaptureStream) stream = this.recordingCanvas.mozCaptureStream(25);
        
        if (!stream) return;

        const mime = MediaRecorder.isTypeSupported('video/mp4') ? 'video/mp4' :
                     MediaRecorder.isTypeSupported('video/webm;codecs=vp9') ? 'video/webm;codecs=vp9' : 
                     MediaRecorder.isTypeSupported('video/webm;codecs=vp8') ? 'video/webm;codecs=vp8' : 'video/webm';
                     
        const myChunks = [];
        this.chunks[index] = myChunks;
        this.recorderStartTimes[index] = Date.now();
        this.recorders[index] = new MediaRecorder(stream, { 
            mimeType: mime,
            videoBitsPerSecond: 2500000 // 2.5 Mbps for smooth quality
        });
        this.recorders[index].ondataavailable = e => {
            if (e.data && e.data.size > 0) {
                myChunks.push(e.data);
            }
        };
        // Record continuously without 1-second fragments to fix MP4 playback stuttering
        this.recorders[index].start();
    }

    setupRecorder() {
        if (this.cycleInterval) clearInterval(this.cycleInterval);
        if (this.recorders) this.recorders.forEach(r => { if (r) try { r.stop(); } catch(e){} });
        
        this.recorders = [null, null];
        this.chunks = [[], []];
        this.recorderStartTimes = [0, 0];
        this.recordingThreat = false;
        this.activeThreatRecorder = null;
        
        this.startRecorder(0);
        
        let turn = 1;
        this.cycleInterval = setInterval(() => {
            if (this.recordingThreat) return; 
            this.startRecorder(turn);
            turn = (turn === 0) ? 1 : 0;
        }, 10000); // Swap every 10 seconds
    }
    
    updateTimestamp() {
        if (!this.tsElement) return;
        const now = new Date();
        this.tsElement.textContent = now.toLocaleTimeString('en-US', { hour12: false });
    }

    bindEvents() {
        this.tabs.forEach(tab => {
            tab.addEventListener('click', () => this.switchMode(tab.dataset.mode));
        });
        
        this.videoFile.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                this.camera.loadFile(file);
                this.updateButtons();
            }
        });
        
        this.loadUrlBtn.addEventListener('click', () => {
            const url = this.videoUrl.value.trim();
            if (url) {
                this.camera.loadURL(url);
                this.updateButtons();
            }
        });
        
        this.startBtn.addEventListener('click', () => this.startCapture());
        this.stopBtn.addEventListener('click', () => this.stopCapture());
        this.clearHistoryBtn.addEventListener('click', () => {
            this.responseHistory.innerHTML = '';
        });
        
        // Handle interval input
        const intervalSlider = this.panel.querySelector('.interval-slider');
        const intervalValue = this.panel.querySelector('.interval-value');
        intervalSlider.addEventListener('input', () => {
            intervalValue.textContent = intervalSlider.value;
            this.captureInterval = intervalSlider.value * 1000;
            if (this.intervalId) {
                this.stopCapture();
                this.startCapture();
            }
        });
    }
    
    switchMode(mode) {
        this.stopCapture();
        this.camera.stop();
        this.currentMode = mode;

        this.tabs.forEach(t => t.classList.toggle('active', t.dataset.mode === mode));
        this.fileInputArea.classList.toggle('hidden', mode !== 'file');
        this.urlInputArea.classList.toggle('hidden', mode !== 'url');

        if (mode === 'webcam') {
            this.camera.startWebcam().then(() => this.updateButtons()).catch(err => {
                if (err.message.includes('Requested device not found') || err.message.includes('NotFoundError')) {
                    this.setProcessStatus(`CAM ERROR: No webcam found! Please plug one in or use 'UPLOAD VIDEO'.`, true);
                } else {
                    this.setProcessStatus(`CAM ERROR: ${err.message}`, true);
                }
            });
        }
        
        this.updateButtons();
    }
    
    updateButtons() {
        const hasSource = this.video.srcObject || this.video.src;
        // Button enabled if ollama is ready, there is a source, and we are not currently capturing
        this.startBtn.disabled = !ollamaReady || !hasSource || !!this.intervalId;
        this.stopBtn.disabled = !this.intervalId;
    }
    
    startCapture() {
        if (this.intervalId) return;
        this.intervalId = setInterval(() => this.captureAndProcess(), this.captureInterval);
        this.captureAndProcess();
        this.updateButtons();
    }
    
    stopCapture() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
        this.processing = false;
        this.setProcessStatus('STANDBY', false);
        this.updateButtons();
    }
    
    captureThreatVideo() {
        if (this.recordingThreat) return;
        this.recordingThreat = true;
        
        // Transfer focus to Threat Viewer IMMEDIATELY
        // Browsers block scripts from focusing an already open tab without a click event.
        // To bypass this and force the browser to bring the recordings to the front,
        // we close the old tab and spawn a new one!
        if (window.threatViewerTab && !window.threatViewerTab.closed) {
            window.threatViewerTab.close();
        }
        window.threatViewerTab = window.open('threat_viewer.html', '_blank');
        
        // Find which recorder has more history
        let oldestIndex = 0;
        let oldestAge = 0;
        const now = Date.now();
        for (let i = 0; i < 2; i++) {
            if (this.recorders[i] && this.recorders[i].state === 'recording') {
                const age = now - this.recorderStartTimes[i];
                if (age > oldestAge) {
                    oldestAge = age;
                    oldestIndex = i;
                }
            }
        }
        
        this.activeThreatRecorder = oldestIndex;
        // Stop the other recorder so we don't waste memory
        const otherIndex = oldestIndex === 0 ? 1 : 0;
        if (this.recorders[otherIndex]) {
            try { this.recorders[otherIndex].stop(); } catch(e){}
        }
        
        // Wait 10 seconds to collect post-threat buffer
        setTimeout(() => {
            const rec = this.recorders[this.activeThreatRecorder];
            const chk = this.chunks[this.activeThreatRecorder];
            
            if (rec) {
                rec.onstop = () => {
                    if (!chk || chk.length === 0) return this.setupRecorder();
                    
                    const actualMime = rec.mimeType;
                    const blob = new Blob(chk, { type: actualMime });
                    const ext = actualMime.includes('mp4') ? 'mp4' : 'webm';
                    
                    // Upload
                    const dt = new Date();
                    const dateStr = dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
                    const timeStr = dt.toLocaleTimeString('en-US', { hour12: false });
                    const title = `threat detection from ${dateStr}, ${timeStr}`;
                    const timestamp = dt.toISOString();
                    
                    const url = `/api/upload_video?title=${encodeURIComponent(title)}&timestamp=${encodeURIComponent(timestamp)}&ext=${ext}`;
                    fetch(url, {
                        method: 'POST',
                        body: blob,
                        headers: { 'Content-Length': blob.size.toString() }
                    }).then(r => r.json()).then(res => {
                        console.log("Threat video uploaded:", res);
                    }).catch(e => console.error("Upload error", e));
                    
                    this.setupRecorder();
                };
                try { rec.stop(); } catch(e){}
            } else {
                this.setupRecorder();
            }
        }, 10000);
    }

    triggerAlert(message) {
        // Visual alert on the panel
        this.panel.classList.add('alert-active');
        
        // Play Alarm Sound (Web Audio API)
        try {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            const audioCtx = new AudioContext();
            const oscillator = audioCtx.createOscillator();
            const gainNode = audioCtx.createGain();
            oscillator.type = 'square';
            oscillator.frequency.setValueAtTime(880, audioCtx.currentTime); // A5 note
            oscillator.frequency.setValueAtTime(1108.73, audioCtx.currentTime + 0.15); // C#6 note
            oscillator.connect(gainNode);
            gainNode.connect(audioCtx.destination);
            gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime);
            oscillator.start();
            oscillator.stop(audioCtx.currentTime + 0.3);
        } catch(e) {
            console.error("Audio playback error", e);
        }

        // Custom HTML Toast Notification
        const toastContainer = document.getElementById('toast-container');
        if (toastContainer) {
            const toast = document.createElement('div');
            toast.className = 'toast';
            toast.innerHTML = message.replace('\n', '<br>');
            toastContainer.appendChild(toast);
            
            // Trigger animation
            requestAnimationFrame(() => {
                requestAnimationFrame(() => toast.classList.add('show'));
            });
            
            // Remove after 5 seconds
            setTimeout(() => {
                toast.classList.remove('show');
                setTimeout(() => toast.remove(), 400);
            }, 5000);
        }

        // Browser Native Notification (Fallback/Background)
        if ('Notification' in window && Notification.permission === 'granted') {
            new Notification(message, {
                body: 'SENTRY OS - SECURITY ALERT',
                requireInteraction: true
            });
        }

        // Add prominent log entry
        const entry = this.addHistoryEntry();
        entry.textEl.textContent = `CRITICAL ALERT: ${message}`;
        entry.textEl.style.color = '#ff003c';
        entry.textEl.style.fontWeight = 'bold';
        
        // Dispatch to backend API
        fetch('http://localhost:8000/api/alert', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: message })
        }).catch(err => console.error('Backend alert failed:', err));

        // Clear visual alert after 5 seconds
        setTimeout(() => {
            this.panel.classList.remove('alert-active');
        }, 5000);
    }

    async captureAndProcess() {
        if (this.processing) return;
        this.processing = true;
        this.setProcessStatus('SCANNING...', true);

        const base64 = capture(this.video);
        if (!base64) {
            this.setProcessStatus('NO FEED', false);
            this.processing = false;
            return;
        }

        const prompt = this.promptInput.value.trim() || 'Describe what you see in this image.';
        const entry = this.addHistoryEntry();
        this.setProcessStatus('ANALYZING...', true);

        try {
            await describe(base64, prompt, (chunk, accumulated) => {
                entry.textEl.textContent = accumulated;
                this.responseHistory.scrollTop = this.responseHistory.scrollHeight;
            });
            entry.el.classList.remove('streaming');
            this.setProcessStatus('STANDBY', false);
            
            // Post-processing check for Alerts
            const finalResponse = entry.textEl.textContent.toLowerCase();
            // Check if the response contains the standalone word "yes"
            if (/\byes\b/i.test(finalResponse)) {
                const camTitle = this.panel.querySelector('.cam-title').textContent.split('//')[0].trim();
                
                let seriousThreat = false;
                try {
                    const dbRes = await fetch('database.json', { cache: 'no-store' });
                    if (dbRes.ok) {
                        const db = await dbRes.json();
                        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
                        const recentThreat = db.find(item => new Date(item.timestamp) > oneHourAgo);
                        if (recentThreat) {
                            seriousThreat = true;
                        }
                    }
                } catch (err) {
                    console.error("Failed to fetch threat database:", err);
                }

                if (seriousThreat) {
                    this.triggerAlert("Warning - seriuos threat!!!");
                } else {
                    this.triggerAlert(`Masked Person Detected on ${camTitle}!`);
                }
                
                this.captureThreatVideo();
            }
            
        } catch (err) {
            entry.el.classList.remove('streaming');
            entry.textEl.className = 'text error-text';
            entry.textEl.textContent = `SYS ERR: ${err.message}`;
            this.setProcessStatus('ERROR', false);
        }

        this.processing = false;
    }
    
    setProcessStatus(text, active) {
        this.processText.textContent = text;
        this.processStatus.classList.toggle('active', active);
    }

    addHistoryEntry() {
        const el = document.createElement('div');
        el.className = 'response-entry streaming';

        const ts = document.createElement('div');
        ts.className = 'timestamp';
        ts.textContent = new Date().toLocaleTimeString('en-US', { hour12: false });

        const textEl = document.createElement('div');
        textEl.className = 'text';

        el.appendChild(ts);
        el.appendChild(textEl);
        this.responseHistory.appendChild(el);
        this.responseHistory.scrollTop = this.responseHistory.scrollHeight;

        return { el, textEl };
    }
}

// Ensure DOM is fully loaded before initializing
document.addEventListener('DOMContentLoaded', () => {
    window.streams = [];
    for (let i = 1; i <= 4; i++) {
        const el = document.getElementById(`stream-${i}`);
        if (el) {
            window.streams.push(new StreamController(`stream-${i}`));
        }
    }
    initOllama();
});
