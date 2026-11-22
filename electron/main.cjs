const {app, BrowserWindow, session, systemPreferences, protocol, net} = require('electron');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
const root = path.resolve(__dirname,'../dist');
protocol.registerSchemesAsPrivileged([{scheme:'studio',privileges:{
  standard:true,secure:true,supportFetchAPI:true,corsEnabled:true,stream:true
}}]);
const page = !app.isPackaged && process.env.STUDIO_DEV === '1'
  ? 'http://127.0.0.1:3000/' : 'studio://app/index.html';
app.whenReady().then(() => {
  protocol.handle('studio', request => {
    const url = new URL(request.url);
    const file = path.resolve(root,'.' + decodeURIComponent(url.pathname));
    if (url.hostname !== 'app' || !file.startsWith(root + path.sep)) return new Response(null,{status:403});
    return net.fetch(pathToFileURL(file).href);
  });
  const window = new BrowserWindow({width:1360,height:900,minWidth:640,minHeight:480,
    webPreferences:{contextIsolation:true,nodeIntegration:false,sandbox:true}});
  const trusted = contents => contents === window.webContents && contents.getURL() === page;
  session.defaultSession.setPermissionCheckHandler((contents, permission) => trusted(contents) && permission === 'media');
  session.defaultSession.setPermissionRequestHandler(async (contents, permission, respond, details) => {
    if (!trusted(contents) || permission !== 'media' || details.isMainFrame === false) return respond(false);
    try {
      for (const kind of details.mediaTypes || []) {
        if (process.platform === 'darwin' && !(await systemPreferences.askForMediaAccess(kind === 'video' ? 'camera' : 'microphone'))) return respond(false);
      }
      respond(true);
    } catch { respond(false); }
  });
  window.webContents.setWindowOpenHandler(() => ({action:'deny'}));
  window.webContents.on('will-navigate',(event,url) => {if (url !== page) event.preventDefault();});
  window.loadURL(page);
});
app.on('window-all-closed', () => app.quit());
