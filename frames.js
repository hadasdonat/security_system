const canvas = document.createElement('canvas');
canvas.width = 640;
canvas.height = 480;
const ctx = canvas.getContext('2d');

export function capture(videoElement) {
    if (!videoElement.videoWidth) return null;
    ctx.drawImage(videoElement, 0, 0, 640, 480);
    const dataURL = canvas.toDataURL('image/jpeg', 0.7);
    return dataURL.split(',')[1];
}
