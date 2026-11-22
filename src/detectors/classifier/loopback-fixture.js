// In the running Vite app's developer console:
// await (await import('/src/detectors/classifier/loopback-fixture.js')).runLoopback()
import classifier from './index.js';

export async function runLoopback() {
  const support = await classifier.check();
  if (!support.available) throw new Error(support.reason);
  const canvas = document.createElement('canvas');
  canvas.width = 320;
  canvas.height = 240;
  const context = canvas.getContext('2d');
  const response = await fetch(new URL('./pico/fixtures/astronaut.gray', import.meta.url));
  if (!response.ok) throw new Error('Missing reference portrait');
  const gray = new Uint8Array(await response.arrayBuffer());
  if (gray.length !== 192 * 192) throw new Error('Invalid reference portrait');
  const portrait = context.createImageData(192, 192);
  gray.forEach((value, i) => portrait.data.set([value, value, value, 255], 4 * i));
  let tick = 0;
  function paint() {
    context.fillStyle = '#244c54';
    context.fillRect(0, 0, 320, 240);
    context.putImageData(portrait, 62 + (tick++ % 3), 24);
  }
  paint();
  const stream = canvas.captureStream(10);
  const [sender, receiver] = [new RTCPeerConnection(), new RTCPeerConnection()];
  const interval = setInterval(paint, 100);
  let handle;
  let timeout;
  let startedAt;
  try {
    const result = new Promise((resolve, reject) => {
      receiver.ontrack = async event => {
        try {
          startedAt = performance.now();
          handle = await classifier.start({ stream: new MediaStream([event.track]), onResult: text => { if (text.includes('%')) resolve(text); }, onError: reject });
        } catch (error) { reject(error); }
      };
    });
    // Wait for host candidates so the test works without a signalling service.
    async function gather(peer, description) {
      const done = new Promise(resolve => {
        peer.onicecandidate = event => { if (!event.candidate) resolve(); };
      });
      await peer.setLocalDescription(description);
      await done;
      return peer.localDescription;
    }
    async function connect() {
      sender.addTrack(stream.getVideoTracks()[0], stream);
      await receiver.setRemoteDescription(await gather(sender, await sender.createOffer()));
      await sender.setRemoteDescription(await gather(receiver, await receiver.createAnswer()));
    }
    const deadline = new Promise((_, reject) => {
      timeout = setTimeout(() => reject(new Error('No decoded-frame result within 90 s')), 90_000);
    });
    const [, score] = await Promise.race([Promise.all([connect(), result]), deadline]);
    handle.stop();
    const reports = [...(await receiver.getStats()).values()];
    const inbound = reports.find(report => report.type === 'inbound-rtp' && report.kind === 'video');
    if (!inbound?.framesDecoded || receiver.getReceivers()[0].track.readyState !== 'live') {
      throw new Error('Expected decoded frames and a live receiver after detector stop');
    }
    return { score, firstResultMs: Math.round(performance.now() - startedAt), framesDecoded: inbound.framesDecoded, codec: reports.find(report => report.id === inbound.codecId)?.mimeType };
  } finally {
    clearInterval(interval);
    clearTimeout(timeout);
    handle?.stop();
    sender.close();
    receiver.close();
    stream.getTracks().forEach(track => track.stop());
  }
}
