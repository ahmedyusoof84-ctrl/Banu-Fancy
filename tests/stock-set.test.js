import {test} from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import crypto from 'node:crypto';
import {createDatabase,one} from '../server/db.js';
import {createApp,bootstrap} from '../server/app.js';
test('set stock updates availability and history, rejects stale quantities and invalid input',async()=>{
 const db=await createDatabase({dir:':memory:',url:''});try{
 const password='Stock-test-password!';await bootstrap(db,{email:'owner@test.local',password});const app=createApp(db,{secret:'stock-test-secret-more-than-32-characters'}),admin=request.agent(app);await admin.post('/api/auth/login').send({email:'owner@test.local',password});
 const p=(await admin.post('/api/products').send({name:'Stock test',code:'STOCK-1',barcode:'STOCK-1',quantity:10,min_stock:3,purchase_price:100,selling_price:200}).expect(201)).body;
 const set=(quantity,expected_quantity)=>admin.post('/api/stock/set').send({product_id:p.id,quantity,expected_quantity,note:'Correct count'});
 await set(0,10).expect(200);assert.equal((await admin.get('/api/catalog?stock=out')).body.total,1);
 await set(8,10).expect(409);assert.equal((await one(db,'SELECT quantity FROM products WHERE id=$1',[p.id])).quantity,0);
 await set(2,0).expect(200);assert.equal((await admin.get('/api/catalog?stock=low')).body.total,1);
 await set(8,2).expect(200);assert.equal((await admin.get('/api/catalog?stock=in')).body.total,1);
 const h=(await admin.get('/api/stock/history')).body;assert.equal(h[0].delta,6);assert.equal(h[0].balance,8);
 await set(-1,8).expect(400);await set(1.5,8).expect(400);await request(app).post('/api/stock/set').send({}).expect(401);
 await admin.post('/api/stock/set').send({product_id:p.id,mode:'set',quantity:25,expected_quantity:8,reason:'Opening stock',note:'Existing shop stock'}).expect(200);
 await admin.post('/api/stock/set').send({product_id:p.id,mode:'add',quantity:5,expected_quantity:25,note:'Delivery received'}).expect(200);
 assert.equal((await one(db,'SELECT quantity FROM products WHERE id=$1',[p.id])).quantity,30);
 const changes=(await admin.get('/api/stock/history')).body;assert.equal(changes[0].reason,'Manual addition');assert.equal(changes[0].delta,5);assert.equal(changes[0].balance,30);assert.ok(changes[0].created_at);assert.equal(changes[1].reason,'Opening stock');
 await admin.post('/api/stock/set').send({product_id:p.id,mode:'add',quantity:5,expected_quantity:25,note:'Duplicate stale delivery'}).expect(409);
 await admin.post('/api/sales').send({request_id:crypto.randomUUID(),customer_id:null,items:[{product_id:p.id,quantity:3}],discount:0,method:'cash',tendered:1000}).expect(201);
 assert.equal((await admin.get('/api/products')).body.find(r=>r.id===p.id).quantity,27);assert.equal((await admin.get('/api/catalog')).body.items.find(r=>r.id===p.id).quantity,27);
 await admin.post('/api/users').send({name:'Cashier',email:'cashier@test.local',password,role:'cashier'});const cashier=request.agent(app);await cashier.post('/api/auth/login').send({email:'cashier@test.local',password});await cashier.post('/api/stock/set').send({product_id:p.id,quantity:0,expected_quantity:8,note:'Blocked'}).expect(403);
 }finally{await db.close();}
});
