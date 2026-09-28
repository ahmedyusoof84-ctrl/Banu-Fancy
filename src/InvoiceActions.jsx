import React from 'react';
import {Button,useApp} from './main.jsx';
export default function InvoiceActions({saleId,itemId,canCorrect=true,refundDue,onOpen}){
 const {user,t,setInvoice}=useApp();const open=action=>{onOpen?.();setInvoice({id:saleId,action,itemId});};
 return <div className="row-actions invoice-row-actions"><Button variant="secondary" onClick={()=>open('view')}>{t('Open invoice')}</Button>{user.role==='admin'&&<>{canCorrect&&<><Button variant="secondary" onClick={()=>open('correct')}>{t('Correct invoice item')}</Button><Button variant="secondary" onClick={()=>open('void')}>{t('Void invoice')}</Button></>}{(refundDue===undefined||Number(refundDue)>0)&&<Button variant="secondary" onClick={()=>open('refund')}>{t('Record refund')}</Button>}<Button variant="secondary" onClick={()=>open('delete')}>{t('Delete incorrect invoice')}</Button></>}</div>;
}
