/* Ú òa – lõi mô phỏng (trình duyệt + Node). Chỉ chứa luật chơi: di chuyển, pha trận, ná cao su, bắt người, âm thanh định vị.
 * Hệ tọa độ: mặt đất là (x, z), y hướng lên. Hướng yaw: hướng đi = (sin yaw, cos yaw).
 * Sim phát sự kiện vào hàng đợi drain(): phase, ping, step, fire, stone_end, catch, over, sprint, role. */
(function (root, factory) {
  const isNode = typeof module === 'object' && module.exports;
  const mod = factory(isNode ? require('./config.js') : root.UO, isNode ? require('./maps.js') : root.UO);
  if (isNode) module.exports = mod; else { root.UO = root.UO || {}; Object.assign(root.UO, mod); }
})(typeof self !== 'undefined' ? self : this, function (cfg, maps) {
  'use strict';
  const { C, LEVELS } = cfg;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const TALL = 1.0;                       // vật cao từ mức này chắn tầm nhìn, tiếng và đạn
  const rngOf = (a) => () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

  /* ================= màu ================= */
  const hexNum = (c) => (typeof c === 'number' ? c : parseInt(String(c).replace('#', ''), 16) || 0);
  function cdist(a, b) {
    a = hexNum(a); b = hexNum(b);
    const dr = (a >> 16 & 255) - (b >> 16 & 255), dg = (a >> 8 & 255) - (b >> 8 & 255), db = (a & 255) - (b & 255);
    return Math.sqrt(dr * dr + dg * dg + db * db) / 441.7;
  }
  function mixHex(list) {           // list: [[hex, weight], …]
    let r = 0, g = 0, b = 0, w = 0;
    for (const [c, k] of list) { const n = hexNum(c); r += (n >> 16 & 255) * k; g += (n >> 8 & 255) * k; b += (n & 255) * k; w += k; }
    return ((Math.round(r / w) << 16) | (Math.round(g / w) << 8) | Math.round(b / w)) >>> 0;
  }

  /* ================= hình học ================= */
  function pushOutBox(o, x, z, r) {
    const hx = o.w / 2, hz = o.d / 2, cx = clamp(x, o.x - hx, o.x + hx), cz = clamp(z, o.z - hz, o.z + hz);
    const dx = x - cx, dz = z - cz, d2 = dx * dx + dz * dz;
    if (d2 >= r * r) return null;
    if (d2 > 1e-10) { const d = Math.sqrt(d2); return [dx / d * (r - d), dz / d * (r - d)]; }
    const px = hx - Math.abs(x - o.x), pz = hz - Math.abs(z - o.z);
    return px < pz ? [(x >= o.x ? 1 : -1) * (px + r), 0] : [0, (z >= o.z ? 1 : -1) * (pz + r)];
  }
  function pushOutCircle(o, x, z, r) {
    const dx = x - o.x, dz = z - o.z, rr = o.r + r, d2 = dx * dx + dz * dz;
    if (d2 >= rr * rr) return null;
    const d = Math.sqrt(d2) || 1e-6; return [dx / d * (rr - d), dz / d * (rr - d)];
  }
  /** Đẩy vòng tròn (x,z,r) ra khỏi mọi vật cản và giữ trong ranh giới */
  function resolve(map, p, r) {
    for (let it = 0; it < 3; it++) {
      for (const o of map.boxes) { const v = pushOutBox(o, p.x, p.z, r); if (v) { p.x += v[0]; p.z += v[1]; } }
      for (const o of map.circles) { const v = pushOutCircle(o, p.x, p.z, r); if (v) { p.x += v[0]; p.z += v[1]; } }
    }
    p.x = clamp(p.x, -map.HW + r, map.HW - r); p.z = clamp(p.z, -map.HD + r, map.HD - r);
  }
  /** đoạn 2D (a→b) cắt hộp? trả về t vào (0..1) hoặc -1 */
  function segBox2(ax, az, bx, bz, o) {
    const hx = o.w / 2, hz = o.d / 2; let t0 = 0, t1 = 1;
    const dx = bx - ax, dz = bz - az;
    for (const [p, q, lo, hi] of [[ax, dx, o.x - hx, o.x + hx], [az, dz, o.z - hz, o.z + hz]]) {
      if (Math.abs(q) < 1e-9) { if (p < lo || p > hi) return -1; continue; }
      let u = (lo - p) / q, v = (hi - p) / q; if (u > v) { const s = u; u = v; v = s; }
      t0 = Math.max(t0, u); t1 = Math.min(t1, v); if (t0 > t1) return -1;
    }
    return t0;
  }
  function segCircle2(ax, az, bx, bz, o, rExtra) {
    const r = o.r + (rExtra || 0), dx = bx - ax, dz = bz - az, fx = ax - o.x, fz = az - o.z;
    const a = dx * dx + dz * dz; if (a < 1e-12) return fx * fx + fz * fz <= r * r ? 0 : -1;
    const b = 2 * (fx * dx + fz * dz), c = fx * fx + fz * fz - r * r, disc = b * b - 4 * a * c;
    if (disc < 0) return -1;
    const s = Math.sqrt(disc), t = (-b - s) / (2 * a);
    if (t >= 0 && t <= 1) return t; if (c <= 0) return 0; return -1;
  }
  /** Số vật cao chắn giữa hai điểm (để tính tường làm nhỏ tiếng và che tầm nhìn) */
  function blockersBetween(map, ax, az, bx, bz, minH) {
    minH = minH == null ? TALL : minH; let n = 0;
    for (const o of map.boxes) if (o.h >= minH && segBox2(ax, az, bx, bz, o) >= 0) n++;
    for (const o of map.circles) if (o.h >= minH && segCircle2(ax, az, bx, bz, o) >= 0) n++;
    return n;
  }
  /** tia 3D tới vật cản (dùng cho camera / điểm ngắm). Trả về khoảng cách tới điểm chạm đầu tiên hoặc maxT */
  function rayWorld(map, ox, oy, oz, dx, dy, dz, maxT, minH) {
    minH = minH || 0; let best = maxT;
    const ex = ox + dx * maxT, ey = oy + dy * maxT, ez = oz + dz * maxT;
    for (const o of map.boxes) {
      const lo = [o.x - o.w / 2, 0, o.z - o.d / 2], hi = [o.x + o.w / 2, o.h, o.z + o.d / 2];
      if (o.h < minH) continue;
      const O = [ox, oy, oz], D = [dx, dy, dz]; let t0 = 0, t1 = maxT, ok = true;
      for (let i = 0; i < 3; i++) {
        if (Math.abs(D[i]) < 1e-9) { if (O[i] < lo[i] || O[i] > hi[i]) { ok = false; break; } continue; }
        let u = (lo[i] - O[i]) / D[i], v = (hi[i] - O[i]) / D[i]; if (u > v) { const s = u; u = v; v = s; }
        t0 = Math.max(t0, u); t1 = Math.min(t1, v); if (t0 > t1) { ok = false; break; }
      }
      if (ok && t0 < best) best = t0;
    }
    for (const o of map.circles) {
      if (o.h < minH) continue;
      const t = segCircle2(ox, oz, ex, ez, o, 0);
      if (t >= 0) { const y = oy + (ey - oy) * t; if (y >= 0 && y <= o.h && t * maxT < best) best = t * maxT; }
    }
    if (dy < -1e-6) { const t = -oy / dy; if (t > 0 && t < best) best = t; }
    return best;
  }

  /* ================= lưới đường đi (bot) ================= */
  class Nav {
    constructor(map, cell) {
      this.map = map; this.cs = cell || 0.75;
      this.W = Math.ceil(2 * map.HW / this.cs); this.H = Math.ceil(2 * map.HD / this.cs);
      this.blocked = new Uint8Array(this.W * this.H);
      const r = C.PLAYER_R + 0.12, tmp = { x: 0, z: 0 };
      for (let j = 0; j < this.H; j++) for (let i = 0; i < this.W; i++) {
        const x = -map.HW + (i + 0.5) * this.cs, z = -map.HD + (j + 0.5) * this.cs;
        let b = Math.abs(x) > map.HW - r || Math.abs(z) > map.HD - r;
        if (!b) for (const o of map.boxes) if (pushOutBox(o, x, z, r)) { b = true; break; }
        if (!b) for (const o of map.circles) if (pushOutCircle(o, x, z, r)) { b = true; break; }
        this.blocked[j * this.W + i] = b ? 1 : 0;
      }
      this.comp = new Int32Array(this.W * this.H).fill(-1); this.mainComp = -1; this._components();
    }
    idx(x, z) { const i = clamp(Math.floor((x + this.map.HW) / this.cs), 0, this.W - 1), j = clamp(Math.floor((z + this.map.HD) / this.cs), 0, this.H - 1); return j * this.W + i; }
    pos(k) { return [-this.map.HW + ((k % this.W) + 0.5) * this.cs, -this.map.HD + (Math.floor(k / this.W) + 0.5) * this.cs]; }
    free(x, z) { return !this.blocked[this.idx(x, z)]; }
    _components() {
      let id = 0, bestN = 0; const W = this.W, H = this.H;
      for (let s = 0; s < W * H; s++) {
        if (this.blocked[s] || this.comp[s] >= 0) continue;
        const st = [s]; this.comp[s] = id; let n = 0;
        while (st.length) {
          const k = st.pop(); n++; const i = k % W, j = (k / W) | 0;
          for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const a = i + di, b = j + dj; if (a < 0 || b < 0 || a >= W || b >= H) continue; const q = b * W + a;
            if (!this.blocked[q] && this.comp[q] < 0) { this.comp[q] = id; st.push(q); }
          }
        }
        if (n > bestN) { bestN = n; this.mainComp = id; } id++;
      }
    }
    nearestFree(x, z) {
      const k = this.idx(x, z); if (!this.blocked[k] && this.comp[k] === this.mainComp) return [x, z];
      const W = this.W; const i0 = k % W, j0 = (k / W) | 0;
      for (let R = 1; R < 14; R++) for (let j = j0 - R; j <= j0 + R; j++) for (let i = i0 - R; i <= i0 + R; i++) {
        if (i < 0 || j < 0 || i >= W || j >= this.H) continue; if (Math.max(Math.abs(i - i0), Math.abs(j - j0)) !== R) continue;
        const q = j * W + i; if (!this.blocked[q] && this.comp[q] === this.mainComp) return this.pos(q);
      }
      return [x, z];
    }
    /** đoạn thẳng đi được (lấy mẫu theo ô) */
    clear(ax, az, bx, bz) {
      const d = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.ceil(d / (this.cs * 0.45)));
      for (let s = 0; s <= n; s++) { const t = s / n; if (this.blocked[this.idx(ax + (bx - ax) * t, az + (bz - az) * t)]) return false; }
      return true;
    }
    /** A* 8 hướng; trả về danh sách điểm [x,z] đã làm thẳng, hoặc null */
    path(ax, az, bx, bz) {
      const W = this.W, H = this.H; const [sx, sz] = this.nearestFree(ax, az), [gx, gz] = this.nearestFree(bx, bz);
      const s = this.idx(sx, sz), g = this.idx(gx, gz); if (s === g) return [[gx, gz]];
      const G = new Float32Array(W * H).fill(1e9), from = new Int32Array(W * H).fill(-1), closed = new Uint8Array(W * H);
      const open = [[0, s]]; G[s] = 0; const [tx, tz] = [g % W, (g / W) | 0];
      const hh = (k) => { const dx = Math.abs((k % W) - tx), dz = Math.abs(((k / W) | 0) - tz); return (dx + dz) + (1.4142 - 2) * Math.min(dx, dz); };
      let guard = 0;
      while (open.length && guard++ < 60000) {
        let bi = 0; for (let q = 1; q < open.length; q++) if (open[q][0] < open[bi][0]) bi = q;
        const [, k] = open[bi]; open[bi] = open[open.length - 1]; open.pop();
        if (k === g) break; if (closed[k]) continue; closed[k] = 1;
        const i = k % W, j = (k / W) | 0;
        for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) {
          if (!di && !dj) continue; const a = i + di, b = j + dj; if (a < 0 || b < 0 || a >= W || b >= H) continue;
          const q = b * W + a; if (this.blocked[q] || closed[q]) continue;
          if (di && dj && (this.blocked[j * W + a] || this.blocked[b * W + i])) continue;
          const ng = G[k] + (di && dj ? 1.4142 : 1);
          if (ng < G[q]) { G[q] = ng; from[q] = k; open.push([ng + hh(q), q]); }
        }
      }
      if (from[g] < 0) return null;
      const pts = []; for (let k = g; k !== s && k >= 0; k = from[k]) pts.push(this.pos(k)); pts.reverse();
      // làm thẳng đường đi
      const out = []; let cx = sx, cz = sz, i = 0;
      while (i < pts.length) {
        let j = pts.length - 1; while (j > i && !this.clear(cx, cz, pts[j][0], pts[j][1])) j--;
        out.push(pts[j]); cx = pts[j][0]; cz = pts[j][1]; i = j + 1;
      }
      out[out.length - 1] = [gx, gz]; return out;
    }
  }
  const navCache = new Map();
  function navOf(map) { let n = navCache.get(map.id); if (!n) { n = new Nav(map); navCache.set(map.id, n); } return n; }

  /* ================= nghe âm thanh ================= */
  /** độ lớn (0..1) mà người nghe (lx,lz) nghe được nguồn (sx,sz) có tầm range; mỗi vật cao xen giữa nhân với wallLoss */
  function hearGain(map, lx, lz, sx, sz, range, gain0) {
    const d = Math.hypot(sx - lx, sz - lz); if (d >= range) return { gain: 0, walls: 0, d };
    const walls = blockersBetween(map, lx, lz, sx, sz);
    const fall = 1 / (1 + (d / 6) * (d / 6) * 0.5);
    return { gain: (gain0 == null ? 1 : gain0) * fall * Math.pow(C.PING.wallLoss, Math.min(walls, 4)) * (1 - d / range), walls, d };
  }

  /* ================= Sim ================= */
  class Sim {
    /** opts: { mapId, players:[{id,name,char,isBot,level,base}], seekers, roleMode:'random'|'seeker'|'hider', meId, seed } */
    constructor(opts) {
      this.map = maps.mapOf(opts.mapId); this.nav = navOf(this.map);
      this.seed = opts.seed >>> 0 || 1; this.R = rngOf(this.seed);
      this.events = []; this.acc = 0; this.t = 0; this.phase = 'lobby'; this.phaseT = 0; this.phaseDur = 0;
      this.players = new Map(); this.stones = []; this.stoneId = 1; this.result = null; this.paused = false;
      const n = clamp(opts.players.length, C.MIN_PLAYERS, C.MAX_PLAYERS);
      this.seekerCount = clamp(opts.seekers | 0, 1, n - 1);
      let order = opts.players.slice(0, n).map((p) => p);
      const meIdx = order.findIndex((p) => p.id === opts.meId);
      const seekIdx = new Set();
      if (opts.roleMode === 'seeker' && meIdx >= 0) seekIdx.add(meIdx);
      const pool = order.map((_, i) => i).filter((i) => !(opts.roleMode === 'hider' && i === meIdx) && !seekIdx.has(i));
      for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(this.R() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
      while (seekIdx.size < this.seekerCount && pool.length) seekIdx.add(pool.shift());
      const hs = this.shuffle(this.map.spawns.hider.slice()), ss = this.map.spawns.seeker.slice();
      let hi = 0, si = 0;
      order.forEach((p, i) => {
        const role = seekIdx.has(i) ? 'seeker' : 'hider', sp0 = role === 'seeker' ? ss[si++ % ss.length] : hs[hi++ % hs.length];
        const sp = this.nav.nearestFree(sp0[0], sp0[1]);      // điểm xuất phát luôn nằm ở chỗ trống
        const lv = LEVELS[p.level] || LEVELS.normal;
        this.players.set(p.id, {
          id: p.id, name: p.name, char: p.char, isBot: !!p.isBot, level: lv, base: p.base == null ? 0xcccccc : p.base, role,
          x: sp[0], z: sp[1], vx: 0, vz: 0, yaw: role === 'seeker' ? 0 : this.R() * 6.28, crouch: false, caught: false, caughtAt: -1, present: true,
          sprintLeft: C.HIDER.sprintTime, sprintCd: 0, sprinting: false, fireCd: 0, pingAt: 1e9, stride: 0, paint: null,
          ctl: { mx: 0, mz: 0, sprint: false, crouch: false, fire: false, ax: 0, ay: 0, az: 1, adist: 30 },
          stat: { catches: 0, caughtT: 0, shots: 0, hits: 0 }, mem: {},
        });
      });
      this.order = order.map((p) => p.id);
      // vùng không được ẩn nấp quanh chỗ xuất phát của người đi tìm (dùng trong giai đoạn ngụy trang)
      const sk = [...this.players.values()].filter((p) => p.role === 'seeker');
      this.pen = { x: sk.reduce((a, p) => a + p.x, 0) / sk.length, z: sk.reduce((a, p) => a + p.z, 0) / sk.length, r: 4.5 };
      this.ai = null;
    }
    shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(this.R() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
    get hiders() { return [...this.players.values()].filter((p) => p.role === 'hider' && p.present); }
    get seekers() { return [...this.players.values()].filter((p) => p.role === 'seeker' && p.present); }
    hidersLeft() { return this.hiders.filter((p) => !p.caught).length; }
    emit(e) { e.ts = this.t; this.events.push(e); if (this.ai && this.ai.onEvent) this.ai.onEvent(this, e); }
    drain() { const e = this.events; this.events = []; return e; }
    setCtl(id, c) { const p = this.players.get(id); if (p) Object.assign(p.ctl, c); }
    canPaint() { return this.phase === 'intro' || this.phase === 'prep'; }
    setPaint(id, paint) {
      const p = this.players.get(id); if (!p || p.role !== 'hider' || !this.canPaint()) return false;
      p.paint = paint ? Object.assign({}, paint) : null; return true;
    }
    start() { this.setPhase('intro', C.INTRO); for (const p of this.players.values()) this.emit({ t: 'role', id: p.id, role: p.role }); }
    setPhase(ph, dur) {
      this.phase = ph; this.phaseT = 0; this.phaseDur = dur || 0;
      if (ph === 'hunt') {
        const hs = this.hiders, n = hs.length || 1;
        hs.forEach((p, i) => { p.pingAt = this.t + (C.PING.stagger ? (i + 0.5) / n * C.PING.every : C.PING.every) ; });
      }
      this.emit({ t: 'phase', phase: ph, dur: this.phaseDur });
    }
    /** màu trung bình ngụy trang của người trốn (vùng chưa tô lấy màu gốc) */
    paintAvg(p) {
      const z = p.paint || {}; const g = (k) => (z[k] ? hexNum(z[k]) : p.base);
      return mixHex([[g('body'), 0.42], [g('head'), 0.2], [g('arms'), 0.14], [g('legs'), 0.24]]);
    }
    /** màu nền xung quanh (vật cao gần nhất trong 3 m, nếu không có thì màu sàn) */
    backdrop(x, z) {
      let best = 3.0, col = this.map.floor;
      for (const o of this.map.boxes) { if (o.h < 0.8) continue; const cx = clamp(x, o.x - o.w / 2, o.x + o.w / 2), cz = clamp(z, o.z - o.d / 2, o.z + o.d / 2), d = Math.hypot(x - cx, z - cz); if (d < best) { best = d; col = o.c; } }
      for (const o of this.map.circles) { if (o.h < 0.8 || o.k === 'pond') continue; const d = Math.hypot(x - o.x, z - o.z) - o.r; if (d < best) { best = d; col = o.c2 != null ? o.c2 : o.c; } }
      return { col, dist: best };
    }
    /** 0 = hòa lẫn hoàn toàn … 1 = nổi bật hẳn */
    conspicuity(p) {
      const bd = this.backdrop(p.x, p.z), cd = cdist(this.paintAvg(p), bd.col), near = clamp(1 - bd.dist / 3, 0, 1);
      return clamp(1 - (1 - clamp(cd / 0.5, 0, 1)) * (0.35 + 0.65 * near), 0.12, 1);
    }

    update(dt) {
      if (this.paused || this.phase === 'lobby') return;
      this.acc += Math.min(dt, 0.1);
      while (this.acc >= C.STEP) { this.acc -= C.STEP; this.step(C.STEP); }
    }
    step(dt) {
      this.t += dt; this.phaseT += dt;
      if (this.ai) this.ai.update(this, dt);
      const ph = this.phase;
      if (ph === 'intro' && this.phaseT >= C.INTRO) this.setPhase('prep', C.PREP);
      else if (ph === 'prep' && this.phaseT >= C.PREP) this.setPhase('hunt', C.HUNT);
      else if (ph === 'hunt') { if (this.phaseT >= C.HUNT) this.finish('hiders', 'time'); }
      else if (ph === 'over' && this.phaseT >= C.END_DELAY && !this.emittedOver) { this.emittedOver = true; this.emit({ t: 'over_screen' }); }
      for (const p of this.players.values()) if (p.present) this.movePlayer(p, dt);
      if (ph === 'hunt') { this.pings(); this.updateStones(dt); }
    }
    movePlayer(p, dt) {
      const c = p.ctl, ph = this.phase;
      p.fireCd = Math.max(0, p.fireCd - dt); p.sprintCd = Math.max(0, p.sprintCd - dt);
      let can = !p.caught && ph !== 'over' && ph !== 'intro';
      if (p.role === 'seeker' && ph === 'prep') can = false;           // người đi tìm nhắm mắt đếm giờ
      const isH = p.role === 'hider';
      p.crouch = can && !!c.crouch;
      let mx = can ? c.mx : 0, mz = can ? c.mz : 0; const ml = Math.hypot(mx, mz); if (ml > 1) { mx /= ml; mz /= ml; }
      let sp = isH ? C.HIDER.walk : C.SEEKER.walk;
      if (isH) {
        if (p.sprinting) { p.sprintLeft -= dt; if (p.sprintLeft <= 0 || !c.sprint || p.crouch || ml < 0.1) { p.sprinting = false; if (p.sprintLeft <= 0) { p.sprintLeft = 0; } p.sprintCd = Math.max(p.sprintCd, C.HIDER.sprintCd); } }
        if (!p.sprinting && c.sprint && can && ml > 0.1 && !p.crouch && p.sprintCd <= 0 && ph === 'hunt') { p.sprinting = true; p.sprintLeft = C.HIDER.sprintTime; this.emit({ t: 'sprint', id: p.id }); }
        if (!p.sprinting && p.sprintCd <= 0) p.sprintLeft = C.HIDER.sprintTime;
        if (p.sprinting) sp = C.HIDER.sprint; if (p.crouch) sp *= C.HIDER.crouch;
      } else if (p.crouch) sp *= C.SEEKER.crouch;
      sp *= (p.isBot ? p.level.speed : 1);
      p.vx = mx * sp; p.vz = mz * sp;
      const ox = p.x, oz = p.z; p.x += p.vx * dt; p.z += p.vz * dt;
      resolve(this.map, p, C.PLAYER_R);
      if (isH && ph === 'prep') {            // không ẩn trong khu người đi tìm xuất phát
        const dx = p.x - this.pen.x, dz = p.z - this.pen.z, d = Math.hypot(dx, dz);
        if (d < this.pen.r) { const k = this.pen.r / (d || 1e-6); p.x = this.pen.x + dx * k; p.z = this.pen.z + dz * k; resolve(this.map, p, C.PLAYER_R); }
      }
      const moved = Math.hypot(p.x - ox, p.z - oz);
      p.vx = (p.x - ox) / dt; p.vz = (p.z - oz) / dt;
      if (moved > 1e-4) { const want = Math.atan2(p.vx, p.vz); let d = want - p.yaw; d = Math.atan2(Math.sin(d), Math.cos(d)); p.yaw += d * Math.min(1, dt * 14); }
      // tiếng bước chân (cúi thì im lặng)
      if (isH && can && !p.crouch && moved > 1e-4 && ph === 'hunt') {
        p.stride += moved; const L = p.sprinting ? 1.5 : 1.1;
        if (p.stride >= L) { p.stride = 0; this.emit({ t: 'step', id: p.id, x: p.x, z: p.z, sprint: p.sprinting }); }
      }
      if (can && ph === 'hunt' && p.role === 'seeker' && c.fire) this.tryFire(p);
    }
    tryFire(p) {
      if (p.fireCd > 0) return false;
      const c = p.ctl, S = C.SLING; p.fireCd = S.cd; p.stat.shots++;
      const ox = p.x, oy = S.muzzleY, oz = p.z;
      let dx = c.ax, dy = c.ay, dz = c.az; const L = Math.hypot(dx, dy, dz) || 1; dx /= L; dy /= L; dz /= L;
      // điểm ngắm = điểm tia camera chạm; đạn bắn từ nòng tới đó và được bù độ rơi để trúng đúng tâm nếu mục tiêu đứng yên
      const ad = clamp(c.adist || 30, 3, S.range);
      let px = c.px != null ? c.px : ox + dx * ad, py = c.py != null ? c.py : oy + dy * ad, pz = c.pz != null ? c.pz : oz + dz * ad;
      let vx = px - ox, vy = py - oy, vz = pz - oz; const D = Math.hypot(vx, vy, vz) || 1; vx /= D; vy /= D; vz /= D;
      const T = D / S.speed, comp = 0.5 * S.gravity * T * T / D;      // bù độ rơi (xấp xỉ bay thẳng)
      vy += comp; const L2 = Math.hypot(vx, vy, vz); vx /= L2; vy /= L2; vz /= L2;
      const st = { id: this.stoneId++, owner: p.id, x: ox + vx * 0.5, y: oy + vy * 0.5, z: oz + vz * 0.5, vx: vx * S.speed, vy: vy * S.speed, vz: vz * S.speed, age: 0, dist: 0 };
      this.stones.push(st); p.yaw = Math.atan2(vx, vz);
      this.emit({ t: 'fire', id: p.id, sid: st.id, x: st.x, y: st.y, z: st.z, vx: st.vx, vy: st.vy, vz: st.vz });
      return true;
    }
    updateStones(dt) {
      const S = C.SLING, keep = [];
      for (const s of this.stones) {
        const n = 2, h = dt / n; let dead = false;
        for (let k = 0; k < n && !dead; k++) {
          const ax = s.x, ay = s.y, az = s.z; s.vy -= S.gravity * h;
          const bx = ax + s.vx * h, by = ay + s.vy * h, bz = az + s.vz * h; let bestT = 2, kind = null, who = null;
          // vật cản
          for (const o of this.map.boxes) {
            if (o.h < 0.2) continue;
            const lo = [o.x - o.w / 2 - S.r, -S.r, o.z - o.d / 2 - S.r], hi = [o.x + o.w / 2 + S.r, o.h + S.r, o.z + o.d / 2 + S.r];
            const O = [ax, ay, az], D = [bx - ax, by - ay, bz - az]; let t0 = 0, t1 = 1, ok = true;
            for (let i = 0; i < 3; i++) {
              if (Math.abs(D[i]) < 1e-9) { if (O[i] < lo[i] || O[i] > hi[i]) { ok = false; break; } continue; }
              let u = (lo[i] - O[i]) / D[i], v = (hi[i] - O[i]) / D[i]; if (u > v) { const q = u; u = v; v = q; }
              t0 = Math.max(t0, u); t1 = Math.min(t1, v); if (t0 > t1) { ok = false; break; }
            }
            if (ok && t0 < bestT) { bestT = t0; kind = 'wall'; }
          }
          for (const o of this.map.circles) {
            if (o.h < 0.2) continue; const t = segCircle2(ax, az, bx, bz, o, S.r);
            if (t >= 0 && t < bestT) { const y = ay + (by - ay) * t; if (y >= -S.r && y <= o.h + S.r) { bestT = t; kind = 'wall'; } }
          }
          if (by <= 0 && by < ay) { const t = ay / (ay - by); if (t < bestT) { bestT = t; kind = 'ground'; } }
          // người đi trốn (hình trụ)
          for (const q of this.players.values()) {
            if (q.role !== 'hider' || q.caught || !q.present) continue;
            const t = segCircle2(ax, az, bx, bz, { x: q.x, z: q.z, r: C.PLAYER_R + S.r }, 0);
            if (t >= 0 && t < bestT) { const y = ay + (by - ay) * t, hh = q.crouch ? C.H_CROUCH : C.H_STAND; if (y >= 0 && y <= hh) { bestT = t; kind = 'hider'; who = q; } }
          }
          if (kind) {
            s.x = ax + (bx - ax) * bestT; s.y = Math.max(0, ay + (by - ay) * bestT); s.z = az + (bz - az) * bestT; dead = true;
            this.emit({ t: 'stone_end', sid: s.id, x: s.x, y: s.y, z: s.z, kind });
            if (kind === 'hider') this.catchPlayer(who, s.owner);
          } else { s.x = bx; s.y = by; s.z = bz; s.dist += Math.hypot(bx - ax, by - ay, bz - az); }
        }
        s.age += dt;
        if (!dead && (s.dist > S.range || s.age > S.life)) { this.emit({ t: 'stone_end', sid: s.id, x: s.x, y: s.y, z: s.z, kind: 'range' }); dead = true; }
        if (!dead) keep.push(s);
      }
      this.stones = keep;
    }
    catchPlayer(q, byId) {
      if (q.caught) return; q.caught = true; q.caughtAt = this.t; q.sprinting = false; q.vx = q.vz = 0;
      q.stat.caughtT = Math.max(0, this.phaseT);
      const by = this.players.get(byId); if (by) { by.stat.catches++; by.stat.hits++; }
      this.emit({ t: 'catch', id: q.id, by: byId, left: this.hidersLeft() });
      if (this.hidersLeft() === 0 && this.phase === 'hunt') this.finish('seekers', 'allcaught');
    }
    pings() {
      for (const p of this.hiders) {
        if (p.caught) continue;
        while (this.t >= p.pingAt) {
          p.pingAt += C.PING.every;
          this.emit({ t: 'ping', id: p.id, x: p.x, z: p.z, gain: p.crouch ? C.PING.crouchGain : 1 });
        }
      }
    }
    /** rời trận (mất kết nối / thoát). Cập nhật số người còn lại và xác định kết quả hợp lệ */
    leave(id) {
      const p = this.players.get(id); if (!p || !p.present) return; p.present = false;
      this.emit({ t: 'left', id });
      if (this.phase === 'over' || this.phase === 'lobby') return;
      if (!this.seekers.length) this.finish('hiders', 'seekersleft');
      else if (!this.hiders.length || this.hidersLeft() === 0) this.finish(this.hiders.length ? 'seekers' : 'hiders', this.hiders.length ? 'allcaught' : 'hidersleft');
    }
    finish(winner, why) {
      if (this.phase === 'over') return;
      const P = C.POINTS, res = { winner, why, time: Math.round(this.phaseT), total: this.hiders.length, caught: this.hiders.filter((p) => p.caught).length, survived: this.hiders.filter((p) => !p.caught).length, rows: [] };
      for (const p of this.players.values()) {
        if (!p.present) continue; let pts;
        if (p.role === 'seeker') pts = P.seekPlay + p.stat.catches * P.seekCatch + (winner === 'seekers' ? P.seekWin : 0);
        else pts = P.hidePlay + (!p.caught ? P.hideSurvive : 0) + (winner === 'hiders' ? P.hideWin : 0);
        res.rows.push({ id: p.id, name: p.name, role: p.role, caught: p.caught, catches: p.stat.catches, pts });
      }
      this.result = res; this.phase = 'over'; this.phaseT = 0; this.emit({ t: 'over', result: res });
    }
  }
  return { Sim, Nav, navOf, hearGain, blockersBetween, rayWorld, resolve, cdist, mixHex, hexNum, TALL };
});
