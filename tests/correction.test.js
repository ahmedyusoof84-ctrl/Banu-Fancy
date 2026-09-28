import {test} from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import request from 'supertest';
import {createDatabase,one} from '../server/db.js';
import {createApp,bootstrap} from '../server/app.js';
test('invoice item correction preserves payment history, restores stock once, and updates reports using original line values',async()=>{
 const db=await createDatabase({dir:':memory:',url:''});try{
 const password='Correction-test-password!';await bootstrap(db,{email:'owner@test.local',password});const app=createApp(db,{secret:'correction-test-secret-more-than-32-characters'}),admin=request.agent(app);await admin.post('/api/auth/login').send({email:'owner@test.local',password});
 const products=[];for(let i=1;i<=2;i++)products.push((await admin.post('/api/products').send({name:'Correction '+i,code:'COR-'+i,barcode:'COR-'+i,quantity:10,min_stock:1,purchase_price:100,selling_price:1000,discount:1000,tax:500}).expect(201)).body);
 const sid=(await admin.post('/api/sales').send({request_id:crypto.randomUUID(),customer_id:null,items:products.map(p=>({product_id:p.id,quantity:2})),discount:1000,method:'cash',tendered:5000}).expect(201)).body.id;
 const invoice=(await admin.get('/api/sales/'+sid)).body,removed=invoice.items[0],remaining=invoice.items[1];
 const choices=(await admin.get('/api/sale-corrections').query({product_id:products[0].id,from:'2020-01-01',to:'2030-12-31'}).expect(200)).body;assert.equal(choices.length,1);assert.equal(choices[0].id,removed.id);
 const path=`/api/sales/${sid}/items/${removed.id}/remove`;
 await request(app).post(path).send({reason:'Mistake'}).expect(401);await admin.post(path).send({reason:''}).expect(400);
 await admin.post('/api/users').send({name:'Cashier',email:'cashier@test.local',password,role:'cashier'});const cashier=request.agent(app);await cashier.post('/api/auth/login').send({email:'cashier@test.local',password});await cashier.post(path).send({reason:'Mistake'}).expect(403);
 const correction=(await admin.post(path).send({reason:'Wrong product selected'}).expect(200)).body;assert.equal(correction.refund_due,removed.total);
 await admin.post(path).send({reason:'Repeat'}).expect(409);
 const after=(await admin.get('/api/sales/'+sid)).body;assert.equal(after.items.length,1);assert.equal(after.total,remaining.total);assert.equal(after.tax,remaining.tax);assert.equal(after.discount,remaining.discount);assert.deepEqual(after.payments,invoice.payments);assert.equal(after.paid,invoice.paid);
 assert.equal((await one(db,'SELECT quantity FROM products WHERE id=$1',[removed.product_id])).quantity,10);assert.ok((await one(db,'SELECT removed_at FROM sale_items WHERE id=$1',[removed.id])).removed_at);
 const report=(await admin.get('/api/reports?from=2020-01-01&to=2030-12-31')).body;assert.equal(report.best.length,1);assert.equal(Number(report.summary.sales),remaining.total);assert.equal(Number(report.summary.outstanding),0);
 assert.equal((await admin.get('/api/sale-corrections').query({sale_id:sid})).body.length,1);
 }finally{await db.close();}
});
