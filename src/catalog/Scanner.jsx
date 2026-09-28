import React,{useEffect,useRef,useState} from 'react';
import {Camera,ScanBarcode} from 'lucide-react';
import {Modal,Button,ErrorBox,useApp} from '../main.jsx';
import {catalogText} from '../catalog-i18n.js';

export default function Scanner({onClose,onScan}) {
  const {lang}=useApp(),t=(s)=>catalogText(s,lang);
  const [value,setValue]=useState(''),[camera,setCamera]=useState(false),[error,setError]=useState('');
  const entry=useRef(),video=useRef(),stream=useRef(),timer=useRef(),generation=useRef(0);
  const stop=()=>{generation.current++;clearTimeout(timer.current);stream.current?.getTracks().forEach(track=>track.stop());stream.current=null;if(video.current)video.current.srcObject=null;};
  useEffect(()=>{const focus=requestAnimationFrame(()=>entry.current?.focus());const hidden=()=>{if(document.hidden){stop();setCamera(false);}};document.addEventListener('visibilitychange',hidden);return()=>{cancelAnimationFrame(focus);stop();document.removeEventListener('visibilitychange',hidden);};},[]);
  const finish=code=>{if(!code.trim())return;stop();onScan(code.trim());onClose();};
  const start=async()=>{
    setError('');stop();const run=generation.current;
    if(!('BarcodeDetector' in window)||!navigator.mediaDevices?.getUserMedia){setError(t('Camera scanning is unavailable in this browser. Use a scanner or type the barcode.'));return;}
    try{
      const detector=new window.BarcodeDetector();
      const media=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'}},audio:false});
      if(generation.current!==run){media.getTracks().forEach(track=>track.stop());return;}
      stream.current=media;video.current.srcObject=media;await video.current.play();setCamera(true);
      const detect=async()=>{if(generation.current!==run)return;try{const found=await detector.detect(video.current);if(generation.current!==run)return;if(found[0]?.rawValue){finish(found[0].rawValue);return;}}catch{/* Frame may not be ready. */}timer.current=setTimeout(detect,180);};
      detect();
    }catch{stop();setCamera(false);setError(t('Camera access failed. Check browser permissions or use a scanner.'));}
  };
  return <Modal title={t('Scan barcode')} onClose={()=>{stop();onClose();}}>
    <p className="catalog-help">{t('Scan with a USB/Bluetooth scanner or enter the barcode, then press Enter.')}</p>
    <form onSubmit={e=>{e.preventDefault();finish(value);}} className="scanner-entry">
      <label className="field"><span>{t('Barcode')}</span><input ref={entry} autoFocus autoComplete="off" maxLength={60} value={value} onChange={e=>setValue(e.target.value)} required/></label>
      <Button icon={ScanBarcode} disabled={!value.trim()}>{t('Use barcode')}</Button>
    </form>
    <div className="camera-preview" hidden={!camera}><video ref={video} muted playsInline aria-label={t('Keep the barcode inside the camera view.')}/><p role="status">{t('Looking for a barcode…')}</p></div>
    {/* The video stays mounted so a requested stream can be attached immediately. */}
    <ErrorBox error={error}/>
    <Button type="button" variant="secondary" icon={Camera} onClick={camera?()=>{stop();setCamera(false);}:start}>{t(camera?'Stop camera':'Start camera')}</Button>
  </Modal>;
}
