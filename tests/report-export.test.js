import {test} from 'node:test';import assert from 'node:assert/strict';import request from 'supertest';import crypto from 'node:crypto';import ExcelJS from 'exceljs';import {createDatabase} from '../server/db.js';import {createApp,bootstrap} from '../server/app.js';
test('PDF and Excel exports match filtered report figures and show LKR instead of cents',async()=>{
 const db=await createDatabase({dir:':memory:',url:''});try{
  await bootstrap(db,{email:'export@test.local',password:'Export-test-password!'});const app=createApp(db,{secret:'export-test-secret-at-least-32-characters'}),admin=request.agent(app);await admin.post('/api/auth/login').send({email:'export@test.local',password:'Export-test-password!'}).expect(200);
  const p=(await admin.post('/api/products').send({name:'Export pen',code:'EXP-1',barcode:'EXP-1',quantity:10,min_stock:2,purchase_price:300,selling_price:1000,tax_mode:'exempt'}).expect(201)).body;
  await admin.post('/api/sales').send({request_id:crypto.randomUUID(),customer_id:null,items:[{product_id:p.id,quantity:1}],discount:0,method:'cash',tendered:1000}).expect(201);
  const range='from=2020-01-01&to=2035-01-01',report=(await admin.get('/api/reports?'+range).expect(200)).body;
  assert.equal(Number(report.summary.sales),1000);
  const xlsx=await admin.get('/api/reports/export.xlsx?'+range).buffer(true).parse((res,done)=>{const chunks=[];res.on('data',chunk=>chunks.push(chunk));res.on('end',()=>done(null,Buffer.concat(chunks)));}).expect(200);
  const book=new ExcelJS.Workbook();await book.xlsx.load(xlsx.body);const overview=book.getWorksheet('Report overview');assert.equal(overview.getCell('A1').value,report.settings.name);assert.match(overview.getCell('A3').value,/2020-01-01 to 2035-01-01/);assert.equal(overview.getCell('A6').value,10);assert.match(overview.getCell('A6').numFmt,/LKR/);
  const products=book.getWorksheet('Product performance');assert.equal(products.getCell('A2').value,'Export pen');assert.equal(products.getCell('C2').value,10);assert.equal(products.getCell('D2').value,7);assert.equal(book.getWorksheet('Sales by day').getCell('B2').value,10);
  for(const name of ['Where the money went','Low stock','Current stock','Stock movements'])assert.ok(book.getWorksheet(name),name);
  const pdf=await admin.get('/api/reports/export.pdf?'+range).buffer(true).parse((res,done)=>{const chunks=[];res.on('data',chunk=>chunks.push(chunk));res.on('end',()=>done(null,Buffer.concat(chunks)));}).expect(200);assert.equal(pdf.body.subarray(0,4).toString(),'%PDF');assert.match(pdf.headers['content-disposition'],/2020-01-01-to-2035-01-01/);
 }finally{await db.close();}
});
