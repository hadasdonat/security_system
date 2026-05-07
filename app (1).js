import * as camera from './modules/camera.js';
import { capture } from './modules/frames.js';
import { checkConnection, describe } from './modules/ollama.js';

// DOM elements
const video = document.getElementById('video');
const tabs = document.querySelectorAll('.tab');
const fileInputArea = document.getElementById('file-input-area');
const urlInputArea = document.getElementById('url-input-area');
const videoFile = document.getElementById('video-file');
const videoUrl = document.getElementById('video-url');
const loadUrlBtn = document.getElementById('load-url-btn');
const promptInput = document.getElementById('prompt-input');
const intervalSlider = document.getElementById('interval-slider');
const intervalValue = document.getElementById('interval-value');
const startBtn = document.getElementById('start-btn');
const stopBtn = document.getElementById('stop-btn');
const processText = document.getElementById('process-text');
const processStatus = document.querySelector('.process-status');
const connectionStatus = document.getElementById('connection-status');
const statusText = document.getElementById('status-text');
const responseHistory = document.getElementById('response-history');
const clearHistoryBtn = document.getElementById('clear-history-btn');

let currentMode = 'webcam';
let intervalId = null;
let processing = false;
let captureInterval = 3000;
let ollamaReady = false;

// --- Connection Check ---

async function checkOllama() {
    connectionStatus.className = 'status checking';
    statusText.textContent = 'Checking Ollama...';

    const result = await checkConnection();

    if (!result.ok) {
        connectionStatus.className = 'status disconnected';
        statusText.textContent = 'Ollama not running';
        startBtn.disabled = true;
        ollamaReady = false;
        return;
    }

    if (!result.hasModel) {
        connectionStatus.className = 'status disconnected';
        statusText.textContent = 'Model not found - run: ollama pull qwen2.5vl:3b';
        startBtn.disabled = true;
        ollamaReady = false;
        return;
    }

    connectionStatus.className = 'status connected';
    statusText.textContent = 'Ollama connected';
    ollamaReady = true;
    updateButtons();
}

// --- Mode Switching ---

function switchMode(mode) {
    stopCapture();
    camera.stop(video);
    currentMode = mode;

    tabs.forEach(t => t.classList.toggle('active', t.dataset.mode === mode));
    fileInputArea.classList.toggle('hidden', mode !== 'file');
    urlInputArea.classList.toggle('hidden', mode !== 'url');

    if (mode === 'webcam') {
        camera.startWebcam(video).then(() => updateButtons()).catch(err => {
            setProcessStatus(`Camera error: ${err.message}`, true);
        });
    }

    updateButtons();
}

tabs.forEach(tab => {
    tab.addEventListener('click', () => switchMode(tab.dataset.mode));
});

// --- File & URL Loading ---

videoFile.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
        camera.loadFile(video, file);
        updateButtons();
    }
});

loadUrlBtn.addEventListener('click', () => {
    const url = videoUrl.value.trim();
    if (url) {
        camera.loadURL(video, url);
        updateButtons();
    }
});

// --- Interval Slider ---

intervalSlider.addEventListener('input', () => {
    const val = intervalSlider.value;
    intervalValue.textContent = val;
    captureInterval = val * 1000;

    if (intervalId) {
        clearInterval(intervalId);
        intervalId = setInterval(captureAndProcess, captureInterval);
    }
});

// --- Start / Stop ---

function updateButtons() {
    const hasSource = video.srcObject || video.src;
    startBtn.disabled = !ollamaReady || !hasSource || !!intervalId;
    stopBtn.disabled = !intervalId;
}

startBtn.addEventListener('click', startCapture);
stopBtn.addEventListener('click', stopCapture);

function startCapture() {
    if (intervalId) return;
    intervalId = setInterval(captureAndProcess, captureInterval);
    captureAndProcess();
    updateButtons();
}

function stopCapture() {
    if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
    }
    processing = false;
    setProcessStatus('Idle', false);
    updateButtons();
}

// --- Capture & Process ---

async function captureAndProcess() {
    if (processing) return;
    processing = true;
    setProcessStatus('Capturing frame...', true);

    const base64 = capture(video);
    if (!base64) {
        setProcessStatus('No video frame available', false);
        processing = false;
        return;
    }

    const prompt = promptInput.value.trim() || 'Describe what you see in this image.';
    const entry = addHistoryEntry();
    setProcessStatus('Processing...', true);

    try {
        await describe(base64, prompt, (chunk, accumulated) => {
            entry.textEl.textContent = accumulated;
            responseHistory.scrollTop = responseHistory.scrollHeight;
        });
        entry.el.classList.remove('streaming');
        setProcessStatus('Idle', false);
    } catch (err) {
        entry.el.classList.remove('streaming');
        entry.textEl.className = 'text error-text';
        entry.textEl.textContent = `Error: ${err.message}`;
        setProcessStatus('Error', false);
    }

    processing = false;
}

// --- UI Helpers ---

function setProcessStatus(text, active) {
    processText.textContent = text;
    processStatus.classList.toggle('active', active);
}

function addHistoryEntry() {
    const el = document.createElement('div');
    el.className = 'response-entry streaming';

    const ts = document.createElement('div');
    ts.className = 'timestamp';
    ts.textContent = new Date().toLocaleTimeString();

    const textEl = document.createElement('div');
    textEl.className = 'text';

    el.appendChild(ts);
    el.appendChild(textEl);
    responseHistory.appendChild(el);
    responseHistory.scrollTop = responseHistory.scrollHeight;

    return { el, textEl };
}

clearHistoryBtn.addEventListener('click', () => {
    responseHistory.innerHTML = '';
});

// --- Init ---

switchMode('webcam');
checkOllama();
