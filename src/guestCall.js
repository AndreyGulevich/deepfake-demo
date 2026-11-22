const builtInServer = 'msk.vinteo.com';

export async function guestConnection(host, browser, tools, signal) {
  const url = host === builtInServer ? '/sip-config/address' : 'https://' + host + '/api/v1/address';
  const response = await fetch(url, {signal, credentials:'omit', cache:'no-store', redirect:'error'});
  if (!response.ok) throw new Error('Не удалось получить параметры SIP: HTTP ' + response.status);
  const config = await response.json();
  if (typeof config.ip !== 'string' || !config.ip.trim()) throw new Error('Сервер не вернул SIP-адрес');
  return {
    sipServerUrl:host, sipServerIp:config.ip, remoteAddress:config.remoteAddress,
    iceServers:Array.isArray(config.iceServers) ? config.iceServers : [{urls:['stun:' + config.ip + ':3478']}],
    register:false, displayName:'Deepfake Demo',
    userAgent:tools.getUserAgent({isUnifiedSdpSemantic:Boolean(config.unified), appName:'Deepfake Demo',
      appVersion:1, browserName:browser.name, browserVersion:browser.version}),
  };
}

export function guestOffer(number, stream, config, tools) {
  const live = tracks => tracks.some(t => t.enabled && t.readyState === 'live');
  return {number:number.trim(), mediaStream:stream, iceServers:config.iceServers,
    offerToReceiveAudio:true, offerToReceiveVideo:true,
    extraHeaders:tools.getExtraHeaders({isRegistered:false, remoteAddress:config.remoteAddress,
      isMutedAudio:!live(stream.getAudioTracks()), isMutedVideo:!live(stream.getVideoTracks())})};
}
