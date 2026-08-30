/* xinmo v1 front-end (pure ASCII; UI text comes from i18n.json) */
(function(){
"use strict";
var I18N = {};

var SUBJ = ['physics','chemistry','geography','chinese','math','english'];
var QTYPE = ['choice','fill','calc','experiment','inference','diagram','short','comprehensive'];
var ETYPE = ['concept','formula','calc','reading','stuck','incomplete','timeout','careless'];
var TOPICS = null;
var selSubj = null, selTopic = null;
var tab = 'entry';
var entryImg = {q: '', a: ''};  // uploaded web paths for question/answer images

function merge(a,b){for(var k in b){if(b[k]&&typeof b[k]==='object'&&!Array.isArray(b[k])){a[k]=a[k]||{};merge(a[k],b[k]);}else{a[k]=b[k];}}}
function t(key, def){var p=I18N,ks=key.split('.');for(var i=0;i<ks.length;i++){if(p==null)break;p=p[ks[i]];}return typeof p==='string'?p:(def||key);}
function el(tag,cls,html){var e=document.createElement(tag);if(cls)e.className=cls;if(html!==undefined)e.innerHTML=html;return e;}
// tpl: replace %token placeholders (e.g. %s, %d, %n, %m) with named values; every occurrence replaced
function tpl(tmpl, vals){return (tmpl||'').replace(/%([a-zA-Z]+)/g,function(_,k){return vals[k]!==undefined?vals[k]:('%'+k);});}
function toast(m){var x=document.getElementById('toast');x.textContent=m;x.classList.add('show');clearTimeout(x._t);x._t=setTimeout(function(){x.classList.remove('show');},1600);}

// ---- lightbox ----
function showLightbox(src){var lb=document.getElementById('lightbox');document.getElementById('lightbox-img').src=src;lb.classList.add('show');}
(function(){var lb=document.getElementById('lightbox');if(lb){lb.onclick=function(){lb.classList.remove('show');document.getElementById('lightbox-img').src='';};}})();

// ---- image upload dropzone ----
function uploadImage(fileObj,kind,cb){
  var fd=new FormData();fd.append('file',fileObj);fd.append('kind',kind);fd.append('pid','tmp');
  fetch('/api/upload',{method:'POST',body:fd}).then(function(r){return r.json();}).then(function(d){
    if(d.ok){cb(d.path);}else{toast(t('entry.uploadFailed'));}
  }).catch(function(){toast(t('entry.uploadFailed'));});
}


// ---- tabs ----
function renderTabs(){
  var tabs=[['entry','entry'],['today','today'],['stats','stats'],['trace','trace'],['library','library']];
  var box=document.getElementById('tabs');box.innerHTML='';
  tabs.forEach(function(pair){
    var b=el('button','tab'+(tab===pair[0]?' active':''),t('tabs.'+pair[1],pair[1]));
    b.onclick=function(){setTab(pair[0]);};
    box.appendChild(b);
  });
}
function setTab(n){tab=n;renderTabs();['entry','today','stats','trace','library'].forEach(function(x){document.getElementById('page-'+x).classList.toggle('active',x===n);});if(n==='entry')renderEntry();if(n==='today')renderToday();if(n==='stats')renderStats();if(n==='trace')renderTrace();if(n==='library')renderLibrary();}

function loadTopics(cb){if(TOPICS){cb();return;}fetch('/api/topics').then(function(r){return r.json();}).then(function(d){TOPICS=d;cb();}).catch(function(){toast('topics load failed');});}

// ---- entry ----
var classifyState=null; // null | 'running' | {subject,topic_ids,summary} | 'failed'
var topicMode='manual';  // 'manual' shows chapter picker; 'auto' shows vision candidates
var noteValue='';

function renderEntry(){
  var p=document.getElementById('page-entry');p.innerHTML='';
  loadTopics(function(){
    p.appendChild(el('div','muted',t('entry.pickSubject')));
    var sg=el('div','subj-group');
    SUBJ.forEach(function(s){
      var b=el('button','subj-btn'+(selSubj===s?' active':''),t('subjects.'+s,s));
      b.onclick=function(){selSubj=s;topicMode='manual';selTopic=null;classifyState=null;noteValue='';renderEntry();};
      sg.appendChild(b);
    });
    p.appendChild(sg);
    p.appendChild(el('div','muted',t('entry.pickTopic')));
    var topicArea=el('div');p.appendChild(topicArea);
    if(topicMode==='auto'){
      renderCandidates(topicArea);
    } else {
      renderManualTopics(topicArea);
    }
    buildEntryForm(p);
  });
}

function renderManualTopics(topicArea){
  topicArea.innerHTML='';
  if(selSubj){
    var chs=(TOPICS[selSubj]&&TOPICS[selSubj].chapters)||[];
    chs.forEach(function(ch){
      var c=el('div','chapter');
      var head=el('div','chapter-head','<span>'+ch.name+'</span><span class="n">'+ch.topics.length+'</span>');
      var body=el('div','chapter-body');
      ch.topics.forEach(function(tp){
        var it=el('div','topic-item'+(selTopic===tp.id?' active':''),tp.label);
        it.onclick=function(){selTopic=tp.id;renderEntry();};
        body.appendChild(it);
      });
      head.onclick=function(){c.classList.toggle('open');};
      c.appendChild(head);c.appendChild(body);topicArea.appendChild(c);
    });
  } else {
    topicArea.appendChild(el('div','muted',t('entry.noSubject')));
  }
}

function renderCandidates(topicArea){
  topicArea.innerHTML='';
  if(classifyState==='running'){
    topicArea.appendChild(el('div','muted',t('entry.autoClassifying')));
    return;
  }
  var st=classifyState;
  var has=st&&st.topic_ids&&st.topic_ids.length;
  topicArea.appendChild(el('div','muted',t('entry.candidatesTitle')));
  if(has){
    var chips=el('div','cand-chips');
    st.topic_ids.forEach(function(tid){
      var b=el('button','cand-chip',topicLabel(st.subject||selSubj||SUBJ[0],tid)||tid);
      b.onclick=function(){
        if(st.subject)selSubj=st.subject;
        selTopic=tid;
        if(st.summary){noteValue=st.summary;}
        renderEntry();
      };
      chips.appendChild(b);
    });
    topicArea.appendChild(chips);
  } else {
    topicArea.appendChild(el('div','muted',t('entry.classifyFailed')));
  }
  var other=el('button','ghost cand-other',t('entry.candidateOther'));
  other.onclick=function(){topicMode='manual';classifyState=null;renderEntry();};
  topicArea.appendChild(other);
  var unc=el('button','ghost cand-unc',t('entry.candidateUnclassified'));
  unc.onclick=function(){
    if(!selSubj&&st&&st.subject)selSubj=st.subject;
    if(!selSubj)selSubj=SUBJ[0];
    selTopic='unclassified';
    if(st&&st.summary){noteValue=st.summary;}
    renderEntry();
  };
  topicArea.appendChild(unc);
}

function autoClassify(path){
  classifyState='running';renderEntry();
  fetch('/api/classify',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({image_path:path})})
    .then(function(r){return r.json();}).then(function(d){
      if(d.ok&&d.topic_ids&&d.topic_ids.length){
        classifyState={subject:d.subject,topic_ids:d.topic_ids,summary:d.summary};
      } else {
        classifyState='failed';
      }
      topicMode='auto';renderEntry();
    }).catch(function(){classifyState='failed';topicMode='auto';renderEntry();});
}

function buildEntryForm(p){
  var form=el('div');
  form.appendChild(el('label',null,t('entry.noteLabel')));
  var note=el('textarea');note.placeholder=t('entry.notePlaceholder');note.value=noteValue||'';form.appendChild(note);

  var g=el('div','grid2');
  var s1=el('div');
  s1.appendChild(el('label',null,t('entry.sourceLabel')));
  var src=el('input');src.type='text';src.placeholder=t('entry.sourcePlaceholder');s1.appendChild(src);
  g.appendChild(s1);
  var s2=el('div');
  s2.appendChild(el('label',null,t('entry.qtypeLabel')));
  var qt=customSelect(QTYPE,'questionTypes','entry.qtypeCustom');
  s2.appendChild(qt);g.appendChild(s2);
  form.appendChild(g);

  form.appendChild(el('label',null,t('entry.qImageLabel')));
  form.appendChild(makeImagePicker('q'));

  form.appendChild(el('label',null,t('entry.answerLabel')));
  var ans=el('input');ans.type='text';ans.placeholder=t('entry.answerPlaceholder');form.appendChild(ans);

  form.appendChild(el('label',null,t('entry.aImageLabel')));
  form.appendChild(makeImagePicker('a'));

  form.appendChild(el('label',null,t('entry.errorLabel')));
  var et=customSelect(ETYPE,'errorTypes','entry.errorCustom');
  form.appendChild(et);

  var sub=el('button','primary',t('entry.submit'));
  sub.onclick=function(){
    if(!selSubj){toast(t('entry.noSubject'));return;}
    if(!selTopic){toast(t('entry.noTopic'));return;}
    if(!entryImg.q){toast(t('entry.needImage'));return;}
    var tlb=topicLabel(selSubj,selTopic)||'';
    var body={subject:selSubj,topic:selTopic,topic_label:tlb,question_type:selValue(qt),error_type:selValue(et),note:note.value,source:src.value,answer_text:ans.value,image_path:entryImg.q,answer_image_path:entryImg.a};
    fetch('/api/problem',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})
      .then(function(r){return r.json();}).then(function(d){
        if(d.ok){toast(t('entry.added')+' #'+d.problem.id);noteValue='';note.value='';ans.value='';src.value='';selTopic=null;entryImg={q:'',a:''};classifyState=null;topicMode='manual';renderEntry();}
      }).catch(function(){toast('save failed');});
  };
  form.appendChild(sub);
  p.appendChild(form);
}

// image picker: dropzone (paste/drag) + 拍照 + 从相册选择; canvas crop before upload
function makeImagePicker(kind){
  var wrap=el('div');
  var dz=el('div','dropzone',t('entry.pasteHint'));
  var buttons=el('div','img-buttons');
  var camInp=el('input');camInp.type='file';camInp.accept='image/*';camInp.capture='environment';camInp.style.display='none';
  var albumInp=el('input');albumInp.type='file';albumInp.accept='image/*';albumInp.style.display='none';
  var camBtn=el('button','ghost',t('entry.takePhoto'));
  var albumBtn=el('button','ghost',t('entry.chooseAlbum'));
  camBtn.onclick=function(){camInp.click();};
  albumBtn.onclick=function(){albumInp.click();};
  buttons.appendChild(camBtn);buttons.appendChild(albumBtn);
  wrap.appendChild(dz);wrap.appendChild(buttons);wrap.appendChild(camInp);wrap.appendChild(albumInp);

  function handleFile(f){
    if(!f)return;
    openCropModal(f,function(blob){
      dz.textContent=t('entry.uploading');
      uploadImage(blob,kind,function(path){entryImg[kind]=path;render();if(kind==='q')autoClassify(path);});
    });
  }
  function render(){
    if(entryImg[kind]){
      dz.className='dropzone filled';dz.innerHTML='';
      var im=el('img');im.src=entryImg[kind];im.onclick=function(ev){ev.stopPropagation();showLightbox(entryImg[kind]);};
      dz.appendChild(im);
      var rm=el('button','dz-remove',t('entry.removeImage'));
      rm.onclick=function(ev){ev.stopPropagation();entryImg[kind]='';render();};
      dz.appendChild(rm);
    }else{dz.className='dropzone';dz.textContent=t('entry.pasteHint');}
  }
  dz.onclick=function(){albumInp.click();};
  camInp.onchange=function(){if(camInp.files&&camInp.files[0])handleFile(camInp.files[0]);camInp.value='';};
  albumInp.onchange=function(){if(albumInp.files&&albumInp.files[0])handleFile(albumInp.files[0]);albumInp.value='';};
  dz.addEventListener('dragover',function(e){e.preventDefault();dz.classList.add('over');});
  dz.addEventListener('dragleave',function(){dz.classList.remove('over');});
  dz.addEventListener('drop',function(e){e.preventDefault();dz.classList.remove('over');var dt=e.dataTransfer;if(dt&&dt.files&&dt.files[0])handleFile(dt.files[0]);});
  dz.addEventListener('paste',function(e){var items=(e.clipboardData||{}).items||[];for(var i=0;i<items.length;i++){if(items[i].type.indexOf('image')===0){handleFile(items[i].getAsFile());e.preventDefault();return;}}});
  dz.tabIndex=0;
  render();
  return wrap;
}

// canvas crop modal (mouse+touch); cb(blob) after confirm
function openCropModal(fileObj,cb){
  var ov=el('div','crop-overlay');
  var box=el('div','crop-box');
  var stage=el('div','crop-stage');
  var img=el('img');img.src=URL.createObjectURL(fileObj);
  var rect=el('div','crop-rect');
  var handle=el('div','crop-handle');
  stage.appendChild(img);stage.appendChild(rect);stage.appendChild(handle);
  var bar=el('div','crop-bar');
  var cancel=el('button','ghost crop-cancel',t('entry.cropCancel'));
  var ok=el('button','primary crop-ok',t('entry.cropConfirm'));
  bar.appendChild(cancel);bar.appendChild(ok);
  box.appendChild(stage);box.appendChild(bar);ov.appendChild(box);
  document.body.appendChild(ov);ov.style.display='flex';

  var geo=null; var dragging=null;
  var startX=0,startY=0,origR=null;
  function applyRect(){
    var r=geo;
    rect.style.left=r.rx+'px';rect.style.top=r.ry+'px';rect.style.width=r.rw+'px';rect.style.height=r.rh+'px';
    handle.style.left=(r.rx+r.rw-14)+'px';handle.style.top=(r.ry+r.rh-14)+'px';
  }
  img.onload=function(){
    var W=img.naturalWidth,H=img.naturalHeight;
    var maxW=window.innerWidth*0.88,maxH=window.innerHeight*0.68;
    var scale=Math.min(1,maxW/W,maxH/H);
    var dispW=Math.round(W*scale),dispH=Math.round(H*scale);
    stage.style.width=dispW+'px';stage.style.height=dispH+'px';
    img.style.width=dispW+'px';img.style.height=dispH+'px';
    var rw=Math.round(dispW*0.7),rh=Math.round(dispH*0.7);
    geo={dispW:dispW,dispH:dispH,scale:scale,rx:Math.round((dispW-rw)/2),ry:Math.round((dispH-rh)/2),rw:rw,rh:rh};
    applyRect();
  };
  function pos(ev){var r=stage.getBoundingClientRect();var t=(ev.touches&&ev.touches[0])||ev;return {x:t.clientX-r.left,y:t.clientY-r.top};}
  function down(ev){if(!geo)return;ev.preventDefault();var p=pos(ev);if(p.x>=geo.rx+geo.rw-20&&p.y>=geo.ry+geo.rh-20){dragging='resize';startX=p.x;startY=p.y;origR={rx:geo.rx,ry:geo.ry,rw:geo.rw,rh:geo.rh};}
    else if(p.x>=geo.rx&&p.x<=geo.rx+geo.rw&&p.y>=geo.ry&&p.y<=geo.ry+geo.rh){dragging='move';startX=p.x;startY=p.y;origR={rx:geo.rx,ry:geo.ry,rw:geo.rw,rh:geo.rh};}}
  function move(ev){if(!dragging||!geo)return;ev.preventDefault();var p=pos(ev);var dx=p.x-startX,dy=p.y-startY;if(dragging==='move'){geo.rx=Math.max(0,Math.min(geo.dispW-geo.rw,origR.rx+dx));geo.ry=Math.max(0,Math.min(geo.dispH-geo.rh,origR.ry+dy));}
    else{geo.rw=Math.max(30,Math.min(geo.dispW-origR.rx,origR.rw+dx));geo.rh=Math.max(30,Math.min(geo.dispH-origR.ry,origR.rh+dy));}
    applyRect();}
  function up(){dragging=null;}
  stage.addEventListener('mousedown',down);window.addEventListener('mousemove',move);window.addEventListener('mouseup',up);
  stage.addEventListener('touchstart',down,{passive:false});window.addEventListener('touchmove',move,{passive:false});window.addEventListener('touchend',up);
  function close(){ov.remove();window.removeEventListener('mousemove',move);window.removeEventListener('mouseup',up);window.removeEventListener('touchmove',move);window.removeEventListener('touchend',up);}
  cancel.onclick=close;
  ok.onclick=function(){
    if(!geo)return;
    var r=geo;var cw=Math.round(r.rw/r.scale),chh=Math.round(r.rh/r.scale);
    var c=el('canvas');c.width=cw;c.height=chh;
    var ctx=c.getContext('2d');
    ctx.drawImage(img,r.rx/r.scale,r.ry/r.scale,cw,chh,0,0,cw,chh);
    if(c.toBlob){c.toBlob(function(b){close();cb(b||dataURLToBlob(c.toDataURL('image/jpeg',0.9)));},'image/jpeg',0.9);}
    else{close();cb(dataURLToBlob(c.toDataURL('image/jpeg',0.9)));}
  };
}
function dataURLToBlob(d){var b=atob(d.split(',')[1]);var a=new Uint8Array(b.length);for(var i=0;i<b.length;i++)a[i]=b.charCodeAt(i);return new Blob([a],{type:'image/jpeg'});}

// custom-select: built-in options + a "自定义" option that reveals a text field
function customSelect(values,i18nPrefix,customKey){
  var wrap=el('div');
  var sel=el('select');
  values.forEach(function(v){var o=el('option',null,t(i18nPrefix+'.'+v,v));o.value=v;sel.appendChild(o);});
  var cust=el('option',null,t(customKey));cust.value='__custom__';sel.appendChild(cust);
  var customWrap=el('div');customWrap.style.display='none';
  var custInp=el('input');custInp.type='text';custInp.placeholder=t('entry.customLabel');customWrap.appendChild(custInp);
  sel.onchange=function(){customWrap.style.display=(sel.value==='__custom__')?'block':'none';};
  wrap.appendChild(sel);wrap.appendChild(customWrap);
  return wrap;
}
function selValue(wrap){
  var sel=wrap.querySelector('select');
  if(sel.value!=='__custom__')return sel.value;
  var inp=wrap.querySelector('input');
  return (inp.value||'').trim()||sel.value;
}

function topicLabel(subj,topicId){
  var chs=(TOPICS[subj]&&TOPICS[subj].chapters)||[];
  for(var i=0;i<chs.length;i++){var ts=chs[i].topics;for(var j=0;j<ts.length;j++){if(ts[j].id===topicId)return ts[j].label;}}
  return '';
}

// ---- today ----
function renderToday(){
  var p=document.getElementById('page-today');p.innerHTML='';
  fetch('/api/today').then(function(r){return r.json();}).then(function(d){renderTodayData(p,d);}).catch(function(){p.innerHTML='load failed';});
}
function resLabel(r){return t('today.result'+ (r.charAt(0).toUpperCase()+r.slice(1)), r);}
function renderTodayData(p,d){
  var title=el('h1',null,t('today.title')+' '+d.queue.length+' '+t('today.unit'));
  p.appendChild(title);
  if(d.on_the_way>0){p.appendChild(el('div','banner',t('today.onTheWay').replace('%d',d.on_the_way)));}
  if(d.queue.length===0){p.appendChild(el('div','muted',t('today.empty')));return;}
  d.queue.forEach(function(item){
    p.appendChild(buildReviewCard(item));
  });
}
function imgThumb(path){var im=el('img','thumb');im.src=path;im.onclick=function(){showLightbox(path);};return im;}

// D3: answer-first, judge-then. Each card is a small state machine.
function buildReviewCard(item){
  var card=el('div','card'+(item.kind==='rebound'?' rebound':''));
  var startTs=Date.now();

  // --- header: title = source else topic_label; note as 批注 line ---
  var h3=el('h3',null,escapeHtml(item.source||item.topic_label||''));
  card.appendChild(h3);
  if(item.source){card.appendChild(el('div','meta',t('today.topic')+': '+item.topic_label));}
  if(item.note){card.appendChild(el('div','note','<b>'+t('today.myNote')+':</b> '+escapeHtml(item.note)));}
  // question image only (answer/std hidden until judged)
  if(item.image_path){card.appendChild(imgThumb(item.image_path));}

  // --- phase container ---
  var phase=el('div');card.appendChild(phase);

  function elapsed(){return Math.round((Date.now()-startTs)/1000);}

  // apply final result to backend then reload list
  function commit(result,extraNote,my_answer,judged){
    var body={problem_id:item.id,result:result,seconds:elapsed(),my_answer:my_answer||'',judged:judged||'unknown'};
    if(extraNote)body.note=extraNote;
    fetch('/api/attempt',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})
      .then(function(r){return r.json();}).then(function(){renderToday();}).catch(function(){toast('save failed');});
  }

  // phase 1: ask for answer
  function renderAsk(){
    phase.innerHTML='';
    phase.appendChild(el('label',null,t('today.yourAnswer')));
    var inp=el('input');inp.type='text';inp.placeholder=t('today.answerInputPlaceholder');phase.appendChild(inp);
    var acts=el('div','actions');
    var jb=el('button','primary',t('today.btnJudge'));
    jb.onclick=function(){doJudge(inp.value);};
    inp.onkeydown=function(e){if(e.key==='Enter'){doJudge(inp.value);}};
    acts.appendChild(jb);phase.appendChild(acts);
    setTimeout(function(){inp.focus();},0);
  }

  function doJudge(my){
    fetch('/api/judge',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({problem_id:item.id,my_answer:my})})
      .then(function(r){return r.json();}).then(function(v){renderVerdict(my,v);})
      .catch(function(){toast('judge failed');});
  }

  // phase 2: show verdict + std answer + answer image + explanation (item 3), then self-assess
  function renderVerdict(my,v){
    phase.innerHTML='';
    var reveal=el('div','reveal-box');
    var std=(v.answer_text&&v.answer_text.trim())?v.answer_text:t('today.noStdAnswer');
    reveal.appendChild(el('div','std-answer','<b>'+t('today.stdAnswer')+'</b>: '+escapeHtml(std)));
    if(v.answer_image_path){reveal.appendChild(imgThumb(v.answer_image_path));}
    if(v.hint==='unit_missing'){reveal.appendChild(el('div','muted',t('today.unitMissingHint')));}
    // explanation shown before the self-assess buttons (item 3)
    var explBox=null;
    if(v.explanation){
      explBox=el('div','expl-box');
      if(v.explanation.wrong_step){explBox.appendChild(el('div','expl-row','<b>'+t('today.explainWhereWrong')+':</b> '+escapeHtml(v.explanation.wrong_step)));}
      if(v.explanation.next_step){explBox.appendChild(el('div','expl-row','<b>'+t('today.explainNextStep')+':</b> '+escapeHtml(v.explanation.next_step)));}
      if(v.explanation.advice){explBox.appendChild(el('div','expl-row adv','<b>'+t('today.explainAdvice')+':</b> '+escapeHtml(v.explanation.advice)));}
      phase.appendChild(el('div','muted',t('today.explainPrompt')));
    }
    if(v.judged==='correct'){
      phase.appendChild(el('div','verdict ok',t('today.verdictCorrect')));
      phase.appendChild(reveal);
      if(explBox)phase.appendChild(explBox);
      phase.appendChild(el('div','meta',t('today.afterCorrect')));
      var a1=el('div','actions');
      var g=el('button','good',t('today.btnGood'));g.onclick=function(){commit('good','',my,'correct');};
      var h=el('button','hard',t('today.btnHard'));h.onclick=function(){commit('hard','',my,'correct');};
      a1.appendChild(g);a1.appendChild(h);phase.appendChild(a1);
    }else if(v.judged==='wrong'){
      phase.appendChild(el('div','verdict bad',t('today.verdictWrong')));
      phase.appendChild(el('div','meta',t('today.afterWrongTitle')));
      phase.appendChild(reveal);
      if(explBox)phase.appendChild(explBox);
      phase.appendChild(el('label',null,t('today.wrongNoteLabel')));
      var wn=el('input');wn.type='text';wn.placeholder=t('today.wrongNotePlaceholder');phase.appendChild(wn);
      var a2=el('div','actions');
      var cb=el('button','again',t('today.btnConfirmWrong'));cb.onclick=function(){commit('again',wn.value,my,'wrong');};
      a2.appendChild(cb);phase.appendChild(a2);
    }else if(v.judged==='partial'){
      phase.appendChild(el('div','verdict unk',t('today.verdictPartial')));
      phase.appendChild(reveal);
      if(explBox)phase.appendChild(explBox);
      var a3=el('div','actions');
      var sc=el('button','good',t('today.selfCorrect'));sc.onclick=function(){renderSelfCorrect(my);};
      var sw=el('button','again',t('today.selfWrong'));sw.onclick=function(){renderSelfWrong(my);};
      a3.appendChild(sc);a3.appendChild(sw);phase.appendChild(a3);
    }else{
      var reason=v.reason==='llm_unavailable'?t('today.llmUnavailable'):t('today.verdictUnknown');
      phase.appendChild(el('div','verdict unk',reason));
      phase.appendChild(reveal);
      if(explBox)phase.appendChild(explBox);
      var a4=el('div','actions');
      var sc4=el('button','good',t('today.selfCorrect'));sc4.onclick=function(){renderSelfCorrect(my);};
      var sw4=el('button','again',t('today.selfWrong'));sw4.onclick=function(){renderSelfWrong(my);};
      a4.appendChild(sc4);a4.appendChild(sw4);phase.appendChild(a4);
    }
  }

  // unknown -> self said correct -> still pick smooth/stuck
  function renderSelfCorrect(my){
    phase.innerHTML='';
    phase.appendChild(el('div','verdict ok',t('today.verdictCorrect')));
    phase.appendChild(el('div','meta',t('today.afterCorrect')));
    var a=el('div','actions');
    var g=el('button','good',t('today.btnGood'));g.onclick=function(){commit('good','',my,'correct');};
    var h=el('button','hard',t('today.btnHard'));h.onclick=function(){commit('hard','',my,'correct');};
    a.appendChild(g);a.appendChild(h);phase.appendChild(a);
  }
  function renderSelfWrong(my){
    phase.innerHTML='';
    phase.appendChild(el('div','verdict bad',t('today.verdictWrong')));
    phase.appendChild(el('label',null,t('today.wrongNoteLabel')));
    var wn=el('input');wn.type='text';wn.placeholder=t('today.wrongNotePlaceholder');phase.appendChild(wn);
    var a=el('div','actions');
    var cb=el('button','again',t('today.btnConfirmWrong'));cb.onclick=function(){commit('again',wn.value,my,'wrong');};
    a.appendChild(cb);phase.appendChild(a);
  }

  renderAsk();
  return card;
}
function escapeHtml(s){return (''+s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}

// ---- stats (D6: realm number + error distribution + 14-day bar chart) ----
function renderStats(){
  var p=document.getElementById('page-stats');p.innerHTML='';
  fetch('/api/stats').then(function(r){return r.json();}).then(function(d){renderStatsData(p,d);}).catch(function(){p.innerHTML=el('div','muted',t('stats.loadFailed')).outerHTML;});
}
function realmOf(refined){
  if(refined>=151)return 3;if(refined>=61)return 2;if(refined>=21)return 1;return 0;
}
function renderStatsData(p,d){
  var realm=realmOf(d.refined||0);
  var top=el('div','stat-realm');
  top.appendChild(el('div','stat-realm-name',t('stats.realm')+' : '+t('stats.realmLabels.'+realm)));
  var nums=el('div','stat-grid');
  [['total',d.total],['refined',d.refined],['active',d.active]].forEach(function(kv){
    var c=el('div','stat-card');c.appendChild(el('div','lbl',t('stats.'+kv[0])));c.appendChild(el('div','val',String(kv[1])));nums.appendChild(c);
  });
  top.appendChild(nums);
  p.appendChild(top);

  var s1=el('div','stats-section');
  s1.appendChild(el('h2',null,t('stats.errorTitle')));
  var eg=el('div','err-grid');
  ETYPE.forEach(function(e){
    var n=(d.by_error&&d.by_error[e])||0;
    var row=el('div','err-row');
    row.appendChild(el('span','err-name',t('errorTypes.'+e)));
    row.appendChild(el('span','err-val',String(n)));
    eg.appendChild(row);
  });
  s1.appendChild(eg);
  p.appendChild(s1);

  var s2=el('div','stats-section');
  s2.appendChild(el('h2',null,t('stats.dailyTitle')));
  var dpr=window.devicePixelRatio||1;
  var cv=el('canvas');cv.className='daily-chart';
  cv.style.width='700px';cv.style.height='230px';
  cv.width=Math.round(700*dpr);cv.height=Math.round(230*dpr);  // scale buffer by devicePixelRatio
  s2.appendChild(cv);
  p.appendChild(s2);
  drawDailyChart(cv,d.daily||[]);
}
function drawDailyChart(cv,daily){
  var dpr=window.devicePixelRatio||1;
  var ctx=cv.getContext('2d');
  var Lw=700,Lh=230;  // logical CSS size
  ctx.setTransform(dpr,0,0,dpr,0,0);  // scale ctx by devicePixelRatio so logical coords map to physical pixels
  ctx.clearRect(0,0,Lw,Lh);
  var padL=36,padR=12,padT=20,padB=44;  // extra room for 12px labels + value labels
  var cw=Lw-padL-padR,chh=Lh-padT-padB;
  var maxv=1;
  daily.forEach(function(x){if(x.added>maxv)maxv=x.added;if(x.redone>maxv)maxv=x.redone;});
  var n=daily.length;
  if(!n)return;
  var gap=2,bw=(cw/n-gap)/2;
  for(var i=0;i<n;i++){
    var x0=padL+i*(cw/n)+gap/2;
    var a=daily[i];
    var ah=(a.added/maxv)*chh;
    var rh=(a.redone/maxv)*chh;
    ctx.fillStyle='#1d5fd6';ctx.fillRect(x0,padT+chh-ah,bw,ah);
    ctx.fillStyle='#d99a2b';ctx.fillRect(x0+bw,padT+chh-rh,bw,rh);
    // value on top of each bar (12px)
    ctx.font='12px sans-serif';ctx.textAlign='center';
    if(a.added>0){ctx.fillStyle='#1d5fd6';ctx.fillText(String(a.added),x0+bw/2,padT+chh-ah-3);}
    if(a.redone>0){ctx.fillStyle='#d99a2b';ctx.fillText(String(a.redone),x0+bw+bw/2,padT+chh-rh-3);}
  }
  // axis date labels >= 12px
  ctx.fillStyle='#667';ctx.font='12px sans-serif';ctx.textAlign='center';
  for(var i=0;i<n;i++){
    ctx.fillText((daily[i].date||'').slice(5),padL+i*(cw/n)+cw/n/2,Lh-padB+12);
  }
  // legend (13px, wider spacing)
  ctx.textAlign='left';ctx.font='13px sans-serif';
  ctx.fillStyle='#1d5fd6';ctx.fillText(t('stats.legendAdded'),padL,Lh-16);
  ctx.fillStyle='#d99a2b';ctx.fillText(t('stats.legendRedone'),padL+80,Lh-16);
}

// ---- trace (D5): today list + knowledge tree + heatmap ----
function renderTrace(){
  var p=document.getElementById('page-trace');p.innerHTML='';
  fetch('/api/trace').then(function(r){return r.json();}).then(function(d){renderTraceData(p,d);}).catch(function(e){window.__traceErr=(e&&e.stack)||String(e);p.innerHTML='load failed';});
}
function renderTraceData(p,d){
  // --- section 1: today list ---
  var s1=el('div','trace-section');
  s1.appendChild(el('h2',null,t('trace.todayTitle')));
  if(!d.today_list.length){s1.appendChild(el('div','muted',t('trace.todayEmpty')));}
  d.today_list.forEach(function(it){
    var row=el('div','tl-item');
    var badge=el('span','tl-badge '+(it.kind==='add'?'add':'redo'),it.kind==='add'?t('trace.actAdd'):t('trace.actRedo'));
    row.appendChild(badge);
    var titleText=it.source||it.topic_label||'';
    var txt=escapeHtml(titleText)+' <span class="tl-sep">&middot;</span> '+escapeHtml(it.error_label||'');
    row.appendChild(el('span',null,txt));
    if(it.note){row.appendChild(el('div','tl-note','<b>'+t('today.myNote')+':</b> '+escapeHtml(it.note)));}
    if(it.kind==='redo'&&it.result){
      var rl=el('span','tl-res '+it.result,t('trace.result'+it.result.charAt(0).toUpperCase()+it.result.slice(1)));
      row.appendChild(rl);
    }
    s1.appendChild(row);
  });
  p.appendChild(s1);

  // --- section 2: knowledge tree ---
  var s2=el('div','trace-section');
  s2.appendChild(el('h2',null,t('trace.treeTitle')));
  var legend=el('div','kt-legend');
  [['unseen','legendUnseen'],['active','legendActive'],['reviewing','legendReviewing'],['refined','legendRefined']].forEach(function(pair){
    var sp=el('span');sp.innerHTML='<i class="kt-node '+pair[0]+'" style="width:12px;height:12px;padding:0"></i>'+t('trace.'+pair[1]);
    legend.appendChild(sp);
  });
  s2.appendChild(legend);
  SUBJ.forEach(function(subj){
    var chs=d.tree[subj]||[];
    var hasAny=chs.some(function(c){return c.topics&&c.topics.length;});
    if(!hasAny)return;
    var sum=d.subject_summary[subj]||{};
    var box=el('div','kt-subject');
    box.appendChild(el('div','kt-summary',tpl(t('trace.summaryTpl'),{s:sum.label||subj,total:sum.total||0,seen:sum.seen||0,refined:sum.refined||0})));
    chs.forEach(function(ch){
      if(!ch.topics||!ch.topics.length)return;
      var m=ch.topics.length;
      var seen=ch.topics.filter(function(tp){return tp.state!=='unseen';}).length;
      var hasAny=seen>0;
      var cbox=el('div','kt-chapter'+(hasAny?' open':''));
      var hd=el('div','kt-chapter-name');
      hd.innerHTML=escapeHtml(ch.name)+' <span class="kt-ch-count">'+tpl(t('trace.chapterCountTpl'),{n:seen,m:m})+'</span>';
      hd.onclick=(function(cb){return function(){cb.classList.toggle('open');};})(cbox);
      cbox.appendChild(hd);
      var nodes=el('div','kt-nodes');
      ch.topics.forEach(function(tp){
        var n=el('div','kt-node '+tp.state);
        n.innerHTML=escapeHtml(tp.label)+(tp.active>0?'<span class="an">'+tpl(t('trace.activeTpl'),{d:tp.active})+'</span>':'');
        nodes.appendChild(n);
      });
      cbox.appendChild(nodes);box.appendChild(cbox);
    });
    s2.appendChild(box);
  });
  p.appendChild(s2);

  // --- section 3: heatmap ---
  var s3=el('div','trace-section');
  s3.appendChild(el('h2',null,t('trace.heatTitle')));
  s3.appendChild(el('div','heat-streak',d.streak>0?t('trace.streakTpl').replace('%d',d.streak):t('trace.noStreak')));
  var grid=el('div','heat-grid');
  var maxc=1;d.heatmap.forEach(function(x){if(x.count>maxc)maxc=x.count;});
  d.heatmap.forEach(function(x){
    var lvl=x.count===0?0:(x.count>=Math.max(4,maxc*0.75)?4:(x.count>=Math.max(3,maxc*0.5)?3:(x.count>=Math.max(2,maxc*0.25)?2:1)));
    var c=el('div','heat-cell'+(lvl?' l'+lvl:''));c.title=x.date+': '+x.count;
    grid.appendChild(c);
  });
  s3.appendChild(grid);
  p.appendChild(s3);
}

// ---- library (history error-book): browse all problems + edit every field / replace image ----
var libFilter = {subject: '', state: '', q: ''};
var libData = null;  // last loaded {items}

function renderLibrary(){
  var p=document.getElementById('page-library');p.innerHTML='';
  p.appendChild(el('h2',null,t('library.title')));
  p.appendChild(el('div','muted',t('library.subtitle')));
  // TOPICS must be loaded before rendering cards/edit form (openEditForm uses TOPICS for topic picker)
  loadTopics(function(){
    renderLibraryFilter(p);
  });
}
function renderLibraryFilter(p){
  var bar=el('div','lib-filter');
  var subjSel=el('select');
  var o0=el('option',null,t('library.allSubjects'));o0.value='';subjSel.appendChild(o0);
  SUBJ.forEach(function(s){
    var o=el('option',null,t('subjects.'+s,s));o.value=s;if(s===libFilter.subject)o.selected=true;subjSel.appendChild(o);
  });
  var stateSel=el('select');
  var sa=el('option',null,t('library.allStates'));sa.value='';stateSel.appendChild(sa);
  [['active','stateActive'],['refined','stateRefined']].forEach(function(pair){
    var o=el('option',null,t('library.'+pair[1]));o.value=pair[0];if(pair[0]===libFilter.state)o.selected=true;stateSel.appendChild(o);
  });
  var qInp=el('input');qInp.type='text';qInp.placeholder=t('library.searchPlaceholder');qInp.value=libFilter.q||'';
  var fbtn=el('button','primary',t('library.btnSearch'));
  fbtn.onclick=function(){libFilter.subject=subjSel.value;libFilter.state=stateSel.value;libFilter.q=qInp.value;renderLibrary();};
  var rbtn=el('button','ghost',t('library.btnReset'));
  rbtn.onclick=function(){libFilter={subject:'',state:'',q:''};renderLibrary();};
  bar.appendChild(subjSel);bar.appendChild(stateSel);bar.appendChild(qInp);bar.appendChild(fbtn);bar.appendChild(rbtn);
  p.appendChild(bar);
  var list=el('div','lib-list');p.appendChild(list);
  fetch('/api/library?subject='+encodeURIComponent(libFilter.subject)+'&state='+encodeURIComponent(libFilter.state)+'&q='+encodeURIComponent(libFilter.q))
    .then(function(r){return r.json();}).then(function(d){
      libData=d;
      if(!d.items||!d.items.length){list.appendChild(el('div','muted',t('library.empty')));return;}
      list.appendChild(el('div','muted',tpl(t('library.countTpl'),{n:d.items.length})));
      d.items.forEach(function(it){list.appendChild(buildLibraryCard(it));});
    }).catch(function(){list.appendChild(el('div','muted',t('library.loadFailed')));});
}
function stateBadge(st){
  if(st==='refined')return el('span','state-badge refined',t('library.stateRefined'));
  return el('span','state-badge active',t('library.stateActive'));
}
function buildLibraryCard(it){
  var card=el('div','card lib-card'+(it.state==='refined'?' refined':''));
  var head=el('div','lib-head');
  head.appendChild(el('div','lib-title',escapeHtml(it.source||it.topic_label||('#'+it.id))));
  head.appendChild(stateBadge(it.state));
  card.appendChild(head);
  var meta=el('div','meta');
  meta.innerHTML='<span>'+t('subjects.'+it.subject,it.subject)+'</span> &middot; <span>'+escapeHtml(it.topic_label||it.topic)+'</span> &middot; <span>'+escapeHtml(it.error_label||'')+'</span> &middot; <span>'+escapeHtml(it.question_type_label||it.question_type)+'</span>';
  card.appendChild(meta);
  card.appendChild(el('div','meta',tpl(t('library.metaTpl'),{s:it.state,n:it.streak||0,e:(it.ease||0).toFixed(1),i:it.interval_days||0,d:it.due_date||''})));
  var thumbs=el('div','lib-thumbs');
  if(it.image_path){
    var tq=imgThumb(it.image_path);
    if(it.image_missing){tq.className='thumb missing';tq.title=t('library.brokenImage');}
    thumbs.appendChild(tq);
  }
  if(it.answer_image_path){
    var ta=imgThumb(it.answer_image_path);
    if(it.answer_image_missing){ta.className='thumb missing';ta.title=t('library.brokenImage');}
    thumbs.appendChild(ta);
  }
  if(thumbs.children.length)card.appendChild(thumbs);
  if(it.note){card.appendChild(el('div','note','<b>'+t('today.myNote')+':</b> '+escapeHtml(it.note)));}
  var lastResTxt='';
  if(it.last_result){lastResTxt=' &middot; '+t('today.result'+it.last_result.charAt(0).toUpperCase()+it.last_result.slice(1),it.last_result);}
  card.appendChild(el('div','meta',tpl(t('library.attemptCountTpl'),{n:it.attempt_count||0})+lastResTxt));
  card.appendChild(el('div','meta',tpl(t('library.createdTpl'),{d:it.created_at||''})));
  var editBtn=el('button','primary lib-edit',t('library.btnEdit'));
  editBtn.onclick=(function(card,it){return function(){openEditForm(card,it);};})(card,it);
  card.appendChild(editBtn);
  return card;
}function openEditForm(card,it){
  var old=card.querySelector('.lib-editform');
  if(old)old.remove();
  var wrap=el('div','lib-editform');
  wrap.appendChild(el('h3',null,tpl(t('library.editTitle'),{n:it.id})));
  var st={subject:it.subject,topic:it.topic,error:it.error_type,qtype:it.question_type,
          note:it.note||'',answer:it.answer_text||'',source:it.source||'',
          imgQ:it.image_path||'',imgA:it.answer_image_path||''};
  wrap.appendChild(el('label',null,t('library.fieldSubject')));
  var sg=el('div','subj-group');
  SUBJ.forEach(function(s){
    var b=el('button','subj-btn'+(st.subject===s?' active':''),t('subjects.'+s,s));
    b.onclick=(function(s,b){return function(){st.subject=s;var bs=sg.querySelectorAll('.subj-btn');for(var i=0;i<bs.length;i++)bs[i].classList.remove('active');b.classList.add('active');renderTopicSlot();};})(s,b);
    sg.appendChild(b);
  });
  wrap.appendChild(sg);
  wrap.appendChild(el('label',null,t('library.fieldTopic')));
  var topicSlot=el('div');wrap.appendChild(topicSlot);
  function renderTopicSlot(){
    topicSlot.innerHTML='';
    var chs=(TOPICS[st.subject]&&TOPICS[st.subject].chapters)||[];
    if(!chs.length){topicSlot.appendChild(el('div','muted',t('entry.noSubject')));return;}
    chs.forEach(function(ch){
      var hasSel=ch.topics.some(function(tp){return tp.id===st.topic;});
      var body=el('div','chapter-body'+(hasSel?'':' closed'));
      ch.topics.forEach(function(tp){
        var itm=el('div','topic-item'+(st.topic===tp.id?' active':''),tp.label);
        itm.onclick=(function(tp){return function(){st.topic=tp.id;renderTopicSlot();};})(tp);
        body.appendChild(itm);
      });
      var head=el('div','chapter-head'+(hasSel?' open':''),'<span>'+ch.name+'</span><span class="n">'+ch.topics.length+'</span>');
      head.onclick=(function(body,head){return function(){body.classList.toggle('closed');head.classList.toggle('open');};})(body,head);
      var c=el('div','chapter');c.appendChild(head);c.appendChild(body);topicSlot.appendChild(c);
    });
  }
  var qtypeWrap=customSelect(QTYPE,'questionTypes','entry.qtypeCustom');
  var errorWrap=customSelect(ETYPE,'errorTypes','entry.errorCustom');
  preselect2(qtypeWrap,qtypeWrap.querySelector('select'),QTYPE,st.qtype);
  preselect2(errorWrap,errorWrap.querySelector('select'),ETYPE,st.error);
  function preselect2(wrap,sel,values,state){
    var found=false;
    for(var i=0;i<values.length;i++){if(values[i]===state){sel.value=values[i];found=true;break;}}
    if(!found){sel.value='__custom__';var inp=wrap.querySelector('input');inp.value=state;inp.style.display='block';}
  }
  wrap.appendChild(el('label',null,t('library.fieldQType')));wrap.appendChild(qtypeWrap);
  wrap.appendChild(el('label',null,t('library.fieldError')));wrap.appendChild(errorWrap);
  wrap.appendChild(el('label',null,t('library.fieldNote')));
  var noteEl=el('textarea');noteEl.value=st.note;wrap.appendChild(noteEl);
  wrap.appendChild(el('label',null,t('library.fieldAnswerText')));
  var ansEl=el('input');ansEl.type='text';ansEl.value=st.answer;wrap.appendChild(ansEl);
  wrap.appendChild(el('label',null,t('library.fieldSource')));
  var srcEl=el('input');srcEl.type='text';srcEl.value=st.source;wrap.appendChild(srcEl);
  wrap.appendChild(el('label',null,t('library.fieldQImage')));
  var qpicker=makeEditImagePicker(st.imgQ,it.image_missing,function(path){st.imgQ=path;});
  wrap.appendChild(qpicker);
  wrap.appendChild(el('label',null,t('library.fieldAImage')));
  var apicker=makeEditImagePicker(st.imgA,it.answer_image_missing,function(path){st.imgA=path;});
  wrap.appendChild(apicker);
  var metaNote=el('div','muted');metaNote.textContent=tpl(t('library.metaTpl'),{s:it.state,n:it.streak||0,e:(it.ease||0).toFixed(1),i:it.interval_days||0,d:it.due_date||''});
  wrap.appendChild(metaNote);
  var acts=el('div','actions');
  var cancel=el('button','ghost',t('library.btnCancel'));
  cancel.onclick=function(){card.querySelector('.lib-editform').remove();};
  var save=el('button','primary',t('library.btnSave'));
  save.onclick=function(){
    var body={subject:st.subject,topic:st.topic,topic_label:topicLabel(st.subject,st.topic)||st.topic,
      error_type:selValue(errorWrap),question_type:selValue(qtypeWrap),
      note:noteEl.value,answer_text:ansEl.value,source:srcEl.value,
      image_path:st.imgQ||'',answer_image_path:st.imgA||''};
    if(!st.subject){toast(t('entry.noSubject'));return;}
    if(!st.topic){toast(t('entry.noTopic'));return;}
    fetch('/api/problem/'+it.id,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})
      .then(function(r){return r.json();}).then(function(d){
        if(d.ok){toast(t('library.saved'));renderLibrary();}
        else{toast(t('library.saveFailed')+': '+(d.error||''));}
      }).catch(function(){toast(t('library.saveFailed'));});
  };
  acts.appendChild(cancel);acts.appendChild(save);wrap.appendChild(acts);
  renderTopicSlot();
  card.appendChild(wrap);
  wrap.scrollIntoView({block:'nearest'});
}
function makeEditImagePicker(currentPath,isMissing,cb){
  var wrap=el('div','edit-picker');
  var dz=el('div','dropzone',t('entry.pasteHint'));
  var btns=el('div','img-buttons');
  var camInp=el('input');camInp.type='file';camInp.accept='image/*';camInp.capture='environment';camInp.style.display='none';
  var albumInp=el('input');albumInp.type='file';albumInp.accept='image/*';albumInp.style.display='none';
  var camBtn=el('button','ghost',t('entry.takePhoto'));
  var albumBtn=el('button','ghost',t('entry.chooseAlbum'));
  camBtn.onclick=function(){camInp.click();};
  albumBtn.onclick=function(){albumInp.click();};
  btns.appendChild(camBtn);btns.appendChild(albumBtn);
  wrap.appendChild(dz);wrap.appendChild(btns);wrap.appendChild(camInp);wrap.appendChild(albumInp);
  function showCurrent(){
    dz.className='dropzone filled'+(isMissing?' missing':'');
    dz.innerHTML='';
    var im=el('img');im.src=currentPath;im.onclick=function(ev){ev.stopPropagation();showLightbox(currentPath);};
    dz.appendChild(im);
    if(isMissing){dz.appendChild(el('div','broken-hint',t('library.brokenImage')));}
    var rm=el('button','dz-remove',t('entry.removeImage'));
    rm.onclick=function(ev){ev.stopPropagation();dz.className='dropzone';dz.textContent=t('entry.pasteHint');};
    dz.appendChild(rm);
  }
  function handle(f){
    if(!f)return;
    dz.textContent=t('entry.uploading');
    uploadImage(f,'q',function(path){currentPath=path;isMissing=false;cb(path);showCurrent();});
  }
  camInp.onchange=function(){if(camInp.files&&camInp.files[0])handle(camInp.files[0]);camInp.value='';};
  albumInp.onchange=function(){if(albumInp.files&&albumInp.files[0])handle(albumInp.files[0]);albumInp.value='';};
  dz.addEventListener('dragover',function(e){e.preventDefault();dz.classList.add('over');});
  dz.addEventListener('dragleave',function(){dz.classList.remove('over');});
  dz.addEventListener('drop',function(e){e.preventDefault();dz.classList.remove('over');var dt=e.dataTransfer;if(dt&&dt.files&&dt.files[0])handle(dt.files[0]);});
  dz.addEventListener('paste',function(e){var items=(e.clipboardData||{}).items||[];for(var i=0;i<items.length;i++){if(items[i].type.indexOf('image')===0){handle(items[i].getAsFile());e.preventDefault();return;}}});
  dz.tabIndex=0;
  if(currentPath)showCurrent();else dz.textContent=t('entry.pasteHint');
  return wrap;
}

// ---- global paste fallback: on entry tab, Ctrl+V without focused zone -> question image ----
document.addEventListener('paste',function(e){
  if(tab!=='entry')return;
  var tgt=e.target;
  if(tgt&&(tgt.tagName==='INPUT'||tgt.tagName==='TEXTAREA'))return;  // let text paste work in fields
  if(tgt&&tgt.className&&(''+tgt.className).indexOf('dropzone')>=0)return;  // zone handles its own
  var items=(e.clipboardData||{}).items||[];
  for(var i=0;i<items.length;i++){
    if(items[i].type.indexOf('image')===0){
      var f=items[i].getAsFile();e.preventDefault();
      toast(t('entry.uploading'));
      uploadImage(f,'q',function(path){entryImg.q=path;renderEntry();});
      return;
    }
  }
});

// ---- boot ----
fetch('/web/i18n.json?v='+Date.now()).then(function(r){return r.json();}).then(function(d){merge(I18N,d);document.getElementById('title').textContent=I18N.appTitle||'xinmo';renderTabs();setTab('entry');}).catch(function(){renderTabs();setTab('entry');});
})();