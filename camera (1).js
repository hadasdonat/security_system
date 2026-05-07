let currentStream = null;
let currentObjectURL = null;

export async function startWebcam(videoElement) {
    stop(videoElement);
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    currentStream = stream;
    videoElement.srcObject = stream;
    videoElement.muted = true;
    await videoElement.play();
}

export function loadFile(videoElement, file) {
    stop(videoElement);
    const url = URL.createObjectURL(file);
    currentObjectURL = url;
    videoElement.srcObject = null;
    videoElement.src = url;
    videoElement.muted = true;
    videoElement.loop = true;
    videoElement.play();
}

export function loadURL(videoElement, url) {
    stop(videoElement);
    videoElement.srcObject = null;
    videoElement.src = url;
    videoElement.muted = true;
    videoElement.loop = true;
    videoElement.crossOrigin = 'anonymous';
    videoElement.play();
}

export function stop(videoElement) {
    if (currentStream) {
        currentStream.getTracks().forEach(t => t.stop());
        currentStream = null;
    }
    if (currentObjectURL) {
        URL.revokeObjectURL(currentObjectURL);
        currentObjectURL = null;
    }
    videoElement.srcObject = null;
    videoElement.src = '';
    videoElement.load();
}
