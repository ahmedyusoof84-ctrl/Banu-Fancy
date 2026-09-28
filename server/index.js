import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {createDatabase} from './db.js';
import {createApp,bootstrap} from './app.js';
import {saveBackup} from './backup.js';
const production=process.env.NODE_ENV==='production';
const origin=process.env.APP_ORIGIN||(process.env.RENDER==='true'?process.env.RENDER_EXTERNAL_URL:undefined);
let secret=process.env.JWT_SECRET;
if(!secret){if(production)throw new Error('JWT_SECRET is required in production.');const dir=path.resolve(process.env.DATA_DIR||'./data');await fs.mkdir(dir,{recursive:true});const file=path.join(dir,'.jwt-secret');try{secret=await fs.readFile(file,'utf8');}catch{secret=crypto.randomBytes(48).toString('hex');await fs.writeFile(file,secret,{mode:0o600});}}
if(secret.length<32)throw new Error('JWT_SECRET must contain at least 32 characters.');
if(production&&!origin?.startsWith('https://'))throw new Error('Set APP_ORIGIN to the public HTTPS origin.');
const db=await createDatabase();await bootstrap(db,{email:process.env.ADMIN_EMAIL,password:process.env.ADMIN_PASSWORD,shopName:process.env.SHOP_NAME});
const app=createApp(db,{secret,production,origin,demo:process.env.DEMO_DATA==='true'});
const server=app.listen(Number(process.env.PORT)||3001,process.env.HOST||'127.0.0.1',()=>console.log('Smart Retail API is ready.'));
let backupRunning=false;
const timer=setInterval(async()=>{if(backupRunning)return;backupRunning=true;try{await saveBackup(db);}catch(e){console.error('Automatic backup failed:',e.message);await db.query('UPDATE backup_status SET last_error=$1 WHERE id=1',[e.message]).catch(()=>{});}finally{backupRunning=false;}},Math.max(1,Number(process.env.BACKUP_INTERVAL_HOURS)||24)*3600000);timer.unref();
const shutdown=()=>{clearInterval(timer);server.close(async()=>{await db.close();process.exit(0);});};process.on('SIGINT',shutdown);process.on('SIGTERM',shutdown);
