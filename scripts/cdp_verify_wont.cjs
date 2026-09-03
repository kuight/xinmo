// v1.11 wont button on knowledge cards: click wont -> read-only panel -> 读完了 -> commit wont.
// ASCII-only source; page text read via textContent (chinese matched by unicode escapes).
const { spawn } = require('child_process');
const os = require('os');
const path = require('path');
const fs = require('fs');
const CHROME = 'C:\\Users\\Administrator\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe';
const URL = 'http://127.0.0.1:8092';
const dir = path.join(os.tmpdir(), 'chrome-cdp-wont-' + Date.now());
const OUT = process.argv[2] || (path.join(os.tmpdir(), 'cdp_wont_evidence.json'));
const net = require('net');
function freePort(){ return new Promise((res,rej)=>{ const s=net.createServer(); s.listen(0,()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function main(){
  const PORT = await freePort();
  const cp = spawn(CHROME, ['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--user-data-dir='+dir,'--remote-debugging-port='+PORT,'about:blank'], {stdio:'ignore'});
  let up=false;
  for(let i=0;i<150;i++){ try{ const r=await fetch('http://127.0.0.1:'+PORT+'/json/version'); await r.json(); up=true; break; }catch(e){} await sleep(200); }
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
  await send('Runtime.enable',{}); await send('Log.enable',{}); await sleep(400);
  await send('Page.navigate',{url:URL}); await sleep(5000);
  const expr = `(async()=>{
    var tabs=[...document.querySelectorAll('.tab')];
    var ti=tabs.findIndex(function(b){return b.textContent.indexOf('\u4eca\u65e5')>=0;});
    if(ti<0)return JSON.stringify({err:'tab-not-found'});
    tabs[ti].click(); await new Promise(function(r){setTimeout(r,2500);});
    var page=document.getElementById('page-today');
    var secs=[...page.querySelectorAll('.today-section')];
    var out={}; out.sectionCount=secs.length;
    var ksec=secs[1];
    var kRows=[...ksec.querySelectorAll('.td-row')];
    out.kRows=kRows.length;
    // expand first knowledge row
    kRows[0].querySelector('.td-row-head').click(); await new Promise(function(r){setTimeout(r,500);});
    var card=ksec.querySelector('.td-row.open .card');
    out.recallActionsHTML=card.querySelector('.actions').outerHTML;
    // click wont button
    var wontBtn=[...card.querySelectorAll('.actions button')].find(function(b){return b.textContent.indexOf('\u4e0d\u4f1a')>=0;});
    out.wontBtnFound=!!wontBtn; out.wontBtnClass=wontBtn?wontBtn.className:null; out.wontBtnText=wontBtn?wontBtn.textContent:null;
    wontBtn.click(); await new Promise(function(r){setTimeout(r,400);});
    out.wontPanelHTML=card.querySelector('.wont-panel')?card.querySelector('.wont-panel').outerHTML:null;
    out.wontPhaseHTML=card.innerHTML;
    // click 读完了
    var doneBtn=[...card.querySelectorAll('.actions button')].find(function(b){return b.textContent.indexOf('\u8bfb\u5b8c\u4e86')>=0;});
    out.doneBtnFound=!!doneBtn;
    if(doneBtn)doneBtn.click();
    await new Promise(function(r){setTimeout(r,1500);});
    out.badgeAfter=card.closest('.td-row').querySelector('.td-badge').textContent;
    out.rowClassAfter=card.closest('.td-row').className;
    out.cardInnerAfter=card.innerHTML;
    out.hasFail=page.innerText.indexOf('\u52a0\u8f7d\u5931\u8d25')>=0;
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