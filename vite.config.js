import {defineConfig} from 'vite';

// Only relay the public address descriptor of the built-in conference server.
function serveAddress(server) {
  server.middlewares.use(async (req, res, next) => {
    if (req.url !== '/sip-config/address') return next();
    if (req.method !== 'GET') { res.writeHead(405).end(); return; }
    try {
      const reply = await fetch('https://msk.vinteo.com/api/v1/address', {
        redirect:'error', signal:AbortSignal.timeout(12000),
      });
      if (!reply.ok) { res.writeHead(reply.status).end(); return; }
      const {ip, remoteAddress, iceServers, unified} = await reply.json();
      res.writeHead(200, {'Content-Type':'application/json','Cache-Control':'no-store'});
      res.end(JSON.stringify({ip,remoteAddress,iceServers,unified}));
    } catch { res.writeHead(502).end(); }
  });
}
export default defineConfig({
  base:'./', build:{license:true}, worker:{format:'es'},
  plugins:[{name:'sip-address',configureServer:serveAddress,configurePreviewServer:serveAddress}],
  server:{host:'127.0.0.1',port:3003,strictPort:true},
});
