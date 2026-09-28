import {z} from 'zod';
import {rows,audit} from './db.js';
import {fail,productSchema} from './domain.js';

const name=z.string().trim().max(200).optional();
export const editableProductSchema=productSchema.extend({category_name:name,brand_name:name,supplier_name:name});

// Resolve typed options in the same transaction as the product. A failed save
// must not leave newly-created category/brand/supplier records behind.
export async function resolveProductOptions(tx,input,user){
 const product={...input,tax_mode:input.tax_mode||(input.tax?'custom':'shop')};
 for(const [field,table] of [['category','categories'],['brand','brands'],['supplier','suppliers']]){
  const label=product[field+'_name'];
  delete product[field+'_name'];
  if(label===undefined)continue; // Preserve ID-based API/Excel clients.
  if(!label){product[field+'_id']=null;continue;}
  const existing=await rows(tx,`SELECT id,name FROM ${table} WHERE LOWER(name)=LOWER($1) ${table==='suppliers'?'AND active=TRUE':''} ORDER BY id`,[label]);
  const selected=existing.find(row=>row.id===product[field+'_id']);
  if(selected){product[field+'_id']=selected.id;continue;}
  if(existing.length>1)fail(`More than one ${field} has this name. Give them distinct names in management before choosing one.`);
  if(existing.length===1){product[field+'_id']=existing[0].id;continue;}
  const created=(await tx.query(`INSERT INTO ${table}(name) VALUES($1) RETURNING id`,[label])).rows[0];
  product[field+'_id']=created.id;
  await audit(tx,user,'create',table,created.id,{source:'product editor',name:label});
 }
 return product;
}
