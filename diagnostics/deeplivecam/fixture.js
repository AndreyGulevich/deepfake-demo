// Dev-only acceptance fixture. The same React app, studio and maker run underneath.
const portrait = new Image();
portrait.src = new URL('./driver.jpg',import.meta.url).href;
await portrait.decode();
const canvas = document.createElement('canvas');
canvas.width = canvas.height = 512;
const ctx = canvas.getContext('2d');
let tick=0;
function paint() {
  ctx.drawImage(portrait,-4+3*Math.sin(tick++/18),-4,520,520);
}
paint();
const clock = setInterval(paint,100);
addEventListener('pagehide',()=>clearInterval(clock),{once:true});
Object.defineProperties(navigator.mediaDevices,{
  getUserMedia:{value:async constraints=>{
    if (constraints.video) return canvas.captureStream(10);
    throw new DOMException('В диагностике микрофон отключён','NotFoundError');
  }},
  enumerateDevices:{value:async()=>[{deviceId:'fixture',kind:'videoinput',label:'Синтетическая камера'}]},
});
// Prevent a SIP connection even if the normal dial control is accidentally activated.
document.addEventListener('submit',e=>{e.preventDefault();e.stopImmediatePropagation();},true);
const nativeFetch=window.fetch.bind(window);
let frames=0, changed=0, before=0;
const metrics=document.getElementById('metrics');
window.fetch=async (url,opts)=>{
  if(['http://127.0.0.1:8766/session','http://127.0.0.1:8766/session/photo'].includes(String(url).split('?')[0]) && opts?.method==='POST') {
    before=(await (await nativeFetch('http://127.0.0.1:8766/health')).json()).swappedFrames;
    frames=changed=0;
  }
  const response=await nativeFetch(url,opts);
  if (String(url)==='http://127.0.0.1:8766/frame' && response.ok) {
    const result=new Uint8Array(await response.clone().arrayBuffer());
    const input=opts.body;
    let difference=0, count=0;
    // Compare central facial pixels; the permanent label sits outside this region.
    for(let y=78;y<180;y++) for(let x=78;x<180;x++) {
      const p=(y*256+x)*4;
      if(result[p]+result[p+1]+result[p+2]>45) {
        count++;
        difference+=Math.abs(result[p]-input[p])+Math.abs(result[p+1]-input[p+1])+Math.abs(result[p+2]-input[p+2]);
      }
    }
    frames++;
    if(count>5000 && difference/(count*3)>1) changed++;
    metrics.textContent='Кадров от Deep-Live-Cam: '+frames+'. С изменённой областью лица: '+changed+'.';
  }
  if(String(url)==='http://127.0.0.1:8766/session' && opts?.method==='DELETE' && response.ok) {
    const after=(await (await nativeFetch('http://127.0.0.1:8766/health')).json()).swappedFrames;
    metrics.textContent+=' Сеанс закрыт. Замен лица у обработчика за интервал: '+(after-before)+'.';
  }
  return response;
};
await import('/src/main.jsx');
