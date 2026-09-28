import React,{useId,useRef,useState} from 'react';
import {ScanBarcode,RefreshCw,Save} from 'lucide-react';
import {Modal,Button,ErrorBox,useApp,api} from '../main.jsx';
import {catalogText} from '../catalog-i18n.js';
import Scanner from './Scanner.jsx';

export function validateDraft(values,editing=false){
  const errors={};
  for(const key of ['name','code','barcode','unit','purchase_price','selling_price','min_stock',...(editing?[]:['quantity'])])if(String(values[key]??'').trim()==='')errors[key]='Required value';
  for(const key of ['name','category_name','brand_name','supplier_name','unit'])if(String(values[key]||'').length>200)errors[key]='Maximum 200 characters';
  if(values.code&&!/^[A-Za-z0-9_-]{1,60}$/.test(values.code))errors.code='Use letters, numbers, hyphens or underscores.';
  if(values.barcode&&!/^[\x21-\x7e]{1,60}$/.test(values.barcode))errors.barcode='Use printable characters without spaces.';
  for(const key of ['purchase_price','selling_price','discount','tax']){if(key==='tax'&&values.tax_mode&&values.tax_mode!=='custom')continue;const n=Number(values[key]);if(!Number.isFinite(n)||n<0||n>1000000||Math.abs(n*100-Math.round(n*100))>.00001)errors[key]='Use a nonnegative amount with at most two decimals';if(['discount','tax'].includes(key)&&n>100)errors[key]='Use a percentage from 0 to 100';}
  for(const key of ['min_stock',...(editing?[]:['quantity'])])if(!Number.isInteger(Number(values[key]))||Number(values[key])<0||Number(values[key])>100000)errors[key]='Use a whole number from 0 to 100000';
  return errors;
}

export default function ProductForm({product,categories=[],brands=[],suppliers=[],onClose,onSaved}){
  const {lang,settings}=useApp(),t=(s,v)=>catalogText(s,lang,v),prefix=useId(),form=useRef();
  const [values,setValues]=useState(()=>({name:product.name||'',code:product.code||'',barcode:product.barcode||'',category_name:product.category||'',brand_name:product.brand||'',supplier_name:product.supplier||'',unit:product.unit||'piece',purchase_price:product.id?product.purchase_price/100:'',selling_price:product.id?product.selling_price/100:'',discount:(product.discount||0)/100,tax:(product.tax||0)/100,tax_mode:product.tax_mode||(product.tax?'custom':'shop'),min_stock:product.id?product.min_stock:'',quantity:0,description:product.description||''}));
  const [image,setImage]=useState(product.image||''),[errors,setErrors]=useState({}),[error,setError]=useState(''),[busy,setBusy]=useState(false),[scan,setScan]=useState(false);
  const change=(name,value)=>{setValues(v=>({...v,[name]:value}));setErrors(e=>({...e,[name]:undefined}));};
  const field=(name,label,{options,type='text',required=false,hint,maxLength=200}={})=><div className="product-field" key={name}>
    <label htmlFor={prefix+name}>{t(label)}{required&&<span aria-label={t('Required')}> *</span>}</label>
    <input id={prefix+name} name={name} type={type} value={values[name]} onChange={e=>change(name,e.target.value)} onBlur={()=>setErrors(e=>({...e,[name]:validateDraft(values,!!product.id)[name]}))} aria-invalid={!!errors[name]} aria-describedby={(errors[name]||hint)?prefix+name+'-help':undefined} list={options?prefix+name+'-list':undefined} autoComplete="off" maxLength={maxLength} min={type==='number'?0:undefined} step={type==='number'?(['quantity','min_stock'].includes(name)?1:'.01'):undefined} disabled={busy}/>
    {options&&<datalist id={prefix+name+'-list'}>{options.map((o,i)=><option key={i} value={typeof o==='string'?o:o.name}/>)}</datalist>}
    {(errors[name]||hint)&&<small id={prefix+name+'-help'} className={errors[name]?'field-error':'field-hint'}>{t(errors[name]||hint)}</small>}
  </div>;
  const save=async e=>{
    e.preventDefault();const issues=validateDraft(values,!!product.id);setErrors(issues);setError('');
    if(Object.keys(issues).length){setError(t('Check the highlighted fields.'));requestAnimationFrame(()=>form.current?.querySelector('[aria-invalid="true"]')?.focus());return;}
    setBusy(true);
    try{
      const duplicates=await api('/product-check?'+new URLSearchParams({code:values.code.trim(),barcode:values.barcode.trim(),exclude:product.id||0}));if(duplicates.code||duplicates.barcode){setErrors({...(duplicates.code?{code:'SKU already exists'}:{}),...(duplicates.barcode?{barcode:'Barcode already exists'}:{})});setError(t('Check the highlighted fields.'));return;}const payload={...values,image,tax:values.tax_mode==='custom'?values.tax:0};
      for(const name of ['purchase_price','selling_price','discount','tax'])payload[name]=Math.round(Number(payload[name])*100);
      for(const name of ['quantity','min_stock'])payload[name]=Number(payload[name]);
      for(const field of ['category','brand','supplier'])payload[field+'_id']=values[field+'_name'].trim().toLowerCase()===(product[field]||'').trim().toLowerCase()?product[field+'_id']||null:null;
      await api('/products'+(product.id?'/'+product.id:''),product.id?'PUT':'POST',payload);onSaved();onClose();
    }catch(e){setError(t(e.message));}finally{setBusy(false);}
  };
  return <Modal title={t(product.id?'Edit product':'Add product')} wide onClose={()=>{if(!busy)onClose();}}>
    <form ref={form} noValidate onSubmit={save} className="product-form">
      <ErrorBox error={error}/>
      <fieldset disabled={busy}><legend>{t('Product details')}</legend><div className="product-form-grid">
        {field('name','Product name',{required:true})}{field('code','SKU / product code',{required:true,maxLength:60})}
        <div className="barcode-field">{field('barcode','Barcode',{required:true,maxLength:60})}<div className="barcode-tools"><Button type="button" variant="secondary" icon={ScanBarcode} onClick={()=>setScan(true)}>{t('Scan barcode')}</Button><button type="button" className="icon-btn" title={t('Generate barcode')} aria-label={t('Generate barcode')} onClick={()=>change('barcode','SR'+crypto.randomUUID().replaceAll('-','').slice(0,16).toUpperCase())}><RefreshCw size={18}/></button></div></div>
      </div></fieldset>
      <fieldset disabled={busy}><legend>{t('Pricing')} · {settings.currency}</legend><div className="product-form-grid">
        {field('purchase_price','Purchase price',{required:true,type:'number'})}{field('selling_price','Selling price',{required:true,type:'number'})}{field('discount','Discount (%)',{type:'number'})}<label className="field"><span>{t('Tax treatment')}</span><select value={values.tax_mode} onChange={e=>change('tax_mode',e.target.value)}><option value="shop">{t('Use shop tax')}</option><option value="exempt">{t('Tax exempt')}</option><option value="custom">{t('Custom tax rate')}</option></select></label>{values.tax_mode==='custom'&&field('tax','Tax (%)',{type:'number'})}<p className="catalog-help">{t('Profit margin')}: {Number(values.selling_price)>0?((Number(values.selling_price)-Number(values.purchase_price))/Number(values.selling_price)*100).toFixed(1)+'%':'—'}{Number(values.selling_price)<Number(values.purchase_price)&&<strong className="field-error"> · {t('Selling below cost')}</strong>}</p>
      </div></fieldset>
      <fieldset disabled={busy}><legend>{t('Stock & organization')}</legend><p className="catalog-help">{t('Type or choose; new names are saved with this product.')}</p><div className="product-form-grid">
        {field('category_name','Category',{options:categories})}{field('brand_name','Brand',{options:brands})}{field('supplier_name','Supplier',{options:suppliers})}{field('unit','Unit',{required:true,options:['piece','pack','box','dozen','kg','metre']})}{field('min_stock','Low-stock threshold',{required:true,type:'number'})}{!product.id&&field('quantity','Opening quantity',{required:true,type:'number'})}
      </div>{product.id&&<p className="catalog-help">{t('Current stock: {count}. Use Inventory to record adjustments.',{count:product.quantity})}</p>}</fieldset>
      <fieldset disabled={busy}><legend>{t('Image & notes')}</legend><label className="field"><span>{t('Description')}</span><textarea maxLength={1000} value={values.description} onChange={e=>change('description',e.target.value)}/></label><label className="field"><span>{t('Product image')}</span><input type="file" accept="image/png,image/jpeg,image/webp" onChange={async e=>{const file=e.target.files[0];if(!file)return;if(file.size>350000||!['image/png','image/jpeg','image/webp'].includes(file.type)){setError(t('Choose a PNG, JPEG or WebP image under 350 KB.'));return;}try{const result=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=reject;r.readAsDataURL(file);});setImage(result);}catch{setError(t('Invalid value'));}}}/><small>{t('PNG, JPEG or WebP, up to 350 KB.')}</small></label>{image&&<div className="image-preview"><img src={image} alt={t('Product image')}/><Button type="button" variant="secondary" onClick={()=>setImage('')}>{t('Remove image')}</Button></div>}</fieldset>
      <div className="form-actions product-form-actions"><Button type="button" variant="secondary" disabled={busy} onClick={onClose}>{t('Cancel')}</Button><Button icon={Save} disabled={busy}>{t(busy?'Saving…':'Save changes')}</Button></div>
    </form>
    {scan&&<Scanner onClose={()=>setScan(false)} onScan={code=>change('barcode',code)}/>}
  </Modal>;
}
