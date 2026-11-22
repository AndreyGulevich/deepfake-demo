import notice from './vendor/LICENSE.txt?raw';
import { paintPortrait } from './portrait.mjs';

async function check() {
  const canvas = globalThis.document?.createElement('canvas');
  const available = !!(canvas?.getContext('2d') && canvas.captureStream && globalThis.MediaStream);
  return { available, reason: available ? '' : 'Требуются Canvas 2D и захват видео с canvas' };
}

async function loadTracker() {
  const [{ default: url }, { createTracker }] = await Promise.all([
    import('./vendor/facefinder.bin?url&inline'),
    import('./tracker.mjs'),
  ]);
  const response = await fetch(url);
  if (!response.ok) throw new Error('Не удалось загрузить модель pico');
  return createTracker(await response.arrayBuffer());
}

async function start({ stream, onError }) {
  const input = stream?.getVideoTracks().find(track => track.readyState === 'live');
  if (!input) throw new Error('Включите камеру, чтобы запустить аватар');
  const locate = await loadTracker();
  const video = document.createElement('video');
  video.playsInline = true;
  video.muted = true;
  video.srcObject = new MediaStream([input]);
  const analysis = document.createElement('canvas');
  analysis.width = analysis.height = 192;
  const reader = analysis.getContext('2d', { willReadFrequently: true });
  const pixels = new Uint8Array(192 * 192);
  const canvas = document.createElement('canvas');
  canvas.width = 640;
  canvas.height = 360;
  const output = canvas.getContext('2d');
  let timer, track;
  let stopped = false;

  function stop() {
    if (stopped) return;
    stopped = true;
    clearInterval(timer);
    input.removeEventListener('ended', inputEnded);
    track?.stop();
    video.pause();
    video.srcObject = null;
  }
  function inputEnded() {
    stop();
    onError?.(new Error('Видеопоток камеры завершён'));
  }
  function render() {
    let face = null;
    if (input.enabled && video.readyState >= 2 && video.videoWidth && video.videoHeight) {
      const factor = 192 / Math.max(video.videoWidth, video.videoHeight);
      const width = video.videoWidth * factor;
      const height = video.videoHeight * factor;
      reader.fillStyle = '#000';
      reader.fillRect(0, 0, 192, 192);
      reader.drawImage(video, (192 - width) / 2, (192 - height) / 2, width, height);
      const rgba = reader.getImageData(0, 0, 192, 192).data;
      for (let i = 0; i < pixels.length; i++) {
        const p = i * 4;
        pixels[i] = (2 * rgba[p] + 7 * rgba[p + 1] + rgba[p + 2]) / 10;
      }
      face = locate(pixels, 192, 192);
    }
    paintPortrait(output, face, canvas.width, canvas.height);
  }

  try {
    if (input.readyState !== 'live') throw new Error('Видеопоток камеры завершён');
    input.addEventListener('ended', inputEnded, { once: true });
    await video.play();
    if (stopped) throw new Error('Видеопоток камеры завершён');
    render();
    [track] = canvas.captureStream(12).getVideoTracks();
    if (!track) throw new Error('Браузер не вернул видеодорожку canvas');
    timer = setInterval(() => {
      try {
        render();
      } catch (error) {
        stop();
        onError?.(error);
      }
    }, 1000 / 12);
    return { track, stop };
  } catch (error) {
    stop();
    throw error;
  }
}

export default { id: 'avatar', label: 'Демо-аватар · pico', location: 'browser', notice, check, start };
