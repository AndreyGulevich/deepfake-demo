import {UAParser} from 'ua-parser-js';
import {SipConnector} from 'sip-connector';
import JsSIP from '@krivega/jssip';
import makers from './makers/index.js';
import detectors from './detectors/index.js';
import {endpoint} from './endpoint.js';

const catalogs = {maker:makers,detector:detectors};
const emptySelection = () => ({options:[],selected:'',active:false});
export function createStudio(onState) {
  let state = {call:'idle',local:null,remote:null,camera:false,mic:false,devices:[],
    cameraId:'',micId:'',maker:emptySelection(),detector:emptySelection(),result:'',error:''};
  const media = navigator.mediaDevices;
  const tracks = {camera:null,mic:null};
  const runs = {maker:null,detector:null};
  let connector = null;
  let generation = 0;
  let disposed = false;
  let queue = Promise.resolve();
  const env = {ua:new UAParser().getResult(),secure:window.isSecureContext,mediaDevices:media};
  function update(patch) {
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
  for (const [kind,catalog] of Object.entries(catalogs)) {
    catalog.options(env).then(options=>update({[kind]:{options,selected:(options.find(o=>o.available) || options[0])?.id || '',active:false}}));
  }
  function local(video=runs.maker?.track ?? tracks.camera,audio=tracks.mic) {
    const list = [video,audio].filter(Boolean);
    return list.length ? new MediaStream(list) : null;
  }
  async function send(stream) {
    if (connector && state.call === 'active') {
      await connector.replaceMediaStream(stream ?? new MediaStream(),{addMissing:true,deleteExisting:true});
    }
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
    if (kind === 'maker') await send(local(tracks.camera));
    runs[kind] = null;
    try { await run.stop(); } finally {
      update({[kind]:{...state[kind],active:false},local:local(),...(kind==='detector'?{result:''}:{})});
    }
  }
  async function changeDevice(kind,id,enabled) {
    if (state.call==='connecting') throw new Error('Дождитесь подключения');
    const old = tracks[kind];
    const replacement = enabled ? await acquire(kind,id) : null;
    try {
      if (kind==='camera') await stop('maker');
      const stream = kind==='camera' ? local(replacement) : local(runs.maker?.track ?? tracks.camera,replacement);
      await send(stream);
      tracks[kind] = replacement;
      old?.stop();
      update({[kind]:enabled,[kind+'Id']:replacement?.getSettings().deviceId || id,local:stream});
    } catch (error) {replacement?.stop();throw error;}
    deviceChange();
  }
  async function activate(kind) {
    if (runs[kind]) return stop(kind);
    const choice = state[kind].options.find(item=>item.id===state[kind].selected);
    if (!choice?.available) throw new Error(choice?.reason || 'Реализация недоступна');
    const stream = kind==='maker' ? local(tracks.camera,null) : state.remote;
    if (!stream?.getVideoTracks().length) throw new Error(kind==='maker'?'Сначала включите камеру':'Ожидание входящего видео конференции');
    const run = await catalogs[kind].get(choice.id).start({stream,
      onResult:result=>update({result}),onError:error=>{update({error:error.message || String(error)});serialize(()=>stop(kind));}});
    try {
      if (kind==='detector' && stream!==state.remote) throw new Error('Входящий поток изменился');
      if (kind==='maker') await send(local(run.track));
      runs[kind] = run;
      update({[kind]:{...state[kind],active:true},local:local()});
    } catch(error) {await run.stop();throw error;}
  }
  async function hangup() {
    ++generation;
    const current = connector;
    connector = null;
    update({call:'idle',remote:null,result:''});
    const cleanup = serialize(()=>stop('detector'));
    if (current) {
      try { if (current.requestedCall || current.isCallActive) await current.hangUp(); }
      finally { await current.disconnect(); }
    }
    await cleanup;
  }
  async function dial(server,number) {
    if (state.call!=='idle') return;
    if (!number.trim()) throw new Error('Введите номер конференции');
    const config = endpoint(server);
    const token = ++generation;
    const current = new SipConnector({JsSIP});
    connector = current;
    update({call:'connecting',error:''});
    const ended = event=>{
      if (connector!==current) return;
      if(event?.cause) update({error:String(event.cause)});
      hangup().catch(e=>update({error:e.message}));
    };
    current.on('call:ended',ended);
    current.on('call:failed',ended);
    current.on('connection:disconnected',ended);
    current.on('call:remote-streams-changed',({streams})=>{
      if (connector!==current || state.remote===streams.mainStream) return;
      update({remote:streams.mainStream ?? null});
      serialize(()=>stop('detector'));
    });
    try {
      await queue;
      if (token!==generation) return;
      await current.connect({...config,register:false,displayName:'Deepfake Demo'});
      if (token!==generation) return;
      await current.call({number:number.trim(),mediaStream:local() ?? new MediaStream(),
        offerToReceiveAudio:true,offerToReceiveVideo:true},{autoRedial:false});
      if (token===generation) update({call:'active',remote:current.getRemoteStreams().mainStream ?? null});
    } catch(error) {
      if (token!==generation) return;
      await hangup();
      throw error;
    }
  }
  return {snapshot:()=>state,dial,hangup,
    toggleCamera:()=>serialize(()=>changeDevice('camera',state.cameraId,!state.camera)),
    toggleMic:()=>serialize(()=>changeDevice('mic',state.micId,!state.mic)),
    setDevice:(kind,id)=>serialize(()=>state[kind] ? changeDevice(kind,id,true) : update({[kind+'Id']:id})),
    select:(kind,id)=>{if (!state[kind].active && state[kind].options.some(o=>o.id===id && o.available)) update({[kind]:{...state[kind],selected:id}});},
    toggle:kind=>serialize(()=>activate(kind)),
    async dispose(){
      media?.removeEventListener('devicechange',deviceChange);
      await hangup();
      await serialize(()=>stop('maker'));
      disposed = true;
      Object.values(tracks).forEach(t=>t?.stop());
    }};
}
