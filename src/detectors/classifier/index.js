import { sha256, size } from './model.mjs';

const assets = () => new URL('models/classifier/', document.baseURI);
const unavailable = reason => ({ available: false, reason });

async function check() {
  // Minimal module returning an i8x16.splat value (the runtime requires SIMD).
  const simdProbe = new Uint8Array([0,97,115,109,1,0,0,0,1,5,1,96,0,1,123,3,2,1,0,10,8,1,6,0,65,0,253,15,11]);
  if (!globalThis.WebAssembly?.validate(simdProbe)) return unavailable('Требуется WebAssembly SIMD');
  if (!globalThis.Worker || !document.createElement('canvas').getContext('2d')) {
    return unavailable('Требуются Web Worker и Canvas 2D');
  }
  try {
    const response = await fetch(new URL('ready.json', assets()), { cache: 'no-store' });
    if ((await response.json()).sha256 === sha256) return { available: true, reason: '' };
  } catch {
    // A missing static asset can also be served as the Vite HTML fallback.
  }
  return unavailable('Установите веса командой yarn model:detector');
}

async function start({ stream, onResult, onError }) {
  const track = stream?.getVideoTracks().find(item => item.readyState === 'live');
  if (!track) throw new Error('Требуется входящий видеопоток');
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('Canvas 2D недоступен');
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'low';
  const video = document.createElement('video');
  video.muted = video.playsInline = true;
  video.srcObject = new MediaStream([track]);
  const worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
  let stopped = false;
  let timer;
  let previousTime = -1;
  function stop() {
    if (stopped) return;
    stopped = true;
    clearTimeout(timer);
    track.removeEventListener('ended', ended);
    video.pause();
    video.srcObject = null;
    worker.terminate();
  }
  function fail(message) {
    if (stopped) return;
    stop();
    onError?.(new Error(message));
  }
  function ended() { fail('Входящий видеопоток завершён'); }
  function sample() {
    if (stopped) return;
    if (video.readyState < 2 || !video.videoWidth || video.currentTime === previousTime || track.muted) {
      timer = setTimeout(sample, 300);
      return;
    }
    try {
      previousTime = video.currentTime;
      context.drawImage(video, 0, 0, size, size);
      const frame = context.getImageData(0, 0, size, size).data;
      worker.postMessage({ frame }, [frame.buffer]);
    } catch (error) {
      fail(error.message);
    }
  }
  track.addEventListener('ended', ended);
  worker.onerror = event => fail(event.message || 'Ошибка загрузки детектора');
  worker.onmessage = ({ data }) => {
    if (stopped) return;
    if (data.error) return fail(data.error);
    if (data.ready) return sample();
    onResult?.(`Оценка Deepfake для кадра: ${(data.score * 100).toFixed(1)}%`);
    timer = setTimeout(sample, 1000);
  };
  try {
    worker.postMessage({ directory: assets().href });
    void video.play().catch(error => fail(error.message));
    return { stop };
  } catch (error) {
    stop();
    throw error;
  }
}
export default { id: 'classifier', label: 'Deep-Fake Detector v2 · ViT', location: 'browser', check, start };
