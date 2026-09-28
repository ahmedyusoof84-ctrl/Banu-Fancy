import crypto from 'node:crypto';
import { promisify } from 'node:util';
import jwt from 'jsonwebtoken';
import { one } from './db.js';
const scrypt=promisify(crypto.scrypt);
export async function hashPassword(password){const salt=crypto.randomBytes(16).toString('hex');return `${salt}:${(await scrypt(password,salt,64)).toString('hex')}`;}
export async function verifyPassword(password,hash){const [salt,key]=hash.split(':');const actual=await scrypt(password,salt,64);const expected=Buffer.from(key,'hex');return actual.length===expected.length&&crypto.timingSafeEqual(actual,expected);}
export function security(db,secret){
 const sign=user=>jwt.sign({sub:String(user.id),v:user.session_version},secret,{expiresIn:'8h',issuer:'smart-retail',audience:'smart-retail-app'});
 const auth=async(req,res,next)=>{try{const payload=jwt.verify(req.cookies.session||'',secret,{algorithms:['HS256'],issuer:'smart-retail',audience:'smart-retail-app'});const u=await one(db,'SELECT id,name,email,role,active,session_version FROM users WHERE id=$1',[payload.sub]);if(!u?.active||u.session_version!==payload.v)return res.status(401).json({error:'Please sign in again.'});req.user=u;next();}catch{return res.status(401).json({error:'Please sign in.'});}};
 const admin=(req,res,next)=>req.user.role==='admin'?next():res.status(403).json({error:'Administrator access required.'});
 return {sign,auth,admin};
}
