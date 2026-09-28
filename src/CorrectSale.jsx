import InvoiceActions from './InvoiceActions.jsx';
import React from 'react';
import {Modal,Button,ErrorBox,Loading,Table,Money,useApp,useData,date} from './main.jsx';
export default function CorrectSale({productId,saleId,range,onClose}){
 const {t,setInvoice}=useApp(),[rows,,error]=useData('/sale-corrections?'+new URLSearchParams(saleId?{sale_id:saleId}:{product_id:productId,...range}));
 return <Modal title={t('Original transactions')} wide onClose={onClose}><p>{t('Open the original invoice to review or correct it.')}</p><ErrorBox error={error}/>{!rows?<Loading/>:<Table data={rows} columns={[{label:'Invoice',key:'invoice_number'},{label:'Date',render:r=>date(r.created_at)},{label:'Product',key:'name'},{label:'Quantity',key:'quantity'},{label:'Total',render:r=><Money value={r.total}/>},{label:'Actions',render:r=><InvoiceActions saleId={r.sale_id} itemId={r.id} refundDue={r.refund_due} onOpen={onClose}/>}]} empty={t('No matching invoice items')}/>}</Modal>;
}
