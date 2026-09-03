// v1.11 starmap: 3D knowledge star map on a celestial sphere.
// ESM module; loaded via dynamic import() from app.js setTab.
// Requires importmap in index.html mapping 'three' and 'three/addons/'.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/OrbitControls.js';

const R = 100;
const TIER_COLORS = { r: '#e05252', o: '#e8942a', y: '#e0c832', g: '#3aa855' };
const SUBJ = (typeof window !== 'undefined' && window.SUBJ) || ['physics','chemistry','geography','chinese','math','english'];
const SUBJ_LABEL = { physics: '物理', chemistry: '化学', geography: '地理', chinese: '语文', math: '数学', english: '英语' };

// ---- module state ----
let scene, camera, renderer, controls;
let starSprites = [];
let starMap = {};
let animId = null;
let mode = 'outside';
let animating = false;
let animStart = 0;
let animFrom = {};
let animTo = {};
let animDuration = 1000;
let fovCurrent = 60;
let canvasEl, container;
let hoverEl, popupEl, counterEl, toggleBtn;
let raycaster, mouse;
let isActive = false;
let starGroup;
let disposed = false;

// ---- helpers ----
function toRad(d) { return d * Math.PI / 180; }
function toDeg(r) { return r * 180 / Math.PI; }

function treeTier(it) {
  if (it.state === 'refined') return 'g';
  var i = it.interval_days || 0;
  if (i <= 1) return 'r';
  if (i <= 8) return 'o';
  if (i < 24) return 'y';
  return 'g';
}

function starWorldPos(item, si, ti, tc, ii, ic) {
  var lon = si * 60 + (ii + 0.5) / ic * 55;
  var lat;
  if (tc === 1) { lat = 0; }
  else { lat = 55 - ti * (110 / (tc - 1)); }
  var r = R * (1 + ((item.id * 37) % 7) / 100);
  var phi = Math.PI / 2 - toRad(lat);
  var theta = toRad(lon);
  return new THREE.Vector3().setFromSpherical(new THREE.Spherical(r, phi, theta));
}

function createStarTexture(tier, size) {
  var c = document.createElement('canvas');
  c.width = c.height = size;
  var ctx = c.getContext('2d');
  var cx = size / 2, color = TIER_COLORS[tier];
  var grad = ctx.createRadialGradient(cx, cx, cx * 0.05, cx, cx, cx);
  grad.addColorStop(0, '#ffffff');
  grad.addColorStop(0.15, color);
  grad.addColorStop(0.5, color);
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(c);
}

function createGlowTexture(tier, size) {
  var c = document.createElement('canvas');
  c.width = c.height = size;
  var ctx = c.getContext('2d');
  var cx = size / 2, color = TIER_COLORS[tier];
  var grad = ctx.createRadialGradient(cx, cx, cx * 0.1, cx, cx, cx);
  grad.addColorStop(0, color);
  grad.addColorStop(0.4, color);
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(c);
}

function createLabelTexture(text) {
  var c = document.createElement('canvas');
  c.width = 256; c.height = 64;
  var ctx = c.getContext('2d');
  ctx.fillStyle = '#8899bb';
  ctx.font = '22px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 128, 32);
  return new THREE.CanvasTexture(c);
}

function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

// ---- main entry ----
export function renderStarmap() {
  var page = document.getElementById('page-starmap');
  if (!page) return;
  if (disposed) { disposed = false; }
  page.innerHTML = '';
  isActive = true;

  // WebGL availability check
  try {
    var testCanvas = document.createElement('canvas');
    var gl = testCanvas.getContext('webgl') || testCanvas.getContext('experimental-webgl');
    if (!gl) throw new Error('no webgl');
  } catch (e) {
    page.innerHTML = '<div style="padding:40px;text-align:center;color:#889;">' +
      (window.I18N && window.I18N.starmap ? window.I18N.starmap.webglMissing : 'WebGL not available') +
      '<br><br><button class="primary" onclick="(function(){var t=document.querySelectorAll(\'.tab\');var ti=[...t].findIndex(function(b){return b.textContent.indexOf(\'知识树\')>=0;});if(ti>=0)t[ti].click();})()">' +
      (window.I18N && window.I18N.starmap ? window.I18N.starmap.goTree : 'Go to 2D tree') +
      '</button></div>';
    return;
  }

  // scene setup
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0a0a14);

  // camera
  camera = new THREE.PerspectiveCamera(60, 1, 1, 1000);
  camera.position.set(0, 0, 260);
  fovCurrent = 60;

  // renderer
  canvasEl = document.createElement('canvas');
  canvasEl.style.display = 'block';
  canvasEl.style.width = '100%';
  canvasEl.style.height = '100%';
  renderer = new THREE.WebGLRenderer({ canvas: canvasEl, antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  container = document.createElement('div');
  container.className = 'starmap-container';
  container.appendChild(canvasEl);
  page.appendChild(container);

  // HUD overlay
  counterEl = document.createElement('div');
  counterEl.className = 'starmap-counter';
  var counterTpl = (window.I18N && window.I18N.starmap && window.I18N.starmap.counter) || '已亮 %d / 65';
  counterEl.textContent = counterTpl.replace('%d', '0');
  container.appendChild(counterEl);

  toggleBtn = document.createElement('button');
  toggleBtn.className = 'starmap-toggle';
  toggleBtn.textContent = (window.I18N && window.I18N.starmap && window.I18N.starmap.inside) || '球内';
  toggleBtn.onclick = toggleMode;
  container.appendChild(toggleBtn);

  hoverEl = document.createElement('div');
  hoverEl.className = 'starmap-hover';
  hoverEl.style.display = 'none';
  container.appendChild(hoverEl);

  popupEl = document.createElement('div');
  popupEl.className = 'tree-pop';
  popupEl.style.display = 'none';
  popupEl.style.position = 'absolute';
  container.appendChild(popupEl);

  // raycaster
  raycaster = new THREE.Raycaster();
  mouse = new THREE.Vector2();

  // OrbitControls for outside mode
  controls = new OrbitControls(camera, canvasEl);
  controls.target.set(0, 0, 0);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 150;
  controls.maxDistance = 400;
  controls.rotateSpeed = 0.6;
  controls.zoomSpeed = 1.0;
  controls.enablePan = false;
  controls.update();

  // reference sphere (wireframe, low opacity)
  var sphereGeom = new THREE.SphereGeometry(R, 48, 24);
  var sphereMat = new THREE.MeshBasicMaterial({ color: 0x334466, wireframe: true, transparent: true, opacity: 0.12, depthTest: true, depthWrite: false });
  var sphereMesh = new THREE.Mesh(sphereGeom, sphereMat);
  scene.add(sphereMesh);

  // star group
  starGroup = new THREE.Group();
  scene.add(starGroup);
  starSprites = [];
  starMap = {};

  // lights (for reference sphere, not really needed for sprites)
  scene.add(new THREE.AmbientLight(0x222244));

  // fetch data and build stars
  fetch('/api/kentry').then(function (r) { return r.json(); }).then(function (d) {
    buildStars(d.items || []);
    drawSectorArcs();
    drawSubjectLabels();
    updateCounter();
    resize();
    startLoop();
  }).catch(function () {
    container.innerHTML = '<div style="padding:40px;text-align:center;color:#c44;">load failed</div>';
  });

  // events
  canvasEl.addEventListener('mousemove', onMouseMove);
  canvasEl.addEventListener('click', onClick);
  canvasEl.addEventListener('touchstart', onTouchStart, { passive: false });
  canvasEl.addEventListener('wheel', onWheel, { passive: false });
  attachInsideControls(canvasEl);
  window.addEventListener('resize', resize);
}

// ---- build stars ----
function buildStars(items) {
  // group by subject (SUBJ order), then tag (sorted), then id (asc)
  var groups = {};
  items.forEach(function (it) {
    var s = it.subject || 'unknown';
    if (!groups[s]) groups[s] = [];
    groups[s].push(it);
  });

  var subjs = SUBJ.filter(function (s) { return groups[s] && groups[s].length; });
  subjs.forEach(function (s, si) {
    var tagMap = {};
    groups[s].forEach(function (it) {
      var t = it.topic_label || '#other';
      if (!tagMap[t]) tagMap[t] = [];
      tagMap[t].push(it);
    });
    var tags = Object.keys(tagMap).sort();
    tags.forEach(function (tag, ti) {
      var items = tagMap[tag].sort(function (a, b) { return a.id - b.id; });
      items.forEach(function (it, ii) {
        var tier = treeTier(it);
        var pos = starWorldPos(it, si, ti, tags.length, ii, items.length);

        // main star sprite
        var texSize = tier === 'g' ? 64 : (tier === 'r' ? 32 : 40);
        var tex = createStarTexture(tier, texSize);
        var mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending });
        var sprite = new THREE.Sprite(mat);
        sprite.position.copy(pos);
        sprite.scale.set(tier === 'g' ? 8 : (tier === 'r' ? 4 : 5.5), tier === 'g' ? 8 : (tier === 'r' ? 4 : 5.5), 1);
        sprite.userData = { id: it.id, tier: tier, baseScale: tier === 'g' ? 8 : (tier === 'r' ? 4 : 5.5), item: it };
        starGroup.add(sprite);

        var starObj = { id: it.id, sprite: sprite, glowSprite: null, pos: pos.clone(), tier: tier, item: it };

        // glow ring for g tier
        if (tier === 'g') {
          var glowTex = createGlowTexture(tier, 128);
          var glowMat = new THREE.SpriteMaterial({ map: glowTex, transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.5 });
          var glowSprite = new THREE.Sprite(glowMat);
          glowSprite.position.copy(pos);
          glowSprite.scale.set(16, 16, 1);
          starGroup.add(glowSprite);
          starObj.glowSprite = glowSprite;
        }

        starSprites.push(starObj);
        starMap[it.id] = starObj;
      });
    });
  });
}

// ---- sector arcs and labels ----
function drawSectorArcs() {
  SUBJ.forEach(function (s, si) {
    var lonStart = si * 60;
    var lonEnd = si * 60 + 55;
    var pts = [];
    for (var a = 0; a <= 32; a++) {
      var lon = lonStart + (a / 32) * (lonEnd - lonStart);
      var phi = Math.PI / 2;
      var theta = toRad(lon);
      pts.push(new THREE.Vector3().setFromSpherical(new THREE.Spherical(R * 1.01, phi, theta)));
    }
    var geom = new THREE.BufferGeometry().setFromPoints(pts);
    var mat = new THREE.LineBasicMaterial({ color: 0x334466, transparent: true, opacity: 0.25 });
    scene.add(new THREE.Line(geom, mat));
  });
}

function drawSubjectLabels() {
  SUBJ.forEach(function (s, si) {
    var lon = si * 60 + 27.5;
    var phi = Math.PI / 2;
    var theta = toRad(lon);
    var pos = new THREE.Vector3().setFromSpherical(new THREE.Spherical(R * 1.18, phi, theta));
    var tex = createLabelTexture(SUBJ_LABEL[s] || s);
    var mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false, opacity: 0.6 });
    var sprite = new THREE.Sprite(mat);
    sprite.position.copy(pos);
    sprite.scale.set(36, 9, 1);
    scene.add(sprite);
  });
}

// ---- camera modes ----
function toggleMode() {
  if (animating) return;
  animating = true;
  animStart = performance.now();
  animFrom.cameraPos = camera.position.clone();
  animFrom.target = controls.target.clone();
  animFrom.fov = fovCurrent;

  if (mode === 'outside') {
    mode = 'inside';
    animTo.cameraPos = new THREE.Vector3(0, 0, 0);
    animTo.target = new THREE.Vector3(0, 0, 1);
    animTo.fov = 75;
    toggleBtn.textContent = (window.I18N && window.I18N.starmap && window.I18N.starmap.outside) || '球外';
    controls.enableZoom = false;
    controls.enableRotate = false;
  } else {
    mode = 'outside';
    animTo.cameraPos = new THREE.Vector3(0, 0, 260);
    animTo.target = new THREE.Vector3(0, 0, 0);
    animTo.fov = 60;
    toggleBtn.textContent = (window.I18N && window.I18N.starmap && window.I18N.starmap.inside) || '球内';
    controls.enableZoom = true;
    controls.enableRotate = true;
  }
}

function updateCameraAnimation(now) {
  if (!animating) return;
  var t = Math.min(1, (now - animStart) / animDuration);
  var e = easeInOutCubic(t);
  camera.position.lerpVectors(animFrom.cameraPos, animTo.cameraPos, e);
  controls.target.lerpVectors(animFrom.target, animTo.target, e);
  fovCurrent = animFrom.fov + (animTo.fov - animFrom.fov) * e;
  camera.fov = fovCurrent;
  camera.updateProjectionMatrix();
  if (t >= 1) {
    animating = false;
    if (mode === 'inside') {
      camera.position.set(0, 0, 0);
      controls.target.set(0, 0, 1);
      fovCurrent = 75;
      camera.fov = 75;
      camera.updateProjectionMatrix();
    } else {
      controls.enableZoom = true;
      controls.enableRotate = true;
      controls.minDistance = 150;
      controls.maxDistance = 400;
    }
  }
}

// ---- inside mode manual rotation ----
var insideYaw = 0, insidePitch = 0;
var pointerDown = false, lastPointer = { x: 0, y: 0 };

function onMouseMove(ev) {
  if (mode === 'inside' && !animating && pointerDown) {
    var dx = ev.clientX - lastPointer.x;
    var dy = ev.clientY - lastPointer.y;
    insideYaw -= dx * 0.005;
    insidePitch -= dy * 0.005;
    insidePitch = Math.max(-Math.PI / 2.1, Math.min(Math.PI / 2.1, insidePitch));
    lastPointer.x = ev.clientX;
    lastPointer.y = ev.clientY;
    updateInsideCamera();
  }

  // hover detection
  var rect = canvasEl.getBoundingClientRect();
  mouse.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(mouse, camera);

  var hits = [];
  starSprites.forEach(function (s) {
    var dist = raycaster.ray.distanceToPoint(s.pos);
    var threshold = mode === 'inside' ? 8 : 5;
    if (dist < threshold) hits.push({ star: s, dist: dist });
  });
  hits.sort(function (a, b) { return a.dist - b.dist; });

  if (hits.length) {
    var it = hits[0].star.item;
    hoverEl.textContent = (it.note || '').slice(0, 14);
    hoverEl.style.display = 'block';
    hoverEl.style.left = (ev.clientX - container.getBoundingClientRect().left + 14) + 'px';
    hoverEl.style.top = (ev.clientY - container.getBoundingClientRect().top - 20) + 'px';
    canvasEl.style.cursor = 'pointer';
  } else {
    hoverEl.style.display = 'none';
    canvasEl.style.cursor = mode === 'inside' && pointerDown ? 'grabbing' : (mode === 'inside' ? 'grab' : '');
  }
}

function onClick(ev) {
  if (popupEl.style.display !== 'none') { closePopup(); return; }
  var rect = canvasEl.getBoundingClientRect();
  mouse.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(mouse, camera);

  var best = null, bestDist = Infinity;
  starSprites.forEach(function (s) {
    var dist = raycaster.ray.distanceToPoint(s.pos);
    var threshold = mode === 'inside' ? 8 : 5;
    if (dist < threshold && dist < bestDist) { best = s; bestDist = dist; }
  });
  if (best) showPopup(best.item);
}

function showPopup(it) {
  var t = window.I18N && window.I18N.tree ? window.I18N.tree : {};
  var leftKey = t.popLeft || '提示';
  var rightKey = t.popRight || '答案';
  var dueKey = t.popDue || '下次到期';
  popupEl.innerHTML = '<div class="tree-pop-close">×</div>' +
    '<div class="tree-pop-label">' + leftKey + ': ' + escHtml(it.note || '') + '</div>' +
    '<div class="tree-pop-label">' + rightKey + ': ' + escHtml(it.answer_text || '') + '</div>' +
    '<div class="tree-pop-label">' + dueKey + ': ' + (it.due_date || '') + '</div>';
  popupEl.style.display = 'block';
  popupEl.querySelector('.tree-pop-close').onclick = closePopup;
}

function closePopup() {
  popupEl.style.display = 'none';
}

function escHtml(s) {
  return ('' + s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ---- inside mode controls (attached inside renderStarmap) ----
function attachInsideControls(el) {
  el.addEventListener('pointerdown', function (ev) {
    if (mode !== 'inside' || animating) return;
    pointerDown = true;
    lastPointer.x = ev.clientX;
    lastPointer.y = ev.clientY;
    el.style.cursor = 'grabbing';
  });
  el.addEventListener('pointerup', function () {
    pointerDown = false;
    if (mode === 'inside') el.style.cursor = 'grab';
  });
  el.addEventListener('pointerleave', function () {
    pointerDown = false;
  });
}

function onTouchStart(ev) {
  if (mode !== 'inside' || animating) return;
  if (ev.touches.length === 1) {
    pointerDown = true;
    lastPointer.x = ev.touches[0].clientX;
    lastPointer.y = ev.touches[0].clientY;
  }
}

function onWheel(ev) {
  if (mode !== 'inside' || animating) return;
  ev.preventDefault();
  fovCurrent += ev.deltaY * 0.05;
  fovCurrent = Math.max(45, Math.min(90, fovCurrent));
  camera.fov = fovCurrent;
  camera.updateProjectionMatrix();
}

function updateInsideCamera() {
  if (mode !== 'inside') return;
  var dir = new THREE.Vector3(
    Math.cos(insidePitch) * Math.sin(insideYaw),
    Math.sin(insidePitch),
    Math.cos(insidePitch) * Math.cos(insideYaw)
  );
  controls.target.copy(dir);
  controls.update();
}

// ---- render loop ----
function startLoop() {
  function loop(now) {
    animId = requestAnimationFrame(loop);
    if (!isActive) return;

    if (animating) updateCameraAnimation(now);

    if (mode === 'outside' && !animating) {
      controls.update();
    }

    resizeRenderer();

    // update star opacity based on camera distance (near bright, far dim)
    var camDir = new THREE.Vector3();
    camera.getWorldDirection(camDir);
    starSprites.forEach(function (s) {
      if (mode === 'outside') {
        var toStar = s.pos.clone().sub(camera.position).normalize();
        var dot = toStar.dot(camDir);
        var opacity = 0.25 + 0.75 * Math.max(0, (dot + 0.4) / 1.4);
        s.sprite.material.opacity = Math.min(1, opacity);
        if (s.glowSprite) s.glowSprite.material.opacity = Math.min(0.5, opacity * 0.5);
      } else {
        s.sprite.material.opacity = 1;
        if (s.glowSprite) s.glowSprite.material.opacity = 0.5;
      }
    });

    renderer.render(scene, camera);
  }
  animId = requestAnimationFrame(loop);
}

function resizeRenderer() {
  var w = container.clientWidth;
  var h = container.clientHeight;
  if (w <= 0 || h <= 0) return;
  if (renderer.domElement.width !== w * Math.min(window.devicePixelRatio, 2) || renderer.domElement.height !== h * Math.min(window.devicePixelRatio, 2)) {
    renderer.setSize(w, h, false);
    camera.aspect = w / Math.max(1, h);
    camera.updateProjectionMatrix();
  }
}

function resize() {
  resizeRenderer();
}

// ---- counter ----
function updateCounter() {
  var lit = 0;
  starSprites.forEach(function (s) { if (s.tier !== 'r') lit++; });
  var tpl = (window.I18N && window.I18N.starmap && window.I18N.starmap.counter) || '已亮 %d / 65';
  counterEl.textContent = tpl.replace('%d', String(lit));
}

// ---- CDP inspection helpers ----
window.__starPositions = function () {
  var result = {};
  starSprites.forEach(function (s) { result[s.id] = [s.pos.x, s.pos.y, s.pos.z]; });
  return result;
};
window.__starCount = function () { return starSprites.length; };
window.__starTiers = function () {
  var t = { r: 0, o: 0, y: 0, g: 0 };
  starSprites.forEach(function (s) { t[s.tier]++; });
  return t;
};
window.__cameraState = function () {
  return {
    pos: [camera.position.x, camera.position.y, camera.position.z],
    fov: camera.fov,
    mode: mode
  };
};
window.__clickStar = function (id) {
  var s = starMap[id];
  if (s) showPopup(s.item);
};
window.__counterText = function () { return counterEl ? counterEl.textContent : null; };
window.__sceneReady = function () { return starSprites.length > 0; };

// ---- cleanup ----
export function stopStarmap() {
  isActive = false;
  if (animId) { cancelAnimationFrame(animId); animId = null; }
  if (controls) { controls.dispose(); controls = null; }
  if (renderer) { renderer.dispose(); renderer = null; }
  if (scene) { scene = null; }
  starSprites = [];
  starMap = {};
  disposed = true;
}