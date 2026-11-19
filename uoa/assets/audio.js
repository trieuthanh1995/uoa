/* Ú òa – âm thanh (WebAudio, tự tổng hợp, không cần file). Âm định vị 3D: hướng theo camera, nhỏ dần theo khoảng cách, tường làm nhỏ và đục. */
(function (UO) {
  'use strict';
  const C = UO.C;
  let ctx = null, master = null, sfx = null, vol = 0.8, muted = false;
  const L = { x: 0, y: 1.5, z: 0, fx: 0, fz: 1 };
  function ensure() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return ctx; }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null;
    ctx = new AC(); master = ctx.createGain(); master.gain.value = muted ? 0 : vol; master.connect(ctx.destination);
    const comp = ctx.createDynamicsCompressor(); comp.connect(master); sfx = comp;
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate); const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return ctx;
  }
  let noiseBuf = null;
  function setVolume(v) { vol = v; if (master) master.gain.value = muted ? 0 : v; }
  function setMuted(m) { muted = m; if (master) master.gain.value = m ? 0 : vol; }
  function listener(x, y, z, fx, fz) {
    L.x = x; L.y = y; L.z = z; L.fx = fx; L.fz = fz; if (!ctx) return;
    const l = ctx.listener;
    if (l.positionX) { l.positionX.value = x; l.positionY.value = y; l.positionZ.value = z; l.forwardX.value = fx; l.forwardY.value = 0; l.forwardZ.value = fz; l.upX.value = 0; l.upY.value = 1; l.upZ.value = 0; }
    else { l.setPosition(x, y, z); l.setOrientation(fx, 0, fz, 0, 1, 0); }
  }
  /** chuỗi → số ổn định (mỗi người trốn có cao độ tiếng riêng để người tìm phân biệt được) */
  const hash = (s) => { let h = 7; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h; };
  function panned(x, y, z, gain, lowpass) {
    const p = ctx.createPanner(); p.panningModel = 'HRTF'; p.distanceModel = 'linear'; p.rolloffFactor = 0; p.refDistance = 1;
    if (p.positionX) { p.positionX.value = x; p.positionY.value = y; p.positionZ.value = z; } else p.setPosition(x, y, z);
    const g = ctx.createGain(); g.gain.value = gain; const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lowpass || 18000;
    f.connect(g); g.connect(p); p.connect(sfx); return f;
  }
  function osc(dest, type, f0, f1, t0, dur, vol0) {
    const o = ctx.createOscillator(), g = ctx.createGain(); o.type = type; o.frequency.setValueAtTime(f0, t0); if (f1) o.frequency.exponentialRampToValueAtTime(f1, t0 + dur * 0.8);
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol0, t0 + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(dest); o.start(t0); o.stop(t0 + dur + 0.05);
  }
  function noise(dest, t0, dur, vol0, hp) {
    const s = ctx.createBufferSource(); s.buffer = noiseBuf; const g = ctx.createGain(); g.gain.setValueAtTime(vol0, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    let n = s; if (hp) { const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = hp; s.connect(f); n = f; } n.connect(g); g.connect(dest); s.start(t0); s.stop(t0 + dur + 0.05);
  }
  /** âm định vị 5 giây/lần của người trốn. g = độ lớn đã tính (khoảng cách + vật cản); walls = số vật chắn */
  function ping(id, x, z, g, walls) {
    if (!ensure() || g < 0.01) return; const t = ctx.currentTime + 0.005, base = 520 + (hash(id) % 9) * 55;
    const out = panned(x, 1.2, z, Math.min(1.4, Math.pow(g, 0.7) * 1.5), walls ? Math.max(500, 2600 - walls * 1100) : 16000);
    osc(out, 'triangle', base, base * 1.9, t, 0.28, 0.5); osc(out, 'sine', base * 2, base * 3.2, t + 0.07, 0.24, 0.22); osc(out, 'sine', base * 1.5, base * 2.2, t + 0.22, 0.2, 0.12);
  }
  function step(x, z, g, sprint, walls) {
    if (!ensure() || g < 0.015) return; const t = ctx.currentTime; const out = panned(x, 0.1, z, Math.min(1, g * (sprint ? 2.2 : 1.6)), walls ? 700 : 1800);
    noise(out, t, sprint ? 0.09 : 0.06, sprint ? 0.6 : 0.4, 200); osc(out, 'sine', sprint ? 130 : 100, 60, t, 0.07, 0.3);
  }
  function twang(x, z, near) {
    if (!ensure()) return; const t = ctx.currentTime; const out = near ? sfx : panned(x, 1.3, z, 0.9, 6000);
    osc(out, 'sawtooth', 520, 150, t, 0.16, 0.22); osc(out, 'square', 260, 90, t, 0.1, 0.1); noise(out, t, 0.08, 0.2, 2000);
  }
  function thud(x, z, kind) {
    if (!ensure()) return; const t = ctx.currentTime, out = panned(x, 0.6, z, 0.9, 5000);
    if (kind === 'hider') { osc(out, 'sine', 380, 90, t, 0.22, 0.55); osc(out, 'square', 700, 250, t, 0.12, 0.18); noise(out, t, 0.1, 0.3, 800); }
    else { noise(out, t, 0.09, 0.45, 600); osc(out, 'sine', 160, 60, t, 0.09, 0.3); }
  }
  /** âm giao diện: không định vị */
  function ui(kind) {
    if (!ensure()) return; const t = ctx.currentTime;
    if (kind === 'tick') osc(sfx, 'sine', 880, 880, t, 0.09, 0.25);
    else if (kind === 'go') { osc(sfx, 'triangle', 523, 523, t, 0.18, 0.35); osc(sfx, 'triangle', 784, 784, t + 0.12, 0.3, 0.35); osc(sfx, 'triangle', 1046, 1046, t + 0.26, 0.4, 0.3); }
    else if (kind === 'start') { osc(sfx, 'sawtooth', 220, 330, t, 0.5, 0.18); osc(sfx, 'triangle', 440, 660, t + 0.1, 0.5, 0.25); }
    else if (kind === 'caught') { osc(sfx, 'sawtooth', 440, 110, t, 0.5, 0.3); osc(sfx, 'sine', 220, 70, t + 0.1, 0.5, 0.3); }
    else if (kind === 'catch') { osc(sfx, 'triangle', 660, 990, t, 0.15, 0.35); osc(sfx, 'triangle', 990, 1320, t + 0.1, 0.25, 0.3); }
    else if (kind === 'win') { [523, 659, 784, 1046, 1318].forEach((f, i) => osc(sfx, 'triangle', f, f, t + i * 0.11, 0.35, 0.3)); }
    else if (kind === 'lose') { [392, 349, 311, 262].forEach((f, i) => osc(sfx, 'sine', f, f * 0.98, t + i * 0.17, 0.4, 0.3)); }
    else if (kind === 'ready') osc(sfx, 'sine', 1200, 1500, t, 0.12, 0.2);
    else if (kind === 'sprint') { noise(sfx, t, 0.25, 0.25, 1500); }
    else if (kind === 'click') osc(sfx, 'square', 700, 500, t, 0.05, 0.12);
    else if (kind === 'selfping') osc(sfx, 'sine', 900, 1500, t, 0.1, 0.1);
  }
  UO.Audio = { ensure, setVolume, setMuted, listener, ping, step, twang, thud, ui, get muted() { return muted; }, get vol() { return vol; } };
})(window.UO = window.UO || {});
