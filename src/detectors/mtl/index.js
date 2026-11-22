import {loadTracker} from '../classifier/pico/loadTracker.js';
import {sha256, framesPerClip, size} from './model.mjs';

const assets = () => new URL('/models/mtl/', document.baseURI);
async function check() {
  const simd = new Uint8Array([0,97,115,109,1,0,0,0,1,5,1,96,0,1,123,3,2,1,0,10,8,1,6,0,65,0,253,15,11]);
  if (!globalThis.WebAssembly?.validate(simd) || !globalThis.Worker ||
      !globalThis.HTMLVideoElement?.prototype.requestVideoFrameCallback || !document.createElement('canvas').getContext('2d'))
    return {available:false, reason:'Требуются WebAssembly SIMD, Web Worker, Canvas и захват видеокадров'};
  try {
    const response = await fetch(new URL('ready.json', assets()), {cache:'no-store'});
    if (response.ok && (await response.json()).sha256 === sha256) return {available:true, reason:''};
  } catch { /* The model can be installed independently. */ }
  return {available:false, reason:'Подготовьте модель командой yarn model:mtl'};
}

async function start({stream, onResult, onError}) {
  const first = stream?.getVideoTracks().find(track => track.readyState === 'live');
  if (!first) throw new Error('Требуется активная видеодорожка');
  const locate = await loadTracker();
  const video = document.createElement('video');
  video.muted = video.playsInline = true;
  const analysis = document.createElement('canvas');
  const reader = analysis.getContext('2d', {willReadFrequently:true});
  const crop = document.createElement('canvas');
  crop.width = crop.height = size;
  const painter = crop.getContext('2d', {willReadFrequently:true});
  const worker = new Worker(new URL('./worker.js', import.meta.url), {type:'module'});
  let track, callback, lastTime, frames = [], version = 0, ready = false, busy = false, stopped = false;

  function stop() {
    if (stopped) return;
    stopped = true;
    video.cancelVideoFrameCallback(callback);
    track?.removeEventListener('ended', ended);
    video.pause();
    video.srcObject = null;
    frames = [];
    worker.terminate();
  }
  function fail(error) {
    if (stopped) return;
    stop();
    onError?.(error);
  }
  function ended() { fail(new Error('Выбранный видеопоток завершён')); }
  function schedule() {
    if (!stopped && ready && !busy) callback = video.requestVideoFrameCallback(sample);
  }
  function sample(_, {mediaTime}) {
    try {
      if (track.muted || !track.enabled || !video.videoWidth) {
        frames = [];
        onResult?.('Ожидание видеокадра');
      } else if (mediaTime !== lastTime) {
        if (mediaTime < lastTime || mediaTime - lastTime > 2) frames = [];
        lastTime = mediaTime;
        const width = video.videoWidth, height = video.videoHeight;
        const scale = Math.min(1, 256 / Math.max(width, height));
        const w = Math.max(1, Math.round(width * scale)), h = Math.max(1, Math.round(height * scale));
        if (analysis.width !== w || analysis.height !== h) { analysis.width = w; analysis.height = h; }
        reader.drawImage(video, 0, 0, w, h);
        const rgba = reader.getImageData(0, 0, w, h).data;
        const gray = new Uint8Array(w * h);
        for (let i = 0; i < gray.length; i++) gray[i] = (2*rgba[4*i] + 7*rgba[4*i+1] + rgba[4*i+2])/10;
        const face = locate(gray, w, h);
        if (!face) {
          frames = [];
          onResult?.('Лицо не найдено');
        } else {
          const side = Math.min(width, height, face.size * 1.3 / scale);
          const x = Math.max(0, Math.min(width-side, face.x/scale-side/2));
          const y = Math.max(0, Math.min(height-side, face.y/scale-side/2));
          painter.drawImage(video, x, y, side, side, 0, 0, size, size);
          frames.push(painter.getImageData(0, 0, size, size).data);
          if (frames.length === framesPerClip) {
            busy = true;
            worker.postMessage({frames, version}, frames.map(frame => frame.buffer));
            frames = [];
          }
        }
      }
      schedule();
    } catch (error) { fail(error); }
  }
  function setTrack(next) {
    if (stopped) return;
    video.cancelVideoFrameCallback(callback);
    track?.removeEventListener('ended', ended);
    track = next;
    const current = ++version;
    frames = [];
    lastTime = -1;
    track.addEventListener('ended', ended);
    video.srcObject = new MediaStream([track]);
    if (track.readyState !== 'live') return ended();
    video.play().catch(error => { if (current === version) fail(error); });
    onResult?.('Сбор 8 кадров');
    schedule();
  }
  worker.onerror = event => fail(new Error(event.message || 'Ошибка MTL Face Auth'));
  worker.onmessage = ({data}) => {
    if (stopped) return;
    if (data.error) return fail(new Error(data.error));
    if (data.ready) ready = true;
    else {
      busy = false;
      if (data.version === version && track.enabled && !track.muted)
        onResult?.('Дипфейк: ' + (100*data.score).toLocaleString('ru-RU', {minimumFractionDigits:1, maximumFractionDigits:1}) + '% · Лицо в кадре');
    }
    schedule();
  };
  try {
    setTrack(first);
    worker.postMessage({directory:assets().href});
    return {stop, setTrack};
  } catch (error) { stop(); throw error; }
}

export default {id:'mtl', label:'MTL Face Auth', location:'browser', check, start};
