const { spawn } = require('child_process');
const os = require('os');
const path = require('path');
const fs = require('fs');
const CHROME = 'C:\\Users\\Administrator\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe';
const URL = 'http://127.0.0.1:8092';
const dir = path.join(os.tmpdir(), 'chrome-cdp-v141-' + Date.now());
const OUT = process.argv[2] || (path.join(os.tmpdir(), 'cdp_v141_evidence.json'));
const net = require('net');
function freePort(){ return new Promise((res,rej)=>{ const s=net.createServer(); s.listen(0,()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function postProblem(body){
  const r = await fetch(URL+'/api/problem', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body)});
  return (await r.json()).problem;
}
async function main(){
  // create two temp problems: A with answer_text, B with neither answer_text nor answer image
  const pa = await postProblem({subject:'physics',topic:'kin-velocity',topic_label:'v141-wont-a',error_type:'concept',question_type:'choice',note:'',answer_text:'B',source:'v141',image_path:'/images/e2e_test.jpg',answer_image_path:''});
  const pb = await postProblem({subject:'physics',topic:'kin-velocity',topic_label:'v141-wont-b',error_type:'concept',question_type:'choice',note:'',answer_text:'',source:'v141',image_path:'/images/e2e_test.jpg',answer_image_path:''});
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
  const expr = `(async()=>{
    const tabs=[...document.querySelectorAll('.tab')]; (tabs[1]||{}).click && tabs[1].click();
    await new Promise(r=>setTimeout(r,1800));
    const out={};
    // --- A: has answer_text -> wont shows panel with std answer + 读完了 ---
    const rowA=[...document.querySelectorAll('#page-today .td-row')].find(row=>row.innerText.indexOf('v141-wont-a')>=0);
    if(rowA){
      rowA.querySelector('.td-row-head').click(); await new Promise(r=>setTimeout(r,400));
      const wbA=rowA.querySelector('.wont'); wbA.click(); await new Promise(r=>setTimeout(r,400));
      const panelA=rowA.querySelector('.wont-panel');
      out.panelA=panelA?panelA.innerText:null;
      const doneA=rowA.querySelector('.actions button');
      out.doneBtnTextA=doneA?doneA.textContent:null;
      const imgCountA=rowA.querySelectorAll('.wont-panel .thumb').length;
      out.panelAImgCount=imgCountA;
      if(doneA){ doneA.click(); await new Promise(r=>setTimeout(r,1200)); }
      const badgeA=rowA.querySelector('.td-badge');
      out.badgeA=badgeA?badgeA.textContent:null;
    }
    // --- B: neither answer_text nor answer image -> wont shows empty hint ---
    const rowB=[...document.querySelectorAll('#page-today .td-row')].find(row=>row.innerText.indexOf('v141-wont-b')>=0);
    if(rowB){
      rowB.querySelector('.td-row-head').click(); await new Promise(r=>setTimeout(r,400));
      const wbB=rowB.querySelector('.wont'); wbB.click(); await new Promise(r=>setTimeout(r,400));
      const emptyB=rowB.querySelector('.wont-empty');
      out.emptyHintB=emptyB?emptyB.textContent:null;
      const doneB=rowB.querySelector('.actions button');
      out.doneBtnTextB=doneB?doneB.textContent:null;
      const hasPanelB=!!rowB.querySelector('.wont-panel');
      out.hasPanelB=hasPanelB;
    }
    out.hasFail=document.getElementById('page-today').innerText.indexOf('加载失败')>=0;
    return JSON.stringify(out);
  })()`;
  const r=await send('Runtime.evaluate',{expression:expr,awaitPromise:true});
  const evid={pidA:pa.id, pidB:pb.id, result:JSON.parse(r.result.result.value), errors:errors.slice(0,10)};
  fs.writeFileSync(OUT, JSON.stringify(evid,null,2));
  console.log('EVIDENCE WRITTEN pidA='+pa.id+' pidB='+pb.id);
  cp.kill(); process.exit(0);
}
main().catch(e=>{ console.log('ERR '+e); process.exit(1); });