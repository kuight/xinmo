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
  var tabs=[['entry','entry'],['today','today'],['stats','stats'],['trace','trace']];
  var box=document.getElementById('tabs');box.innerHTML='';
  tabs.forEach(function(pair){
    var b=el('button','tab'+(tab===pair[0]?' active':''),t('tabs.'+pair[1],pair[1]));
    b.onclick=function(){setTab(pair[0]);};
    box.appendChild(b);
  });
}
function setTab(n){tab=n;renderTabs();['entry','today','stats','trace'].forEach(function(x){document.getElementById('page-'+x).classList.toggle('active',x===n);});if(n==='entry')renderEntry();if(n==='today')renderToday();if(n==='stats')renderStats();if(n==='trace')renderTrace();}

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
  var cv=el('canvas');cv.width=700;cv.height=230;cv.className='daily-chart';
  s2.appendChild(cv);
  p.appendChild(s2);
  drawDailyChart(cv,d.daily||[]);
}
function drawDailyChart(cv,daily){
  var ctx=cv.getContext('2d');
  var W=cv.width,H=cv.height;
  ctx.clearRect(0,0,W,H);
  var padL=30,padR=10,padT=14,padB=40;
  var cw=W-padL-padR,chh=H-padT-padB;
  var maxv=1;
  daily.forEach(function(x){if(x.added>maxv)maxv=x.added;if(x.redone>maxv)maxv=x.redone;});
  var n=daily.length;
  if(!n)return;
  var gap=2,bw=(cw/n-gap)/2;
  for(var i=0;i<n;i++){
    var x0=padL+i*(cw/n)+gap/2;
    var a=daily[i];
    var ah=(a.added/maxv)*chh;
    ctx.fillStyle='#1d5fd6';
    ctx.fillRect(x0,padT+chh-ah,bw,ah);
    var rh=(a.redone/maxv)*chh;
    ctx.fillStyle='#d99a2b';
    ctx.fillRect(x0+bw,padT+chh-rh,bw,rh);
  }
  ctx.fillStyle='#667';ctx.font='10px sans-serif';ctx.textAlign='center';
  for(var i=0;i<n;i++){
    ctx.fillText((daily[i].date||'').slice(5),padL+i*(cw/n)+cw/n/2,H-padB+10);
  }
  ctx.textAlign='left';
  ctx.fillStyle='#1d5fd6';ctx.fillText(t('stats.legendAdded'),padL,H-18);
  ctx.fillStyle='#d99a2b';ctx.fillText(t('stats.legendRedone'),padL+46,H-18);
}

// ---- trace (D5): today list + knowledge tree + heatmap ----
function renderTrace(){
  var p=document.getElementById('page-trace');p.innerHTML='';
  fetch('/api/trace').then(function(r){return r.json();}).then(function(d){renderTraceData(p,d);}).catch(function(){p.innerHTML='load failed';});
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
    box.appendChild(el('div','kt-summary',t('trace.summaryTpl').replace('%s',sum.label||subj).replace('%d',sum.total||0).replace('%d',sum.seen||0).replace('%d',sum.refined||0)));
    chs.forEach(function(ch){
      if(!ch.topics||!ch.topics.length)return;
      var cbox=el('div','kt-chapter');
      cbox.appendChild(el('div','kt-chapter-name',ch.name));
      var nodes=el('div','kt-nodes');
      ch.topics.forEach(function(tp){
        var n=el('div','kt-node '+tp.state);
        n.innerHTML=escapeHtml(tp.label)+(tp.active>0?'<span class="an">'+t('trace.activeTpl').replace('%d',tp.active)+'</span>':'');
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
fetch('/web/i18n.json').then(function(r){return r.json();}).then(function(d){merge(I18N,d);document.getElementById('title').textContent=I18N.appTitle||'xinmo';renderTabs();setTab('entry');}).catch(function(){renderTabs();setTab('entry');});
})();