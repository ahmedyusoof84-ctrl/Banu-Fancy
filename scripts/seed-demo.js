import 'dotenv/config';
import {createDatabase,one} from '../server/db.js';
import {bootstrap} from '../server/app.js';
import {hashPassword} from '../server/security.js';
if(process.env.NODE_ENV==='production'||process.env.DEMO_DATA!=='true')throw new Error('Demo seeding requires DEMO_DATA=true and a non-production environment.');
const db=await createDatabase();
try{
 await bootstrap(db,{email:process.env.ADMIN_EMAIL,password:process.env.ADMIN_PASSWORD,name:'Shop owner',shopName:'The Little Shop'});
 if(await one(db,'SELECT id FROM products LIMIT 1'))throw new Error('Demo seeding requires an empty catalog.');
 await db.transaction(async tx=>{
  const names=['Exercise books','Pens & pencils','School bags','Gifts','Toys','Hair accessories','Watches','Jewellery','Cosmetics','Fashion accessories','Erasers','Colour pencils','Lunch boxes','Water bottles','Files','Art materials','Stationery items'];
  for(const name of names)await tx.query('INSERT INTO categories(name) VALUES($1)',[name]);
  for(const name of ['Atlas','Faber-Castell','Maped','Unbranded'])await tx.query('INSERT INTO brands(name) VALUES($1)',[name]);
  for(const [name,company,phone] of [['Nimal Perera','Lanka Stationery Distributors','94771234567'],['Sakura Trading','Sakura Imports','94112345678'],['Bright Gifts','Bright Gifts & Toys','94772345678']])await tx.query('INSERT INTO suppliers(name,company,phone) VALUES($1,$2,$3)',[name,company,phone]);
  for(const [name,phone] of [['Amaya Fernando','94771231234'],['Ruwan Silva','94777654321'],['Nethmi Perera','94776543210'],['Kavindu Jayasuriya','94779876543']])await tx.query('INSERT INTO customers(name,phone) VALUES($1,$2)',[name,phone]);
  const products=[['Atlas CR book · 200 pages',1,1,1,230,320,64],['Pastel notebook · A5',1,4,1,260,450,32],['Atlas blue ballpoint pen',2,1,1,25,40,120],['Faber-Castell HB pencil',2,2,1,55,90,78],['Everyday school backpack',3,4,2,1850,2850,12],['Canvas pencil case',3,4,2,350,590,24],['Ceramic gift mug',4,4,3,480,750,18],['Gift wrap · floral',4,4,3,60,120,6],['Wooden puzzle set',5,4,3,680,1150,8],['Mini building blocks',5,4,3,420,690,16],['Satin scrunchie set',6,4,2,180,350,5],['Hair clip · pearl',6,4,2,90,190,0],['Colour pencils · 12 pack',12,2,1,360,550,42],['Steel water bottle · 500 ml',14,4,2,920,1450,9],['Lunch box · 3 compartment',13,4,2,560,950,3],['A4 document folder',15,3,1,75,130,55]];
  for(let i=0;i<products.length;i++){const [name,category_id,brand_id,supplier_id,cost,price,qty]=products[i];const p=await one(tx,'INSERT INTO products(name,code,barcode,category_id,brand_id,supplier_id,purchase_price,selling_price,quantity,min_stock) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,6) RETURNING id',[name,'SKU-'+String(i+1).padStart(4,'0'),'SR'+String(i+1).padStart(8,'0'),category_id,brand_id,supplier_id,cost*100,price*100,qty]);await tx.query('INSERT INTO stock_history(product_id,delta,balance,reason,created_by) VALUES($1,$2,$2,$3,1)',[p.id,qty,'Sample opening stock']);}
 });
 console.log('Sample catalog created. No fictional sales or financial records were added.');
}finally{await db.close();}
