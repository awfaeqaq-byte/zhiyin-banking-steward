import {useEffect,useState} from 'react';
import QRCode from 'qrcode';
/** Encode locally so a shop URL is never disclosed to a third-party QR service. */
export function MerchantQRCode({url}:{url:string}){
 const [result,setResult]=useState<{url:string;src:string}|null>(null),[failed,setFailed]=useState(false);
 useEffect(()=>{let live=true;setFailed(false);void QRCode.toDataURL(url,{width:256,margin:2,errorCorrectionLevel:'M',color:{dark:'#133346',light:'#ffffff'}}).then(src=>{if(live)setResult({url,src});}).catch(()=>{if(live)setFailed(true);});return()=>{live=false;};},[url]);
 return failed?<p role="status">二维码暂未生成，可以复制点餐链接。</p>:result?.url===url?<img src={result.src} alt="顾客扫码点餐二维码" width={192} height={192}/>:<p role="status">正在生成点餐码…</p>;
}
