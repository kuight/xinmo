const { spawn } = require('child_process');
const os = require('os');
const path = require('path');
// Real Chrome install path is under LocalAppData, not Program Files.
const CHROME = 'C:\\Users\\Administrator\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe';
const URL = 'http://127.0.0.1:8092';
const dir = path.join(os.tmpdir(), 'chrome-cdp-' + Date.now());
// Use a random free debug port to avoid clash with lingering CDP processes on 9222.
const net = require('net');
function freePort(){ return new Promise((res,rej)=>{ const s=net.createServer(); s.listen(0,()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function main(){
  const PORT = await freePort();
  const cp = spawn(CHROME, ['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--user-data-dir='+dir,'--remote-debugging-port='+PORT,'about:blank'], {stdio:'ignore'});
  let up=false;
  for(let i=0;i<100;i++){ try{ const r=await fetch('http://127.0.0.1:'+PORT+'/json/version'); await r.json(); up=true; break; }catch(e){} await sleep(200); }
  if(!up){ console.log('NO_CDP'); process.exit(1); }
  console.log('PORT='+PORT);
  const t = await (await fetch('http://127.0.0.1:'+PORT+'/json/new?'+encodeURIComponent(URL), {method:'PUT'})).json();
  const ws = new WebSocket(t.webSocketDebuggerUrl);
  let id=0; const pending=new Map();
  const send=(method,params)=>new Promise((res,rej)=>{ const mid=++id; pending.set(mid,{res,rej}); ws.send(JSON.stringify({id:mid,method,params})); });
  ws.onmessage=(ev)=>{ const m=JSON.parse(ev.data); if(m.id&&pending.has(m.id)){ pending.get(m.id).res(m); pending.delete(m.id); return; }
    if(m.method==='Runtime.consoleAPICalled'){ console.log('CONSOLE: '+ (m.params.args||[]).map(a=>a.value!==undefined?String(a.value):(a.description||a.type)).join(' ')); }
    else if(m.method==='Runtime.exceptionThrown'){ const d=m.params.exceptionDetails; console.log('EXCEPTION: '+(d.exception?d.exception.description:d.text)); }
    else if(m.method==='Network.loadingFailed'){ console.log('NETFAIL: '+JSON.stringify(m.params.errorText)+' '+m.params.requestId); }
  };
  await new Promise(r=>ws.onopen=r).catch(()=>{});
  await send('Runtime.enable',{}); await send('Network.enable',{}); await sleep(500);
  await send('Page.navigate',{url:URL}); await sleep(3000);
  // click 5th tab (错题库) to trigger the library render, then read the rendered list
  await send('Runtime.evaluate',{expression:"(()=>{ const b=[...document.querySelectorAll('.tab')][4]; if(b){b.click(); return 'clicked '+b.textContent;} return 'no-tab'; })()"});
  await sleep(3000);
  const r=await send('Runtime.evaluate',{expression:"(()=>{ const p=document.getElementById('page-library'); return JSON.stringify({txt:p.innerText.replace(/\\s+/g,' ').slice(0,600), cards:document.querySelectorAll('#page-library .lib-card').length, thumbs:document.querySelectorAll('#page-library .thumb').length, hasFail:p.innerText.indexOf('加载失败')>=0, options:[...p.querySelectorAll('select')].map(s=>s.value)}) })()"});
  console.log('RESULT: '+JSON.stringify(r.result.result.value));
  cp.kill(); process.exit(0);
}
main().catch(e=>{ console.log('ERR '+e); process.exit(1); });