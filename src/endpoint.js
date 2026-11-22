export function endpoint(value) {
  const raw = value.trim();
  if (!raw || /[\s?#@]/.test(raw)) throw new Error('Введите адрес сервера ВКС');
  const url = new URL(raw.includes('://') ? raw : 'https://'+raw);
  if (!['https:','wss:'].includes(url.protocol) || !['/','/webrtc/wss/'].includes(url.pathname)) {
    throw new Error('Укажите имя сервера и при необходимости порт. SIP использует /webrtc/wss/');
  }
  return {sipServerUrl:url.host};
}
