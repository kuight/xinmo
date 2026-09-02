// v1.7 verify: history block + memory curve SVG + tag stats on 条目库 and 错题库 pages.
// ASCII-only source; page text read via textContent.
const { spawn } = require('child_process');
const os = require('os');
const path = require('path');
const fs = require('fs');
const CHROME = 'C:\\Users\\Administrator\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe';
const URL = 'http://127.0.0.1:8092';
const dir = path.join(os.tmpdir(), 'chrome-cdp-v17-' + Date.now());
const OUT = process.argv[2] || (path.join(os.tmpdir(), 'cdp_v17_evidence.json'));
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
    const out={};
    function clickTab(label){ const t=[...document.querySelectorAll('.tab')].find(b=>b.textContent.indexOf(label)>=0); t.click(); }
    function openGroup(page, gTitle){
      const g=[...page.querySelectorAll(':scope > .lib-list > .td-row')].find(x=>x.querySelector('.td-row-title').innerText.indexOf(gTitle)>=0);
      if(!g)return null; g.querySelector('.td-row-head').click(); return g;
    }
    function openTag(g, tagTitle){
      const t=[...g.querySelectorAll('.td-body > .td-row')].find(x=>x.querySelector('.td-row-title').innerText.indexOf(tagTitle)>=0);
      if(!t)return null; t.querySelector('.td-row-head').click(); return t;
    }
    // ---- 条目库 ----
    clickTab('条目库'); await new Promise(r=>setTimeout(r,1600));
    const kpage=document.getElementById('page-kentry');
    const chem=openGroup(kpage,'化学'); await new Promise(r=>setTimeout(r,300));
    out.chemGroupTitle=chem?chem.querySelector('.td-row-title').innerText:null;
    const oper=openTag(chem,'分离提纯操作'); await new Promise(r=>setTimeout(r,300));
    out.operTagTitle=oper?oper.querySelector('.td-row-title').innerText:null;
    const card=[...oper.querySelectorAll('.kentry-item')].find(c=>c.innerText.indexOf('蒸馏')>=0);
    out.cardText=card?card.innerText:null;
    out.cardHasHist=card?!!card.querySelector('.hist-block'):null;
    out.cardHasSvg=card?!!card.querySelector('.mem-wrap svg'):null;
    out.svgCount=card?card.querySelectorAll('.mem-wrap svg circle').length:null;
    // un-attempted card: physics 仪器读数 -> 游标卡尺
    const phys=openGroup(kpage,'物理'); await new Promise(r=>setTimeout(r,300));
    const inst=openTag(phys,'仪器读数'); await new Promise(r=>setTimeout(r,300));
    const ruler=[...inst.querySelectorAll('.kentry-item')].find(c=>c.innerText.indexOf('游标卡尺')>=0);
    out.rulerCardText=ruler?ruler.innerText:null;
    // ---- 错题库 ----
    clickTab('错题库'); await new Promise(r=>setTimeout(r,1600));
    const lpage=document.getElementById('page-library');
    const math=openGroup(lpage,'数学'); await new Promise(r=>setTimeout(r,300));
    out.mathTagTitles=math?[...math.querySelectorAll('.td-body > .td-row .td-row-title')].map(x=>x.innerText):null;
    out.libraryHasFail=lpage.innerText.indexOf('加载失败')>=0;
    return JSON.stringify(out);
  })()`;
  const r=await send('Runtime.evaluate',{expression:expr,awaitPromise:true});
  const evid={result:JSON.parse(r.result.result.value), consoleErrors, exceptions, logErrors};
  fs.writeFileSync(OUT, JSON.stringify(evid,null,2));
  console.log('EVIDENCE WRITTEN');
  cp.kill(); process.exit(0);
}
main().catch(e=>{ console.log('ERR '+e); process.exit(1); });