export class CameraHandler {
    constructor(videoElement) {
        this.videoElement = videoElement;
        this.currentStream = null;
        this.currentObjectURL = null;
    }

    async startWebcam() {
        this.stop();
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
