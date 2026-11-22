import { loadTracker } from './pico/loadTracker.js';
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
  let track = stream?.getVideoTracks().find(item => item.readyState === 'live');
  if (!track) throw new Error('Требуется активная видеодорожка');
  const locate = await loadTracker();
  const snapshot = document.createElement('canvas');
  const full = snapshot.getContext('2d');
  const analysis = document.createElement('canvas');
  const reader = analysis.getContext('2d', {willReadFrequently:true});
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
  function ended() { fail('Выбранный видеопоток завершён'); }
  let version = 0;
  let sampledVersion = 0;
  function setTrack(next) {
    track.removeEventListener('ended', ended);
    track = next;
    version++;
    previousTime = -1;
    track.addEventListener('ended', ended);
    video.srcObject = new MediaStream([track]);
    play();
  }
  function play() {
    const current = version;
    void video.play().catch(error => { if (current === version) fail(error.message); });
  }
  function sample() {
    if (stopped) return;
    if (video.readyState < 2 || !video.videoWidth || track.muted || !track.enabled) {
      onResult?.('Ожидание видеокадра');
      timer = setTimeout(sample, 300);
      return;
    }
    if (video.currentTime === previousTime) {
      timer = setTimeout(sample, 300);
      return;
    }
    try {
      sampledVersion = version;
      previousTime = video.currentTime;
      const width = video.videoWidth, height = video.videoHeight;
      if (snapshot.width !== width || snapshot.height !== height) {
        snapshot.width = width;
        snapshot.height = height;
      }
      full.drawImage(video, 0, 0);
      const scale = Math.min(1, 320 / Math.max(width, height));
      const w = Math.max(1, Math.round(width * scale)), h = Math.max(1, Math.round(height * scale));
      if (analysis.width !== w || analysis.height !== h) {
        analysis.width = w;
        analysis.height = h;
      }
      reader.drawImage(snapshot, 0, 0, w, h);
      const rgba = reader.getImageData(0, 0, w, h).data;
      const gray = new Uint8Array(w * h);
      for (let i = 0; i < gray.length; i++) {
        const j = 4 * i;
        gray[i] = (2 * rgba[j] + 7 * rgba[j+1] + rgba[j+2]) / 10;
      }
      const face = locate(gray, w, h);
      if (!face) {
        onResult?.('Лицо не найдено');
        timer = setTimeout(sample, 1000);
        return;
      }
      const side = Math.min(width, height, 1.35 * face.size / scale);
      const x = Math.max(0, Math.min(width - side, face.x / scale - side / 2));
      const y = Math.max(0, Math.min(height - side, face.y / scale - side / 2));
      context.drawImage(snapshot, x, y, side, side, 0, 0, size, size);
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
    if (sampledVersion === version && track.enabled && !track.muted)
      onResult?.(`Дипфейк: ${(data.score * 100).toLocaleString('ru-RU', {minimumFractionDigits:1, maximumFractionDigits:1})}% · Лицо в кадре`);
    timer = setTimeout(sample, 1000);
  };
  try {
    worker.postMessage({ directory: assets().href });
    play();
    return { stop, setTrack };
  } catch (error) {
    stop();
    throw error;
  }
}
export default { id: 'classifier', label: 'Deep-Fake Detector v2 · ViT', location: 'browser', check, start };
