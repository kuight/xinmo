// Comprehensive verification for xinmo v1.3 tasks 1-6. Dumps JSON evidence to stdout/file.
const { spawn } = require('child_process');
const os = require('os');
const path = require('path');
const fs = require('fs');
const CHROME = 'C:\\Users\\Administrator\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe';
const URL = 'http://127.0.0.1:8092';
const dir = path.join(os.tmpdir(), 'chrome-cdp-v13-' + Date.now());
const net = require('net');
const OUT = process.argv[2] || (path.join(os.tmpdir(), 'cdp_v13_evidence.json'));
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
  const errors=[];
  ws.onmessage=(ev)=>{ const m=JSON.parse(ev.data); if(m.id&&pending.has(m.id)){ pending.get(m.id).res(m); pending.delete(m.id); } else if(m.method==='Runtime.exceptionThrown'){ errors.push(m.params.exceptionDetails.text); } };
  await new Promise(r=>ws.onopen=r).catch(()=>{});
  await send('Runtime.enable',{}); await send('Network.enable',{}); await sleep(500);
  await send('Page.navigate',{url:URL}); await sleep(3500);
  const evid = {};

  // --- app boots clean? ---
  const boot = await send('Runtime.evaluate',{expression:"JSON.stringify({title:document.title, tabs:[...document.querySelectorAll('.tab')].map(t=>t.textContent), pageEntry:!!document.getElementById('page-entry'), datalist:!!document.getElementById('source-history')})"});
  evid.boot = JSON.parse(boot.result.result.value);

  // --- task 1: search box exists + typing 晶胞 filters topics ---
  const t1 = await send('Runtime.evaluate',{expression:"(async()=>{ const b=[...document.querySelectorAll('.subj-btn')].find(x=>x.textContent==='化学'); if(b)b.click(); await new Promise(r=>setTimeout(r,600)); const s=document.querySelector('.topic-search'); if(!s)return 'NO_SEARCH'; s.value='电解'; s.dispatchEvent(new Event('input',{bubbles:true})); await new Promise(r=>setTimeout(r,500)); const items=[...document.querySelectorAll('#page-entry .topic-item')].map(x=>x.textContent); const openCh=[...document.querySelectorAll('#page-entry .chapter.open')].map(x=>x.querySelector('.chapter-head span').textContent); s.value=''; s.dispatchEvent(new Event('input',{bubbles:true})); await new Promise(r=>setTimeout(r,300)); const after=[...document.querySelectorAll('#page-entry .chapter.open')].map(x=>x.querySelector('.chapter-head span').textContent); return JSON.stringify({items:items.slice(0,12), openCh, afterClear:after}); })()",awaitPromise:true});
  evid.task1 = JSON.parse(t1.result.result.value);

  // --- task 2: datalist populated from /api/sources ---
  const t2 = await send('Runtime.evaluate',{expression:"JSON.stringify({opts:[...document.querySelectorAll('#source-history option')].map(o=>o.value).slice(0,5)})"});
  evid.task2 = JSON.parse(t2.result.result.value);

  // --- task 6: switch to today, check collapse rows + progress + scrollTop ---
  await send('Runtime.evaluate',{expression:"[...document.querySelectorAll('.tab')].find(x=>x.textContent==='今日').click()"});
  await sleep(1800);
  const t6 = await send('Runtime.evaluate',{expression:"JSON.stringify({scrollTop:window.scrollY, rows:document.querySelectorAll('#page-today .td-row').length, openRows:document.querySelectorAll('#page-today .td-row.open').length, hasProgress:!!document.querySelector('#page-today .today-progress'), hasBadge:!!document.querySelector('#page-today .td-badge'), pageHtmlLen:document.getElementById('page-today').innerHTML.length, pageText:document.getElementById('page-today').innerText.slice(0,80)})"});
  evid.task6 = JSON.parse(t6.result.result.value);

  evid.errors = errors.slice(0,10);
  fs.writeFileSync(OUT, JSON.stringify(evid,null,2));
  cp.kill(); process.exit(0);
}
main().catch(e=>{ console.log('ERR '+e); process.exit(1); });