import {z} from 'zod';
import {one,rows,audit} from './db.js';
import {id,fail} from './domain.js';
export async function removeSaleItem(db,req,res){
 const sid=id.parse(req.params.id),iid=req.params.itemId?id.parse(req.params.itemId):null;
 const input=z.object({reason:z.string().trim().min(1).max(200),restock:z.boolean().default(true)}).parse(req.body);
 const result=await db.transaction(async tx=>{
 const sale=await one(tx,'SELECT * FROM sales WHERE id=$1 FOR UPDATE',[sid]);if(!sale)fail('Invoice not found.',404);if(sale.deleted_at)fail('Invoice was deleted.',409);
 const items=await rows(tx,iid?'SELECT * FROM sale_items WHERE id=$1 AND sale_id=$2 FOR UPDATE':'SELECT * FROM sale_items WHERE sale_id=$1 AND removed_at IS NULL ORDER BY product_id,id FOR UPDATE',iid?[iid,sid]:[sid]);if(!items.length)fail(iid?'Invoice item not found.':'Invoice is already voided.',iid?404:409);
 for(const item of items){if(item.removed_at)fail('This invoice item was already removed.',409);
 await tx.query('INSERT INTO sale_corrections(sale_id,item_id,reason,created_by,amount,tax,cost,quantity,restock) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',[sid,item.id,input.reason,req.user.id,item.total,item.tax,item.cost*item.quantity,item.quantity,input.restock]);
 await tx.query('UPDATE sale_items SET removed_at=NOW(),removal_reason=$1 WHERE id=$2',[input.reason,item.id]);
 await tx.query('UPDATE sales SET subtotal=subtotal-$1,discount=discount-$2,tax=tax-$3,total=total-$4,cost=cost-$5 WHERE id=$6',[item.price*item.quantity,item.discount,item.tax,item.total,input.restock?item.cost*item.quantity:0,sid]);
 if(input.restock){const stock=await one(tx,'UPDATE products SET quantity=quantity+$1 WHERE id=$2 RETURNING quantity',[item.quantity,item.product_id]);await tx.query('INSERT INTO stock_history(product_id,delta,balance,reason,reference,created_by) VALUES($1,$2,$3,$4,$5,$6)',[item.product_id,item.quantity,stock.quantity,'Invoice correction',sale.invoice_number,req.user.id]);}
 const state=await one(tx,'SELECT * FROM sales_state WHERE id=$1',[sid]);await audit(tx,req.user,'remove_item','sale',sid,{reason:input.reason,item,restock:input.restock,before:{total:sale.total},after:{total:state.total,status:state.status},refund_due:state.refund_due});sale.total=state.total;}
 const finalState=await one(tx,'SELECT * FROM sales_state WHERE id=$1',[sid]);return {ok:true,refund_due:Number(finalState.refund_due),status:finalState.status};
 });res.json(result);
}
export function reliabilityRoutes(app,db,admin){
 app.delete('/api/sales/:id',admin,async(req,res)=>{
  const sid=id.parse(req.params.id),input=z.object({reason:z.string().trim().min(1).max(200),confirm_no_exchange:z.literal(true)}).parse(req.body);
  const result=await db.transaction(async tx=>{
   const sale=await one(tx,'SELECT * FROM sales WHERE id=$1 FOR UPDATE',[sid]);
   if(!sale)fail('Invoice not found.',404);
   if(sale.deleted_at)fail('Invoice was already deleted.',409);
   if(await one(tx,'SELECT id FROM sale_refunds WHERE sale_id=$1 LIMIT 1',[sid]))fail('This invoice has a recorded refund. Use the correction workflow.',409);
   const lines=await rows(tx,'SELECT i.id,i.product_id,i.quantity,i.removed_at,COALESCE(c.restock,FALSE) restocked FROM sale_items i LEFT JOIN sale_corrections c ON c.item_id=i.id WHERE i.sale_id=$1 ORDER BY i.product_id,i.id FOR UPDATE OF i',[sid]);
   for(const line of lines){
    if(line.removed_at&&line.restocked)continue;
    const stock=await one(tx,'UPDATE products SET quantity=quantity+$1 WHERE id=$2 RETURNING quantity',[line.quantity,line.product_id]);
    await tx.query('INSERT INTO stock_history(product_id,delta,balance,reason,reference,created_by) VALUES($1,$2,$3,$4,$5,$6)',[line.product_id,line.quantity,stock.quantity,'Incorrect invoice deleted',sale.invoice_number,req.user.id]);
   }
   await tx.query('UPDATE sales SET deleted_at=NOW(),deletion_reason=$1,deleted_by=$2 WHERE id=$3',[input.reason,req.user.id,sid]);
   await audit(tx,req.user,'delete_incorrect','sale',sid,{invoice_number:sale.invoice_number,reason:input.reason,original_total:(await one(tx,'SELECT COALESCE(SUM(total),0) amount FROM sale_items WHERE sale_id=$1',[sid])).amount,recorded_payments:sale.paid,stock_restored:lines.filter(l=>!l.removed_at||!l.restocked).map(l=>({product_id:l.product_id,quantity:l.quantity}))});
   return {ok:true};
  });res.json(result);
 });
 app.post('/api/sales/:id/void',admin,(req,res)=>removeSaleItem(db,req,res));
 app.post('/api/sales/:id/refunds',admin,async(req,res)=>{
 const sid=id.parse(req.params.id),input=z.object({request_id:z.string().uuid(),amount:z.number().int().positive().max(100000000),method:z.enum(['cash','card','bank']),reason:z.string().trim().min(1).max(200),reference:z.string().max(200).default('')}).parse(req.body);
 const result=await db.transaction(async tx=>{const sale=await one(tx,'SELECT id,deleted_at FROM sales WHERE id=$1 FOR UPDATE',[sid]);if(!sale)fail('Invoice not found.',404);if(sale.deleted_at)fail('Invoice was deleted.',409);const previous=await one(tx,'SELECT * FROM sale_refunds WHERE request_id=$1',[input.request_id]);if(previous){if(previous.sale_id!==sid||previous.amount!==input.amount)fail('Request ID is already in use.',409);return previous;}const state=await one(tx,'SELECT * FROM sales_state WHERE id=$1',[sid]);if(input.amount>Number(state.refund_due))fail('Refund exceeds the pending amount.',409);const r=await one(tx,'INSERT INTO sale_refunds(sale_id,request_id,amount,method,reason,reference,created_by) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *',[sid,input.request_id,input.amount,input.method,input.reason,input.reference,req.user.id]);await audit(tx,req.user,'refund','sale',sid,{amount:input.amount,reason:input.reason,method:input.method,reference:input.reference});return r;});res.json(result);
 });
 app.get('/api/suppliers/:id/statement',admin,async(req,res)=>{const sid=id.parse(req.params.id),supplier=await one(db,'SELECT * FROM suppliers WHERE id=$1',[sid]);if(!supplier)fail('Supplier not found.',404);res.json({supplier,purchases:await rows(db,'SELECT * FROM purchases WHERE supplier_id=$1 ORDER BY id DESC',[sid]),payments:await rows(db,'SELECT p.*,b.reference purchase_reference FROM payments p JOIN purchases b ON b.id=p.purchase_id WHERE b.supplier_id=$1 ORDER BY p.id DESC',[sid])});});
 app.get('/api/product-check',admin,async(req,res)=>{const q=z.object({code:z.string().max(60),barcode:z.string().max(60),exclude:z.coerce.number().int().min(0).default(0)}).parse(req.query);const found=await rows(db,'SELECT code,barcode FROM products WHERE id<>$1 AND (code=$2 OR barcode=$3)',[q.exclude,q.code,q.barcode]);res.json({code:found.some(p=>p.code===q.code),barcode:found.some(p=>p.barcode===q.barcode)});});
 app.get('/api/backup/status',admin,async(req,res)=>res.json(await one(db,'SELECT * FROM backup_status WHERE id=1')));
 app.get('/api/expense-categories',admin,async(req,res)=>res.json(await rows(db,'SELECT * FROM expense_categories ORDER BY name')));
 app.post('/api/expense-categories',admin,async(req,res)=>{const {name}=z.object({name:z.string().trim().min(1).max(100)}).parse(req.body);const r=await one(db,'INSERT INTO expense_categories(name) VALUES($1) RETURNING *',[name]);await audit(db,req.user,'create','expense_category',r.id,{name});res.status(201).json(r);});
}
