import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import crypto from 'node:crypto';
import {createDatabase,one} from '../server/db.js';
import {createApp,bootstrap} from '../server/app.js';
import {snapshot,restore} from '../server/backup.js';
let db,app,admin,cashier,user;
const pass='Reliability-test-password!';
before(async()=>{db=await createDatabase({dir:':memory:',url:''});await bootstrap(db,{email:'admin@test.local',password:pass});app=createApp(db,{secret:'reliability-test-secret-more-than-32-characters'});admin=request.agent(app);await admin.post('/api/auth/login').send({email:'admin@test.local',password:pass});user=await one(db,'SELECT * FROM users WHERE email=$1',['admin@test.local']);await admin.post('/api/users').send({name:'Cashier',email:'cashier@test.local',password:pass,role:'cashier'});cashier=request.agent(app);await cashier.post('/api/auth/login').send({email:'cashier@test.local',password:pass});});
after(async()=>db.close());
let n=0;async function product(extra={}){n++;return (await admin.post('/api/products').send({name:'Test '+n,code:'REL-'+n,barcode:'REL-'+n,quantity:10,min_stock:2,purchase_price:100,selling_price:1000,...extra}).expect(201)).body;}
async function sale(p,extra={}){return (await admin.post('/api/sales').send({request_id:crypto.randomUUID(),customer_id:null,items:[{product_id:p.id,quantity:1}],discount:0,method:'cash',tendered:10000,...extra}).expect(201)).body.id;}
const invoice=async id=>(await admin.get('/api/sales/'+id).expect(200)).body;
test('full correction keeps original invoice, becomes voided/refund pending, and refunds reconcile exactly once',async()=>{
 const p=await product({selling_price:13000}),sid=await sale(p,{tendered:13000});let s=await invoice(sid);assert.equal(s.status,'Completed');assert.equal((await one(db,'SELECT quantity FROM products WHERE id=$1',[p.id])).quantity,9);
 await admin.post(`/api/sales/${sid}/items/${s.items[0].id}/remove`).send({reason:'Wrong invoice',restock:true}).expect(200);s=await invoice(sid);assert.equal(s.status,'Refund Pending');assert.equal(s.transaction_status,'Voided');assert.equal(s.original_items.length,1);assert.equal(s.original_total,13000);assert.equal(s.total,0);assert.equal(Number(s.refund_due),13000);assert.equal(s.corrections[0].employee,user.name);assert.ok(s.corrections[0].created_at);
 const key=crypto.randomUUID(),body={request_id:key,amount:5000,method:'cash',reason:'Returned cash'};await admin.post(`/api/sales/${sid}/refunds`).send(body).expect(200);await admin.post(`/api/sales/${sid}/refunds`).send(body).expect(200);s=await invoice(sid);assert.equal(s.refunds.length,1);assert.equal(Number(s.refund_due),8000);assert.equal(Number(s.outstanding),0);
 await admin.post(`/api/sales/${sid}/refunds`).send({...body,request_id:crypto.randomUUID(),amount:8001}).expect(409);await admin.post(`/api/sales/${sid}/refunds`).send({...body,request_id:crypto.randomUUID(),amount:8000}).expect(200);s=await invoice(sid);assert.equal(s.status,'Refunded');assert.equal(Number(s.refund_due),0);assert.equal(s.payments[0].amount,13000);assert.equal((await one(db,'SELECT quantity FROM products WHERE id=$1',[p.id])).quantity,10);
 const report=(await admin.get('/api/reports?from=2020-01-01&to=2035-01-01')).body;assert.equal(Number(report.summary.refunds),13000);assert.equal(Number(report.summary.money_collected),13000);assert.equal(Number(report.summary.net_collected),0);assert.equal(report.summary.transactions,0);assert.equal(report.summary.voided_transactions,1);
 assert.equal((await admin.get('/api/sales?status=Voided')).body.length,1);
});
test('partial correction/refund, historical costs and credit repayment remain consistent',async()=>{
 const p=await product(),q=await product(),customer=(await admin.post('/api/customers').send({name:'Credit customer'})).body;
 const sid=await sale(p,{customer_id:customer.id,items:[{product_id:p.id,quantity:1},{product_id:q.id,quantity:1}],method:'credit',tendered:500});let s=await invoice(sid);await admin.post(`/api/sales/${sid}/items/${s.items[0].id}/remove`).send({reason:'Wrong item',restock:false}).expect(200);s=await invoice(sid);assert.equal(Number(s.outstanding),500);assert.equal((await one(db,'SELECT cost FROM sales WHERE id=$1',[sid])).cost,200);assert.equal((await one(db,'SELECT quantity FROM products WHERE id=$1',[p.id])).quantity,9);await admin.post(`/api/sales/${sid}/payments`).send({amount:500,method:'cash',reference:'Settled credit'}).expect(200);assert.equal(Number((await invoice(sid)).outstanding),0);
 const cashSale=await sale(p,{items:[{product_id:p.id,quantity:1},{product_id:q.id,quantity:1}],tendered:2000});const original=await invoice(cashSale);await admin.post(`/api/sales/${cashSale}/items/${original.items[0].id}/remove`).send({reason:'Wrong line'}).expect(200);await admin.post(`/api/sales/${cashSale}/refunds`).send({request_id:crypto.randomUUID(),amount:1000,method:'card',reason:'Card refund confirmed'}).expect(200);assert.equal((await invoice(cashSale)).status,'Partially Refunded');
 await db.query('UPDATE products SET purchase_price=9999 WHERE id=$1',[q.id]);const stored=await one(db,'SELECT cost FROM sale_items WHERE sale_id=$1 AND removed_at IS NULL',[sid]);assert.equal(stored.cost,100);assert.equal(Number((await admin.get('/api/customers/'+customer.id+'/statement')).body.sales[0].outstanding),0);
});
test('shop, exempt and custom-zero taxes are distinct; imports are validated and atomic',async()=>{
 const settings=(await admin.get('/api/auth/me')).body.settings;await admin.put('/api/settings').send({...settings,tax:1000}).expect(200);
 const shop=await product({tax_mode:'shop',tax:0}),exempt=await product({tax_mode:'exempt',tax:1000}),zero=await product({tax_mode:'custom',tax:0});assert.equal((await invoice(await sale(shop))).tax,100);assert.equal((await invoice(await sale(exempt))).tax,0);assert.equal((await invoice(await sale(zero))).tax,0);
 const preview=(await admin.post('/api/stock/opening/preview').send({rows:[{code:shop.code,quantity:25,note:'Counted stock'},{code:exempt.code,quantity:12,note:'Counted stock'}]}).expect(200)).body;assert.equal(preview.valid,true);const key=crypto.randomUUID();await admin.post('/api/stock/opening').send({request_id:key,rows:preview.rows}).expect(200);await admin.post('/api/stock/opening').send({request_id:key,rows:preview.rows}).expect(200);assert.equal((await one(db,'SELECT quantity FROM products WHERE id=$1',[shop.id])).quantity,25);
 const invalid=(await admin.post('/api/stock/opening/preview').send({rows:[{code:shop.code,quantity:-1,note:''},{code:shop.code,quantity:3,note:'duplicate'}]})).body;assert.equal(invalid.valid,false);
 await admin.post('/api/stock/opening').send({request_id:crypto.randomUUID(),rows:[{product_id:shop.id,quantity:2,expected_quantity:25,note:'first'},{product_id:exempt.id,quantity:2,expected_quantity:999,note:'stale'}]}).expect(409);assert.equal((await one(db,'SELECT quantity FROM products WHERE id=$1',[shop.id])).quantity,25);
 await admin.post('/api/stock/set').send({product_id:shop.id,mode:'remove',quantity:2,expected_quantity:25,note:'Damaged count'}).expect(200);assert.equal((await one(db,'SELECT quantity FROM products WHERE id=$1',[shop.id])).quantity,23);
});
test('supplier receiving is idempotent, balances settle, expenses attach receipts, and filters work',async()=>{
 const p=await product(),supplier=(await admin.post('/api/suppliers').send({name:'Delivery supplier'})).body,key=crypto.randomUUID(),body={request_id:key,supplier_id:supplier.id,reference:'DELIVERY-1',paid:100,items:[{product_id:p.id,quantity:4,cost:100}]};const a=(await admin.post('/api/purchases').send(body).expect(201)).body;const b=(await admin.post('/api/purchases').send(body).expect(201)).body;assert.equal(a.id,b.id);assert.equal((await one(db,'SELECT quantity FROM products WHERE id=$1',[p.id])).quantity,14);let statement=(await admin.get(`/api/suppliers/${supplier.id}/statement`)).body;assert.equal(statement.purchases[0].total-statement.purchases[0].paid,300);await admin.post(`/api/purchases/${a.id}/payments`).send({amount:300,method:'cash'}).expect(200);statement=(await admin.get(`/api/suppliers/${supplier.id}/statement`)).body;assert.equal(statement.payments.length,2);
 await admin.post('/api/expense-categories').send({name:'Packaging'}).expect(201);const receipt='data:image/png;base64,iVBORw0KGgo=';const expense=(await admin.post('/api/expenses').send({category:'Packaging',description:'Bags',amount:100,date:'2026-09-28',receipt}).expect(201)).body;assert.equal(expense.receipt,receipt);
 const logs=(await admin.get('/api/audit?from=2020-01-01&to=2035-01-01&action=refund&user_id='+user.id)).body;assert.ok(logs.length);assert.ok(logs.every(l=>l.action==='refund'&&l.user_id===user.id));await admin.get('/api/sales?from=2020-01-01&status=Completed&method=cash').expect(200);await admin.get('/api/backup/status').expect(200);
});
test('cashiers cannot refund, change stock, export, delete, or manage financial records; backups retain corrections',async()=>{
 for(const url of ['/api/stock/opening','/api/stock/opening/preview','/api/sales/1/refunds','/api/expense-categories'])await cashier.post(url).send({}).expect(403);
 for(const url of ['/api/reports/export.xlsx','/api/products/export.xlsx','/api/backup/status','/api/audit'])await cashier.get(url).expect(403);
 for(const type of ['products','customers','suppliers','expenses'])await cashier.delete('/api/'+type+'/1').send({}).expect(403);
 const backup=await snapshot(db);const before=Number((await one(db,'SELECT COUNT(*) count FROM sale_refunds')).count);await restore(db,backup,user);assert.equal(Number((await one(db,'SELECT COUNT(*) count FROM sale_refunds')).count),before);assert.ok(Number((await one(db,'SELECT COUNT(*) count FROM sale_corrections')).count)>0);
});
test('void reverses remaining lines atomically, preserves payments, prevents duplicate stock and denies cashiers',async()=>{
 await admin.post('/api/auth/login').send({email:'admin@test.local',password:pass}).expect(200);await cashier.post('/api/auth/login').send({email:'cashier@test.local',password:pass}).expect(200);
 const a=await product({tax_mode:'exempt'}),b=await product({tax_mode:'exempt'}),sid=await sale(a,{items:[{product_id:a.id,quantity:2},{product_id:b.id,quantity:3}],tendered:5000});
 await cashier.post(`/api/sales/${sid}/void`).send({reason:'Wrong invoice'}).expect(403);
 await admin.post(`/api/sales/${sid}/void`).send({reason:''}).expect(400);
 await admin.post(`/api/sales/${sid}/void`).send({reason:'Duplicate invoice',restock:true}).expect(200);
 const s=await invoice(sid);assert.equal(s.total,0);assert.equal(s.transaction_status,'Voided');assert.equal(s.original_items.length,2);assert.equal(s.corrections.length,2);assert.equal(Number(s.refund_due),5000);assert.equal(s.payments[0].amount,5000);
 for(const p of [a,b])assert.equal((await one(db,'SELECT quantity FROM products WHERE id=$1',[p.id])).quantity,10);
 await admin.post(`/api/sales/${sid}/void`).send({reason:'Repeated',restock:true}).expect(409);
 assert.equal((await one(db,'SELECT quantity FROM products WHERE id=$1',[a.id])).quantity,10);
});
test('expense edits validate input and preserve before/after audit and creator',async()=>{
 const input={category:'Packaging',description:'Original expense',amount:100,date:'2026-09-28',receipt:''};const e=(await admin.post('/api/expenses').send(input).expect(201)).body;
 await cashier.put('/api/expenses/'+e.id).send({...input,amount:200}).expect(403);
 await admin.put('/api/expenses/'+e.id).send({...input,amount:-1}).expect(400);
 const updated=(await admin.put('/api/expenses/'+e.id).send({...input,amount:200,description:'Corrected expense'}).expect(200)).body;
 assert.equal(updated.amount,200);assert.equal(updated.created_by,e.created_by);
 const log=await one(db,"SELECT detail FROM audit_logs WHERE entity='expense' AND entity_id=$1 AND action='update' ORDER BY id DESC LIMIT 1",[String(e.id)]);assert.equal(log.detail.before.amount,100);assert.equal(log.detail.after.amount,200);
});
test('deleting an incorrect invoice removes it from every operational report and restores stock once',async()=>{
 await admin.post('/api/auth/login').send({email:'admin@test.local',password:pass}).expect(200);await cashier.post('/api/auth/login').send({email:'cashier@test.local',password:pass}).expect(200);
 const p=await product({selling_price:13000,purchase_price:5000,tax_mode:'exempt'}),sid=await sale(p,{tendered:13000});const before=await admin.get('/api/reports?from=2020-01-01&to=2035-01-01').expect(200);assert.ok(Number(before.body.summary.original_sales)>=13000);
 await cashier.delete(`/api/sales/${sid}`).send({reason:'Test',confirm_no_exchange:true}).expect(403);
 await admin.delete(`/api/sales/${sid}`).send({reason:'',confirm_no_exchange:true}).expect(400);
 await admin.delete(`/api/sales/${sid}`).send({reason:'Accidental test invoice',confirm_no_exchange:false}).expect(400);
 await admin.delete(`/api/sales/${sid}`).send({reason:'Accidental test invoice',confirm_no_exchange:true}).expect(200);
 assert.equal((await one(db,'SELECT quantity FROM products WHERE id=$1',[p.id])).quantity,10);
 assert.equal((await admin.get('/api/sales').expect(200)).body.some(s=>s.id===sid),false);
 const deleted=(await admin.get('/api/sales?deleted=true').expect(200)).body.find(s=>s.id===sid);assert.ok(deleted.deleted_at);
 const after=(await admin.get('/api/reports?from=2020-01-01&to=2035-01-01').expect(200)).body;
 assert.equal(Number(before.body.summary.sales)-Number(after.summary.sales),13000);
 assert.equal(Number(before.body.summary.original_sales)-Number(after.summary.original_sales),13000);
 assert.equal(Number(before.body.summary.money_collected)-Number(after.summary.money_collected),13000);
 assert.equal(Number(before.body.summary.gross_profit)-Number(after.summary.gross_profit),8000);
 assert.equal((await admin.get('/api/sale-corrections?product_id='+p.id).expect(200)).body.some(r=>r.sale_id===sid),false);
 assert.equal((await admin.get('/api/sales/'+sid).expect(200)).body.original_items.length,1);
 await admin.delete(`/api/sales/${sid}`).send({reason:'Again',confirm_no_exchange:true}).expect(409);
 await admin.post(`/api/sales/${sid}/void`).send({reason:'Again'}).expect(409);
 await admin.post(`/api/sales/${sid}/refunds`).send({request_id:crypto.randomUUID(),amount:1,method:'cash',reason:'Again'}).expect(409);
 assert.equal((await one(db,'SELECT quantity FROM products WHERE id=$1',[p.id])).quantity,10);
 const log=await one(db,"SELECT detail FROM audit_logs WHERE entity='sale' AND entity_id=$1 AND action='delete_incorrect'",[String(sid)]);assert.equal(log.detail.reason,'Accidental test invoice');
});
test('incorrect voided invoices restore only previously unreturned stock; refunded invoices cannot be deleted',async()=>{
 const p=await product({selling_price:5000,tax_mode:'exempt'}),q=await product({selling_price:5000,tax_mode:'exempt'}),sid=await sale(p,{items:[{product_id:p.id,quantity:1},{product_id:q.id,quantity:1}],tendered:10000});let s=await invoice(sid);
 await admin.post(`/api/sales/${sid}/items/${s.items[0].id}/remove`).send({reason:'Wrong line',restock:true}).expect(200);
 await admin.post(`/api/sales/${sid}/items/${s.items[1].id}/remove`).send({reason:'Wrong line',restock:false}).expect(200);
 await admin.delete(`/api/sales/${sid}`).send({reason:'Entire test invoice',confirm_no_exchange:true}).expect(200);
 for(const item of [p,q])assert.equal((await one(db,'SELECT quantity FROM products WHERE id=$1',[item.id])).quantity,10);
 const refunded=await sale(p,{tendered:5000});s=await invoice(refunded);await admin.post(`/api/sales/${refunded}/items/${s.items[0].id}/remove`).send({reason:'Returned'}).expect(200);await admin.post(`/api/sales/${refunded}/refunds`).send({request_id:crypto.randomUUID(),amount:5000,method:'cash',reason:'Returned cash'}).expect(200);
 await admin.delete(`/api/sales/${refunded}`).send({reason:'Try deleting',confirm_no_exchange:true}).expect(409);
});
