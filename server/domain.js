import {z} from 'zod';
export const id=z.coerce.number().int().positive();
export const money=z.number().int().min(0).max(100000000);
export const quantity=z.number().int().min(1).max(100000);
export const text=z.string().trim().min(1).max(200);
export const optionalText=z.string().trim().max(1000).default('');
export const nullableId=id.nullable().default(null);
export const productSchema=z.object({name:text,code:z.string().trim().regex(/^[A-Za-z0-9_-]{1,60}$/),barcode:z.string().trim().regex(/^[\x21-\x7E]{1,60}$/),category_id:nullableId,brand_id:nullableId,supplier_id:nullableId,purchase_price:money,selling_price:money,discount:z.number().int().min(0).max(10000).default(0),tax:z.number().int().min(0).max(10000).default(0),min_stock:z.number().int().min(0).max(100000).default(5),tax_mode:z.enum(['shop','exempt','custom']).optional(),image:z.string().max(500000).refine(s=>!s||/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(s),'Use a PNG, JPEG or WebP image under 350 KB.').default(''),description:optionalText,unit:text.default('piece')});
export const contactSchema=z.object({name:text,phone:optionalText,address:optionalText,email:z.union([z.string().email(),z.literal('')]).default('')});
export const settingsSchema=z.object({name:text,address:optionalText,phone:optionalText,currency:z.string().regex(/^[A-Z]{3}$/),logo:z.string().max(500000).refine(s=>!s||/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(s)).default(''),tax:z.number().int().min(0).max(10000),invoice_format:z.enum(['a4','80mm']),thank_you:text,timezone:z.string().refine(s=>{try{new Intl.DateTimeFormat('en',{timeZone:s});return true;}catch{return false;}}),cashier_discount_limit:z.number().int().min(0).max(10000)});
export function fail(message,status=400){const e=new Error(message);e.status=status;throw e;}
export function calculateSale(products,input,settings){
 let subtotal=0,discount=0,tax=0,cost=0;
 const lines=input.items.map(item=>{
  const p=products.find(p=>p?.id===item.product_id);if(!p?.active)fail('A selected product is unavailable.');if(item.quantity>p.quantity)fail(`Insufficient stock: ${p.name}`,409);
  const gross=p.selling_price*item.quantity;
  const productDiscount=Math.round(gross*p.discount/10000);
  const billDiscount=Math.round((gross-productDiscount)*input.discount/10000);
  const lineDiscount=productDiscount+billDiscount;
  const lineTax=Math.round((gross-lineDiscount)*(p.tax_mode==='exempt'?0:p.tax_mode==='custom'?p.tax:p.tax_mode==='shop'?settings.tax:(p.tax||settings.tax))/10000);
  subtotal+=gross;discount+=lineDiscount;tax+=lineTax;cost+=p.purchase_price*item.quantity;
  return {product_id:p.id,name:p.name,code:p.code,quantity:item.quantity,price:p.selling_price,cost:p.purchase_price,discount:lineDiscount,tax:lineTax,total:gross-lineDiscount+lineTax};
 });
 const total=subtotal-discount+tax;
 if(total>2000000000||cost>2000000000)fail('Invoice value exceeds the supported limit. Split this invoice.');
 return {lines,subtotal,discount,tax,cost,total};
}
