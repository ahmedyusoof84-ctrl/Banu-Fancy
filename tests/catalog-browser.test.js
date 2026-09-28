import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import {createDatabase,one} from '../server/db.js';
import {createApp,bootstrap} from '../server/app.js';
import {requiredColumns,stockStatus,unitText,normalizeImportRow} from '../shared/catalog.js';
let db,admin,app,category;
const password='Catalog-test-password!';
before(async()=>{
 db=await createDatabase({dir:':memory:',url:''});await bootstrap(db,{email:'admin@test.local',password});app=createApp(db,{secret:'catalog-test-secret-more-than-32-characters'});admin=request.agent(app);await admin.post('/api/auth/login').send({email:'admin@test.local',password}).expect(200);
 category=(await admin.post('/api/categories').send({name:'Test category'})).body.id;
 for(let i=1;i<=24;i++)await admin.post('/api/products').send({name:i===1?'100% paper':`Product ${String(i).padStart(2,'0')}`,code:'SKU'+i,barcode:'SCAN'+i,category_id:i<=12?category:null,purchase_price:100*i,selling_price:200*i,quantity:i===1?0:i===2?2:20,min_stock:i===3?25:i===4?0:5}).expect(201);
});
after(async()=>await db.close());
test('catalog pages are bounded, sortable and summarize actual product thresholds',async()=>{
 const first=(await admin.get('/api/catalog')).body;assert.equal(first.items.length,20);assert.equal(first.pages,2);assert.deepEqual(first.summary,{total:24,low:2,out:1});
 const second=(await admin.get('/api/catalog?page=2')).body;assert.equal(second.items.length,4);assert.equal(new Set([...first.items,...second.items].map(p=>p.id)).size,24);
 const sorted=(await admin.get('/api/catalog?sort=selling_price&direction=desc')).body;assert.equal(sorted.items[0].selling_price,4800);
 const clamp=(await admin.get('/api/catalog?page=999')).body;assert.equal(clamp.page,2);
});
test('name, SKU and scanner searches and combined filters use server data',async()=>{
 for(const q of ['SCAN12','SKU12','Product 12']){const r=(await admin.get('/api/catalog').query({q})).body;assert.equal(r.total,1);assert.equal(r.items[0].code,'SKU12');}
 const exact=(await admin.get('/api/catalog').query({barcode:'SCAN1'})).body;assert.equal(exact.total,1);assert.equal(exact.items[0].barcode,'SCAN1');
 const missing=(await admin.get('/api/catalog').query({barcode:'SCAN'})).body;assert.equal(missing.total,0);
 const literal=(await admin.get('/api/catalog').query({q:'%'})).body;assert.equal(literal.total,1);
 const low=(await admin.get('/api/catalog').query({stock:'low',category})).body;assert.deepEqual(low.items.map(p=>p.code),['SKU2','SKU3']);
 const out=(await admin.get('/api/catalog?stock=out')).body;assert.equal(out.total,1);
 const stocked=(await admin.get('/api/catalog?stock=in')).body;assert.equal(stocked.total,21);
 await admin.get('/api/catalog?sort=invalid').expect(400);await admin.get('/api/catalog?size=1000000').expect(400);
});
test('stock boundaries and English unit plurals remain exact',()=>{
 assert.equal(stockStatus({quantity:0,min_stock:0}),'out');assert.equal(stockStatus({quantity:1,min_stock:0}),'in');assert.equal(stockStatus({quantity:6,min_stock:6}),'low');assert.equal(unitText(1,'piece'),'1 piece');assert.equal(unitText(55,'piece'),'55 pieces');assert.equal(unitText(2,'box'),'2 boxes');assert.equal(unitText(2,'custom'),'2 custom');assert.equal(unitText(2,'piece','ta'),'2 துண்டுகள்');
});
const sheetRow=(changes={})=>({name:'Imported',code:'NEW',barcode:'0000123',purchase_price:12.25,selling_price:25.5,quantity:10,min_stock:3,...changes});
test('Excel preview validates without writing and retains leading zeros and currency units',async()=>{
 const before=Number((await one(db,'SELECT COUNT(*) count FROM products')).count);
 const preview=(await admin.post('/api/products/import/preview').send({columns:requiredColumns,rows:[{row_number:2,values:sheetRow()}]}).expect(200)).body;
 assert.equal(preview.valid,true);assert.equal(preview.rows[0].values.barcode,'0000123');assert.equal(preview.rows[0].values.purchase_price,1225);assert.equal(Number((await one(db,'SELECT COUNT(*) count FROM products')).count),before);
 await admin.post('/api/products/import').send({rows:preview.rows.map(r=>r.values)}).expect(200);const found=await one(db,'SELECT * FROM products WHERE code=$1',['NEW']);assert.equal(found.min_stock,3);assert.equal(found.selling_price,2550);
});
test('Excel preview reports missing headers, row duplicates, bad numbers, references and formula errors',async()=>{
 const r=(await admin.post('/api/products/import/preview').send({columns:['name','code'],rows:[{row_number:4,values:sheetRow({code:'SKU1',barcode:'SCAN1',quantity:-1,category_id:999})},{row_number:8,values:sheetRow({code:'SKU1',barcode:'SCAN1',purchase_price:'bad'}),issues:[{field:'name',message:'Formulas and rich cells are not supported'}]}]})).body;
 assert.equal(r.valid,false);assert.ok(r.missing.includes('min_stock'));assert.equal(r.rows[0].row_number,4);assert.ok(r.rows[0].issues.some(i=>i.message==='Unknown reference ID'));assert.ok(r.rows[1].issues.some(i=>i.message==='Duplicate value in the workbook or catalog'));assert.ok(r.rows[1].issues.some(i=>i.field==='purchase_price'));assert.ok(r.rows[1].issues.some(i=>i.message==='Formulas and rich cells are not supported'));
 assert.ok(normalizeImportRow(sheetRow({min_stock:''})).issues.some(i=>i.field==='min_stock'));
});
test('new catalog and import preview APIs stay admin-only',async()=>{
 await request(app).get('/api/catalog').expect(401);
 await admin.post('/api/users').send({name:'Cashier',email:'cashier@test.local',password,role:'cashier'}).expect(201);const cashier=request.agent(app);await cashier.post('/api/auth/login').send({email:'cashier@test.local',password}).expect(200);
 await cashier.get('/api/catalog').expect(403);await cashier.post('/api/products/import/preview').send({columns:requiredColumns,rows:[]}).expect(403);
});
