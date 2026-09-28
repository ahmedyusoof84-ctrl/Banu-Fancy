import {z} from 'zod';
import {one, rows} from './db.js';
import {productSchema} from './domain.js';
import {normalizeImportRow, requiredColumns} from '../shared/catalog.js';

export function catalogBrowserRoutes(app, db, admin) {
  app.get('/api/catalog', admin, async(req,res) => {
    const q=z.object({q:z.string().max(200).default(''),category:z.coerce.number().int().positive().optional(),stock:z.enum(['all','in','low','out']).default('all'),sort:z.enum(['name','code','category','purchase_price','selling_price','quantity']).default('name'),direction:z.enum(['asc','desc']).default('asc'),page:z.coerce.number().int().min(1).max(1000000).default(1),size:z.coerce.number().int().refine(n=>[20,50,100].includes(n)).default(20)}).parse(req.query);
    const barcode=z.string().min(1).max(60).optional().parse(req.query.barcode);
    const args=[], conditions=['p.active=TRUE'];
    if(barcode){args.push(barcode);conditions.push(`p.barcode=$${args.length}`);}
    else if(q.q.trim()){args.push('%'+q.q.trim().replace(/[\\%_]/g,'\\$&')+'%');conditions.push(`(p.name ILIKE $${args.length} OR p.code ILIKE $${args.length} OR p.barcode ILIKE $${args.length})`);}
    if(q.category){args.push(q.category);conditions.push(`p.category_id=$${args.length}`);}
    if(q.stock==='out')conditions.push('p.quantity=0');
    if(q.stock==='low')conditions.push('p.quantity>0 AND p.quantity<=p.min_stock');
    if(q.stock==='in')conditions.push('p.quantity>p.min_stock');
    const where=conditions.join(' AND ');
    const order={name:'p.name',code:'p.code',category:'c.name',purchase_price:'p.purchase_price',selling_price:'p.selling_price',quantity:'p.quantity'}[q.sort];
    const result=await db.transaction(async tx=>{
      await tx.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
      const summary=await one(tx,'SELECT COUNT(*)::int total,COUNT(*) FILTER (WHERE quantity>0 AND quantity<=min_stock)::int low,COUNT(*) FILTER (WHERE quantity=0)::int out FROM products WHERE active=TRUE');
      const total=(await one(tx,`SELECT COUNT(*)::int count FROM products p WHERE ${where}`,args)).count;
      const page=Math.min(q.page,Math.max(1,Math.ceil(total/q.size)));
      const list=await rows(tx,`SELECT p.*,c.name category,b.name brand,s.name supplier FROM products p LEFT JOIN categories c ON c.id=p.category_id LEFT JOIN brands b ON b.id=p.brand_id LEFT JOIN suppliers s ON s.id=p.supplier_id WHERE ${where} ORDER BY ${order} ${q.direction.toUpperCase()} NULLS LAST,p.id ASC LIMIT $${args.length+1} OFFSET $${args.length+2}`,[...args,q.size,(page-1)*q.size]);
      return {items:list,total,page,size:q.size,pages:Math.max(1,Math.ceil(total/q.size)),summary};
    });
    res.json(result);
  });

  app.post('/api/products/import/preview',admin,async(req,res)=>{
    const input=z.object({columns:z.array(z.string()).max(40),rows:z.array(z.object({row_number:z.number().int().min(2),values:z.record(z.unknown()),issues:z.array(z.object({field:z.string(),message:z.string()})).default([])})).min(1).max(2000)}).parse(req.body);
    const missing=requiredColumns.filter(c=>!input.columns.includes(c));
    const existing=await rows(db,'SELECT code,barcode FROM products');
    const codes=new Set(existing.map(p=>p.code)), barcodes=new Set(existing.map(p=>p.barcode));
    const refs={};for(const [field,table] of [['category_id','categories'],['brand_id','brands'],['supplier_id','suppliers']])refs[field]=new Set((await rows(db,`SELECT id FROM ${table}`)).map(r=>r.id));
    const preview=input.rows.map(row=>{
      const {values,issues}=normalizeImportRow(row.values);
      issues.push(...row.issues);
      for(const field of ['code','barcode']){const set=field==='code'?codes:barcodes;if(set.has(values[field]))issues.push({field,message:'Duplicate value in the workbook or catalog'});set.add(values[field]);}
      for(const field of Object.keys(refs))if(values[field]!==null&&!refs[field].has(values[field]))issues.push({field,message:'Unknown reference ID'});
      const parsed=productSchema.safeParse(values);
      if(!parsed.success)for(const issue of parsed.error.issues)issues.push({field:issue.path.join('.'),message:'Invalid value'});
      return {row_number:row.row_number,values:parsed.success?{...parsed.data,quantity:values.quantity}:values,issues};
    });
    res.json({missing,rows:preview,valid:missing.length===0&&preview.every(r=>!r.issues.length)});
  });
}
