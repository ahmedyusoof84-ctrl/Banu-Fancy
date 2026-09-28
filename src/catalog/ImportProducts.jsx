import React,{useRef,useState} from 'react';
import {Download,Upload,CheckCircle2,AlertCircle} from 'lucide-react';
import {Modal,Button,ErrorBox,api,useApp,Money} from '../main.jsx';
import {catalogText} from '../catalog-i18n.js';
import {requiredColumns,importColumns} from '../../shared/catalog.js';

export default function ImportProducts({onClose,onSaved,categories,brands,suppliers}){
  const {lang}=useApp(),t=(s,v)=>catalogText(s,lang,v),fileInput=useRef();
  const [preview,setPreview]=useState(null),[filename,setFilename]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(''),[page,setPage]=useState(1);
  const template=async()=>{setError('');try{const {default:ExcelJS}=await import('exceljs');const book=new ExcelJS.Workbook(),sheet=book.addWorksheet('Products');sheet.columns=importColumns.map(key=>({header:key,key,width:22}));sheet.getRow(1).font={bold:true};sheet.getColumn('barcode').numFmt='@';sheet.getColumn('code').numFmt='@';for(const [name,list] of [['Categories',categories],['Brands',brands],['Suppliers',suppliers]]){const ref=book.addWorksheet(name);ref.columns=[{header:'id',key:'id',width:12},{header:'name',key:'name',width:36}];list.forEach(row=>ref.addRow({id:row.id,name:row.name}));}const blob=new Blob([await book.xlsx.writeBuffer()],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='product-import-template.xlsx';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}catch{setError(t('Could not read workbook. Check the file and try again.'));}};
  const choose=async e=>{
    const file=e.target.files[0];e.target.value='';if(!file)return;setPreview(null);setPage(1);setError('');setFilename(file.name);
    if(!file.name.toLowerCase().endsWith('.xlsx')||file.size>5000000){setError(t('Choose an .xlsx file under 5 MB.'));return;}
    setBusy('preview');
    try{
      const {default:ExcelJS}=await import('exceljs');const book=new ExcelJS.Workbook();await book.xlsx.load(await file.arrayBuffer());const sheet=book.worksheets[0];if(!sheet)throw new Error('No worksheet found.');
      const columns=[];sheet.getRow(1).eachCell({includeEmpty:true},(cell,col)=>{columns[col-1]=typeof cell.value==='string'?cell.value.trim():String(cell.value??'');});
      const named=columns.filter(Boolean);if(new Set(named).size!==named.length)throw new Error('Duplicate column');
      const rows=[];
      sheet.eachRow((row,row_number)=>{if(row_number===1)return;const values={},issues=[];let hasValue=false;row.eachCell((cell,col)=>{const field=columns[col-1];if(!field)return;if(cell.value!==null&&cell.value!=='')hasValue=true;if(!importColumns.includes(field))return;if(typeof cell.value==='object'&&cell.value!==null){issues.push({field,message:'Formulas and rich cells are not supported'});values[field]='';}else values[field]=cell.value;});if(hasValue)rows.push({row_number,values,issues});});
      if(!rows.length||rows.length>2000)throw new Error('Use between 1 and 2000 product rows.');
      setPreview(await api('/products/import/preview','POST',{columns:named,rows}));
    }catch(e){setError(t(['No worksheet found.','Duplicate column','Use between 1 and 2000 product rows.'].includes(e.message)?e.message:'Could not read workbook. Check the file and try again.'));}finally{setBusy('');}
  };
  const save=async()=>{if(!preview?.valid)return;setBusy('save');setError('');try{const result=await api('/products/import','POST',{rows:preview.rows.map(row=>row.values)});onSaved(result.count);onClose();}catch(e){setError(t(e.message));}finally{setBusy('');}};
  const invalid=preview?.rows.filter(row=>row.issues.length).length||0;
  return <Modal title={t('Import products')} wide onClose={()=>{if(!busy)onClose();}}>
    <div className="import-guide"><strong>{t('Required columns')}</strong><p className="column-list">{requiredColumns.map(c=><code key={c}>{c}</code>)}</p><p>{t('Use prices in your shop currency and tax/discount as percentages. Keep SKU and barcode cells as text.')}</p><p>{t('New products only. Maximum 2,000 rows and 5 MB. Nothing is saved until you confirm.')}</p></div>
    <div className="actions"><Button variant="secondary" icon={Download} onClick={template} disabled={!!busy}>{t('Download template')}</Button><Button variant="secondary" icon={Upload} onClick={()=>fileInput.current.click()} disabled={!!busy}>{t('Choose workbook')}</Button><input ref={fileInput} type="file" hidden accept=".xlsx" onChange={choose}/></div>
    <ErrorBox error={error}/>{busy==='preview'&&<p className="catalog-loading" role="status">{t('Checking workbook…')}</p>}
    {preview&&<section className="import-preview" aria-label={t('Review import')}><h3>{t('Review import')}</h3><p className="catalog-help">{filename}</p><div className={'import-status '+(preview.valid?'valid':'invalid')} role="status">{preview.valid?<CheckCircle2 size={19}/>:<AlertCircle size={19}/>}<span>{t('{count} rows ready',{count:preview.rows.length-invalid})}{invalid>0&&' · '+t('{count} rows need correction',{count:invalid})}</span></div>
      {!!preview.missing.length&&<ErrorBox error={t('Missing columns: {columns}',{columns:preview.missing.join(', ')})}/>}
      {!preview.valid&&<p className="catalog-help">{t('Fix the workbook and choose it again before importing.')}</p>}
      <div className="catalog-table-scroll import-table" tabIndex={0}><table><thead><tr>{['Excel row','Product','SKU','Price','Stock','Validation'].map(label=><th scope="col" key={label}>{t(label)}</th>)}</tr></thead><tbody>{preview.rows.slice((page-1)*25,page*25).map(row=><tr key={row.row_number}><td>{row.row_number}</td><td>{row.values.name||'—'}</td><td>{row.values.code||'—'}</td><td className="numeric"><Money value={row.values.selling_price}/></td><td>{row.values.quantity??'—'}</td><td className="validation-cell">{row.issues.length?<ul>{row.issues.map((issue,i)=><li key={i}><strong>{issue.field}</strong>: {t(issue.message)}</li>)}</ul>:<span className="positive">{t('Ready')}</span>}</td></tr>)}</tbody></table></div>
      <div className="catalog-pagination"><span>{t('Page {page} of {pages}',{page,pages:Math.ceil(preview.rows.length/25)})}</span><Button variant="secondary" disabled={page===1} onClick={()=>setPage(p=>p-1)}>{t('Previous')}</Button><Button variant="secondary" disabled={page*25>=preview.rows.length} onClick={()=>setPage(p=>p+1)}>{t('Next')}</Button></div>
    </section>}
    <div className="form-actions"><Button variant="secondary" disabled={!!busy} onClick={onClose}>{t('Cancel')}</Button><Button disabled={!preview?.valid||!!busy} onClick={save}>{t(busy==='save'?'Importing…':'Import {count} products',{count:preview?.rows.length||0})}</Button></div>
  </Modal>;
}
