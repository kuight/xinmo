const { spawn } = require('child_process');
const os = require('os');
const path = require('path');
const fs = require('fs');
const CHROME = 'C:\\Users\\Administrator\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe';
const URL = 'http://127.0.0.1:8092';
const dir = path.join(os.tmpdir(), 'chrome-cdp-v14-' + Date.now());
const OUT = process.argv[2] || (path.join(os.tmpdir(), 'cdp_v14_evidence.json'));
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
  const errors=[];
  ws.onmessage=(ev)=>{ const m=JSON.parse(ev.data); if(m.id&&pending.has(m.id)){ pending.get(m.id).res(m); pending.delete(m.id); } else if(m.method==='Runtime.exceptionThrown'){ errors.push(m.params.exceptionDetails.text); } };
  await new Promise(r=>ws.onopen=r).catch(()=>{});
  await send('Runtime.enable',{}); await send('Network.enable',{}); await sleep(500);
  await send('Page.navigate',{url:URL}); await sleep(3500);
  const evid = {};

  const boot = await send('Runtime.evaluate',{expression:"JSON.stringify({title:document.title, tabs:[...document.querySelectorAll('.tab')].map(t=>t.textContent), hasFail:document.body.innerText.indexOf('加载失败')>=0})"});
  evid.boot = JSON.parse(boot.result.result.value);

  const lib = await send('Runtime.evaluate',{expression:"(async()=>{ const tabs=[...document.querySelectorAll('.tab')]; (tabs[4]||{}).click && tabs[4].click(); await new Promise(r=>setTimeout(r,2200)); const groups=[...document.querySelectorAll('#page-library .td-row')].map(g=>{ const t=g.querySelector('.td-row-title'); return {title:t?t.childNodes[0].textContent.trim():'', count:(g.querySelector('.lib-grp-count')||{}).textContent||null, open:g.classList.contains('open'), bodyDisplay:getComputedStyle(g.querySelector('.td-body')).display}; }); const firstHead=document.querySelector('#page-library .td-row-head'); let afterOpen=null; if(firstHead){ firstHead.click(); await new Promise(r=>setTimeout(r,400)); afterOpen=[...document.querySelectorAll('#page-library .td-row')].map(g=>({open:g.classList.contains('open'), bodyDisplay:getComputedStyle(g.querySelector('.td-body')).display})); } return JSON.stringify({groups, afterOpen, cardCount:document.querySelectorAll('#page-library .lib-card').length, countTxt:(document.querySelector('#page-library .muted')||{}).textContent||''}); })()",awaitPromise:true});
  evid.library = JSON.parse(lib.result.result.value);

  const tod = await send('Runtime.evaluate',{expression:"(async()=>{ const tabs=[...document.querySelectorAll('.tab')]; (tabs[1]||{}).click && tabs[1].click(); await new Promise(r=>setTimeout(r,1800)); const rows=document.querySelectorAll('#page-today .td-row').length; const prog=(document.querySelector('#page-today .today-progress')||{}).textContent||''; const wontBtns=document.querySelectorAll('#page-today .wont').length; const retroBoxes=document.querySelectorAll('#page-today .retro-box').length; const hasFail=document.getElementById('page-today').innerText.indexOf('加载失败')>=0; let firstAsk=''; const head=document.querySelector('#page-today .td-row-head'); if(head){ head.click(); await new Promise(r=>setTimeout(r,400)); const acts=document.querySelector('#page-today .td-row .card .actions'); firstAsk=acts?acts.textContent:''; } return JSON.stringify({rows, prog, wontBtns, retroBoxes, hasFail, firstAskText:firstAsk}); })()",awaitPromise:true});
  evid.today = JSON.parse(tod.result.result.value);

  evid.errors = errors.slice(0,10);
  fs.writeFileSync(OUT, JSON.stringify(evid,null,2));
  console.log('EVIDENCE WRITTEN');
  cp.kill(); process.exit(0);
}
main().catch(e=>{ console.log('ERR '+e); process.exit(1); });