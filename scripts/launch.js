import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
process.chdir(root);
if(!fs.existsSync('node_modules/dotenv')){console.error('First-time installation: run npm ci in this folder. See README.md for setup instructions.');process.exit(1);}
if(!fs.existsSync('.env')){console.error('First-time installation: copy .env.example to .env and set ADMIN_EMAIL, ADMIN_PASSWORD, and APP_ORIGIN=http://127.0.0.1:3001. See README.md.');process.exit(1);}
await import('dotenv/config');
const port=Number(process.env.PORT)||3001;
if(!Number.isInteger(port)||port<1||port>65535)throw new Error('Invalid PORT in .env.');
const url=`http://127.0.0.1:${port}`;
if(process.env.NODE_ENV==='production'){console.error('This launcher is for local use. Start your production service with npm start behind your HTTPS proxy.');process.exit(1);}
if(!fs.existsSync('dist/index.html')){console.error('Run npm run build once, then double-click this launcher again.');process.exit(1);}
const healthy=async()=>{try{const r=await fetch(url+'/api/health',{signal:AbortSignal.timeout(1200)});return r.ok&&(await r.json()).application==='smart-retail';}catch{return false;}};
if(!await healthy()){
 const logDir=path.resolve(process.env.DATA_DIR||'./data');fs.mkdirSync(logDir,{recursive:true});
 const fd=fs.openSync(path.join(logDir,'server.log'),'a');
 const child=spawn(process.execPath,['server/index.js'],{cwd:root,detached:true,windowsHide:true,stdio:['ignore',fd,fd]});child.unref();fs.closeSync(fd);
 let ready=false;
 for(let i=0;i<40;i++){if(await healthy()){ready=true;break;}await new Promise(r=>setTimeout(r,500));}
 if(!ready){console.error('The shop server could not start. Check '+path.join(logDir,'server.log')+' for the reason.');process.exit(1);}
}
if(process.env.APP_ORIGIN!==url)console.warn(`Set APP_ORIGIN=${url} in .env if you want to use the compiled local app.`);
console.log('Smart Retail is running at '+url);
// This URL is constructed only from a validated port, never from untrusted shell text.
if(!process.argv.includes('--no-open')){
const opener=process.platform==='win32'?spawn('cmd.exe',['/d','/c','start','',url],{windowsHide:true,detached:true,stdio:'ignore'}):spawn(process.platform==='darwin'?'open':'xdg-open',[url],{detached:true,stdio:'ignore'});
opener.on('error',()=>console.log('Open this address in your browser: '+url));opener.unref();
}
