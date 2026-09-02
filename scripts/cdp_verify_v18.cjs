// v1.8 verify: trace page manual log - add 3 category records, capture day block, delete one.
// ASCII-only source; page text read via textContent.
const { spawn } = require('child_process');
const os = require('os');
const path = require('path');
const fs = require('fs');
const CHROME = 'C:\\Users\\Administrator\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe';
const URL = 'http://127.0.0.1:8092';
const dir = path.join(os.tmpdir(), 'chrome-cdp-v18-' + Date.now());
const OUT = process.argv[2] || (path.join(os.tmpdir(), 'cdp_v18_evidence.json'));
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
    tabs.find(b=>b.textContent.indexOf('足迹')>=0).click();
    await new Promise(r=>setTimeout(r,1600));
    const out={};
    const page=document.getElementById('page-trace');
    function fill(day,cat,subj,content,min){
      const f=page.querySelector('.log-form-row');
      const dateInp=f.querySelector('input[type=date]');
      const catSel=f.querySelectorAll('select')[0];
      const subjSel=f.querySelectorAll('select')[1];
      const contentInp=f.querySelector('input[type=text]');
      const minInp=f.querySelector('input[type=number]');
      dateInp.value=day; catSel.value=cat; subjSel.value=subj; contentInp.value=content; minInp.value=min;
      f.querySelector('button').click();
    }
    // add 3 records of different categories
    fill('2026-09-02','practice','math','指数函数练习册 P37-38，卡住 1 道','40');
    await new Promise(r=>setTimeout(r,700));
    fill('2026-09-02','recite','physics','牛顿定律条目背 10 条','20');
    await new Promise(r=>setTimeout(r,700));
    fill('2026-09-02','class','chemistry','氧化还原反应课 1 小时','60');
    await new Promise(r=>setTimeout(r,700));
    out.summary=page.querySelector('.log-today-sum')?page.querySelector('.log-today-sum').textContent:null;
    const blocks=[...page.querySelectorAll('.log-day')];
    out.dayBlocks=blocks.map(b=>b.innerText);
    out.blockCount=blocks.length;
    // delete the first record (newest first in the day block: recite 20min was added second -> class 60min is last)
    const items=[...page.querySelectorAll('.log-item')];
    out.itemCountBefore=items.length;
    out.firstItemText=items[0]?items[0].innerText:null;
    const del=items[items.length-1].querySelector('.log-del'); // delete last (class 60min)
    del.click(); await new Promise(r=>setTimeout(r,700));
    const blocks2=[...page.querySelectorAll('.log-day')];
    out.dayBlocksAfterDelete=blocks2.map(b=>b.innerText);
    out.itemCountAfter=page.querySelectorAll('.log-item').length;
    return JSON.stringify(out);
  })()`;
  const r=await send('Runtime.evaluate',{expression:expr,awaitPromise:true});
  const evid={result:JSON.parse(r.result.result.value), consoleErrors, exceptions, logErrors};
  fs.writeFileSync(OUT, JSON.stringify(evid,null,2));
  console.log('EVIDENCE WRITTEN');
  cp.kill(); process.exit(0);
}
main().catch(e=>{ console.log('ERR '+e); process.exit(1); });