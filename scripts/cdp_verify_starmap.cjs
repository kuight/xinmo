// v1.11 step1 acceptance: starmap CDP verification (items c-h).
// ASCII-only source; page text via textContent.
const { spawn } = require('child_process');
const os = require('os');
const path = require('path');
const fs = require('fs');
const CHROME = 'C:\\Users\\Administrator\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe';
const URL = 'http://127.0.0.1:8092';
const dir = path.join(os.tmpdir(), 'chrome-cdp-starmap-' + Date.now());
const OUT = process.argv[2] || (path.join(os.tmpdir(), 'cdp_starmap_evidence.json'));
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
  const consoleErrors=[]; const exceptions=[]; const allRequests=[];
  ws.onmessage=(ev)=>{ const m=JSON.parse(ev.data); if(m.id&&pending.has(m.id)){ pending.get(m.id).res(m); pending.delete(m.id); return; }
    if(m.method==='Runtime.consoleAPICalled'){ if((m.params.type||'')==='error'){ consoleErrors.push((m.params.args||[]).map(a=>a.value!==undefined?String(a.value):(a.description||a.type)).join(' ')); } }
    else if(m.method==='Runtime.exceptionThrown'){ const d=m.params.exceptionDetails; exceptions.push(d.exception?d.exception.description:d.text); }
    else if(m.method==='Network.requestWillBeSent'){ const r=m.params.request||{}; if(r.url)allRequests.push(r.url); }
  };
  await new Promise(r=>ws.onopen=r).catch(()=>{});
  await send('Runtime.enable',{}); await send('Network.enable',{}); await sleep(400);
  await send('Page.navigate',{url:URL}); await sleep(5000);

  // Helper: wait for starmap scene to be ready
  const waitForScene = async (timeoutMs) => {
    const start = Date.now();
    while(Date.now() - start < timeoutMs){
      const r = await send('Runtime.evaluate',{expression:'window.__sceneReady && window.__sceneReady()',returnByValue:true});
      if(r.result && r.result.result && r.result.result.value) return true;
      await sleep(300);
    }
    return false;
  };

  // ---- First load: open starmap tab ----
  const expr1 = `(async()=>{
    var tabs=[...document.querySelectorAll('.tab')];
    var ti=tabs.findIndex(function(b){return b.textContent.indexOf('星图')>=0;});
    if(ti<0)return JSON.stringify({err:'no-starmap-tab'});
    tabs[ti].click(); return JSON.stringify({ok:true});
  })()`;
  await send('Runtime.evaluate',{expression:expr1,awaitPromise:true});
  const ready = await waitForScene(10000);
  if(!ready){ console.log('SCENE_NOT_READY'); cp.kill(); process.exit(1); }

  // ---- Item c: star count, tier counts, counter text ----
  const exprC = `(async()=>{
    var out={};
    out.starCount=window.__starCount();
    out.tiers=window.__starTiers();
    out.counterText=window.__counterText();
    out.cameraState=window.__cameraState();
    out.starPositions1=window.__starPositions();
    return JSON.stringify(out);
  })()`;
  const rC = await send('Runtime.evaluate',{expression:exprC,awaitPromise:true});
  let evC = null;
  if(rC.result&&rC.result.result&&rC.result.result.value){try{evC=JSON.parse(rC.result.result.value);}catch(e){evC={parseError:String(e)}}}

  // ---- Item f: camera switch test ----
  // Click toggle button to switch to inside
  const exprF = `(async()=>{
    var out={};
    out.outsideBefore=window.__cameraState();
    var btn=document.querySelector('.starmap-toggle');
    if(!btn)return JSON.stringify({err:'no-toggle-btn'});
    btn.click(); await new Promise(function(r){setTimeout(r,2000);});
    out.inside=window.__cameraState();
    btn.click(); await new Promise(function(r){setTimeout(r,2000);});
    out.outsideAfter=window.__cameraState();
    return JSON.stringify(out);
  })()`;
  const rF = await send('Runtime.evaluate',{expression:exprF,awaitPromise:true});
  let evF = null;
  if(rF.result&&rF.result.result&&rF.result.result.value){try{evF=JSON.parse(rF.result.result.value);}catch(e){evF={parseError:String(e)}}}

  // ---- Item h: click star id=31, capture popup outerHTML ----
  const exprH = `(async()=>{
    window.__clickStar(31);
    await new Promise(function(r){setTimeout(r,300);});
    var pop=document.querySelector('#page-starmap .tree-pop');
    var out={};
    out.popupHTML=pop?pop.outerHTML:null;
    out.popupDisplay=pop?pop.style.display:null;
    // close popup
    var close=pop?pop.querySelector('.tree-pop-close'):null;
    if(close)close.click();
    return JSON.stringify(out);
  })()`;
  const rH = await send('Runtime.evaluate',{expression:exprH,awaitPromise:true});
  let evH = null;
  if(rH.result&&rH.result.result&&rH.result.result.value){try{evH=JSON.parse(rH.result.result.value);}catch(e){evH={parseError:String(e)}}}

  // ---- Item g: deterministic test - reload page and capture again ----
  await send('Page.navigate',{url:URL}); await sleep(5000);
  const exprG2 = `(async()=>{
    var tabs=[...document.querySelectorAll('.tab')];
    var ti=tabs.findIndex(function(b){return b.textContent.indexOf('星图')>=0;});
    if(ti<0)return JSON.stringify({err:'no-starmap-tab'});
    tabs[ti].click(); return JSON.stringify({ok:true});
  })()`;
  await send('Runtime.evaluate',{expression:exprG2,awaitPromise:true});
  const ready2 = await waitForScene(10000);
  let evG2 = null;
  if(ready2){
    const rG2 = await send('Runtime.evaluate',{expression:'(async()=>{return JSON.stringify({starPositions2:window.__starPositions()});})()',awaitPromise:true});
    if(rG2.result&&rG2.result.result&&rG2.result.result.value){try{evG2=JSON.parse(rG2.result.result.value);}catch(e){evG2={parseError:String(e)}}}
  }

  const evid = {
    c: evC,
    f: evF,
    h: evH,
    g_load1: evC ? {starPositions1: evC.starPositions1} : null,
    g_load2: evG2,
    consoleErrors, exceptions,
    allRequests
  };
  fs.writeFileSync(OUT, JSON.stringify(evid,null,2));
  console.log('EVIDENCE WRITTEN');
  cp.kill(); process.exit(0);
}
main().catch(e=>{ console.log('ERR '+e); process.exit(1); });