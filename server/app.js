import {openingStockRoutes} from './opening-stock.js';
import {reliabilityRoutes} from './reliability.js';
import express from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import {rateLimit} from 'express-rate-limit';
import path from 'node:path';
import {z,ZodError} from 'zod';
import {one,rows,audit} from './db.js';
import {security,verifyPassword,hashPassword} from './security.js';
import {settingsSchema,fail} from './domain.js';
import {catalogRoutes} from './catalog.js';
import {catalogBrowserRoutes} from './catalog-browser.js';
import {commerceRoutes} from './commerce.js';
import {reportRoutes} from './reports.js';
import {snapshot,restore,saveBackup} from './backup.js';
export async function bootstrap(db,{email,password,name='Shop owner',shopName='Smart Retail'}={}){
 if(!(await one(db,'SELECT id FROM users LIMIT 1'))){if(!email||!password||password.length<12)throw new Error('Set ADMIN_EMAIL and ADMIN_PASSWORD (at least 12 characters) before first start.');await db.query('INSERT INTO users(name,email,password_hash,role) VALUES($1,$2,$3,$4)',[name,email.toLowerCase(),await hashPassword(password),'admin']);}
 if(!(await one(db,'SELECT id FROM settings WHERE id=1')))await db.query('INSERT INTO settings(id,value) VALUES(1,$1)',[JSON.stringify({name:shopName,address:'',phone:'',currency:'LKR',logo:'',tax:0,invoice_format:'80mm',thank_you:'Thank you for shopping with us!',timezone:'Asia/Colombo',cashier_discount_limit:0})]);
}
export function createApp(db,{secret,production=false,origin='http://127.0.0.1:5173',demo=false}={}){
 const app=express(),{sign,auth,admin}=security(db,secret);
 app.disable('x-powered-by');
 app.use(helmet({contentSecurityPolicy:{directives:{'default-src':["'self'"],'script-src':["'self'"],'style-src':["'self'","'unsafe-inline'"],'img-src':["'self'",'data:'],'connect-src':["'self'"],'font-src':["'self'",'data:'],'object-src':["'none'"],'frame-ancestors':["'none'"],...(production?{}:{'upgrade-insecure-requests':null})}}}));
 app.use(express.json({limit:'20mb'}),cookieParser());
 app.use('/api',(req,res,next)=>{res.set('Cache-Control','no-store');if(!['GET','HEAD','OPTIONS'].includes(req.method)){const source=req.get('origin');if(source&&source!==origin)return res.status(403).json({error:'Request origin is not allowed.'});if(req.get('sec-fetch-site')==='cross-site')return res.status(403).json({error:'Cross-site request rejected.'});if(!req.is('application/json'))return res.status(415).json({error:'Use JSON requests.'});}next();});
 const cookie={httpOnly:true,sameSite:'strict',secure:production,path:'/api',maxAge:8*60*60*1000};
 app.get('/api/health',async(req,res)=>{await db.query('SELECT 1');res.json({ok:true,application:'smart-retail'});});
 app.post('/api/auth/login',rateLimit({windowMs:15*60*1000,limit:15,standardHeaders:'draft-7',legacyHeaders:false,message:{error:'Too many sign-in attempts. Try again in 15 minutes.'}}),async(req,res)=>{const input=z.object({email:z.string().email().max(200),password:z.string().min(1).max(128)}).parse(req.body);const user=await one(db,'SELECT * FROM users WHERE email=$1',[input.email.toLowerCase()]);const hash=user?.password_hash||'00000000000000000000000000000000:'+('00'.repeat(64));if(!(await verifyPassword(input.password,hash))||!user?.active){await audit(db,null,'login_failed','auth');return res.status(401).json({error:'Email or password is incorrect.'});}await audit(db,user,'login','auth',user.id);res.cookie('session',sign(user),cookie).json({user:{id:user.id,name:user.name,role:user.role,email:user.email}});});
 app.use('/api',auth);
 app.get('/api/auth/me',async(req,res)=>res.json({user:req.user,settings:(await one(db,'SELECT value FROM settings WHERE id=1')).value,demo}));
 app.post('/api/auth/logout',async(req,res)=>{await db.query('UPDATE users SET session_version=session_version+1 WHERE id=$1',[req.user.id]);res.clearCookie('session',{path:'/api',sameSite:'strict',secure:production,httpOnly:true}).json({ok:true});});
 app.post('/api/auth/password',async(req,res)=>{const p=z.object({current:z.string().max(128),password:z.string().min(12).max(128)}).parse(req.body);const user=await one(db,'SELECT * FROM users WHERE id=$1',[req.user.id]);if(!await verifyPassword(p.current,user.password_hash))fail('Current password is incorrect.',403);await db.query('UPDATE users SET password_hash=$1,session_version=session_version+1 WHERE id=$2',[await hashPassword(p.password),user.id]);await audit(db,req.user,'password_change','user',user.id);res.clearCookie('session',{path:'/api'}).json({ok:true});});
 openingStockRoutes(app,db,admin);reliabilityRoutes(app,db,admin);catalogBrowserRoutes(app,db,admin);catalogRoutes(app,db,admin);commerceRoutes(app,db,admin);reportRoutes(app,db,admin);
 app.put('/api/settings',admin,async(req,res)=>{const settings=settingsSchema.parse(req.body);await db.transaction(async tx=>{await tx.query('UPDATE settings SET value=$1 WHERE id=1',[JSON.stringify(settings)]);await audit(tx,req.user,'update','settings');});res.json(settings);});
 app.get('/api/audit',admin,async(req,res)=>{const q=z.object({from:z.string().date().optional(),to:z.string().date().optional(),user_id:z.coerce.number().int().positive().optional(),action:z.string().max(80).optional()}).parse(req.query),args=[],where=[];const add=(key,v)=>{args.push(v);where.push(key.replace('?', '$'+args.length));};if(q.user_id)add('a.user_id=?',q.user_id);if(q.action)add('a.action=?',q.action);if(q.from||q.to){args.push((await one(db,'SELECT value FROM settings WHERE id=1')).value.timezone);const expr='(a.created_at AT TIME ZONE $'+args.length+')::date';if(q.from)add(expr+'>=?::date',q.from);if(q.to)add(expr+'<=?::date',q.to);}res.json(await rows(db,'SELECT a.*,u.name employee FROM audit_logs a LEFT JOIN users u ON u.id=a.user_id '+(where.length?'WHERE '+where.join(' AND '):'')+' ORDER BY a.id DESC LIMIT 2000',args));});
 app.get('/api/backup',admin,async(req,res)=>{await audit(db,req.user,'download','backup');res.attachment('smart-retail-backup.json').json(await snapshot(db));});
 app.post('/api/restore',admin,async(req,res)=>{const user=await one(db,'SELECT * FROM users WHERE id=$1',[req.user.id]);if(typeof req.body.password!=='string'||req.body.password.length>128||!await verifyPassword(req.body.password,user.password_hash))fail('Administrator password is incorrect.',403);settingsSchema.parse(req.body.backup?.data?.settings?.[0]?.value);await saveBackup(db);await restore(db,req.body.backup,req.user);res.clearCookie('session',{path:'/api'}).json({ok:true});});
 app.use('/api',(req,res)=>res.status(404).json({error:'Endpoint not found.'}));
 app.use(express.static(path.resolve('dist')));app.get('/{*path}',(req,res)=>res.sendFile(path.resolve('dist/index.html')));
 app.use((e,req,res,next)=>{if(res.headersSent)return next(e);if(e instanceof ZodError)return res.status(400).json({error:e.issues.map(i=>`${i.path.join('.')}: ${i.message}`).join('; ')});if(e.code==='23505')return res.status(409).json({error:'This code, barcode, email, or name already exists.'});if(e.code==='23503')return res.status(409).json({error:'This record is linked to another record. Check references before changing it.'});if(e.type==='entity.too.large')return res.status(413).json({error:'The file or request is too large.'});if(e.status)return res.status(e.status).json({error:e.message});console.error('Request failed',e);res.status(500).json({error:'The operation failed. No incomplete transaction was saved.'});});
 return app;
}
