// v1.10 step2 verify: today knowledge row shows 先看前置 hint when a prereq is unmastered.
// ASCII-only source; page text read via textContent.
const { spawn } = require('child_process');
const os = require('os');
const path = require('path');
const fs = require('fs');
const CHROME = 'C:\\Users\\Administrator\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe';
const URL = 'http://127.0.0.1:8092';
const dir = path.join(os.tmpdir(), 'chrome-cdp-v110b-' + Date.now());
const OUT = process.argv[2] || (path.join(os.tmpdir(), 'cdp_v110b_evidence.json'));
const net = require('net');
function freePort(){ return new Promise((res,rej)=>{ const s=net.createServer(); s.listen(0,()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function main(){
  const PORT = await freePort();
  const cp = spawn(CHROME, ['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--user-data-dir='+dir,'--remote-debugging-port='+PORT,'about:blank'], {stdio:'ignore'});
  let up=false;
  for(let i=0;i<120;i++){ try{ const r=await fetch('http://127.0.0.1:'+PORT+'/json/version'); await r.json(); up=true; break; }catch(e){} await sleep(200); }
  if(!up){ console.log('NO_CDP'); process.exit(1); }
  const t = await (await fetch('http://127.0.0.1:'+PORT+'/json/new?'+encodeURIComponent(URL), {method:'PUT'})).json();
  const ws = new WebSocket(t.webSocketDebuggerUrl);
  let id=0; const pending=new Map();
  const send=(method,params)=>new Promise((res,rej)=>{ const mid=++id; pending.set(mid,{res,rej}); ws.send(JSON.stringify({id:mid,method,params})); });
  const consoleErrors=[];
  const exceptions=[];
  const logErrors=[];
  ws.onmessage=(ev)=>{ const m=JSON.parse(ev.data); if(m.id&&pending.has(m.id)){ pending.get(m.id).res(m); pending.delete(m.id); return; }
    if(m.method==='Runtime.consoleAPICalled'){ if((m.params.type||'')==='error'){ consoleErrors.push((m.params.args||[]).map(a=>a.value!==undefined?String(a.value):(a.description||a.type)).join(' ')); } }
    else if(m.method==='Runtime.exceptionThrown'){ const d=m.params.exceptionDetails; exceptions.push(d.exception?d.exception.description:d.text); }
    else if(m.method==='Log.entryAdded'){ const e=m.params.entry||{}; if(e.level==='error'){ logErrors.push(e.text||''); } }
  };
  await new Promise(r=>ws.onopen=r).catch(()=>{});
  await send('Runtime.enable',{}); await send('Log.enable',{}); await send('Network.enable',{}); await sleep(500);
  await send('Page.navigate',{url:URL}); await sleep(3500);
  const expr = `(async()=>{
    const tabs=[...document.querySelectorAll('.tab')];
    tabs[1].click(); await new Promise(r=>setTimeout(r,1800));
    const page=document.getElementById('page-today');
    const out={};
    const rows=[...page.querySelectorAll('.td-row')];
    const hit=rows.find(r=>r.innerText.indexOf('沸点相差XX℃')>=0);
    out.hitRowHead=hit?hit.querySelector('.td-row-head').innerText.replace(/\\n/g,' | '):null;
    out.hitRowFull=hit?hit.innerText:null;
    out.warnCount=page.querySelectorAll('.prereq-warn').length;
    out.pageHasFail=page.innerText.indexOf('加载失败')>=0;
    return JSON.stringify(out);
  })()`;
  const r=await send('Runtime.evaluate',{expression:expr,awaitPromise:true});
  let parsed=null;
  if(r.result&&r.result.result&&r.result.result.value){try{parsed=JSON.parse(r.result.result.value);}catch(e){parsed={parseError:String(e)}}}
  else{parsed={evalError:r.result&&r.result.exceptionDetails?r.result.exceptionDetails.text:'no-value'};}
  const evid={result:parsed, consoleErrors, exceptions, logErrors};
  fs.writeFileSync(OUT, JSON.stringify(evid,null,2));
  console.log('EVIDENCE WRITTEN');
  cp.kill(); process.exit(0);
}
main().catch(e=>{ console.log('ERR '+e); process.exit(1); });