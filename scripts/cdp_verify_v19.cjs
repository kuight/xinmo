// v1.9 verify: knowledge tree - 3-layer SVG, 4-tier coloring, tag toggle, item popup.
// ASCII-only source; page text read via textContent.
const { spawn } = require('child_process');
const os = require('os');
const path = require('path');
const fs = require('fs');
const CHROME = 'C:\\Users\\Administrator\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe';
const URL = 'http://127.0.0.1:8092';
const dir = path.join(os.tmpdir(), 'chrome-cdp-v19-' + Date.now());
const OUT = process.argv[2] || (path.join(os.tmpdir(), 'cdp_v19_evidence.json'));
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
    const ti=tabs.findIndex(b=>b.textContent.indexOf('知识树')>=0);
    if(ti<0)return JSON.stringify({err:'tab-not-found'});
    tabs[ti].click();
    await new Promise(r=>setTimeout(r,2200));
    const page=document.getElementById('page-tree');
    const out={};
    const legend=page.querySelector('.tree-legend');
    out.legendText=legend?legend.innerText:null;
    out.tierCount=page.querySelector('.tree-count')?page.querySelector('.tree-count').textContent:null;
    const svg=page.querySelector('.ktree');
    if(!svg){out.err='svg-missing';out.pageText=page.innerText;return JSON.stringify(out);}
    const subjTexts=[...svg.querySelectorAll('text')].filter(t=>t.getAttribute('text-anchor')==='middle').map(t=>t.textContent);
    out.subjectNodes=subjTexts;
    const tagGs=[...svg.querySelectorAll('g[data-key]')];
    out.tagNodes=tagGs.map(g=>g.textContent);
    out.tagCount=tagGs.length;
    out.circleBeforeExpand=svg.querySelectorAll('circle').length;
    tagGs[0].dispatchEvent(new MouseEvent('click',{bubbles:true}));
    await new Promise(r=>setTimeout(r,400));
    const svg2=page.querySelector('.ktree');
    out.circleAfterExpand=svg2?svg2.querySelectorAll('circle').length:0;
    const itemLabels=svg2?[...svg2.querySelectorAll('text')].filter(t=>t.getAttribute('font-size')==='11').map(t=>t.textContent):[];
    out.itemLabels=itemLabels;
    // expand ALL tags (skip index 0 which was expanded above) to capture per-tier hit counts
    tagGs.slice(1).forEach(function(g){g.dispatchEvent(new MouseEvent('click',{bubbles:true}));});
    await new Promise(r=>setTimeout(r,500));
    const svgAll=page.querySelector('.ktree');
    out.allTierCount=page.querySelector('.tree-count')?page.querySelector('.tree-count').textContent:null;
    out.allCircles=svgAll?svgAll.querySelectorAll('circle').length:0;
    const circles=svgAll?svgAll.querySelectorAll('circle'):[];
    if(circles.length){circles[0].dispatchEvent(new MouseEvent('click',{bubbles:true}));}
    await new Promise(r=>setTimeout(r,250));
    const pop=page.querySelector('.tree-pop');
    out.popupText=pop?pop.innerText:null;
    out.hasFail=page.innerText.indexOf('加载失败')>=0;
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