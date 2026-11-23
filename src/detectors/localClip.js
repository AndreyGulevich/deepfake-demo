import {generatedFrames} from '../generatedFrames.js';

export function localClip({id, label, engine, port, frameCount, side = 320}) {
  const endpoint = `http://127.0.0.1:${port}`;
  const request = (path, options) => fetch(endpoint + path, {
    cache: 'no-store', credentials: 'omit', redirect: 'error', ...options
  });

  async function check() {
    if (!globalThis.HTMLVideoElement?.prototype.requestVideoFrameCallback)
      return {available:false, reason:'Браузер не поддерживает захват декодированных кадров'};
    try {
      const response = await request('/health', {signal:AbortSignal.timeout(2000)});
      const health = await response.json();
      if (response.ok && health.engine === engine) {
        return {available:health.ready === true, reason:health.reason || ''};
      }
    } catch { /* The local process can be started separately. */ }
    return {available:false, reason:`Запустите yarn start:${id} и обновите список`};
  }

  async function start({stream, onResult, onError}) {
    const first = stream?.getVideoTracks().find(t => t.readyState === 'live');
    if (!first) throw new Error('Требуется активная видеодорожка');
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = side;
    const ctx = canvas.getContext('2d', {willReadFrequently:true});
    if (!ctx) throw new Error('Требуется Canvas 2D');
    const video = document.createElement('video');
    video.muted = video.playsInline = true;
    let track, controller, callback;
    let stopped = false;
    function clear() {
      controller?.abort();
      video.cancelVideoFrameCallback(callback);
      track?.removeEventListener('ended', ended);
      video.pause();
      video.srcObject = null;
    }
    function stop() { stopped = true; clear(); }
    function fail(error) { stop(); onError?.(error); }
    function ended() { fail(new Error('Выбранный видеопоток завершён')); }
    function setTrack(next) {
      if (stopped) return;
      clear();
      track = next;
      controller = new AbortController();
      const {signal} = controller;
      let frames = [], previous = -1, busy = false, firstClip = true;
      const generated = generatedFrames.get(next);
      const image = generated?.canvas ?? video;
      track.addEventListener('ended', ended);
      if (!generated) video.srcObject = new MediaStream([track]);
      onResult?.(frameCount === 1 ? 'Ожидание видеокадра' : `Сбор кадров · ${frameCount}`);
      async function sample(_, {mediaTime}) {
        if (signal.aborted || busy) return;
        const width = generated ? image.width : video.videoWidth;
        const height = generated ? image.height : video.videoHeight;
        try {
          if ((!generated && track.muted) || !track.enabled || !width) {
            frames = [];
            onResult?.('Ожидание видеокадра');
          } else if (mediaTime !== previous) {
            if (mediaTime < previous || (!generated && mediaTime - previous > 2)) frames = [];
            previous = mediaTime;
            const scale = side / Math.max(width, height);
            const w = width * scale, h = height * scale;
            ctx.fillRect(0, 0, side, side);
            ctx.drawImage(image, (side-w)/2, (side-h)/2, w, h);
            frames.push(ctx.getImageData(0, 0, side, side).data);
            if (generated && firstClip) onResult?.(`Сбор кадров · ${frames.length}/${frameCount}`);
            if (frames.length === frameCount) {
              firstClip = false;
              busy = true;
              const body = new Blob(frames, {type:'application/octet-stream'});
              frames = [];
              const response = await request('/clip', {method:'POST', body,
                signal:AbortSignal.any([signal, AbortSignal.timeout(60000)])});
              if (signal.aborted) return;
              busy = false;
              if (response.status === 429) {
                onResult?.(label + ' занят · ожидание видео');
              } else {
                if (!response.ok) throw new Error(label + ' · HTTP ' + response.status);
                const result = await response.json();
                if (signal.aborted) return;
                if (result.status === 'no_track') onResult?.('Нужно одно лицо в кадре');
                else if (result.status === 'ok' && Number.isFinite(result.score) && result.score >= 0 && result.score <= 1)
                  onResult?.('Дипфейк: ' + (100 * result.score).toLocaleString('ru-RU', {minimumFractionDigits:1, maximumFractionDigits:1}) + '%');
                else throw new Error('Некорректный результат ' + label);
              }
            }
          }
          if (!generated && !signal.aborted) callback = video.requestVideoFrameCallback(sample);
        } catch (error) { if (!signal.aborted) fail(error); }
      }
      if (generated) {
        let sequence = 0;
        generated.rendered.addEventListener('frame', () => { void sample(0, {mediaTime:++sequence}); }, {signal});
        return;
      }
      video.play().then(() => {
        if (!signal.aborted) callback = video.requestVideoFrameCallback(sample);
      }).catch(error => { if (!signal.aborted) fail(error); });
    }
    setTrack(first);
    return {stop, setTrack};
  }
  return {id, label, engine, port, location:'server', check, start, stop:run => run?.stop()};
}
