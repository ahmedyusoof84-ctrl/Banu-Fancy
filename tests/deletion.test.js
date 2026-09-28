import {test} from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import request from 'supertest';
import {createDatabase,one} from '../server/db.js';
import {createApp,bootstrap} from '../server/app.js';
test('row deletion archives linked contacts/products, preserves invoices, deletes expenses and enforces permissions',async()=>{
 const db=await createDatabase({dir:':memory:',url:''});
 try{
 const password='Deletion-test-password!';await bootstrap(db,{email:'owner@test.local',password});const app=createApp(db,{secret:'deletion-test-secret-more-than-32-characters'}),admin=request.agent(app);await admin.post('/api/auth/login').send({email:'owner@test.local',password}).expect(200);
 const customer=(await admin.post('/api/customers').send({name:'Linked customer'}).expect(201)).body;
 const supplier=(await admin.post('/api/suppliers').send({name:'Linked supplier'}).expect(201)).body;
 const product=(await admin.post('/api/products').send({name:'Linked item',code:'DEL-1',barcode:'DEL-1',quantity:5,min_stock:1,purchase_price:100,selling_price:200}).expect(201)).body;
 const purchase=(await admin.post('/api/purchases').send({supplier_id:supplier.id,reference:'KEEP-INVOICE',paid:0,items:[{product_id:product.id,quantity:1,cost:100}]}).expect(201)).body;
 const sale=(await admin.post('/api/sales').send({request_id:crypto.randomUUID(),customer_id:customer.id,items:[{product_id:product.id,quantity:1}],discount:0,method:'credit',tendered:0}).expect(201)).body;
 for(const [type,record] of [['customers',customer],['suppliers',supplier],['products',product]]){
  assert.equal((await admin.delete(`/api/${type}/${record.id}`).send({}).expect(200)).body.archived,true);
  assert.equal((await admin.get(`/api/${type}`)).body.some(r=>r.id===record.id),false);
  assert.equal((await one(db,`SELECT active FROM ${type} WHERE id=$1`,[record.id])).active,false);
  await admin.delete(`/api/${type}/${record.id}`).send({}).expect(404);
 }
 await admin.get(`/api/sales/${sale.id}`).expect(200);assert.equal((await admin.get(`/api/purchases/${purchase.id}`).expect(200)).body.supplier,'Linked supplier');await admin.get(`/api/customers/${customer.id}/statement`).expect(200);
 await admin.post(`/api/sales/${sale.id}/payments`).send({amount:100,method:'cash'}).expect(200);await admin.post(`/api/purchases/${purchase.id}/payments`).send({amount:100,method:'cash'}).expect(200);
 for(const type of ['customers','suppliers']){const record=(await admin.post('/api/'+type).send({name:'Unlinked'}).expect(201)).body;assert.equal((await admin.delete(`/api/${type}/${record.id}`).send({}).expect(200)).body.archived,false);assert.equal(await one(db,`SELECT id FROM ${type} WHERE id=$1`,[record.id]),undefined);}
 const expense=(await admin.post('/api/expenses').send({category:'Other',description:'Test deletion',amount:250,date:'2026-09-28'}).expect(201)).body;
 await request(app).delete('/api/expenses/'+expense.id).send({}).expect(401);
 await admin.post('/api/users').send({name:'Cashier',email:'cashier@test.local',password,role:'cashier'}).expect(201);const cashier=request.agent(app);await cashier.post('/api/auth/login').send({email:'cashier@test.local',password}).expect(200);
 for(const type of ['products','customers','suppliers','expenses'])await cashier.delete(`/api/${type}/${expense.id}`).send({}).expect(403);
 await admin.delete('/api/expenses/'+expense.id).send({}).expect(200);await admin.delete('/api/expenses/'+expense.id).send({}).expect(404);assert.equal((await admin.get('/api/expenses')).body.length,0);assert.equal((await one(db,"SELECT detail FROM audit_logs WHERE entity='expense' AND action='delete'")).detail.before.amount,250);
 }finally{await db.close();}
});
