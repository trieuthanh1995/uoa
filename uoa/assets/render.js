/* Ú òa – dựng cảnh 3D: bản đồ, nhân vật (nhân vật gốc), camera quanh người chơi, hiệu ứng. Chỉ chạy ở trình duyệt. */
(function (UO) {
  'use strict';
  const T = window.THREE, PP = window.PP, C = UO.C;
  const lin = (hex) => new T.Color(hex).convertSRGBToLinear();
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

  /* ---------- hoa văn (canvas) – vẽ sáng/tối nhẹ để màu của vật thể vẫn là chủ đạo ---------- */
  const texCache = new Map();
  function canvasTex(key, size, draw) {
    if (texCache.has(key)) return texCache.get(key);
    const cv = document.createElement('canvas'); cv.width = cv.height = size; const g = cv.getContext('2d'); draw(g, size);
    const t = new T.CanvasTexture(cv); t.wrapS = t.wrapT = T.RepeatWrapping; t.anisotropy = 4; t.encoding = T.sRGBEncoding; texCache.set(key, t); return t;
  }
  const TEX = {
    brick: () => canvasTex('brick', 128, (g, s) => { g.fillStyle = '#e9e9e9'; g.fillRect(0, 0, s, s); g.fillStyle = '#bdbdbd'; for (let r = 0; r < 8; r++) { g.fillRect(0, r * 16, s, 2); for (let c = 0; c < 4; c++) g.fillRect(((c * 32 + (r % 2) * 16) % s), r * 16, 2, 16); } }),
    stripe: () => canvasTex('stripe', 128, (g, s) => { g.fillStyle = '#ffffff'; g.fillRect(0, 0, s, s); g.fillStyle = '#c9c9c9'; for (let i = 0; i < 4; i++) g.fillRect(i * 32, 0, 14, s); }),
    wood: () => canvasTex('wood', 128, (g, s) => { g.fillStyle = '#f0f0f0'; g.fillRect(0, 0, s, s); g.strokeStyle = '#c6c6c6'; g.lineWidth = 2; for (let i = 0; i < 9; i++) { g.beginPath(); g.moveTo(0, i * 15 + 4); g.bezierCurveTo(40, i * 15 - 3, 90, i * 15 + 12, s, i * 15 + 3); g.stroke(); } }),
    plank: () => canvasTex('plank', 128, (g, s) => { g.fillStyle = '#ececec'; g.fillRect(0, 0, s, s); g.fillStyle = '#b8b8b8'; for (let i = 0; i < 4; i++) g.fillRect(i * 32, 0, 3, s); }),
    dots: () => canvasTex('dots', 128, (g, s) => { g.fillStyle = '#f2f2f2'; g.fillRect(0, 0, s, s); g.fillStyle = '#cfcfcf'; for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) { g.beginPath(); g.arc(16 + x * 32 + (y % 2) * 8, 16 + y * 32, 7, 0, 7); g.fill(); } }),
    check: () => canvasTex('check', 128, (g, s) => { g.fillStyle = '#ffffff'; g.fillRect(0, 0, s, s); g.fillStyle = '#c4c4c4'; for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) if ((x + y) % 2) g.fillRect(x * 32, y * 32, 32, 32); }),
  };
  function floorTex(map) {
    const col = (n) => '#' + ('000000' + n.toString(16)).slice(-6), a = col(map.floor), b = col(map.floor2);
    return canvasTex('floor:' + map.id, 256, (g, s) => {
      g.fillStyle = a; g.fillRect(0, 0, s, s);
      if (map.ground === 'tile') { g.fillStyle = b; for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) if ((x + y) % 2) g.fillRect(x * 64, y * 64, 64, 64); }
      else if (map.ground === 'concrete') { g.fillStyle = b; g.fillRect(0, 0, s, 4); g.fillRect(0, 0, 4, s); for (let i = 0; i < 60; i++) { g.globalAlpha = 0.25; g.fillRect(Math.random() * s, Math.random() * s, 5 + Math.random() * 12, 3); } g.globalAlpha = 1; }
      else { for (let i = 0; i < 900; i++) { g.fillStyle = i % 3 ? b : a; g.globalAlpha = 0.5; g.fillRect(Math.random() * s, Math.random() * s, 2, 4 + Math.random() * 5); } g.globalAlpha = 1; }
    });
  }
  /** hộp có UV theo kích thước thật (hoa văn không bị kéo giãn) */
  const geoCache = new Map();
  function boxGeo(w, h, d) {
    const key = [w, h, d].join(':'); let g = geoCache.get(key); if (g) return g;
    g = new T.BoxGeometry(w, h, d); const uv = g.attributes.uv, K = 1.4;
    const faces = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
    for (let f = 0; f < 6; f++) for (let i = 0; i < 4; i++) { const k = f * 4 + i; uv.setXY(k, uv.getX(k) * faces[f][0] / K, uv.getY(k) * faces[f][1] / K); }
    geoCache.set(key, g); return g;
  }
  const matCache = new Map();
  function mat(color, tex) {
    const key = color + ':' + (tex || ''); let m = matCache.get(key); if (m) return m;
    m = new T.MeshStandardMaterial({ color: lin(color), roughness: 0.82, metalness: 0, map: tex && TEX[tex] ? TEX[tex]() : null }); m.envMapIntensity = 0.55; matCache.set(key, m); return m;
  }

  /* ---------- thế giới ---------- */
  function buildWorld(renderer, map, quality) {
    const scene = new T.Scene(); scene.background = lin(map.sky);
    scene.fog = new T.Fog(lin(map.sky), 45, 130);
    const camera = new T.PerspectiveCamera(60, 1, 0.1, 260);
    let pm = null, env = null;
    try { pm = new T.PMREMGenerator(renderer); env = pm.fromScene(new T.RoomEnvironment(), 0.04).texture; scene.environment = env; } catch (e) { /* không có env cũng chạy được */ }
    scene.add(new T.HemisphereLight(lin(map.indoor ? 0xfff4d6 : 0xe8f4ff), lin(0x8a7b66), 0.75));
    const sun = new T.DirectionalLight(lin(0xfff1dc), 1.25); sun.position.set(-18, 34, 14);
    const sh = quality >= 1; sun.castShadow = sh;
    if (sh) { const S = quality >= 2 ? 2048 : 1024; sun.shadow.mapSize.set(S, S); Object.assign(sun.shadow.camera, { left: -26, right: 26, top: 26, bottom: -26, near: 5, far: 90 }); sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.03; }
    scene.add(sun); scene.add(sun.target);
    renderer.shadowMap.enabled = sh; renderer.shadowMap.type = T.PCFSoftShadowMap;

    // sàn
    const ft = floorTex(map); ft.repeat.set(map.HW * 2 / 6, map.HD * 2 / 6);
    const floor = new T.Mesh(new T.PlaneGeometry(map.HW * 2, map.HD * 2), new T.MeshStandardMaterial({ map: ft, color: 0xffffff, roughness: 0.95 }));
    floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
    const outer = new T.Mesh(new T.PlaneGeometry(600, 600), new T.MeshStandardMaterial({ color: lin(map.indoor ? 0x4b4636 : 0x6f8a56), roughness: 1 }));
    outer.rotation.x = -Math.PI / 2; outer.position.y = -0.02; scene.add(outer);

    // vật cản
    const group = new T.Group(); scene.add(group); const canopies = [];
    const add = (m, x, y, z) => { m.position.set(x, y, z); m.castShadow = sh; m.receiveShadow = true; group.add(m); return m; };
    for (const o of map.boxes) {
      const m = add(new T.Mesh(boxGeo(o.w, o.h, o.d), mat(o.c, o.tex)), o.x, o.h / 2, o.z);
      if (o.k === 'car') { const cab = new T.Mesh(boxGeo(o.w * (o.w > o.d ? 0.5 : 0.9), 0.55, o.d * (o.w > o.d ? 0.9 : 0.5)), mat(0xdcecff)); add(cab, o.x, o.h + 0.27, o.z); }
      if (o.k === 'counter' || o.k === 'bench' || o.k === 'desk') { const top = new T.Mesh(boxGeo(o.w + 0.06, 0.06, o.d + 0.06), mat(0xe9e0cc)); add(top, o.x, o.h + 0.03, o.z); }
      void m;
    }
    for (const o of map.circles) {
      if (o.k === 'tree') {
        add(new T.Mesh(new T.CylinderGeometry(o.r * 0.8, o.r, o.h, 10), mat(o.c)), o.x, o.h / 2, o.z);
        const R = o.r * 2.6; const c1 = add(new T.Mesh(new T.SphereGeometry(R, 14, 10), mat(o.c2 || 0x3fa34d)), o.x, o.h + R * 0.45, o.z);
        const c2 = add(new T.Mesh(new T.SphereGeometry(R * 0.7, 12, 8), mat(o.c2 || 0x3fa34d)), o.x + R * 0.35, o.h + R * 0.15, o.z - R * 0.2);
        canopies.push([c1, R], [c2, R * 0.7]);
      } else if (o.k === 'bush') add(new T.Mesh(new T.SphereGeometry(o.r * 1.15, 12, 8), mat(o.c)), o.x, o.r * 0.45, o.z).scale.set(1, o.h / (o.r * 1.15) * 0.6, 1);
      else if (o.k === 'pond' || o.k === 'pondrim') { const m = add(new T.Mesh(new T.CylinderGeometry(o.r, o.r, o.h, 28), mat(o.c)), o.x, o.k === 'pond' ? o.h / 2 + 0.01 : o.h / 2, o.z); m.castShadow = false; }
      else { add(new T.Mesh(new T.CylinderGeometry(o.r, o.r, o.h, 16), mat(o.c)), o.x, o.h / 2, o.z); if (o.k === 'barrel') add(new T.Mesh(new T.CylinderGeometry(o.r * 1.02, o.r * 1.02, 0.08, 16), mat(0x333333)), o.x, o.h * 0.7, o.z); }
    }
    const fxs = [];
    return { scene, camera, sun, group, fxs, canopies, dispose() { if (env) env.dispose(); if (pm) pm.dispose(); scene.traverse((o) => { if (o.isMesh && o.material && !matCache.has(o.material.color && 0) && o.geometry && o.geometry.type !== 'BoxGeometry') o.geometry.dispose(); }); }, map };
  }

  /* ---------- nhân vật ---------- */
  const CHAR = (id) => PP.CHARACTERS.find((c) => c.id === id) || PP.CHARACTERS[0];
  class Avatar {
    constructor(world, p, isMe) {
      this.p = p; this.isMe = isMe; const def = CHAR(p.char);
      this.ch = PP.Character.build(def, { team: 'B', look: null });
      this.holder = new T.Group(); this.holder.add(this.ch.root); world.scene.add(this.holder);
      this.ch.root.traverse((o) => { if (o.isMesh) { o.castShadow = true; } });
      if (p.role === 'seeker' && PP.Guns) { this.gun = PP.Guns.attach(this.ch, 'sniper', 0x8a5a33); } else this.ch.root.traverse((o) => { if (o.userData && o.userData.paddle) o.visible = false; });
      if (isMe) this.ch.setHighlight(p.role === 'seeker' ? 0xff9f1c : 0x5ad1ff);
      this.scaleY = 1; this.paintKey = ''; this.crouchT = 0; this.dustT = 0; this.catchT = -1;
      this.holder.scale.setScalar(C.CHAR_SCALE);
    }
    sync(dt, sim, hideSelf) {
      const p = this.p, c = Math.cos(p.yaw), s = Math.sin(p.yaw);
      this.holder.position.set(p.x, 0, p.z); this.holder.rotation.y = p.yaw;
      const lvx = c * p.vx - s * p.vz, lvz = s * p.vx + c * p.vz;
      let mode = 'ready'; if (p.caught) mode = 'sad'; else if (sim.phase === 'over') mode = (sim.result && ((sim.result.winner === 'seekers') === (p.role === 'seeker'))) ? 'celebrate' : 'sad';
      else if (Math.hypot(p.vx, p.vz) < 0.2) mode = 'idle';
      this.ch.update(dt, { x: 0, z: 0, vx: lvx, vz: lvz, mode });
      if (this.gun) this.gun.sync(p.fireCd > C.SLING.cd - 0.18 ? 1 : 0);
      // cúi thấp
      const tgt = p.crouch ? 0.68 : 1; this.scaleY += (tgt - this.scaleY) * Math.min(1, dt * 12);
      this.holder.scale.set(C.CHAR_SCALE, C.CHAR_SCALE * this.scaleY, C.CHAR_SCALE);
      if (p.caught) { this.catchT = this.catchT < 0 ? 0 : this.catchT + dt; this.holder.rotation.z = Math.min(1.3, this.catchT * 5) * 0.0; }
      // tô màu
      const key = p.paint ? JSON.stringify(p.paint) : ''; if (key !== this.paintKey) { this.paintKey = key; this.ch.setPaint(p.paint || null); }
      this.holder.visible = !hideSelf;
    }
    dispose() { if (this.gun) this.gun.dispose(); this.ch.dispose(); if (this.holder.parent) this.holder.parent.remove(this.holder); }
  }

  /* ---------- hiệu ứng ---------- */
  class Fx {
    constructor(world) { this.world = world; this.list = []; this.geo = new T.SphereGeometry(1, 6, 5); this.stones = new Map(); this.stoneGeo = new T.SphereGeometry(C.SLING.r, 10, 8); this.stoneMat = new T.MeshStandardMaterial({ color: lin(0x6b6b73), roughness: 0.6 }); }
    burst(x, y, z, color, n, speed, life, size, grav) {
      for (let i = 0; i < n; i++) {
        const m = new T.Mesh(this.geo, new T.MeshBasicMaterial({ color: lin(color), transparent: true, opacity: 0.9, depthWrite: false })); m.position.set(x, y, z);
        const a = Math.random() * 6.283, e = Math.random() * 0.9, sp = speed * (0.4 + Math.random() * 0.6);
        this.list.push({ m, vx: Math.cos(a) * Math.cos(e) * sp, vy: Math.sin(e) * sp + 0.6, vz: Math.sin(a) * Math.cos(e) * sp, t: 0, life: life * (0.7 + Math.random() * 0.5), size, g: grav == null ? 3 : grav });
        this.world.scene.add(m);
      }
    }
    dust(x, z, big) { this.burst(x, 0.08, z, 0xd9cdb4, big ? 4 : 2, big ? 1.4 : 0.8, 0.5, big ? 0.16 : 0.1, -0.5); }
    ring(x, z, color) {
      const m = new T.Mesh(new T.RingGeometry(0.3, 0.42, 32), new T.MeshBasicMaterial({ color: lin(color), transparent: true, opacity: 0.85, side: T.DoubleSide, depthWrite: false }));
      m.rotation.x = -Math.PI / 2; m.position.set(x, 0.06, z); this.list.push({ m, ring: true, t: 0, life: 0.9, size: 1 }); this.world.scene.add(m);
    }
    launch(e) {
      const m = new T.Mesh(this.stoneGeo, this.stoneMat); m.position.set(e.x, e.y, e.z); m.castShadow = true; this.world.scene.add(m);
      this.stones.set(e.sid, { m, vx: e.vx, vy: e.vy, vz: e.vz });
    }
    endStone(e) { const s = this.stones.get(e.sid); if (s) { this.world.scene.remove(s.m); this.stones.delete(e.sid); } }
    update(dt) {
      for (const s of this.stones.values()) { s.vy -= C.SLING.gravity * dt; s.m.position.x += s.vx * dt; s.m.position.y += s.vy * dt; s.m.position.z += s.vz * dt; }
      for (let i = this.list.length - 1; i >= 0; i--) {
        const f = this.list[i]; f.t += dt; const k = f.t / f.life;
        if (k >= 1) { this.world.scene.remove(f.m); f.m.material.dispose(); if (f.ring) f.m.geometry.dispose(); this.list.splice(i, 1); continue; }
        if (f.ring) { const s = 1 + k * 5; f.m.scale.set(s, s, s); f.m.material.opacity = 0.85 * (1 - k); continue; }
        f.vy -= f.g * dt; f.m.position.x += f.vx * dt; f.m.position.y = Math.max(0.03, f.m.position.y + f.vy * dt); f.m.position.z += f.vz * dt;
        const s = f.size * (f.g < 0 ? 0.6 + k * 1.6 : 1 - k * 0.5); f.m.scale.set(s, s, s); f.m.material.opacity = 0.9 * (1 - k);
      }
    }
    clear() { for (const f of this.list) { this.world.scene.remove(f.m); f.m.material.dispose(); } this.list = []; for (const s of this.stones.values()) this.world.scene.remove(s.m); this.stones.clear(); }
  }

  /* ---------- camera quanh nhân vật ---------- */
  class OrbitCam {
    constructor() { this.yaw = 0; this.pitch = 0.42; this.dist = 5.8; this.want = 5.8; this.cur = 5.8; this.pos = new T.Vector3(); this.look = new T.Vector3(); this.fwd = new T.Vector3(); this.shake = 0; }
    rotate(dx, dy, sens) { this.yaw -= dx * sens; this.pitch = clamp(this.pitch + dy * sens, -0.35, 1.25); }
    zoom(d) { this.want = clamp(this.want + d, 2.6, 10); }
    update(dt, camera, map, tx, ty, tz, aiming) {
      const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch), sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);
      // vector từ mục tiêu ra phía sau camera
      const bx = -sy * cp, by = sp, bz = -cy * cp;
      const sideX = -cy, sideZ = sy, off = aiming ? 0.65 : 0;                       // vai phải khi ngắm
      const ox = tx + sideX * off, oz = tz + sideZ * off;
      const free = UO.rayWorld(map, ox, ty, oz, bx, by, bz, this.want + 0.4, 0.2);
      const target = Math.max(1.0, Math.min(this.want, free - 0.4));
      this.cur += (target - this.cur) * Math.min(1, dt * (target < this.cur ? 22 : 7));
      this.pos.set(ox + bx * this.cur, Math.max(0.35, ty + by * this.cur), oz + bz * this.cur);
      camera.position.copy(this.pos);
      if (this.shake > 0.001) { camera.position.x += (Math.random() - 0.5) * this.shake; camera.position.y += (Math.random() - 0.5) * this.shake; this.shake *= 0.86; }
      this.look.set(tx + sideX * off * 0.6 + sy * cp * 3, ty - sp * 3, tz + sideZ * off * 0.6 + cy * cp * 3);
      this.look.set(this.pos.x + sy * cp, this.pos.y - sp, this.pos.z + cy * cp);
      camera.lookAt(this.look); camera.updateMatrixWorld();
      this.fwd.set(sy * cp, -sp, cy * cp);
    }
  }

  UO.Render = { buildWorld, Avatar, Fx, OrbitCam, CHAR };
})(window.UO = window.UO || {});
