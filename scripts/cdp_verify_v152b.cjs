// v1.5 batch2 evidence: read chemistry + math knowledge cards from the 条目库 page.
// ASCII-only source; page text read via textContent.
const { spawn } = require('child_process');
const os = require('os');
const path = require('path');
const fs = require('fs');
const CHROME = 'C:\\Users\\Administrator\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe';
const URL = 'http://127.0.0.1:8092';
const dir = path.join(os.tmpdir(), 'chrome-cdp-v152b-' + Date.now());
const OUT = process.argv[2] || (path.join(os.tmpdir(), 'cdp_v152b_evidence.json'));
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
  ws.onmessage=(ev)=>{ const m=JSON.parse(ev.data); if(m.id&&pending.has(m.id)){ pending.get(m.id).res(m); pending.delete(m.id); return; }
    if(m.method==='Runtime.consoleAPICalled'){ if((m.params.type||'')==='error'){ consoleErrors.push((m.params.args||[]).map(a=>a.value!==undefined?String(a.value):(a.description||a.type)).join(' ')); } }
    else if(m.method==='Runtime.exceptionThrown'){ const d=m.params.exceptionDetails; exceptions.push(d.exception?d.exception.description:d.text); }
  };
  await new Promise(r=>ws.onopen=r).catch(()=>{});
  await send('Runtime.enable',{}); await sleep(500);
  await send('Page.navigate',{url:URL}); await sleep(3500);
  const expr = `(async()=>{
    const tabs=[...document.querySelectorAll('.tab')];
    tabs.find(b=>b.textContent.indexOf('条目库')>=0).click();
    await new Promise(r=>setTimeout(r,1800));
    const page=document.getElementById('page-kentry');
    const out={};
    function grabGroup(gName, tagTitle){
      const grp=[...page.querySelectorAll(':scope > .lib-list > .td-row')].find(g=>g.querySelector('.td-row-title').innerText.indexOf(gName)>=0);
      if(!grp)return null;
      grp.querySelector('.td-row-head').click();
      const tag=[...grp.querySelectorAll('.td-body > .td-row')].find(tr=>tr.querySelector('.td-row-title').innerText.indexOf(tagTitle)>=0);
      if(!tag)return null;
      tag.querySelector('.td-row-head').click();
      const card=tag.querySelector('.kentry-item');
      return card?card.innerText:null;
    }
    out.chemistry=grabGroup('化学','反向速查');
    out.chemistryOper=grabGroup('化学','分离提纯操作');
    out.math=grabGroup('数学','指数对数基本概念');
    return JSON.stringify(out);
  })()`;
  const r=await send('Runtime.evaluate',{expression:expr,awaitPromise:true});
  const evid={result:JSON.parse(r.result.result.value), consoleErrors, exceptions};
  fs.writeFileSync(OUT, JSON.stringify(evid,null,2));
  console.log('EVIDENCE WRITTEN');
  cp.kill(); process.exit(0);
}
main().catch(e=>{ console.log('ERR '+e); process.exit(1); });