/* Ú òa – điều khiển: WASD + chuột (Roblox: giữ chuột phải để xoay, hoặc khóa chuột), cảm ứng (cần ảo + vuốt xoay). */
(function (UO) {
  'use strict';
  const keys = new Set();
  const I = { turn: 0, move: { x: 0, y: 0 }, sprint: false, crouch: false, proneOn: false, studio: false, fire: false, sens: 0.0042, touch: false, cb: {}, locked: false, enabled: false };
  let canvas = null, rmb = false, lastX = 0, lastY = 0, joyId = null, lookId = null, joyC = { x: 0, y: 0 }, lookLast = { x: 0, y: 0 };
  const btn = { fire: false, sprint: false, crouch: false, turnL: false, turnR: false };
  const setProne = (v) => { I.proneOn = v; const b = document.querySelector('#bProne'); if (b) b.classList.toggle('on', v); };
  I.setProne = setProne;
  const $ = (s) => document.querySelector(s);

  function recompute() {
    let x = 0, y = 0;
    if (keys.has('KeyW') || keys.has('ArrowUp')) y += 1; if (keys.has('KeyS') || keys.has('ArrowDown')) y -= 1;
    if (keys.has('KeyD') || keys.has('ArrowRight')) x += 1; if (keys.has('KeyA') || keys.has('ArrowLeft')) x -= 1;
    if (I.joy) { x += I.joy.x; y += I.joy.y; }
    const l = Math.hypot(x, y); if (l > 1) { x /= l; y /= l; }
    I.move.x = x; I.move.y = y;
    I.sprint = keys.has('ShiftLeft') || keys.has('ShiftRight') || btn.sprint;
    I.crouch = keys.has('KeyC') || keys.has('ControlLeft') || btn.crouch;
    I.turn = (keys.has('BracketLeft') || btn.turnL ? 1 : 0) - (keys.has('BracketRight') || btn.turnR ? 1 : 0);            // xoay người tại chỗ ([ trái, ] phải)
  }
  I.init = function (cv) {
    canvas = cv; I.touch = ('ontouchstart' in window) || navigator.maxTouchPoints > 0; document.body.classList.toggle('touch', I.touch);
    window.addEventListener('keydown', (e) => {
      if (e.target && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
      if (e.code === 'Space' || e.code.startsWith('Arrow')) { if (I.enabled) e.preventDefault(); }
      if (I.studio && (e.ctrlKey || e.metaKey) && e.code === 'KeyZ') { e.preventDefault(); if (e.shiftKey) I.cb.redo && I.cb.redo(); else I.cb.undo && I.cb.undo(); return; }
      if (I.studio && (e.ctrlKey || e.metaKey) && e.code === 'KeyY') { e.preventDefault(); I.cb.redo && I.cb.redo(); return; }
      if (I.enabled && !e.repeat) {                                                      // thu phóng bằng bàn phím (không để trình duyệt zoom cả trang)
        if (e.code === 'Equal' || e.code === 'NumpadAdd') { e.preventDefault(); I.cb.zoom && I.cb.zoom(-1.2); }
        else if (e.code === 'Minus' || e.code === 'NumpadSubtract') { e.preventDefault(); I.cb.zoom && I.cb.zoom(1.2); }
        else if (e.code === 'Digit0' || e.code === 'Numpad0') { e.preventDefault(); I.cb.zoomReset && I.cb.zoomReset(); }
      }
      if ((e.ctrlKey || e.metaKey) && I.enabled && (e.code === 'Equal' || e.code === 'Minus' || e.code === 'Digit0')) e.preventDefault();
      if (e.repeat) return; keys.add(e.code); recompute();
      if (e.code === 'KeyZ' && I.enabled && !I.studio && !e.ctrlKey && !e.metaKey) setProne(!I.proneOn);
      else if (I.proneOn && (e.code === 'ShiftLeft' || e.code === 'ShiftRight' || e.code === 'KeyC')) setProne(false);   // đứng dậy
      if (e.code === 'Space' || e.code === 'KeyF') { I.fire = true; }
      if (e.code === 'KeyE' && I.cb.paint) I.cb.paint();
      if (e.code === 'KeyQ' && I.cb.lock) I.cb.lock();
      if (e.code === 'Escape' && I.cb.pause) I.cb.pause();
    });
    window.addEventListener('keyup', (e) => { keys.delete(e.code); recompute(); if (e.code === 'Space' || e.code === 'KeyF') I.fire = false; });
    window.addEventListener('blur', () => { keys.clear(); I.fire = false; rmb = false; recompute(); });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('mousedown', (e) => {
      if (!I.enabled) return;
      if (I.studio) { if (e.button === 2) { rmb = true; lastX = e.clientX; lastY = e.clientY; } return; }
      if (e.button === 2) { rmb = true; lastX = e.clientX; lastY = e.clientY; }
      else if (e.button === 0) { if (I.cb.click) I.cb.click(); I.fire = true; lastX = e.clientX; lastY = e.clientY; I.dragL = true; }
    });
    window.addEventListener('mouseup', (e) => { if (e.button === 2) rmb = false; if (e.button === 0) { I.fire = false; I.dragL = false; } });
    window.addEventListener('mousemove', (e) => {
      if (!I.enabled) return;
      if (I.locked) { I.cb.look && I.cb.look(e.movementX, e.movementY); return; }
      if (rmb) { I.cb.look && I.cb.look(e.clientX - lastX, e.clientY - lastY); lastX = e.clientX; lastY = e.clientY; }
    });
    canvas.addEventListener('wheel', (e) => { if (I.enabled && I.cb.zoom) { I.cb.zoom(Math.sign(e.deltaY) * 0.6); e.preventDefault(); } }, { passive: false });
    window.addEventListener('wheel', (e) => { if (I.enabled && e.ctrlKey) { e.preventDefault(); I.cb.zoom && I.cb.zoom(Math.sign(e.deltaY) * 0.6); } }, { passive: false });   // Ctrl+cuộn trên bảng màu cũng chỉ zoom cảnh, không zoom cả trang
    document.addEventListener('gesturestart', (e) => { if (I.enabled) e.preventDefault(); });
    document.addEventListener('pointerlockchange', () => { I.locked = document.pointerLockElement === canvas; document.body.classList.toggle('locked', I.locked); if (!I.locked && I.cb.unlocked) I.cb.unlocked(); });
    // ----- cảm ứng
    const joy = $('#joy'), knob = $('#joyKnob');
    const R = 52;
    function joyMove(t) {
      let dx = t.clientX - joyC.x, dy = t.clientY - joyC.y; const l = Math.hypot(dx, dy); if (l > R) { dx = dx / l * R; dy = dy / l * R; }
      knob.style.transform = 'translate(' + dx + 'px,' + dy + 'px)'; I.joy = { x: dx / R, y: -dy / R }; recompute();
    }
    if (joy) {
      joy.addEventListener('touchstart', (e) => { e.preventDefault(); const t = e.changedTouches[0]; joyId = t.identifier; const r = joy.getBoundingClientRect(); joyC = { x: r.left + r.width / 2, y: r.top + r.height / 2 }; joyMove(t); }, { passive: false });
      joy.addEventListener('touchmove', (e) => { e.preventDefault(); for (const t of e.changedTouches) if (t.identifier === joyId) joyMove(t); }, { passive: false });
      const end = (e) => { for (const t of e.changedTouches) if (t.identifier === joyId) { joyId = null; I.joy = null; knob.style.transform = ''; recompute(); } };
      joy.addEventListener('touchend', end); joy.addEventListener('touchcancel', end);
    }
    let pinch = null; const tdist = (a, b) => Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
    canvas.addEventListener('touchstart', (e) => {
      if (!I.enabled) return;
      if (e.touches.length === 2) { pinch = tdist(e.touches[0], e.touches[1]); lookId = null; return; }        // hai ngón: thu phóng
      if (I.studio) return; for (const t of e.changedTouches) if (lookId == null) { lookId = t.identifier; lookLast = { x: t.clientX, y: t.clientY }; }
    }, { passive: true });
    canvas.addEventListener('touchmove', (e) => {
      if (e.touches.length === 2 && pinch != null) { const d = tdist(e.touches[0], e.touches[1]); I.cb.zoom && I.cb.zoom((pinch - d) * 0.02); pinch = d; e.preventDefault(); return; }
      if (!I.studio) for (const t of e.changedTouches) if (t.identifier === lookId) { I.cb.look && I.cb.look((t.clientX - lookLast.x) * 1.5, (t.clientY - lookLast.y) * 1.5); lookLast = { x: t.clientX, y: t.clientY }; }
      e.preventDefault();
    }, { passive: false });
    const lend = (e) => { if (e.touches.length < 2) pinch = null; for (const t of e.changedTouches) if (t.identifier === lookId) lookId = null; };
    canvas.addEventListener('touchend', lend); canvas.addEventListener('touchcancel', lend);
    for (const [id, k] of [['#bFire', 'fire'], ['#bSprint', 'sprint'], ['#bCrouch', 'crouch'], ['#bProne', 'prone'], ['#bTurnL', 'turnL'], ['#bTurnR', 'turnR']]) {
      const el = $(id); if (!el) continue;
      const down = (e) => { e.preventDefault(); if (k === 'prone') { setProne(!I.proneOn); return; } if (k === 'crouch') btn.crouch = !btn.crouch; else btn[k] = true; if (k === 'fire') I.fire = true; el.classList.toggle('on', btn[k]); recompute(); };
      const up = (e) => { e.preventDefault(); if (k !== 'crouch' && k !== 'prone') { btn[k] = false; el.classList.remove('on'); if (k === 'fire') I.fire = false; recompute(); } };
      el.addEventListener('touchstart', down, { passive: false }); el.addEventListener('touchend', up, { passive: false }); el.addEventListener('touchcancel', up, { passive: false });
      el.addEventListener('mousedown', down); el.addEventListener('mouseup', up); el.addEventListener('mouseleave', up);
    }
    const bp = $('#bPaint'); if (bp) bp.addEventListener('click', () => I.cb.paint && I.cb.paint());
  };
  I.lock = function () { if (!canvas || I.touch || I.locked) return; try { const r = canvas.requestPointerLock(); if (r && r.catch) r.catch(() => {}); } catch (e) { /* bỏ qua */ } };
  I.unlock = function () { if (document.pointerLockElement) document.exitPointerLock(); };
  I.resetButtons = function () { btn.fire = btn.sprint = btn.crouch = btn.turnL = btn.turnR = false; setProne(false); ['#bFire', '#bSprint', '#bCrouch', '#bProne', '#bTurnL', '#bTurnR'].forEach((s) => { const e = $(s); if (e) e.classList.remove('on'); }); keys.clear(); I.fire = false; I.joy = null; recompute(); };
  UO.Input = I;
})(window.UO = window.UO || {});
