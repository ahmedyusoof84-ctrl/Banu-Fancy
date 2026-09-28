import { PGlite } from '@electric-sql/pglite';
import pg from 'pg';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
export async function createDatabase({url=process.env.DATABASE_URL,dir=process.env.DATA_DIR||'./data'}={}) {
 let engine,db;
 if(url){
  engine=new pg.Pool({connectionString:url,max:10});
  db={query:(sql,args=[])=>engine.query(sql,args),transaction:async fn=>{const c=await engine.connect();try{await c.query('BEGIN');const r=await fn(c);await c.query('COMMIT');return r;}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}},close:()=>engine.end()};
 }else{
  if(dir!==':memory:')await fs.mkdir(path.resolve(dir),{recursive:true});
  engine=new PGlite(dir===':memory:'?undefined:path.resolve(dir));await engine.waitReady;
  db={query:(sql,args=[])=>engine.query(sql,args),transaction:fn=>engine.transaction(fn),close:()=>engine.close()};
 }
 const schema=await fs.readFile(fileURLToPath(new URL('./schema.sql',import.meta.url)),'utf8');
 // schema statements have no embedded semicolons; compatible with both drivers.
 for(const statement of schema.split(';').filter(s=>s.trim()))await db.query(statement);
 return db;
}
export const rows=async(db,sql,args=[]) => (await db.query(sql,args)).rows;
export const one=async(db,sql,args=[]) => (await rows(db,sql,args))[0];
export async function audit(db,user,action,entity,id='',detail={}) {await db.query('INSERT INTO audit_logs(user_id,action,entity,entity_id,detail) VALUES($1,$2,$3,$4,$5)',[user?.id||null,action,entity,String(id),JSON.stringify(detail)]);}
