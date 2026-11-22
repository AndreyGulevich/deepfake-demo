import {UAParser} from 'ua-parser-js';
import {SipConnector,tools} from 'sip-connector';
import JsSIP from '@krivega/jssip';
import makers from './makers/index.js';
import detectors from './detectors/index.js';
import {guestConnection,guestOffer} from './guestCall.js';
import {endpoint} from './endpoint.js';

const catalogs = {maker:makers,detector:detectors};
const emptySelection = () => ({options:[],selected:'',active:false});
export function createStudio(onState) {
  let state = {call:'idle',local:null,remote:null,camera:false,mic:false,devices:[],
    cameraId:'',micId:'',starting:{camera:true,mic:true},deviceErrors:{},maker:emptySelection(),detector:{...emptySelection(),source:'outgoing'},result:'',error:''};
  const media = navigator.mediaDevices;
  const tracks = {camera:null,mic:null};
  const runs = {maker:null,detector:null};
  let connector = null;
  let generation = 0;
  let cancelDial;
  let disposed = false;
  let queue = Promise.resolve();
  const env = {ua:new UAParser().getResult(),secure:window.isSecureContext,mediaDevices:media};
  function update(patch) {
    if ('local' in patch && state.detector.source === 'outgoing' && runs.detector) {
      const next = patch.local?.getVideoTracks()[0];
      if (next !== state.local?.getVideoTracks()[0]) {
        patch.result = '';
        if (next?.readyState === 'live') runs.detector.setTrack(next);
        else {
          runs.detector.stop();
          runs.detector = null;
          patch.detector = {...state.detector, active:false};
        }
      }
    }
    state = {...state,...patch};
    if (!disposed) onState(state);
  }
  function serialize(fn) {
    const action = queue.then(()=>{if (!disposed) return fn();});
    queue = action.catch(()=>{});
    return action;
  }
  async function refresh() {
    const devices = media ? await media.enumerateDevices() : [];
    update({devices});
  }
  const deviceChange = () => refresh().catch(e=>update({error:e.message}));
  media?.addEventListener('devicechange',deviceChange);
  deviceChange();
  const checks = {};
  async function refreshOptions(kind) {
    const check = catalogs[kind].options(env);
    checks[kind] = check;
    const options = await check;
    if (disposed || checks[kind] !== check) return;
    const current = state[kind];
    const selected = current.selected || (options.find(o=>o.available) || options[0])?.id || '';
    update({[kind]:{...current,options,selected}});
  }
  for (const kind of Object.keys(catalogs)) void refreshOptions(kind);
  function local(video=runs.maker?.track ?? tracks.camera,audio=tracks.mic) {
    const list = [video,audio].filter(Boolean);
    return list.length ? new MediaStream(list) : null;
  }
  function conferenceStream(stream) {
    const maker = runs.maker;
    if (!maker || !stream?.getVideoTracks().includes(maker.track)) return stream;
    return new MediaStream([maker.getCallTrack(), ...stream.getAudioTracks()]);
  }
  function notifyMedia(current, stream) {
    const enabled = tracks => tracks.some(t => t.readyState === 'live' && t.enabled);
    if (current.isCallActive && !current.callManager.stateMachine.isInPurgatory)
      void current.sendMediaState({cam:enabled(stream.getVideoTracks()),mic:enabled(stream.getAudioTracks())}).catch(()=>{});
  }
  async function send(stream) {
    const current = connector;
    if (current && state.call === 'active') {
      const outbound = conferenceStream(stream) ?? new MediaStream();
      await current.replaceMediaStream(outbound,{addMissing:true,deleteExisting:true});
      notifyMedia(current, outbound);
    }
  }
  async function sendVideo(track) {
    const current = connector;
    if (!current || state.call !== 'active') return;
    await current.replaceMediaStream(new MediaStream([track]), {addMissing:true,deleteExisting:false});
    notifyMedia(current, local(track));
  }
  async function acquire(kind,id) {
    const type = kind === 'camera' ? 'video' : 'audio';
    if (!media) throw new Error('Захват медиа недоступен в этом браузере');
    const stream = await media.getUserMedia({[type]:id ? {deviceId:{exact:id}} : true});
    return stream.getTracks()[0];
  }
  async function stop(kind) {
    const run = runs[kind];
    if (!run) return;
    if (kind === 'maker') await sendVideo(tracks.camera);
    runs[kind] = null;
    try { await run.stop(); } finally {
      update({[kind]:{...state[kind],active:false},local:local(),...(kind==='detector'?{result:''}:{})});
    }
  }
  async function changeDevice(kind,id,enabled) {
    if (state.call==='connecting') throw new Error('Дождитесь подключения');
    const replacement = enabled ? await acquire(kind,id) : null;
    await applyDevice(kind,id,replacement);
  }
  async function applyDevice(kind,id,replacement) {
    const old = tracks[kind];
    try {
      if (kind==='camera') await stop('maker');
      const stream = kind==='camera' ? local(replacement) : local(runs.maker?.track ?? tracks.camera,replacement);
      await send(stream);
      tracks[kind] = replacement;
      old?.stop();
      update({[kind]:Boolean(replacement),deviceErrors:{...state.deviceErrors,[kind]:''},[kind+'Id']:replacement?.getSettings().deviceId || id,local:stream});
    } catch (error) {replacement?.stop();throw error;}
    deviceChange();
  }
  async function startDefault(kind) {
    try {
      const track = await acquire(kind,'');
      await serialize(async()=>{
        if (closing) track.stop();
        else await applyDevice(kind,'',track);
      });
      if (disposed) track.stop();
    } catch (error) {
      if (!closing) update({deviceErrors:{...state.deviceErrors,[kind]:error.message}});
    } finally {
      if (!closing) update({starting:{...state.starting,[kind]:false}});
    }
  }
  let closing = false;
  for (const kind of ['camera','mic']) void startDefault(kind);
  async function activate(kind, photo) {
    if (runs[kind]) return stop(kind);
    const choice = state[kind].options.find(item=>item.id===state[kind].selected);
    if (!choice?.available) throw new Error(choice?.reason || 'Реализация недоступна');
    const outgoing = kind==='detector' && state.detector.source==='outgoing';
    const stream = kind==='maker' ? local(tracks.camera,null) : outgoing ? state.local : state.remote;
    if (!stream?.getVideoTracks().length) throw new Error(kind==='maker' || outgoing ? 'Сначала включите камеру' : 'Для входящего потока нужен видеозвонок. Без звонка выберите исходящий поток.');
    const run = await catalogs[kind].get(choice.id).start({stream, photo,
      onResult:result=>update({result}),onError:error=>{update({error:error.message || String(error)});serialize(()=>stop(kind));}});
    try {
      if (kind==='detector' && !outgoing && stream!==state.remote) throw new Error('Входящий поток изменился');
      if (kind==='maker' && connector && state.call==='active') await sendVideo(run.getCallTrack());
      runs[kind] = run;
      update({[kind]:{...state[kind],active:true},local:local()});
    } catch(error) {
      try { if (kind==='maker' && tracks.camera?.readyState==='live') await sendVideo(tracks.camera); }
      finally { await run.stop(); }
      throw error;
    }
  }
  async function hangup() {
    ++generation;
    cancelDial?.();
    cancelDial = undefined;
    const current = connector;
    connector = null;
    update({call:'idle',remote:null});
    const cleanup = serialize(()=>{if (closing || state.detector.source==='incoming') return stop('detector');});
    if (current) {
      try { if (current.requestedCall || current.isCallActive) await current.hangUp(); }
      finally { await current.disconnect(); }
    }
    await cleanup;
    if (!connector) runs.maker?.releaseCallTrack();
  }
  async function dial(server,number) {
    if (state.call!=='idle') return;
    if (!number.trim()) throw new Error('Введите номер конференции');
    const {sipServerUrl} = endpoint(server);
    const token = ++generation;
    const current = new SipConnector({JsSIP});
    connector = current;
    const controller = new AbortController();
    const cancelled = new Promise(resolve=>{cancelDial=()=>{controller.abort(); resolve();};});
    update({call:'connecting',error:''});
    const ended = event=>{
      if (connector!==current) return;
      if(event?.cause) update({error:String(event.cause)});
      hangup().catch(e=>update({error:e.message}));
    };
    current.on('call:ended',ended);
    current.on('call:failed',ended);
    current.on('connection:disconnected',event=>ended({cause:event?.cause || 'Соединение с SIP-сервером закрыто. Проверьте адрес и доступность сервера.'}));
    current.on('call:remote-streams-changed',({streams})=>{
      if (connector!==current || state.remote===streams.mainStream) return;
      update({remote:streams.mainStream ?? null});
      serialize(()=>{if (state.detector.source==='incoming') return stop('detector');});
    });
    try {
      await queue;
      if (token!==generation) return;
      const config = await guestConnection(sipServerUrl, env.ua.browser, tools, AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]));
      if (token!==generation) return;
      await Promise.race([current.connect(config),cancelled]);
      if (token!==generation) return;
      const offered = state.local;
      await Promise.race([current.call(guestOffer(number, conferenceStream(offered) ?? new MediaStream(), config, tools),{autoRedial:false}),cancelled]);
      if (token!==generation) return;
      update({call:'active',remote:current.getRemoteStreams().mainStream ?? null});
      // A device permission can resolve while the SIP offer is in flight.
      if (state.local !== offered) await send(state.local);
    } catch(error) {
      if (token!==generation) return;
      await hangup();
      throw error;
    }
  }
  return {snapshot:()=>state,dial,hangup,refreshOptions,
    setDetectorSource(source) {
      if (!state.detector.active && ['incoming','outgoing'].includes(source))
        update({detector:{...state.detector,source}, result:''});
    },
    toggleCamera:()=>serialize(()=>changeDevice('camera',state.cameraId,!state.camera)),
    toggleMic:()=>serialize(()=>changeDevice('mic',state.micId,!state.mic)),
    setDevice:(kind,id)=>serialize(()=>state[kind] ? changeDevice(kind,id,true) : update({[kind+'Id']:id})),
    select:(kind,id)=>{if (!state[kind].active && state[kind].options.some(o=>o.id===id && o.available)) update({[kind]:{...state[kind],selected:id}});},
    toggle:(kind,photo)=>serialize(()=>activate(kind,photo)),
    async dispose(){
      closing = true;
      media?.removeEventListener('devicechange',deviceChange);
      await hangup();
      await serialize(()=>stop('maker'));
      disposed = true;
      Object.values(tracks).forEach(t=>t?.stop());
    }};
}
