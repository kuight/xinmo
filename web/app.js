/* xinmo v1 front-end (pure ASCII; UI text comes from i18n.json) */
(function(){
"use strict";
var I18N = {};

var SUBJ = ['physics','chemistry','geography','chinese','math','english'];
// v1.3 (task 3): per-subject question types. physics unchanged (legacy 8 codes).
// Codes are stored in the question_type TEXT column; labels live in i18n.json questionTypes.
var QTYPES = {
  physics:   ['choice','fill','calc','experiment','inference','diagram','short','comprehensive'],
  chemistry: ['choice','fill','experiment','flow','organic','structure','calc','short'],
  geography: ['choice','comprehensive','chart','location','calc','short'],
  math:      ['single','multi','fill','solve','proof','calc'],
  english:   ['word','sentence','cloze','reading','seven5','grammar','proofread','writing'],
  chinese:   ['choice','recitation','classical_trans','classical_word','poetry','language','literature','short']
};
var ETYPE = ['concept','formula','calc','reading','stuck','incomplete','timeout','careless'];
function qtypesFor(subj){return (QTYPES[subj]||QTYPES.physics).concat(['__custom__']);}
var TOPICS = null;
var selSubj = null;
var selTopics = [];  // v1.2 multi-topic: array of selected topic ids (max 3)
var tab = 'entry';
var entryImg = {q: [], a: []};  // v1.2 multi-image: arrays of uploaded web paths (max 5 per kind)

function merge(a,b){for(var k in b){if(b[k]&&typeof b[k]==='object'&&!Array.isArray(b[k])){a[k]=a[k]||{};merge(a[k],b[k]);}else{a[k]=b[k];}}}
function t(key, def){var p=I18N,ks=key.split('.');for(var i=0;i<ks.length;i++){if(p==null)break;p=p[ks[i]];}return typeof p==='string'?p:(def||key);}
function el(tag,cls,html){var e=document.createElement(tag);if(cls)e.className=cls;if(html!==undefined)e.innerHTML=html;return e;}
// tpl: replace %token placeholders (e.g. %s, %d, %n, %m) with named values; every occurrence replaced
function tpl(tmpl, vals){return (tmpl||'').replace(/%([a-zA-Z]+)/g,function(_,k){return vals[k]!==undefined?vals[k]:('%'+k);});}
function toast(m){var x=document.getElementById('toast');x.textContent=m;x.classList.add('show');clearTimeout(x._t);x._t=setTimeout(function(){x.classList.remove('show');},1600);}
// v1.2 multi-value helpers: image_path / topic / topic_label stored ';'-joined in one TEXT column.
function splitMulti(s){s=(s||'');return s?s.split(';').map(function(x){return x.trim();}).filter(Boolean):[];}
function joinMulti(arr){return (arr||[]).join(';');}
function capArr(arr,n){arr=(arr||[]).filter(Boolean);return arr.slice(0,n);}
// v1.2: thumbnail image (click to zoom); used by today cards, library cards, and the reveal panel.
function imgThumb(path){var im=el('img','thumb');im.src=path;im.onclick=function(){showLightbox(path);};return im;}
// render every image in a ';'-joined path string, stacked vertically, click to zoom.
function renderImageStack(container,joinedPath){
  var paths=splitMulti(joinedPath);
  paths.forEach(function(p){container.appendChild(imgThumb(p));});
}

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
  var tabs=[['entry','entry'],['today','today'],['stats','stats'],['trace','trace'],['library','library'],['kentry','kentry']];
  var box=document.getElementById('tabs');box.innerHTML='';
  tabs.forEach(function(pair){
    var b=el('button','tab'+(tab===pair[0]?' active':''),t('tabs.'+pair[1],pair[1]));
    b.onclick=function(){setTab(pair[0]);};
    box.appendChild(b);
  });
}
function setTab(n){tab=n;renderTabs();['entry','today','stats','trace','library','kentry'].forEach(function(x){document.getElementById('page-'+x).classList.toggle('active',x===n);});if(n==='entry')renderEntry();if(n==='today'){window.scrollTo(0,0);document.documentElement.scrollTop=0;document.body.scrollTop=0;renderToday();}if(n==='stats')renderStats();if(n==='trace')renderTrace();if(n==='library')renderLibrary();if(n==='kentry')renderKEntry();}

function loadTopics(cb){if(TOPICS){cb();return;}fetch('/api/topics').then(function(r){return r.json();}).then(function(d){TOPICS=d;cb();}).catch(function(){toast('topics load failed');});}

// ---- entry ----
var classifyState=null; // null | 'running' | {subject,topic_ids,summary} | 'failed'
var topicMode='manual';  // 'manual' shows chapter picker; 'auto' shows vision candidates
var noteValue='';
var topicSearch='';  // v1.3: live topic search box filter over chapter names + topic labels
// v1.3 (task 4): persist every form field so adding an image never wipes user input.
var formVals={source:'',note:'',answer:'',retro:'',qtype:'choice',qtypeCustom:'',error:'concept',errorCustom:''};
var topicAreaEl=null; // live reference to the topic area so it can be refreshed without rebuilding the form

// v1.3 (task 2): populate the source datalist from /api/sources (most recently used first).
function loadSourceHistory(){
  var dl=document.getElementById('source-history');if(!dl)return;
  fetch('/api/sources').then(function(r){return r.json();}).then(function(d){
    if(!d.sources)return;
    var opts=(d.sources||[]).map(function(s){var o=el('option');o.value=s;return o;});
    dl.innerHTML='';
    opts.forEach(function(o){dl.appendChild(o);});
  }).catch(function(){});
}

function renderEntry(){
  var p=document.getElementById('page-entry');p.innerHTML='';
  loadSourceHistory();  // v1.3 (task 2): refresh the source datalist once per page open
  loadTopics(function(){
    p.appendChild(el('div','muted',t('entry.pickSubject')));
    var sg=el('div','subj-group');
    SUBJ.forEach(function(s){
      var b=el('button','subj-btn'+(selSubj===s?' active':''),t('subjects.'+s,s));
      b.onclick=function(){selSubj=s;topicMode='manual';selTopics=[];classifyState=null;noteValue='';formVals.source='';formVals.note='';formVals.answer='';topicSearch='';renderEntry();};
      sg.appendChild(b);
    });
    p.appendChild(sg);
    p.appendChild(el('div','muted',t('entry.pickTopic')));
    // v1.3: live topic search box (pure front-end filter, topics.json untouched)
    var search=el('input');search.type='text';search.placeholder=t('entry.topicSearchPlaceholder');search.value=topicSearch;
    search.className='topic-search';
    search.oninput=function(){topicSearch=search.value;refreshTopicArea();};
    p.appendChild(search);
    topicAreaEl=el('div');p.appendChild(topicAreaEl);
    refreshTopicArea();
    buildEntryForm(p);
  });
}
function refreshTopicArea(){
  if(!topicAreaEl)return;
  topicAreaEl.innerHTML='';
  if(topicMode==='auto'){renderCandidates(topicAreaEl);}
  else{renderManualTopics(topicAreaEl);}
}

function renderManualTopics(topicArea){
  topicArea.innerHTML='';
  if(selSubj){
    var q=topicSearch.trim();
    var chs=(TOPICS[selSubj]&&TOPICS[selSubj].chapters)||[];
    chs.forEach(function(ch){
      // v1.3: match chapter name OR any topic label (simple includes, no fuzzy)
      var chHit=q && ch.name && ch.name.indexOf(q)>=0;
      var shown=ch.topics.filter(function(tp){
        return selTopics.indexOf(tp.id)>=0 || !q || tp.label.indexOf(q)>=0;  // always keep selected; else filter
      });
      if(q && !chHit && !shown.length)return;  // drop chapters with nothing to show during search
      var c=el('div','chapter');
      var head=el('div','chapter-head','<span>'+ch.name+'</span><span class="n">'+ch.topics.length+'</span>');
      var body=el('div','chapter-body');
      shown.forEach(function(tp){
        var it=el('div','topic-item'+(selTopics.indexOf(tp.id)>=0?' active':''),tp.label);
        it.onclick=(function(tid){return function(){toggleTopic(tid);refreshTopicArea();};})(tp.id);
        body.appendChild(it);
      });
      // v1.3: expand a chapter during search if its name matches OR any topic inside matches
      if(q && (chHit || shown.length))c.classList.add('open');
      head.onclick=function(){c.classList.toggle('open');};
      c.appendChild(head);c.appendChild(body);topicArea.appendChild(c);
    });
  } else {
    topicArea.appendChild(el('div','muted',t('entry.noSubject')));
  }
}
function toggleTopic(tid){
  var i=selTopics.indexOf(tid);
  if(i>=0){selTopics.splice(i,1);}
  else if(selTopics.length<3){selTopics.push(tid);}
  else{toast(t('entry.maxTopics'));}
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
      var b=el('button','cand-chip'+(selTopics.indexOf(tid)>=0?' active':''),topicLabel(st.subject||selSubj||SUBJ[0],tid)||tid);
      b.onclick=function(){
        // v1.3 (task 4): never overwrite a user-picked subject with LLM's; only fill empty
        if(!selSubj&&st.subject)selSubj=st.subject;
        toggleTopic(tid);
        if(st.summary&&!formVals.note&&!noteValue){noteValue=st.summary;}
        refreshTopicArea();
      };
      chips.appendChild(b);
    });
    topicArea.appendChild(chips);
  } else {
    topicArea.appendChild(el('div','muted',t('entry.classifyFailed')));
  }
  var other=el('button','ghost cand-other',t('entry.candidateOther'));
  other.onclick=function(){topicMode='manual';classifyState=null;refreshTopicArea();};
  topicArea.appendChild(other);
  var unc=el('button','ghost cand-unc',t('entry.candidateUnclassified'));
  unc.onclick=function(){
    // v1.3 (task 4): only fill empty subject from LLM
    if(!selSubj&&st&&st.subject)selSubj=st.subject;
    if(!selSubj)selSubj=SUBJ[0];
    selTopics=['unclassified'];
    if(st&&st.summary&&!formVals.note&&!noteValue){noteValue=st.summary;}
    refreshTopicArea();
  };
  topicArea.appendChild(unc);
}

function autoClassify(path){
  classifyState='running';refreshTopicArea();  // v1.3 (task 4): refresh topic area only, never wipe the form
  fetch('/api/classify',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({image_path:path})})
    .then(function(r){return r.json();}).then(function(d){
      if(d.ok&&d.topic_ids&&d.topic_ids.length){
        classifyState={subject:d.subject,topic_ids:d.topic_ids,summary:d.summary};
      } else {
        classifyState='failed';
      }
      topicMode='auto';refreshTopicArea();
    }).catch(function(){classifyState='failed';topicMode='auto';refreshTopicArea();});
}

function buildEntryForm(p){
  var form=el('div');
  form.appendChild(el('label',null,t('entry.noteLabel')));
  var note=el('textarea');note.placeholder=t('entry.notePlaceholder');note.value=formVals.note||noteValue||'';
  note.oninput=function(){formVals.note=note.value;};form.appendChild(note);

  var g=el('div','grid2');
  var s1=el('div');
  s1.appendChild(el('label',null,t('entry.sourceLabel')));
  // v1.3 (task 2): source input backed by a datalist of recently used sources from /api/sources
  var src=el('input');src.type='text';src.placeholder=t('entry.sourcePlaceholder');src.value=formVals.source;
  src.setAttribute('list','source-history');
  src.oninput=function(){formVals.source=src.value;};
  s1.appendChild(src);g.appendChild(s1);
  var s2=el('div');
  s2.appendChild(el('label',null,t('entry.qtypeLabel')));
  var qt=customSelect(qtypesFor(selSubj),'questionTypes','entry.qtypeCustom');
  // preselect persisted qtype
  (function(){var sel=qt.querySelector('select');var f=formVals.qtype;if(f&&qtypesFor(selSubj).indexOf(f)>=0){sel.value=f;}else if(f&&f!=='__custom__'){sel.value='__custom__';var ci=qt.querySelector('input');if(ci){ci.value=formVals.qtypeCustom||f;ci.parentNode.style.display='block';}}})();
  qt.onchange=function(){var sel=qt.querySelector('select');formVals.qtype=sel.value;if(sel.value==='__custom__'){var ci=qt.querySelector('input');formVals.qtypeCustom=ci.value;}};
  s2.appendChild(qt);g.appendChild(s2);
  form.appendChild(g);

  form.appendChild(el('label',null,t('entry.qImageLabel')));
  form.appendChild(makeImagePicker('q'));

  form.appendChild(el('label',null,t('entry.answerLabel')));
  var ans=el('input');ans.type='text';ans.placeholder=t('entry.answerPlaceholder');ans.value=formVals.answer;
  ans.oninput=function(){formVals.answer=ans.value;};form.appendChild(ans);

  // v1.4: retro (复盘) - separate input under the answer; shown only at self-judge time.
  form.appendChild(el('label',null,t('entry.retroLabel')));
  var retro=el('textarea');retro.placeholder=t('entry.retroPlaceholder');retro.value=formVals.retro;
  retro.oninput=function(){formVals.retro=retro.value;};form.appendChild(retro);

  form.appendChild(el('label',null,t('entry.aImageLabel')));
  form.appendChild(makeImagePicker('a'));

  form.appendChild(el('label',null,t('entry.errorLabel')));
  var et=customSelect(ETYPE,'errorTypes','entry.errorCustom');
  (function(){var sel=et.querySelector('select');var f=formVals.error;if(f&&ETYPE.indexOf(f)>=0){sel.value=f;}else if(f&&f!=='__custom__'){sel.value='__custom__';var ci=et.querySelector('input');if(ci){ci.value=formVals.errorCustom||f;ci.parentNode.style.display='block';}}})();
  et.onchange=function(){var sel=et.querySelector('select');formVals.error=sel.value;if(sel.value==='__custom__'){var ci=et.querySelector('input');formVals.errorCustom=ci.value;}};
  form.appendChild(et);

  var sub=el('button','primary',t('entry.submit'));
  sub.onclick=function(){
    if(!selSubj){toast(t('entry.noSubject'));return;}
    if(!selTopics.length){toast(t('entry.noTopic'));return;}
    if(!entryImg.q.length){toast(t('entry.needImage'));return;}
    var tids=capArr(selTopics,3);
    var tlb=joinMulti(tids.map(function(tid){return topicLabel(selSubj,tid)||tid;}));
    var body={subject:selSubj,topic:joinMulti(tids),topic_label:tlb,question_type:selValue(qt),error_type:selValue(et),note:note.value,retro:retro.value,source:src.value,answer_text:ans.value,image_path:joinMulti(entryImg.q),answer_image_path:joinMulti(entryImg.a)};
    fetch('/api/problem',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})
      .then(function(r){return r.json();}).then(function(d){
        if(d.ok){toast(t('entry.added')+' #'+d.problem.id);noteValue='';note.value='';ans.value='';src.value='';formVals={source:'',note:'',answer:'',retro:'',qtype:'choice',qtypeCustom:'',error:'concept',errorCustom:''};selTopics=[];entryImg={q:[],a:[]};classifyState=null;topicMode='manual';renderEntry();}
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
  var camInp=el('input');camInp.type='file';camInp.accept='image/*';camInp.style.display='none';  // v1.2: no capture (blocks album picker)
  var albumInp=el('input');albumInp.type='file';albumInp.accept='image/*';albumInp.multiple='multiple';albumInp.style.display='none';  // v1.2: multi-select
  var camBtn=el('button','ghost',t('entry.takePhoto'));
  var albumBtn=el('button','ghost',t('entry.chooseAlbum'));
  camBtn.onclick=function(){camInp.click();};
  albumBtn.onclick=function(){albumInp.click();};
  buttons.appendChild(camBtn);buttons.appendChild(albumBtn);
  wrap.appendChild(dz);wrap.appendChild(buttons);wrap.appendChild(camInp);wrap.appendChild(albumInp);

  // v1.2 multi-image: process a list of files, each through its own crop+compress (per-image <=300KB server-side)
  function handleFiles(files){
    files=(files||[]);var list=[];
    for(var i=0;i<files.length;i++){if(files[i]&&files[i].type&&files[i].type.indexOf('image')===0)list.push(files[i]);}
    if(!list.length)return;
    if(entryImg[kind].length+list.length>5){toast(t('entry.maxImages'));list=capArr(list,5-entryImg[kind].length);}
    list.forEach(function(f){
      openCropModal(f,function(blob){
        dz.textContent=t('entry.uploading');
        uploadImage(blob,kind,function(path){
          entryImg[kind]=capArr(entryImg[kind].concat([path]),5);
          if(kind==='q'&&entryImg[kind].length===1&&!classifyState){autoClassify(path);}
          render();
        });
      });
    });
  }
  // v1.3 (task 5): per-image remove button on each thumbnail (replaces the old remove-all button).
  function render(){
    var arr=entryImg[kind]||[];
    if(arr.length){
      dz.className='dropzone filled';dz.innerHTML='';
      var stk=el('div','img-stack');
      arr.forEach(function(p,idx){
        var tw=el('div','thumb-wrap');
        var im=el('img');im.src=p;im.onclick=function(ev){ev.stopPropagation();showLightbox(p);};
        tw.appendChild(im);
        var x=el('button','img-x','✕');
        x.onclick=function(ev){ev.stopPropagation();entryImg[kind].splice(idx,1);render();};
        tw.appendChild(x);
        stk.appendChild(tw);
      });
      dz.appendChild(stk);
      dz.appendChild(el('div','muted',tpl(t('entry.imgCount'),{n:arr.length,max:5})));
    }else{dz.className='dropzone';dz.textContent=t('entry.pasteHint');}
  }
  dz.onclick=function(){albumInp.click();};
  camInp.onchange=function(){if(camInp.files&&camInp.files.length)handleFiles([camInp.files[0]]);camInp.value='';};
  albumInp.onchange=function(){if(albumInp.files)handleFiles(Array.prototype.slice.call(albumInp.files));albumInp.value='';};
  dz.addEventListener('dragover',function(e){e.preventDefault();dz.classList.add('over');});
  dz.addEventListener('dragleave',function(){dz.classList.remove('over');});
  dz.addEventListener('drop',function(e){e.preventDefault();dz.classList.remove('over');var dt=e.dataTransfer;if(dt&&dt.files)handleFiles(Array.prototype.slice.call(dt.files));});
  dz.addEventListener('paste',function(e){var items=(e.clipboardData||{}).items||[];for(var i=0;i<items.length;i++){if(items[i].type.indexOf('image')===0){e.preventDefault();handleFiles([items[i].getAsFile()]);return;}}});
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

// v1.3 (task 6): today page = collapsed rows + progress line + accordion + scroll-to-top on switch.
var todayTotalP=0, todayDoneP=0, todayTotalK=0, todayDoneK=0;  // v1.6: per-section counters
function todayProgressRefresh(section){  // v1.6: section = 'problem' | 'knowledge'
  var sel=section==='problem'?'.today-progress.problem':'.today-progress.knowledge';
  var pg=document.getElementById('page-today').querySelector(sel);
  if(!pg)return;
  var n=section==='problem'?todayTotalP:todayTotalK;
  var m=section==='problem'?todayDoneP:todayDoneK;
  pg.textContent=tpl(t(section==='problem'?'today.progressTpl':'today.kProgressTpl'),{n:n,m:m});
}

function renderTodayData(p,d){
  var queue=d.queue||[]; var kqueue=d.kqueue||[];
  todayTotalP=queue.length; todayDoneP=queue.filter(function(it){return !!(it.last_attempt&&it.last_attempt.result);}).length;
  todayTotalK=kqueue.length; todayDoneK=kqueue.filter(function(it){return !!(it.last_attempt&&it.last_attempt.result);}).length;
  p.innerHTML='';
  p.appendChild(el('h1',null,t('today.title')+' '+todayTotalP+' '+t('today.unit')));
  if(d.on_the_way>0){p.appendChild(el('div','banner',t('today.onTheWay').replace('%d',d.on_the_way)));}
  if(!queue.length&&!kqueue.length){p.appendChild(el('div','muted',t('today.empty')));return;}
  // v1.6: two sections - problems on top, knowledge items below, each with its own progress line
  var secP=el('div','today-section');p.appendChild(secP);
  secP.appendChild(el('div','today-progress problem',tpl(t('today.progressTpl'),{n:todayTotalP,m:todayDoneP})));
  queue.forEach(function(item,idx){secP.appendChild(buildCollapsibleRow(item,idx));});
  var secK=el('div','today-section');p.appendChild(secK);
  secK.appendChild(el('h2',null,t('today.kTitle')+' '+todayTotalK+' '+t('today.kUnit')));
  secK.appendChild(el('div','today-progress knowledge',tpl(t('today.kProgressTpl'),{n:todayTotalK,m:todayDoneK})));
  kqueue.forEach(function(item,idx){secK.appendChild(buildCollapsibleRow(item,idx));});
}
function buildCollapsibleRow(item,idx){
  var row=el('div','td-row');
  var head=el('div','td-row-head');
  var titleText=(item.row_kind==='knowledge')?(item.note||item.topic_label):(splitMulti(item.topic_label).join('、')||item.source||('#'+item.id));
  var qtypeTxt=(item.question_type?t('questionTypes.'+item.question_type,item.question_type):'');
  var line=escapeHtml(titleText);
  if(item.source)line+=' <span class="tl-sep">&middot;</span> '+escapeHtml(item.source);
  if(qtypeTxt)line+=' <span class="tl-sep">&middot;</span> '+escapeHtml(qtypeTxt);
  head.appendChild(el('div','td-row-title',line));
  var done=item.done||(item.last_attempt&&item.last_attempt.result)?true:false;
  var badge=el('span','td-badge '+(done?'done':'todo'),done?t('today.statusDone'):t('today.statusTodo'));
  head.appendChild(badge);
  row.appendChild(head);
  var body=el('div','td-body');
  if(item.row_kind==='knowledge'){body.appendChild(buildKnowledgeCard(item));}  // v1.5
  else{body.appendChild(buildReviewCard(item));}
  row.appendChild(body);
  head.onclick=function(){
    // v1.6: per-section accordion (rows live in two independent sections)
    var box=row.parentElement;
    var openRows=box.querySelectorAll('.td-row.open');
    for(var i=0;i<openRows.length;i++){if(openRows[i]!==row)openRows[i].classList.remove('open');}
    row.classList.toggle('open');
    row.scrollIntoView({block:'nearest',behavior:'smooth'});
  };
  return row;
}

// D3: answer-first, judge-then. Each card is a small state machine.
function buildReviewCard(item){
  var card=el('div','card'+(item.kind==='rebound'?' rebound':''));
  var startTs=Date.now();

  // --- header: title = source else topic_label; note as 批注 line ---
  var h3=el('h3',null,escapeHtml(item.source||splitMulti(item.topic_label).join('、')||''));
  card.appendChild(h3);
  if(item.source){card.appendChild(el('div','meta',t('today.topic')+': '+splitMulti(item.topic_label).join('、')));}
  if(item.note){card.appendChild(el('div','note','<b>'+t('today.myNote')+':</b> '+escapeHtml(item.note)));}
  // question images (v1.2 multi: all stacked)
  if(item.image_path){renderImageStack(card,item.image_path);}

  // --- phase container ---
  var phase=el('div');card.appendChild(phase);

  function elapsed(){return Math.round((Date.now()-startTs)/1000);}

  // apply final result to backend then reload list
  function commit(result,extraNote,my_answer,judged){
    var body={problem_id:item.id,result:result,seconds:elapsed(),my_answer:my_answer||'',judged:judged||'unknown'};
    if(extraNote)body.note=extraNote;
    fetch('/api/attempt',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})
      .then(function(r){return r.json();}).then(function(d){
        if(d.ok){toast(t('entry.added')+' #'+item.id);
          // v1.3 (task 6): mark this row done + collapse it + bump the progress counter without rebuilding
          var row=card.closest('.td-row');if(row){row.classList.remove('open');var b=row.querySelector('.td-badge');if(b){b.className='td-badge done';b.textContent=t('today.statusDone');}var h=row.querySelector('.td-row-head');}
          todayDoneP++;todayProgressRefresh('problem');  // v1.6
        }else{toast('save failed');}
      }).catch(function(){toast('save failed');});
  }
  // v1.4: retro (复盘) shows only in self-judge phases, next to the explanation.
  function retroBox(){
    if(!item.retro)return null;
    return el('div','retro-box','<b>'+t('today.retroLabel')+':</b> '+escapeHtml(item.retro));
  }
  // v1.4.1: wont shows a read-only explanation panel first; commit happens on 读完了.
  // Panel = answer_text + saved answer image (answer_image_path column). No new fields.
  function renderWontPanel(my, judged){
    phase.innerHTML='';
    var ansTxt=(item.answer_text||'').trim();
    var ansImgs=splitMulti(item.answer_image_path||'');
    if(!ansTxt&&!ansImgs.length){
      phase.appendChild(el('div','wont-empty',t('today.wontEmpty')));
    }else{
      var panel=el('div','wont-panel');
      if(ansTxt){panel.appendChild(el('div','std-answer','<b>'+t('today.stdAnswer')+'</b>: '+escapeHtml(ansTxt)));}
      if(ansImgs.length){renderImageStack(panel,item.answer_image_path);}
      phase.appendChild(panel);
    }
    var acts=el('div','actions');
    var done=el('button','primary',t('today.btnWontDone'));
    done.onclick=function(){commit('wont','',my||'',judged);};
    acts.appendChild(done);
    phase.appendChild(acts);
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
    acts.appendChild(jb);
    // v1.4.1: wont opens the read-only explanation panel first; commit on 读完了.
    var wb=el('button','wont',t('today.btnWont'));
    wb.onclick=function(){renderWontPanel('','unknown');};
    acts.appendChild(wb);
    phase.appendChild(acts);
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
    if(v.answer_image_path){renderImageStack(reveal,v.answer_image_path);}
    if(v.hint==='unit_missing'){reveal.appendChild(el('div','muted',t('today.unitMissingHint')));}
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
      var rb1=retroBox();if(rb1)phase.appendChild(rb1);
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
      var rb2=retroBox();if(rb2)phase.appendChild(rb2);
      phase.appendChild(el('label',null,t('today.wrongNoteLabel')));
      var wn=el('input');wn.type='text';wn.placeholder=t('today.wrongNotePlaceholder');phase.appendChild(wn);
      var a2=el('div','actions');
      var cb=el('button','again',t('today.btnConfirmWrong'));cb.onclick=function(){commit('again',wn.value,my,'wrong');};
      a2.appendChild(cb);phase.appendChild(a2);
    }else if(v.judged==='partial'){
      phase.appendChild(el('div','verdict unk',t('today.verdictPartial')));
      phase.appendChild(reveal);
      if(explBox)phase.appendChild(explBox);
      var rb3=retroBox();if(rb3)phase.appendChild(rb3);
      var a3=el('div','actions');
      var sc=el('button','good',t('today.selfCorrect'));sc.onclick=function(){renderSelfCorrect(my);};
      var sw=el('button','again',t('today.selfWrong'));sw.onclick=function(){renderSelfWrong(my);};
      a3.appendChild(sc);a3.appendChild(sw);phase.appendChild(a3);
    }else{
      var reason=v.reason==='llm_unavailable'?t('today.llmUnavailable'):t('today.verdictUnknown');
      phase.appendChild(el('div','verdict unk',reason));
      phase.appendChild(reveal);
      if(explBox)phase.appendChild(explBox);
      var rb4=retroBox();if(rb4)phase.appendChild(rb4);
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
    var rb5=retroBox();if(rb5)phase.appendChild(rb5);
    var a=el('div','actions');
    var g=el('button','good',t('today.btnGood'));g.onclick=function(){commit('good','',my,'correct');};
    var h=el('button','hard',t('today.btnHard'));h.onclick=function(){commit('hard','',my,'correct');};
    a.appendChild(g);a.appendChild(h);phase.appendChild(a);
  }
  function renderSelfWrong(my){
    phase.innerHTML='';
    phase.appendChild(el('div','verdict bad',t('today.verdictWrong')));
    var rb6=retroBox();if(rb6)phase.appendChild(rb6);
    phase.appendChild(el('label',null,t('today.wrongNoteLabel')));
    var wn=el('input');wn.type='text';wn.placeholder=t('today.wrongNotePlaceholder');phase.appendChild(wn);
    var a=el('div','actions');
    var cb=el('button','again',t('today.btnConfirmWrong'));cb.onclick=function(){commit('again',wn.value,my,'wrong');};
    a.appendChild(cb);
    // v1.4.1: wont opens the read-only explanation panel first; commit on 读完了.
    var wb=el('button','wont',t('today.btnWont'));wb.onclick=function(){renderWontPanel(my,'wrong');};
    a.appendChild(wb);
    phase.appendChild(a);
  }

  renderAsk();
  return card;
}
function escapeHtml(s){return (''+s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}

// v1.5: knowledge card - "给出左列，回忆右列", self-judge only (no input/judge/wont).
function buildKnowledgeCard(item){
  var card=el('div','card kcard'+(item.state==='refined'?' refined':''));
  var startTs=Date.now();
  card.appendChild(el('div','meta',t('today.kTag')+': '+escapeHtml(item.topic_label||item.source||'')));
  card.appendChild(el('h3',null,escapeHtml(item.note||'')));
  var phase=el('div');card.appendChild(phase);
  function elapsed(){return Math.round((Date.now()-startTs)/1000);}
  function commit(result){
    var body={problem_id:item.id,result:result,seconds:elapsed(),my_answer:'',judged:'self'};
    fetch('/api/attempt',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})
      .then(function(r){return r.json();}).then(function(d){
        if(d.ok){toast(t('entry.added')+' #'+item.id);
          var row=card.closest('.td-row');if(row){row.classList.remove('open');var b=row.querySelector('.td-badge');if(b){b.className='td-badge done';b.textContent=t('today.statusDone');}}
          todayDoneK++;todayProgressRefresh('knowledge');  // v1.6
        }else{toast('save failed');}
      }).catch(function(){toast('save failed');});
  }
  // phase 1: recall the right column from the left, then self-judge
  function renderRecall(){
    phase.innerHTML='';
    phase.appendChild(el('div','muted',t('today.kRecall')));
    var acts=el('div','actions');
    var g=el('button','good',t('today.selfCorrect'));g.onclick=function(){renderResult('good');};
    var w=el('button','again',t('today.selfWrong'));w.onclick=function(){renderResult('again');};
    acts.appendChild(g);acts.appendChild(w);phase.appendChild(acts);
  }
  // phase 2: reveal the right column, pick the final result
  function renderResult(judge){
    phase.innerHTML='';
    var box=el('div','reveal-box');
    box.appendChild(el('div','std-answer','<b>'+t('today.kAnswer')+'</b>: '+escapeHtml(item.answer_text||'')));
    phase.appendChild(box);
    var acts=el('div','actions');
    if(judge==='good'){
      var g=el('button','good',t('today.btnGood'));g.onclick=function(){commit('good');};
      var h=el('button','hard',t('today.btnHard'));h.onclick=function(){commit('hard');};
      acts.appendChild(g);acts.appendChild(h);
    }else{
      var cb=el('button','again',t('today.btnConfirmWrong'));cb.onclick=function(){commit('again');};
      acts.appendChild(cb);
    }
    phase.appendChild(acts);
  }
  renderRecall();
  return card;
}

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
  // v1.8: manual study-log form + today summary + day-grouped list
  var LOG_CATS=['practice','review','recite','class','other'];
  function todayISO(){var d=new Date();var m=('0'+(d.getMonth()+1)).slice(-2);var dd=('0'+d.getDate()).slice(-2);return d.getFullYear()+'-'+m+'-'+dd;}
  var secLog=el('div','trace-section log-form');
  secLog.appendChild(el('h2',null,t('trace.logTitle')));
  var form=el('div','log-form-row');
  var dateInp=el('input');dateInp.type='date';dateInp.value=todayISO();
  var catSel=el('select');
  LOG_CATS.forEach(function(c){var o=el('option',null,t('trace.logCat'+c.charAt(0).toUpperCase()+c.slice(1),c));o.value=c;catSel.appendChild(o);});
  var subjSel=el('select');
  var o0=el('option',null,t('trace.logNoSubject'));o0.value='';subjSel.appendChild(o0);
  SUBJ.forEach(function(s){var o=el('option',null,t('subjects.'+s,s));o.value=s;subjSel.appendChild(o);});
  var contentInp=el('input');contentInp.type='text';contentInp.placeholder=t('trace.logContentPh');
  var minInp=el('input');minInp.type='number';minInp.min='0';minInp.placeholder=t('trace.logMinutes');
  var addBtn=el('button','primary',t('trace.logAdd'));
  form.appendChild(dateInp);form.appendChild(catSel);form.appendChild(subjSel);form.appendChild(contentInp);form.appendChild(minInp);form.appendChild(addBtn);
  secLog.appendChild(form);
  var sumBox=el('div','log-today-sum');secLog.appendChild(sumBox);
  p.appendChild(secLog);
  function loadLogs(){
    fetch('/api/logs').then(function(r){return r.json();}).then(function(d){
      sumBox.textContent=tpl(t('trace.todaySummaryTpl'),{p:d.today.problems,k:d.today.knowledge,m:d.today.manual_minutes});
      var oldList=p.querySelector('.log-list'); if(oldList)oldList.remove();
      var days={};
      d.items.forEach(function(it){(days[it.day]=days[it.day]||[]).push(it);});
      var list=el('div','log-list');p.appendChild(list);
      Object.keys(days).forEach(function(day){
        var arr=days[day];
        var total=arr.reduce(function(s,x){return s+(x.minutes||0);},0);
        var block=el('div','log-day');
        block.appendChild(el('div','log-day-head',escapeHtml(day)+' <span class="log-day-meta">'+tpl(t('trace.logDayTpl'),{n:arr.length,m:total})+'</span>'));
        var cats={};
        arr.forEach(function(it){(cats[it.category]=cats[it.category]||[]).push(it);});
        Object.keys(cats).forEach(function(cat){
          var sec=el('div','log-cat');
          sec.appendChild(el('div','log-cat-name',t('trace.logCat'+cat.charAt(0).toUpperCase()+cat.slice(1),cat)));
          cats[cat].forEach(function(it){
            var row=el('div','log-item');
            var txt=escapeHtml(it.subject?(t('subjects.'+it.subject,it.subject)+' · '):'')+escapeHtml(it.content)+(it.minutes?(' · '+it.minutes+'min'):'');
            row.appendChild(el('span',null,txt));
            var del=el('button','ghost log-del',t('trace.logDelete'));
            del.onclick=(function(lid){return function(){fetch('/api/log/'+lid,{method:'DELETE'}).then(function(r){return r.json();}).then(function(dd){if(dd.ok){row.remove();loadLogs();}}).catch(function(){});};})(it.id);
            row.appendChild(del);
            sec.appendChild(row);
          });
          block.appendChild(sec);
        });
        list.appendChild(block);
      });
    }).catch(function(){sumBox.textContent=t('trace.logLoadFailed');});
  }
  addBtn.onclick=function(){
    var body={day:dateInp.value, category:catSel.value, subject:subjSel.value, content:contentInp.value, minutes:minInp.value||null};
    if(!(body.content||'').trim()){toast(t('trace.logContentReq'));return;}
    fetch('/api/log',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})
      .then(function(r){return r.json();}).then(function(d){if(d.ok){toast(t('entry.added')+' #'+d.log.id);contentInp.value='';minInp.value='';loadLogs();}else{toast('save failed');}})
      .catch(function(){toast('save failed');});
  };
  loadLogs();
  // existing sections
  fetch('/api/trace').then(function(r){return r.json();}).then(function(d){renderTraceData(p,d);}).catch(function(e){window.__traceErr=(e&&e.stack)||String(e);p.innerHTML='load failed';});
}
function renderTraceData(p,d){
  // --- section 1: today list (v1.2 paginated, 5 rows/page; entry and redo are separate rows) ---
  var s1=el('div','trace-section');
  s1.appendChild(el('h2',null,t('trace.todayTitle')));
  var PAGE=5;
  var page=0;
  function buildTraceRow(it){
    var row=el('div','tl-item');
    var badge=el('span','tl-badge '+(it.kind==='add'?'add':'redo'),it.kind==='add'?t('trace.actAdd'):t('trace.actRedo'));
    row.appendChild(badge);
    var titleText=it.source||splitMulti(it.topic_label).join('、')||'';
    var subjTxt=(it.subject?t('subjects.'+it.subject,it.subject):'');
    var txt=escapeHtml(titleText)+(subjTxt?' <span class="tl-sep">&middot;</span> '+subjTxt:'')+' <span class="tl-sep">&middot;</span> '+escapeHtml(it.error_label||'');
    if(it.time)txt+=' <span class="tl-sep">&middot;</span> '+escapeHtml(it.time);
    row.appendChild(el('span',null,txt));
    if(it.note){row.appendChild(el('div','tl-note','<b>'+t('today.myNote')+':</b> '+escapeHtml(it.note)));}
    if(it.kind==='redo'&&it.result){
      var rl=el('span','tl-res '+it.result,t('trace.result'+it.result.charAt(0).toUpperCase()+it.result.slice(1)));
      row.appendChild(rl);
    }
    return row;
  }
  function renderTodayListPage(){
    s1.querySelectorAll('.tl-item').forEach(function(n){n.remove();});
    var footer=s1.querySelector('.tl-pager');if(footer)footer.remove();
    var list=d.today_list;
    var pages=Math.max(1,Math.ceil(list.length/PAGE));
    if(page>=pages)page=pages-1;
    var slice=list.slice(page*PAGE,(page+1)*PAGE);
    slice.forEach(function(it){s1.appendChild(buildTraceRow(it));});
    if(pages>1||list.length>PAGE){
      var pg=el('div','tl-pager');
      var prev=el('button','ghost',t('trace.prevPage'));prev.onclick=function(){if(page>0){page--;renderTodayListPage();}};
      var next=el('button','ghost',t('trace.nextPage'));next.onclick=function(){if(page<pages-1){page++;renderTodayListPage();}};
      pg.appendChild(prev);
      pg.appendChild(el('span','tl-pageno',tpl(t('trace.pageTpl'),{x:page+1,y:pages})));
      pg.appendChild(next);
      s1.appendChild(pg);
    }
  }
  if(!d.today_list.length){s1.appendChild(el('div','muted',t('trace.todayEmpty')));}
  else{renderTodayListPage();}
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

  // --- section 3: heatmap (v1.2: click a cell to drill into that day's detail via /api/trace/day) ---
  var s3=el('div','trace-section');
  s3.appendChild(el('h2',null,t('trace.heatTitle')));
  s3.appendChild(el('div','heat-streak',d.streak>0?t('trace.streakTpl').replace('%d',d.streak):t('trace.noStreak')));
  var grid=el('div','heat-grid');
  var maxc=1;d.heatmap.forEach(function(x){if(x.count>maxc)maxc=x.count;});
  var detailBox=el('div','heat-detail');
  detailBox.style.display='none';
  function showDayDetail(date){
    detailBox.innerHTML='';
    detailBox.style.display='block';
    detailBox.appendChild(el('div','heat-detail-title',escapeHtml(date)));
    var body=el('div','heat-detail-body');
    body.appendChild(el('div','muted',t('trace.dayLoading')));
    detailBox.appendChild(body);
    fetch('/api/trace/day?date='+encodeURIComponent(date)).then(function(r){return r.json();}).then(function(day){
      body.innerHTML='';
      var items=day.items||[];
      if(!items.length){body.appendChild(el('div','muted',t('trace.dayEmpty')));return;}
      var shown=items.slice(0,8);
      shown.forEach(function(it){
        var r=el('div','day-item');
        var b=el('span','tl-badge '+(it.kind==='add'?'add':'redo'),it.kind==='add'?t('trace.actAdd'):t('trace.actRedo'));
        r.appendChild(b);
        var subjTxt=(it.subject?t('subjects.'+it.subject,it.subject):'');
        var txt=escapeHtml(splitMulti(it.topic_label).join('、')||'')+(subjTxt?' <span class="tl-sep">&middot;</span> '+subjTxt:'')+' <span class="tl-sep">&middot;</span> '+escapeHtml(it.time||'')+(it.source?' <span class="tl-sep">&middot;</span> '+escapeHtml(it.source):'');
        r.appendChild(el('span',null,txt));
        if(it.kind==='redo'&&it.result){
          var rl=el('span','tl-res '+it.result,t('trace.result'+it.result.charAt(0).toUpperCase()+it.result.slice(1)));
          r.appendChild(rl);
        }
        body.appendChild(r);
      });
      if(items.length>8){body.appendChild(el('div','day-more',tpl(t('trace.dayMore'),{n:items.length})));}
    }).catch(function(){body.innerHTML='';body.appendChild(el('div','muted',t('trace.dayLoadFail')));});
  }
  d.heatmap.forEach(function(x){
    var lvl=x.count===0?0:(x.count>=Math.max(4,maxc*0.75)?4:(x.count>=Math.max(3,maxc*0.5)?3:(x.count>=Math.max(2,maxc*0.25)?2:1)));
    var c=el('div','heat-cell'+(lvl?' l'+lvl:''));c.title=x.date+': '+x.count;
    if(x.count>0){c.onclick=(function(date){return function(){showDayDetail(date);};})(x.date);c.classList.add('clickable');}
    grid.appendChild(c);
  });
  s3.appendChild(grid);
  s3.appendChild(detailBox);
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
      // v1.4/v1.7: group by subject then tag, collapsible groups, default closed.
      var groups={};
      d.items.forEach(function(it){var g=groups[it.subject]||(groups[it.subject]={count:0,tags:{}});g.count++;var tg=it.topic_label||'#other';(g.tags[tg]=g.tags[tg]||[]).push(it);});
      SUBJ.forEach(function(s){
        var g=groups[s];if(!g)return;
        var grp=el('div','td-row');
        var head=el('div','td-row-head');
        head.appendChild(el('div','td-row-title',t('subjects.'+s,s)+' <span class="lib-grp-count">'+g.count+'</span>'));
        var body=el('div','td-body');
        Object.keys(g.tags).forEach(function(tag){
          var tagRow=el('div','td-row kentry-tagrow');
          var tagHead=el('div','td-row-head');
          tagHead.appendChild(el('div','td-row-title',escapeHtml(tag)+' <span class="lib-grp-count">'+g.tags[tag].length+'</span>'+tagStats(g.tags[tag])));
          var tagBody=el('div','td-body');
          g.tags[tag].forEach(function(it){tagBody.appendChild(buildLibraryCard(it));});
          tagRow.appendChild(tagHead);tagRow.appendChild(tagBody);
          tagHead.onclick=function(){tagRow.classList.toggle('open');};
          body.appendChild(tagRow);
        });
        grp.appendChild(head);grp.appendChild(body);
        head.onclick=function(){grp.classList.toggle('open');};
        list.appendChild(grp);
      });
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
  // v1.2 multi-image: render all question images then all answer images, stacked
  splitMulti(it.image_path).forEach(function(p){
    var th=imgThumb(p);
    if(it.image_missing){th.className='thumb missing';th.title=t('library.brokenImage');}
    thumbs.appendChild(th);
  });
  splitMulti(it.answer_image_path).forEach(function(p){
    var th=imgThumb(p);
    if(it.answer_image_missing){th.className='thumb missing';th.title=t('library.brokenImage');}
    thumbs.appendChild(th);
  });
  if(thumbs.children.length)card.appendChild(thumbs);
  if(it.note){card.appendChild(el('div','note','<b>'+t('today.myNote')+':</b> '+escapeHtml(it.note)));}
  var lastResTxt='';
  if(it.last_result){lastResTxt=' &middot; '+t('today.result'+it.last_result.charAt(0).toUpperCase()+it.last_result.slice(1),it.last_result);}
  card.appendChild(el('div','meta',tpl(t('library.attemptCountTpl'),{n:it.attempt_count||0})+lastResTxt));
  card.appendChild(el('div','meta',tpl(t('library.createdTpl'),{d:it.created_at||''})));
  // v1.7: attempt history + memory curve
  card.appendChild(historyBlock(it));
  var mc=memoryCurve(it); if(mc)card.appendChild(mc);
  var editBtn=el('button','primary lib-edit',t('library.btnEdit'));
  editBtn.onclick=(function(card,it){return function(){openEditForm(card,it);};})(card,it);
  card.appendChild(editBtn);
  return card;
}
// ---- kentry (v1.5 batch3: 条目库 - browse knowledge items grouped by subject then tag, read-only) ----
function renderKEntry(){
  var p=document.getElementById('page-kentry');p.innerHTML='';
  p.appendChild(el('h2',null,t('kentry.title')));
  p.appendChild(el('div','muted',t('kentry.hint')));
  var list=el('div','lib-list');p.appendChild(list);
  fetch('/api/kentry').then(function(r){return r.json();}).then(function(d){
    if(!d.items||!d.items.length){list.appendChild(el('div','muted',t('library.empty')));return;}
    list.appendChild(el('div','muted',tpl(t('library.countTpl'),{n:d.items.length})));
    // group by subject (SUBJ order), then by tag; both levels collapsible via .td-row
    var groups={};
    d.items.forEach(function(it){
      var g=groups[it.subject]||(groups[it.subject]={count:0,tags:{}});
      g.count++;
      var tg=it.topic_label||'#other';
      (g.tags[tg]=g.tags[tg]||[]).push(it);
    });
    SUBJ.forEach(function(s){
      var g=groups[s];if(!g)return;
      var grp=el('div','td-row');
      var head=el('div','td-row-head');
      head.appendChild(el('div','td-row-title',t('subjects.'+s,s)+' <span class="lib-grp-count">'+g.count+'</span>'));
      var body=el('div','td-body');
      Object.keys(g.tags).forEach(function(tag){
        var tagRow=el('div','td-row kentry-tagrow');
        var tagHead=el('div','td-row-head');
        tagHead.appendChild(el('div','td-row-title',escapeHtml(tag)+' <span class="lib-grp-count">'+g.tags[tag].length+'</span>'+tagStats(g.tags[tag])));
        var tagBody=el('div','td-body');
        g.tags[tag].forEach(function(it){tagBody.appendChild(buildKEntryCard(it));});
        tagRow.appendChild(tagHead);tagRow.appendChild(tagBody);
        tagHead.onclick=function(){tagRow.classList.toggle('open');};
        body.appendChild(tagRow);
      });
      grp.appendChild(head);grp.appendChild(body);
      head.onclick=function(){grp.classList.toggle('open');};
      list.appendChild(grp);
    });
  }).catch(function(){list.appendChild(el('div','muted',t('library.loadFailed')));});
}
function buildKEntryCard(it){
  var card=el('div','card kentry-item');
  card.appendChild(el('div','kentry-left','<b>'+t('kentry.left')+':</b> '+escapeHtml(it.note||'')));
  card.appendChild(el('div','kentry-right','<b>'+t('kentry.right')+':</b> '+escapeHtml(it.answer_text||'')));
  var meta=el('div','meta');
  meta.appendChild(el('span',null,t('kentry.tag')+': '+escapeHtml(it.topic_label||'')));
  meta.appendChild(el('span',null,t('kentry.due')+': '+(it.due_date||'')));
  meta.appendChild(el('span',null,t('kentry.interval')+': '+(it.interval_days||0)));
  card.appendChild(meta);
  // v1.7: attempt history + memory curve
  card.appendChild(historyBlock(it));
  var mc=memoryCurve(it); if(mc)card.appendChild(mc);
  return card;
}
// v1.7: per-tag summary numbers (count / avg interval / error rate) appended to group titles
function tagStats(items){
  var n=items.length; if(!n)return '';
  var avgI=0,total=0,bad=0;
  items.forEach(function(it){
    avgI+=(it.interval_days||0);
    if(it.attempts)it.attempts.forEach(function(a){total++;if(a.result==='again'||a.result==='wont')bad++;});
  });
  var avg=(avgI/n).toFixed(1);
  var err=total?(100*bad/total).toFixed(0):'0';
  return ' <span class="tag-stats">'+t('library.tagTotal')+n+' · '+t('library.tagAvg')+avg+t('library.tagDay')+' · '+t('library.tagErr')+err+'%</span>';
}
function historyBlock(it){
  var box=el('div','hist-block');
  box.appendChild(el('div','hist-title',t('library.histTitle')));
  if(!it.attempts||!it.attempts.length){box.appendChild(el('div','muted',t('library.histEmpty')));return box;}
  var ul=el('ul','hist-list');
  it.attempts.forEach(function(a){
    var res=t('today.result'+a.result.charAt(0).toUpperCase()+a.result.slice(1),a.result);
    var iv=a.interval_days!=null?a.interval_days:'—';
    var st=a.streak!=null?a.streak:'—';
    ul.appendChild(el('li',null,escapeHtml(a.ts)+' · '+res+' · '+t('library.histIv')+iv+' · '+t('library.histSk')+st));
  });
  box.appendChild(ul);
  return box;
}
function memoryCurve(it){
  var asc=(it.attempts||[]).slice().reverse();  // time asc
  if(!asc.length)return null;
  var d0=new Date(asc[0].ts.slice(0,10)).getTime();
  var d1=it.due_date?new Date(it.due_date).getTime():d0+86400000;
  var days=(d1-d0)/86400000; if(!(days>0))days=1;
  var W=340,H=110,pad=12;
  var x=function(day){return pad+(W-2*pad)*(Math.min(day,days)/days);};
  var y=function(str){return pad+(H-2*pad)*(1-str/100);};
  var pts=[],day=0;
  asc.forEach(function(a){
    var itv=a.interval_days; var nd=(itv&&itv>0)?itv:1;
    var end=Math.min(day+nd,days);
    pts.push([x(day),y(100),a.result]);  // review point: strength back to 100%
    if(end>day)pts.push([x(end),y(50),null]);  // decays to 50% at next due
    day=end;
  });
  var path='M'+pts[0][0].toFixed(1)+' '+pts[0][1].toFixed(1);
  for(var i=1;i<pts.length;i++)path+=' L'+pts[i][0].toFixed(1)+' '+pts[i][1].toFixed(1);
  var svg='<svg width="'+W+'" height="'+H+'" viewBox="0 0 '+W+' '+H+'" xmlns="http://www.w3.org/2000/svg">';
  svg+='<line x1="'+pad+'" y1="'+y(50).toFixed(1)+'" x2="'+(W-pad)+'" y2="'+y(50).toFixed(1)+'" stroke="#ccd4e0" stroke-dasharray="4 3"/>';
  svg+='<path d="'+path+'" fill="none" stroke="#1d5fd6" stroke-width="2" stroke-linejoin="round"/>';
  pts.forEach(function(p){ if(p[2]){ svg+='<circle cx="'+p[0].toFixed(1)+'" cy="'+p[1].toFixed(1)+'" r="3.5" fill="#1d5fd6"><title>'+escapeHtml(p[2])+'</title></circle>'; } });
  svg+='</svg>';
  return el('div','mem-wrap',svg);
}
function openEditForm(card,it){
  var old=card.querySelector('.lib-editform');
  if(old)old.remove();
  var wrap=el('div','lib-editform');
  wrap.appendChild(el('h3',null,tpl(t('library.editTitle'),{n:it.id})));
  var st={subject:it.subject,topics:splitMulti(it.topic),error:it.error_type,qtype:it.question_type,
          note:it.note||'',retro:it.retro||'',answer:it.answer_text||'',source:it.source||'',
          imgQ:it.image_path||'',imgA:it.answer_image_path||''};
  wrap.appendChild(el('label',null,t('library.fieldSubject')));
  var sg=el('div','subj-group');
  SUBJ.forEach(function(s){
    var b=el('button','subj-btn'+(st.subject===s?' active':''),t('subjects.'+s,s));
    b.onclick=(function(s,b){return function(){st.subject=s;var bs=sg.querySelectorAll('.subj-btn');for(var i=0;i<bs.length;i++)bs[i].classList.remove('active');b.classList.add('active');renderTopicSlot();};})(s,b);
    sg.appendChild(b);
  });
  wrap.appendChild(sg);
  wrap.appendChild(el('label',null,t('library.fieldTopic')+(st.topics.length?'：'+tpl(t('entry.topicCount'),{n:st.topics.length,max:3}):'')));
  var topicSlot=el('div');wrap.appendChild(topicSlot);
  function toggleEditTopic(tid){
    var i=st.topics.indexOf(tid);
    if(i>=0){st.topics.splice(i,1);}
    else if(st.topics.length<3){st.topics.push(tid);}
    else{toast(t('entry.maxTopics'));}
  }
  function renderTopicSlot(){
    topicSlot.innerHTML='';
    var chs=(TOPICS[st.subject]&&TOPICS[st.subject].chapters)||[];
    if(!chs.length){topicSlot.appendChild(el('div','muted',t('entry.noSubject')));return;}
    chs.forEach(function(ch){
      var hasSel=ch.topics.some(function(tp){return st.topics.indexOf(tp.id)>=0;});
      var body=el('div','chapter-body'+(hasSel?'':' closed'));
      ch.topics.forEach(function(tp){
        var itm=el('div','topic-item'+(st.topics.indexOf(tp.id)>=0?' active':''),tp.label);
        itm.onclick=(function(tp){return function(){toggleEditTopic(tp.id);renderTopicSlot();};})(tp);
        body.appendChild(itm);
      });
      var head=el('div','chapter-head'+(hasSel?' open':''),'<span>'+ch.name+'</span><span class="n">'+ch.topics.length+'</span>');
      head.onclick=(function(body,head){return function(){body.classList.toggle('closed');head.classList.toggle('open');};})(body,head);
      var c=el('div','chapter');c.appendChild(head);c.appendChild(body);topicSlot.appendChild(c);
    });
  }
  var qtypeWrap=customSelect(qtypesFor(st.subject),'questionTypes','entry.qtypeCustom');
  var errorWrap=customSelect(ETYPE,'errorTypes','entry.errorCustom');
  preselect2(qtypeWrap,qtypeWrap.querySelector('select'),qtypesFor(st.subject),st.qtype);
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
  wrap.appendChild(el('label',null,t('library.fieldRetro')));
  var retroEl=el('textarea');retroEl.value=st.retro;wrap.appendChild(retroEl);
  wrap.appendChild(el('label',null,t('library.fieldAnswerText')));
  var ansEl=el('input');ansEl.type='text';ansEl.value=st.answer;wrap.appendChild(ansEl);
  wrap.appendChild(el('label',null,t('library.fieldSource')));
  var srcEl=el('input');srcEl.type='text';srcEl.value=st.source;wrap.appendChild(srcEl);
  wrap.appendChild(el('label',null,t('library.fieldQImage')));
  var qHolder={get val(){return st.imgQ;},set val(v){st.imgQ=v;}};
  var qpicker=makeEditImagePicker(qHolder,it.image_missing,function(v){st.imgQ=v;});
  wrap.appendChild(qpicker);
  wrap.appendChild(el('label',null,t('library.fieldAImage')));
  var aHolder={get val(){return st.imgA;},set val(v){st.imgA=v;}};
  var apicker=makeEditImagePicker(aHolder,it.answer_image_missing,function(v){st.imgA=v;});
  wrap.appendChild(apicker);
  var metaNote=el('div','muted');metaNote.textContent=tpl(t('library.metaTpl'),{s:it.state,n:it.streak||0,e:(it.ease||0).toFixed(1),i:it.interval_days||0,d:it.due_date||''});
  wrap.appendChild(metaNote);
  var acts=el('div','actions');
  var cancel=el('button','ghost',t('library.btnCancel'));
  cancel.onclick=function(){card.querySelector('.lib-editform').remove();};
  var save=el('button','primary',t('library.btnSave'));
  save.onclick=function(){
    var tids=capArr(st.topics,3);
    var body={subject:st.subject,topic:joinMulti(tids),
      topic_label:joinMulti(tids.map(function(t){return topicLabel(st.subject,t)||t;})),
      error_type:selValue(errorWrap),question_type:selValue(qtypeWrap),
      note:noteEl.value,retro:retroEl.value,answer_text:ansEl.value,source:srcEl.value,
      image_path:st.imgQ||'',answer_image_path:st.imgA||''};
    if(!st.subject){toast(t('entry.noSubject'));return;}
    if(!tids.length){toast(t('entry.noTopic'));return;}
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
function makeEditImagePicker(holder,isMissing,cb){
  // v1.2: holder = {val: ';'-joined path string}; cb(newJoined) called on upload (append).
  var wrap=el('div','edit-picker');
  var dz=el('div','dropzone',t('entry.pasteHint'));
  var btns=el('div','img-buttons');
  var camInp=el('input');camInp.type='file';camInp.accept='image/*';camInp.style.display='none';  // no capture
  var albumInp=el('input');albumInp.type='file';albumInp.accept='image/*';albumInp.multiple='multiple';albumInp.style.display='none';
  var camBtn=el('button','ghost',t('entry.takePhoto'));
  var albumBtn=el('button','ghost',t('entry.chooseAlbum'));
  camBtn.onclick=function(){camInp.click();};
  albumBtn.onclick=function(){albumInp.click();};
  btns.appendChild(camBtn);btns.appendChild(albumBtn);
  wrap.appendChild(dz);wrap.appendChild(btns);wrap.appendChild(camInp);wrap.appendChild(albumInp);
  function showCurrent(){
    var paths=splitMulti(holder.val);
    if(!paths.length){dz.className='dropzone';dz.textContent=t('entry.pasteHint');return;}
    dz.className='dropzone filled'+(isMissing?' missing':'');dz.innerHTML='';
    var stk=el('div','img-stack');
    paths.forEach(function(p){var im=el('img');im.src=p;im.onclick=function(ev){ev.stopPropagation();showLightbox(p);};stk.appendChild(im);});
    dz.appendChild(stk);
    if(isMissing){dz.appendChild(el('div','broken-hint',t('library.brokenImage')));}
    var rm=el('button','dz-remove',t('entry.removeImage'));
    rm.onclick=function(ev){ev.stopPropagation();holder.val='';isMissing=false;cb('');showCurrent();};
    dz.appendChild(rm);
  }
  function handleFiles(files){
    files=(files||[]);var list=[];
    for(var i=0;i<files.length;i++){if(files[i]&&files[i].type&&files[i].type.indexOf('image')===0)list.push(files[i]);}
    if(!list.length)return;
    if(splitMulti(holder.val).length+list.length>5){toast(t('entry.maxImages'));list=capArr(list,5-splitMulti(holder.val).length);}
    list.forEach(function(f){
      dz.textContent=t('entry.uploading');
      uploadImage(f,'q',function(path){
        holder.val=joinMulti(capArr(splitMulti(holder.val).concat([path]),5));
        isMissing=false;cb(holder.val);showCurrent();
      });
    });
  }
  camInp.onchange=function(){if(camInp.files&&camInp.files.length)handleFiles([camInp.files[0]]);camInp.value='';};
  albumInp.onchange=function(){if(albumInp.files)handleFiles(Array.prototype.slice.call(albumInp.files));albumInp.value='';};
  dz.addEventListener('dragover',function(e){e.preventDefault();dz.classList.add('over');});
  dz.addEventListener('dragleave',function(){dz.classList.remove('over');});
  dz.addEventListener('drop',function(e){e.preventDefault();dz.classList.remove('over');var dt=e.dataTransfer;if(dt&&dt.files)handleFiles(Array.prototype.slice.call(dt.files));});
  dz.addEventListener('paste',function(e){var items=(e.clipboardData||{}).items||[];for(var i=0;i<items.length;i++){if(items[i].type.indexOf('image')===0){e.preventDefault();handleFiles([items[i].getAsFile()]);return;}}});
  dz.tabIndex=0;
  showCurrent();
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
      uploadImage(f,'q',function(path){entryImg.q=capArr(entryImg.q.concat([path]),5);renderEntry();});
      return;
    }
  }
});

// ---- boot ----
fetch('/web/i18n.json?v='+Date.now()).then(function(r){return r.json();}).then(function(d){merge(I18N,d);document.getElementById('title').textContent=I18N.appTitle||'xinmo';renderTabs();setTab('entry');}).catch(function(){renderTabs();setTab('entry');});
})();