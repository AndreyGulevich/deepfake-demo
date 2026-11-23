import {generatedFrames} from '../generatedFrames.js';

const size = 256;

export function localProcessor({id,label,engine,port,squareOutput=false,publishFrames=false}) {
  const endpoint = `http://127.0.0.1:${port}`;
  function request(path, options = {}, timeout = 5000) {
    const deadline = AbortSignal.timeout(timeout);
    return fetch(endpoint + path, {
      ...options, credentials: 'omit', cache: path === '/frame' ? 'default' : 'no-store', redirect: 'error',
      signal: options.signal ? AbortSignal.any([options.signal, deadline]) : deadline,
    });
  }

  async function check() {
    const canvas = document.createElement('canvas');
    if (!window.isSecureContext || !canvas.captureStream || !canvas.getContext('2d')) {
      return {available:false, reason:'Для передачи видео требуются защищённый контекст и Canvas Capture'};
    }
    try {
      const response = await request('/health', {}, 2000);
      const health = await response.json();
      if (health.engine !== engine) return {available:false, reason:`На порту ${port} ответил другой обработчик`};
      if (response.ok && health.ready === true) return {available:true, reason:''};
      return {available:false, reason:health.reason || label + ' ещё не готов'};
    } catch {
      return {available:false, reason:`Выполните yarn start:${id} и откройте список снова (локальный порт ${port})`};
    }
  }

  async function start({stream, photo, onError}) {
    const input = stream.getVideoTracks().find(track => track.readyState === 'live');
    if (!input) throw new Error('Включите камеру для ' + label);
    const health = await check();
    if (!health.available) throw new Error(health.reason);

    const driver = document.createElement('video');
    driver.muted = driver.playsInline = true;
    driver.srcObject = new MediaStream([input]);
    const capture = document.createElement('canvas');
    capture.width = capture.height = size;
    const reader = capture.getContext('2d', {willReadFrequently:true});
    const output = document.createElement('canvas');
    const swap = squareOutput;
    const rendered = publishFrames ? new EventTarget() : null;
    if (swap) {
      output.width = size;
      output.height = size;
    }
    const painter = output.getContext('2d');
    const controller = new AbortController();
    const signal = controller.signal;
    let sessionId, track, timer;

    let callCanvas, callPainter, callTrack;
    function paintCallFrame() {
      const w = driver.videoWidth, h = driver.videoHeight;
      if (callCanvas.width !== w || callCanvas.height !== h) {
        callCanvas.width = w;
        callCanvas.height = h;
      }
      const side = Math.min(w, h);
      callPainter.fillStyle = 'black';
      callPainter.fillRect(0, 0, w, h);
      callPainter.drawImage(output, (w-side)/2, (h-side)/2, side, side);
      callTrack?.requestFrame?.();
    }
    function getCallTrack() {
      if (!swap) return track;
      if (!callTrack) {
        callCanvas = document.createElement('canvas');
        callPainter = callCanvas.getContext('2d');
        paintCallFrame();
        [callTrack] = callCanvas.captureStream(24).getVideoTracks();
        paintCallFrame();
      }
      return callTrack;
    }
    function releaseCallTrack() {
      callTrack?.stop();
      callTrack = callCanvas = callPainter = undefined;
    }

    function stop() {
      if (signal.aborted) return;
      controller.abort();
      clearTimeout(timer);
      input.removeEventListener('ended', ended);
      window.removeEventListener('pagehide', stop);
      driver.pause();
      driver.srcObject = null;
      releaseCallTrack();
      track?.stop();
      if (sessionId) {
        void request('/session', {method:'DELETE', headers:{'X-Session':sessionId}, keepalive:true}).catch(()=>{});
      }
    }
    function ended() {
      stop();
      onError?.(new Error('Камера отключилась'));
    }
    async function render() {
      const width = driver.videoWidth, height = driver.videoHeight;
      if (!width || !height) throw new Error('Камера ещё не передала кадр');
      if (!swap && (output.width !== width || output.height !== height)) {
        output.width = width;
        output.height = height;
      }
      const side = Math.min(width, height);
      reader.drawImage(driver, (width-side)/2, (height-side)/2, side, side, 0, 0, size, size);
      const pixels = reader.getImageData(0, 0, size, size).data;
      const result = await request('/frame', {method:'POST', signal, headers:{
        'Content-Type':'application/octet-stream', 'X-Session':sessionId,
      }, body:pixels}, 30000);
      if (!result.ok) throw new Error(label + ': HTTP ' + result.status);
      const data = new Uint8ClampedArray(await result.arrayBuffer());
      if (data.length !== size * size * 4) throw new Error(label + ' вернул неполный кадр');
      if (signal.aborted) return;
      if (swap) {
        painter.putImageData(new ImageData(data, size, size), 0, 0);
        rendered?.dispatchEvent(new Event('frame'));
        if (callCanvas) paintCallFrame();
      } else {
        reader.putImageData(new ImageData(data, size, size), 0, 0);
        painter.fillStyle = 'black';
        painter.fillRect(0, 0, width, height);
        painter.drawImage(capture, (width-side)/2, (height-side)/2, side, side);
      }
    }
    async function next() {
      try {
        await render();
        if (!signal.aborted) timer = setTimeout(next, 0);
      } catch (error) {
        if (!signal.aborted) { stop(); onError?.(error); }
      }
    }
    try {
      let session;
      if (photo) {
        if (!['image/jpeg','image/png','image/webp'].includes(photo.type) || photo.size > 20 * 1024 * 1024)
          throw new Error('Выберите JPEG, PNG или WebP размером до 20 МБ.');
        const bitmap = await createImageBitmap(photo).catch(() => { throw new Error('Не удалось прочитать фотографию.'); });
        try {
          const side = Math.min(bitmap.width, bitmap.height);
          reader.drawImage(bitmap, (bitmap.width-side)/2, (bitmap.height-side)/2, side, side, 0, 0, size, size);
        } finally { bitmap.close(); }
        session = await request('/session/photo', {method:'POST', signal, headers:{'Content-Type':'application/octet-stream'},
          body:reader.getImageData(0, 0, size, size).data}, 30000);
      } else {
        session = await request('/session', {method:'POST',signal});
      }
      if (!session.ok) {
        const detail = await session.json().catch(() => null);
        throw new Error(detail?.reason || 'Не удалось открыть сеанс: HTTP ' + session.status);
      }
      sessionId = (await session.json()).id;
      if (typeof sessionId !== 'string' || !sessionId) throw new Error('Сервис вернул некорректный сеанс');
      input.addEventListener('ended', ended, {once:true});
      window.addEventListener('pagehide', stop, {once:true});
      if (input.readyState !== 'live') throw new Error('Камера отключилась');
      await driver.play();
      await render();
      [track] = output.captureStream(24).getVideoTracks();
      if (!track) throw new Error('Не удалось создать выходную видеодорожку');
      if (rendered) generatedFrames.set(track, {canvas:output, rendered});
      timer = setTimeout(next, 0);
      return {track, stop, getCallTrack, releaseCallTrack};
    } catch (error) { stop(); throw error; }
  }
  return {id,label,engine,port,location:'server',check,start};
}
