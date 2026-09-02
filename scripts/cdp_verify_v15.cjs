// v1.5 batch1 verify: today queue knowledge card render + self-judge flow.
// ASCII-only source; page text read via textContent to dodge encoding issues.
const { spawn } = require('child_process');
const os = require('os');
const path = require('path');
const fs = require('fs');
const CHROME = 'C:\\Users\\Administrator\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe';
const URL = 'http://127.0.0.1:8092';
const dir = path.join(os.tmpdir(), 'chrome-cdp-v15-' + Date.now());
const OUT = process.argv[2] || (path.join(os.tmpdir(), 'cdp_v15_evidence.json'));
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
    const tabs=[...document.querySelectorAll('.tab')]; (tabs[1]||{}).click && tabs[1].click();
    await new Promise(r=>setTimeout(r,1800));
    const out={};
    const kcard=document.querySelector('#page-today .kcard');
    if(!kcard){ out.error='kcard-not-found'; out.pageText=document.getElementById('page-today').innerText; return JSON.stringify(out); }
    const row=kcard.closest('.td-row');
    out.headTitle=row.querySelector('.td-row-head').innerText.replace(/\\n/g,' | ');
    out.badgeBefore=row.querySelector('.td-badge')?row.querySelector('.td-badge').textContent:null;
    const prog0=document.querySelector('.today-progress');
    out.progressBefore=prog0?prog0.textContent:null;
    out.kcardId=kcard.parentElement.querySelector('h3')?null:kcard.querySelector('h3').textContent;
    row.querySelector('.td-row-head').click(); await new Promise(r=>setTimeout(r,500));
    const openBody=row.querySelector('.td-body');
    out.bodyDisplay=openBody?getComputedStyle(openBody).display:null;
    out.phase1Text=kcard.innerText;
    out.phase1Buttons=[...kcard.querySelectorAll('.actions button')].map(b=>({cls:b.className,txt:b.textContent}));
    // click self-wrong (again) in phase 1
    const sw=kcard.querySelector('.actions button.again');
    if(!sw){ out.error='selfwrong-btn-missing'; return JSON.stringify(out); }
    sw.click(); await new Promise(r=>setTimeout(r,400));
    out.phase2Text=kcard.innerText;
    out.phase2Buttons=[...kcard.querySelectorAll('.actions button')].map(b=>({cls:b.className,txt:b.textContent}));
    // commit again (排回今天再练)
    const cb=kcard.querySelector('.actions button.again');
    if(!cb){ out.error='commit-btn-missing'; return JSON.stringify(out); }
    cb.click(); await new Promise(r=>setTimeout(r,900));
    out.afterCommitRowOpen=row.classList.contains('open');
    out.badgeAfter=row.querySelector('.td-badge')?row.querySelector('.td-badge').textContent:null;
    const prog1=document.querySelector('.today-progress');
    out.progressAfter=prog1?prog1.textContent:null;
    out.pageText=document.getElementById('page-today').innerText;
    return JSON.stringify(out);
  })()`;
  const r=await send('Runtime.evaluate',{expression:expr,awaitPromise:true});
  const evid={result:JSON.parse(r.result.result.value), consoleErrors, exceptions, logErrors};
  fs.writeFileSync(OUT, JSON.stringify(evid,null,2));
  console.log('EVIDENCE WRITTEN');
  cp.kill(); process.exit(0);
}
main().catch(e=>{ console.log('ERR '+e); process.exit(1); });