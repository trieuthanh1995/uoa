/* Ú òa – lõi mô phỏng (trình duyệt + Node). Chỉ chứa luật chơi: di chuyển (nhiều tầng, 3 tư thế), pha trận, ná cao su, bắt người, âm thanh định vị.
 * Hệ tọa độ: mặt đất là (x, z), y hướng lên (độ cao chân). Hướng yaw: hướng đi = (sin yaw, cos yaw).
 * Bản đồ: hộp/trụ có độ cao nền o.y (mặc định 0) + `surfaces` (sàn phẳng hoặc dốc cầu thang). Mặt đất y=0 luôn có.
 * Sim phát sự kiện vào hàng đợi drain(): phase, ping, step, fire, stone_end, catch, over, sprint, role. */
(function (root, factory) {
  const isNode = typeof module === 'object' && module.exports;
  const mod = factory(isNode ? require('./config.js') : root.UO, isNode ? require('./maps.js') : root.UO);
  if (isNode) module.exports = mod; else { root.UO = root.UO || {}; Object.assign(root.UO, mod); }
})(typeof self !== 'undefined' ? self : this, function (cfg, maps) {
  'use strict';
  const { C, LEVELS } = cfg;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const STEP_UP = 0.55, SLAB_T = 0.3;
  const HEIGHT = [C.H_STAND, C.H_CROUCH, C.H_PRONE];           // chiều cao thân theo tư thế (đứng, cúi, nằm)
  const NEED = [1.9, 1.15, 0.55];                              // độ thoáng đầu tối thiểu để ở tư thế đó
  const CENTER = [1.0, 0.65, 0.25];                            // độ cao trọng tâm để bot ngắm / kiểm tra tầm nhìn
  const rngOf = (a) => () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

  /* ================= màu ================= */
  const hexNum = (c) => (typeof c === 'number' ? c : parseInt(String(c).replace('#', ''), 16) || 0);
  function cdist(a, b) {
    a = hexNum(a); b = hexNum(b);
    const dr = (a >> 16 & 255) - (b >> 16 & 255), dg = (a >> 8 & 255) - (b >> 8 & 255), db = (a & 255) - (b & 255);
    return Math.sqrt(dr * dr + dg * dg + db * db) / 441.7;
  }
  function mixHex(list) {
    let r = 0, g = 0, b = 0, w = 0;
    for (const [c, k] of list) { const n = hexNum(c); r += (n >> 16 & 255) * k; g += (n >> 8 & 255) * k; b += (n & 255) * k; w += k; }
    return ((Math.round(r / w) << 16) | (Math.round(g / w) << 8) | Math.round(b / w)) >>> 0;
  }

  /* ================= chuẩn bị bản đồ (tầng, bề mặt) ================= */
  function prepMap(map) {
    if (map._prep) return map; map._prep = true;
    map.surfaces = map.surfaces || []; map.buildings = map.buildings || [];
    const set = new Set([0]);
    for (const s of map.surfaces) { set.add(+s.y0.toFixed(2)); set.add(+s.y1.toFixed(2)); }
    map.levels = [...set].sort((a, b) => a - b);
    const li = (y) => { let bi = 0; for (let k = 1; k < map.levels.length; k++) if (Math.abs(map.levels[k] - y) < Math.abs(map.levels[bi] - y)) bi = k; return bi; };
    map.levelOf = li;
    map.surfaces.forEach((s, i) => { s.id = i; s.la = li(s.y0); s.lb = li(s.y1); });
    map.ramps = map.surfaces.filter((s) => s.y0 !== s.y1);
    return map;
  }
  const covers = (s, x, z) => x >= s.x0 - 1e-6 && x <= s.x1 + 1e-6 && z >= s.z0 - 1e-6 && z <= s.z1 + 1e-6;
  function fracOf(s, x, z) {
    let t; switch (s.dir) { case 'x+': t = (x - s.x0) / (s.x1 - s.x0); break; case 'x-': t = (s.x1 - x) / (s.x1 - s.x0); break; case 'z+': t = (z - s.z0) / (s.z1 - s.z0); break; default: t = (s.z1 - z) / (s.z1 - s.z0); }
    return clamp(t, 0, 1);
  }
  const heightAt = (s, x, z) => (s.dir ? s.y0 + (s.y1 - s.y0) * fracOf(s, x, z) : s.y0);
  /** nền đứng được tại (x,z) cho người đang ở độ cao y: độ cao mặt đứng + khoảng trần phía trên */
  function groundAt(map, x, z, y) {
    let h = 0; const S = map.surfaces;
    for (let i = 0; i < S.length; i++) { const s = S[i]; if (covers(s, x, z)) { const hs = heightAt(s, x, z); if (hs <= y + STEP_UP && hs > h) h = hs; } }
    let ceil = Infinity;
    for (let i = 0; i < S.length; i++) { const s = S[i]; if (covers(s, x, z)) { const b = heightAt(s, x, z) - SLAB_T; if (b > h + 0.05 && b < ceil) ceil = b; } }
    return { h, clear: ceil - h };
  }

  /* ================= hình học ================= */
  const oy = (o) => o.y || 0;
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
  /** Đẩy vòng tròn (x,z,r) ra khỏi vật cản có độ cao chồng với thân người [y+0.4, y+hgt] và giữ trong ranh giới */
  function resolve(map, p, r, y, hgt) {
    y = y || 0; hgt = hgt || C.H_STAND; const lo = y + 0.4, hi = y + hgt;
    for (let it = 0; it < 3; it++) {
      for (const o of map.boxes) { const b = oy(o); if (b + o.h <= lo || b >= hi) continue; const v = pushOutBox(o, p.x, p.z, r); if (v) { p.x += v[0]; p.z += v[1]; } }
      for (const o of map.circles) { const b = oy(o); if (b + o.h <= lo || b >= hi) continue; const v = pushOutCircle(o, p.x, p.z, r); if (v) { p.x += v[0]; p.z += v[1]; } }
    }
    p.x = clamp(p.x, -map.HW + r, map.HW - r); p.z = clamp(p.z, -map.HD + r, map.HD - r);
  }
  function segBox2(ax, az, bx, bz, o) {
    const hx = o.w / 2, hz = o.d / 2; let t0 = 0, t1 = 1; const dx = bx - ax, dz = bz - az;
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
  /** đoạn 3D cắt hộp: trả về t vào (0..1) hoặc -1; pad mở rộng hộp (bán kính đạn) */
  function segBox3(ax, ay, az, bx, by, bz, o, pad) {
    pad = pad || 0; const lo = [o.x - o.w / 2 - pad, oy(o) - pad, o.z - o.d / 2 - pad], hi = [o.x + o.w / 2 + pad, oy(o) + o.h + pad, o.z + o.d / 2 + pad];
    const O = [ax, ay, az], D = [bx - ax, by - ay, bz - az]; let t0 = 0, t1 = 1;
    for (let i = 0; i < 3; i++) {
      if (Math.abs(D[i]) < 1e-9) { if (O[i] < lo[i] || O[i] > hi[i]) return -1; continue; }
      let u = (lo[i] - O[i]) / D[i], v = (hi[i] - O[i]) / D[i]; if (u > v) { const q = u; u = v; v = q; }
      t0 = Math.max(t0, u); t1 = Math.min(t1, v); if (t0 > t1) return -1;
    }
    return t0;
  }
  /** số bề mặt (sàn/trần/dốc) mà đoạn 3D cắt qua (lấy mẫu) */
  function surfaceHits(map, ax, ay, az, bx, by, bz) {
    const S = map.surfaces; if (!S.length) return 0;
    const len = Math.hypot(bx - ax, by - ay, bz - az), n = Math.max(2, Math.ceil(len / 0.3)); let hit = 0; const seen = new Set();
    for (let k = 0; k <= n; k++) {
      const t = k / n, x = ax + (bx - ax) * t, y = ay + (by - ay) * t, z = az + (bz - az) * t;
      for (let i = 0; i < S.length; i++) { const s = S[i]; if (seen.has(i) || !covers(s, x, z)) continue; const hs = heightAt(s, x, z); if (y <= hs + 0.02 && y >= hs - SLAB_T - 0.02) { seen.add(i); hit++; } }
    }
    return hit;
  }
  /** số vật chắn giữa hai điểm 3D (tường/đồ vật/sàn). Dùng cho tầm nhìn và tiếng */
  function blockers3(map, ax, ay, az, bx, by, bz) {
    let n = 0;
    for (const o of map.boxes) if (segBox3(ax, ay, az, bx, by, bz, o) >= 0) n++;
    for (const o of map.circles) { const t = segCircle2(ax, az, bx, bz, o, 0); if (t >= 0) { const y = ay + (by - ay) * t, b = oy(o); if (y >= b && y <= b + o.h) n++; } }
    return n + surfaceHits(map, ax, ay, az, bx, by, bz);
  }
  /** tương thích bản cũ: hai điểm cùng độ cao ngang ngực ở tầng trệt */
  const blockersBetween = (map, ax, az, bx, bz, minH, ay, by) => blockers3(map, ax, ay == null ? 1.0 : ay, az, bx, by == null ? 1.0 : by, bz);
  /** tia 3D tới vật cản (camera / điểm ngắm). skip = { above, rect }: bỏ qua vật nằm trên độ cao `above` trong `rect` (mở mái khi vào nhà) */
  function rayWorld(map, ox, oy_, oz, dx, dy, dz, maxT, minH, skip) {
    minH = minH || 0; let best = maxT;
    const ex = ox + dx * maxT, ey = oy_ + dy * maxT, ez = oz + dz * maxT;
    const skipIt = (bottom, x, z) => skip && bottom >= skip.above && (!skip.rect || (x >= skip.rect.x0 && x <= skip.rect.x1 && z >= skip.rect.z0 && z <= skip.rect.z1));
    for (const o of map.boxes) {
      if (o.h < minH || skipIt(oy(o), o.x, o.z)) continue;
      const t = segBox3(ox, oy_, oz, ex, ey, ez, o, 0); if (t >= 0 && t * maxT < best) best = t * maxT;
    }
    for (const o of map.circles) {
      if (o.h < minH || skipIt(oy(o), o.x, o.z)) continue;
      const t = segCircle2(ox, oz, ex, ez, o, 0);
      if (t >= 0) { const y = oy_ + (ey - oy_) * t, b = oy(o); if (y >= b && y <= b + o.h && t * maxT < best) best = t * maxT; }
    }
    const S = map.surfaces;
    if (S.length) {
      const n = Math.max(2, Math.ceil(Math.min(best, maxT) / 0.25));
      for (let k = 1; k <= n; k++) {
        const t = k / n * Math.min(best, maxT), x = ox + dx * t, y = oy_ + dy * t, z = oz + dz * t; let hit = false;
        for (let i = 0; i < S.length && !hit; i++) { const s = S[i]; if (!covers(s, x, z)) continue; const hs = heightAt(s, x, z); if (skipIt(hs - SLAB_T, (s.x0 + s.x1) / 2, (s.z0 + s.z1) / 2)) continue; if (y <= hs && y >= hs - SLAB_T - 0.15) hit = true; }
        if (hit) { if (t < best) best = t; break; }
      }
    }
    if (dy < -1e-6) { const t = -oy_ / dy; if (t > 0 && t < best) best = t; }
    return best;
  }

  /* ================= lưới đường đi nhiều tầng (bot) ================= */
  class Heap {
    constructor() { this.a = []; }
    push(f, k) { const a = this.a; a.push([f, k]); let i = a.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (a[p][0] <= a[i][0]) break; [a[p], a[i]] = [a[i], a[p]]; i = p; } }
    pop() { const a = this.a, top = a[0], last = a.pop(); if (a.length) { a[0] = last; let i = 0; for (;;) { let l = 2 * i + 1, r = l + 1, m = i; if (l < a.length && a[l][0] < a[m][0]) m = l; if (r < a.length && a[r][0] < a[m][0]) m = r; if (m === i) break; [a[m], a[i]] = [a[i], a[m]]; i = m; } } return top; }
    get size() { return this.a.length; }
  }
  class Nav {
    constructor(map, cell) {
      prepMap(map); this.map = map; this.cs = cell || 0.6; this.L = map.levels.length;
      this.W = Math.ceil(2 * map.HW / this.cs); this.H = Math.ceil(2 * map.HD / this.cs); this.N = this.W * this.H;
      this.blocked = new Uint8Array(this.L * this.N).fill(1); this.ramp = new Int16Array(this.L * this.N).fill(-1); this.hgt = new Float32Array(this.L * this.N);
      const r = C.PLAYER_R + 0.04;
      for (let k = 0; k < this.L; k++) {
        const e = map.levels[k];
        for (let j = 0; j < this.H; j++) for (let i = 0; i < this.W; i++) {
          const x = -map.HW + (i + 0.5) * this.cs, z = -map.HD + (j + 0.5) * this.cs, id = k * this.N + j * this.W + i;
          if (Math.abs(x) > map.HW - r || Math.abs(z) > map.HD - r) continue;
          let y = e, ok = false;
          const g = groundAt(map, x, z, e + 0.05); if (Math.abs(g.h - e) < 0.06 && g.clear >= 1.95) ok = true;
          for (const s of map.ramps) if (covers(s, x, z)) { const t = fracOf(s, x, z), kk = t < 0.5 ? s.la : s.lb; if (kk === k) { ok = true; this.ramp[id] = s.id; y = heightAt(s, x, z); } }
          if (!ok) continue;
          this.hgt[id] = y; const lo = y + 0.4, hi = y + 1.75; let blk = false;
          for (const o of map.boxes) { const b = oy(o); if (b + o.h <= lo || b >= hi) continue; if (pushOutBox(o, x, z, r)) { blk = true; break; } }
          if (!blk) for (const o of map.circles) { const b = oy(o); if (b + o.h <= lo || b >= hi) continue; if (pushOutCircle(o, x, z, r)) { blk = true; break; } }
          this.blocked[id] = blk ? 1 : 0;
        }
      }
      this.comp = new Int32Array(this.L * this.N).fill(-1); this.mainComp = -1; this._components();
    }
    cellOf(x, z) { return clamp(Math.floor((z + this.map.HD) / this.cs), 0, this.H - 1) * this.W + clamp(Math.floor((x + this.map.HW) / this.cs), 0, this.W - 1); }
    pos(id) { const c = id % this.N; return [-this.map.HW + ((c % this.W) + 0.5) * this.cs, -this.map.HD + (Math.floor(c / this.W) + 0.5) * this.cs]; }
    levelOfId(id) { return Math.floor(id / this.N); }
    idx(x, z, k) { return (k || 0) * this.N + this.cellOf(x, z); }
    free(x, z, k) { const id = this.idx(x, z, k); return !this.blocked[id]; }
    /** các ô kề (kể cả nối tầng qua dốc) */
    each(id, fn) {
      const k = Math.floor(id / this.N), c = id % this.N, i = c % this.W, j = (c / this.W) | 0, W = this.W, H = this.H, base = k * this.N, h0 = this.hgt[id];
      for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) {
        if (!di && !dj) continue; const a = i + di, b = j + dj; if (a < 0 || b < 0 || a >= W || b >= H) continue;
        const q = base + b * W + a; if (this.blocked[q] || Math.abs(this.hgt[q] - h0) > STEP_UP) continue;
        if (di && dj && (this.blocked[base + j * W + a] || this.blocked[base + b * W + i])) continue;
        fn(q, di && dj ? 1.4142 : 1);
      }
      const rid = this.ramp[id];
      if (rid >= 0) {                                        // sang tầng kia của cùng một cầu thang
        const s = this.map.surfaces[rid], k2 = k === s.la ? s.lb : s.la;
        for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const a = i + di, b = j + dj; if (a < 0 || b < 0 || a >= W || b >= H) continue; const q = k2 * this.N + b * W + a; if (!this.blocked[q] && this.ramp[q] === rid && Math.abs(this.hgt[q] - h0) <= STEP_UP) fn(q, 1); }
      }
    }
    _components() {
      let id = 0, bestN = 0;
      for (let s = 0; s < this.comp.length; s++) {
        if (this.blocked[s] || this.comp[s] >= 0) continue; const st = [s]; this.comp[s] = id; let n = 0;
        while (st.length) { const k = st.pop(); n++; this.each(k, (q) => { if (this.comp[q] < 0) { this.comp[q] = id; st.push(q); } }); }
        if (n > bestN) { bestN = n; this.mainComp = id; } id++;
      }
    }
    nearestFree(x, z, k) {
      k = k || 0; const id = this.idx(x, z, k); if (!this.blocked[id] && this.comp[id] === this.mainComp) return [x, z, id];
      const base = k * this.N, c = id % this.N, W = this.W, i0 = c % W, j0 = (c / W) | 0;
      for (let R = 1; R < 16; R++) for (let j = j0 - R; j <= j0 + R; j++) for (let i = i0 - R; i <= i0 + R; i++) {
        if (i < 0 || j < 0 || i >= W || j >= this.H) continue; if (Math.max(Math.abs(i - i0), Math.abs(j - j0)) !== R) continue;
        const q = base + j * W + i; if (!this.blocked[q] && this.comp[q] === this.mainComp) { const p = this.pos(q); return [p[0], p[1], q]; }
      }
      return [x, z, id];
    }
    clear(k, ax, az, bx, bz) {
      const d = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.ceil(d / (this.cs * 0.45)));
      for (let s = 0; s <= n; s++) { const t = s / n; if (this.blocked[k * this.N + this.cellOf(ax + (bx - ax) * t, az + (bz - az) * t)]) return false; }
      return true;
    }
    /** A*; (ay, by) là độ cao chân xuất phát / đích. Trả về danh sách điểm [x,z] đã làm thẳng hoặc null */
    path(ax, az, ay, bx, bz, by) {
      const map = this.map, ka = map.levelOf(ay || 0), kb = map.levelOf(by || 0);
      const [sx, sz, s] = this.nearestFree(ax, az, ka), [gx, gz, g] = this.nearestFree(bx, bz, kb); if (s === g) return [[gx, gz]];
      const G = new Float32Array(this.comp.length).fill(1e9), from = new Int32Array(this.comp.length).fill(-1), closed = new Uint8Array(this.comp.length);
      const heap = new Heap(); G[s] = 0; heap.push(0, s); const [tx, tz] = this.pos(g), gk = this.levelOfId(g);
      const hh = (q) => { const p = this.pos(q); return (Math.hypot(p[0] - tx, p[1] - tz) / this.cs) + Math.abs(this.levelOfId(q) - gk) * 2; };
      let guard = 0;
      while (heap.size && guard++ < 200000) {
        const [, k] = heap.pop(); if (k === g) break; if (closed[k]) continue; closed[k] = 1;
        this.each(k, (q, c) => { if (closed[q]) return; const ng = G[k] + c; if (ng < G[q]) { G[q] = ng; from[q] = k; heap.push(ng + hh(q), q); } });
      }
      if (from[g] < 0) return null;
      const nodes = []; for (let k = g; k !== s && k >= 0; k = from[k]) nodes.push(k); nodes.reverse();
      const out = []; let cx = sx, cz = sz, i = 0;
      while (i < nodes.length) {
        const n = nodes[i], lv = this.levelOfId(n);
        if (this.ramp[n] >= 0) { const p = this.pos(n); out.push([p[0], p[1]]); cx = p[0]; cz = p[1]; i++; continue; }
        let j = i; while (j + 1 < nodes.length && this.levelOfId(nodes[j + 1]) === lv && this.ramp[nodes[j + 1]] < 0) j++;
        while (j > i) { const p = this.pos(nodes[j]); if (this.clear(lv, cx, cz, p[0], p[1])) break; j--; }
        const p = this.pos(nodes[j]); out.push([p[0], p[1]]); cx = p[0]; cz = p[1]; i = j + 1;
      }
      out[out.length - 1] = [gx, gz]; return out;
    }
  }
  const navCache = new Map();
  function navOf(map) { let n = navCache.get(map.id); if (!n) { n = new Nav(map); navCache.set(map.id, n); } return n; }

  /* ================= nghe âm thanh ================= */
  /** độ lớn (0..1) người nghe (lx,ly,lz) nghe nguồn (sx,sy,sz): suy giảm theo khoảng cách 3D; mỗi vật cao/sàn xen giữa nhân với wallLoss */
  function hearGain(map, lx, ly, lz, sx, sy, sz, range, gain0) {
    const d = Math.hypot(sx - lx, sy - ly, sz - lz); if (d >= range) return { gain: 0, walls: 0, d };
    const walls = blockers3(map, lx, ly + 1.5, lz, sx, sy + 1.0, sz);
    const fall = 1 / (1 + (d / 6) * (d / 6) * 0.5);
    return { gain: (gain0 == null ? 1 : gain0) * fall * Math.pow(C.PING.wallLoss, Math.min(walls, 4)) * (1 - d / range), walls, d };
  }

  /* ================= Sim ================= */
  class Sim {
    /** opts: { mapId, players:[{id,name,char,isBot,level,base}], seekers, roleMode:'random'|'seeker'|'hider', meId, seed } */
    constructor(opts) {
      this.map = prepMap(maps.mapOf(opts.mapId)); this.nav = navOf(this.map);
      this.seed = opts.seed >>> 0 || 1; this.R = rngOf(this.seed);
      this.events = []; this.acc = 0; this.t = 0; this.phase = 'lobby'; this.phaseT = 0; this.phaseDur = 0;
      this.players = new Map(); this.stones = []; this.stoneId = 1; this.result = null; this.paused = false;
      const n = clamp(opts.players.length, C.MIN_PLAYERS, C.MAX_PLAYERS);
      this.seekerCount = clamp(opts.seekers | 0, 1, n - 1);
      const order = opts.players.slice(0, n);
      const meIdx = order.findIndex((p) => p.id === opts.meId), seekIdx = new Set();
      if (opts.roleMode === 'seeker' && meIdx >= 0) seekIdx.add(meIdx);
      const pool = order.map((_, i) => i).filter((i) => !(opts.roleMode === 'hider' && i === meIdx) && !seekIdx.has(i));
      for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(this.R() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
      while (seekIdx.size < this.seekerCount && pool.length) seekIdx.add(pool.shift());
      const hs = this.shuffle(this.map.spawns.hider.slice()), ss = this.map.spawns.seeker.slice(); let hi = 0, si = 0;
      order.forEach((p, i) => {
        const role = seekIdx.has(i) ? 'seeker' : 'hider', sp0 = role === 'seeker' ? ss[si++ % ss.length] : hs[hi++ % hs.length];
        const sp = this.nav.nearestFree(sp0[0], sp0[1], 0), lv = LEVELS[p.level] || LEVELS.normal;
        this.players.set(p.id, {
          id: p.id, name: p.name, char: p.char, isBot: !!p.isBot, level: lv, base: p.base == null ? 0xcccccc : p.base, role,
          x: sp[0], z: sp[1], y: 0, vy: 0, vx: 0, vz: 0, yaw: role === 'seeker' ? 0 : this.R() * 6.28,
          stance: 0, crouch: false, prone: false, trans: 0, caught: false, caughtAt: -1, present: true,
          sprintLeft: C.HIDER.sprintTime, sprintCd: 0, sprinting: false, fireCd: 0, pingAt: 1e9, stride: 0, paint: null, art: null,
          ctl: { mx: 0, mz: 0, sprint: false, stance: 0, fire: false, ax: 0, ay: 0, az: 1, adist: 30 },
          stat: { catches: 0, caughtT: 0, shots: 0, hits: 0 }, mem: {},
        });
      });
      this.order = order.map((p) => p.id);
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
    /** paint: màu trung bình từng vùng (head/body/arms/legs) dùng để tính độ ngụy trang; art: dữ liệu nét vẽ gốc (để đồng bộ về sau) */
    setPaint(id, paint, art) {
      const p = this.players.get(id); if (!p || p.role !== 'hider' || !this.canPaint()) return false;
      p.paint = paint ? Object.assign({}, paint) : null; if (art !== undefined) p.art = art; return true;
    }
    start() { this.setPhase('intro', C.INTRO); for (const p of this.players.values()) this.emit({ t: 'role', id: p.id, role: p.role }); }
    setPhase(ph, dur) {
      this.phase = ph; this.phaseT = 0; this.phaseDur = dur || 0;
      if (ph === 'hunt') { const hs = this.hiders, n = hs.length || 1; hs.forEach((p, i) => { p.pingAt = this.t + (C.PING.stagger ? (i + 0.5) / n * C.PING.every : C.PING.every); }); }
      this.emit({ t: 'phase', phase: ph, dur: this.phaseDur });
    }
    paintAvg(p) {
      const z = p.paint || {}; const g = (k) => (z[k] ? hexNum(z[k]) : p.base);
      return mixHex([[g('body'), 0.42], [g('head'), 0.2], [g('arms'), 0.14], [g('legs'), 0.24]]);
    }
    /** màu nền xung quanh: vật cùng tầng gần nhất trong 3 m, nếu không có thì màu sàn */
    backdrop(x, z, y) {
      y = y || 0; let best = 3.0, col = this.map.floor;
      for (const o of this.map.boxes) { const b = oy(o); if (o.h < 0.8 || b > y + 1.5 || b + o.h < y + 0.6) continue; const cx = clamp(x, o.x - o.w / 2, o.x + o.w / 2), cz = clamp(z, o.z - o.d / 2, o.z + o.d / 2), d = Math.hypot(x - cx, z - cz); if (d < best) { best = d; col = o.c; } }
      for (const o of this.map.circles) { const b = oy(o); if (o.h < 0.8 || o.k === 'pond' || b > y + 1.5 || b + o.h < y + 0.6) continue; const d = Math.hypot(x - o.x, z - o.z) - o.r; if (d < best) { best = d; col = o.c2 != null ? o.c2 : o.c; } }
      if (y > 0.3) { for (const s of this.map.surfaces) if (covers(s, x, z) && Math.abs(heightAt(s, x, z) - y) < 0.4 && best > 2.9) { col = s.c; break; } }
      return { col, dist: best };
    }
    /** 0 = hòa lẫn hoàn toàn … 1 = nổi bật hẳn */
    conspicuity(p) {
      const bd = this.backdrop(p.x, p.z, p.y), cd = cdist(this.paintAvg(p), bd.col), near = clamp(1 - bd.dist / 3, 0, 1);
      return clamp(1 - (1 - clamp(cd / 0.5, 0, 1)) * (0.35 + 0.65 * near), 0.12, 1);
    }
    centerY(p) { return p.y + CENTER[p.stance]; }

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
    /** đổi tư thế nếu đủ chỗ (độ thoáng đầu) và không đang chuyển tư thế */
    setStance(p, want) {
      if (want === p.stance || p.trans > 0) return;
      if (want < p.stance) { const g = groundAt(this.map, p.x, p.z, p.y); if (g.clear < NEED[want]) { p.mem.lowCeil = this.t; return; } }
      const toFrom = (want === 2 || p.stance === 2);
      p.trans = toFrom ? C.PRONE.transition : 0.15; p.stance = want; p.crouch = want === 1; p.prone = want === 2;
      if (want !== 0) { p.sprinting = false; }
    }
    movePlayer(p, dt) {
      const c = p.ctl, ph = this.phase, map = this.map;
      p.fireCd = Math.max(0, p.fireCd - dt); p.sprintCd = Math.max(0, p.sprintCd - dt); p.trans = Math.max(0, p.trans - dt);
      let can = !p.caught && ph !== 'over' && ph !== 'intro';
      if (p.role === 'seeker' && ph === 'prep') can = false;
      const isH = p.role === 'hider';
      if (can) this.setStance(p, c.stance != null ? c.stance : (c.crouch ? 1 : 0));
      else if (p.caught) { p.stance = 0; p.crouch = p.prone = false; }
      let mx = can ? c.mx : 0, mz = can ? c.mz : 0; const ml = Math.hypot(mx, mz); if (ml > 1) { mx /= ml; mz /= ml; }
      let sp = isH ? C.HIDER.walk : C.SEEKER.walk;
      if (isH) {
        if (p.sprinting) { p.sprintLeft -= dt; if (p.sprintLeft <= 0 || !c.sprint || p.stance !== 0 || ml < 0.1) { p.sprinting = false; if (p.sprintLeft <= 0) p.sprintLeft = 0; p.sprintCd = Math.max(p.sprintCd, C.HIDER.sprintCd); } }
        if (!p.sprinting && c.sprint && can && ml > 0.1 && p.stance === 0 && p.trans <= 0 && p.sprintCd <= 0 && ph === 'hunt') { p.sprinting = true; p.sprintLeft = C.HIDER.sprintTime; this.emit({ t: 'sprint', id: p.id }); }
        if (!p.sprinting && p.sprintCd <= 0) p.sprintLeft = C.HIDER.sprintTime;
        if (p.sprinting) sp = C.HIDER.sprint;
      }
      if (p.stance === 1) sp *= isH ? C.HIDER.crouch : C.SEEKER.crouch; else if (p.stance === 2) sp *= C.PRONE.speed;
      if (p.trans > 0) sp *= 0.25;
      sp *= (p.isBot ? p.level.speed : 1);
      const ox = p.x, oz = p.z, ovy = p.y, hgt = HEIGHT[p.stance], need = NEED[p.stance];
      // thử đi; nếu đầu chạm trần (gầm cầu thang) thì thử trượt theo từng trục
      const tryMove = (nx, nz) => { const q = { x: nx, z: nz }; resolve(map, q, C.PLAYER_R, p.y, hgt); const g = groundAt(map, q.x, q.z, p.y); if (g.clear < need) return null; return [q.x, q.z, g.h]; };
      const nx = p.x + mx * sp * dt, nz = p.z + mz * sp * dt;
      let r = tryMove(nx, nz) || tryMove(nx, p.z) || tryMove(p.x, nz);
      if (r) { p.x = r[0]; p.z = r[1]; const gh = r[2]; if (gh >= p.y) { p.y = gh; p.vy = 0; } else { p.vy -= 22 * dt; p.y = Math.max(gh, p.y + p.vy * dt); if (p.y === gh) p.vy = 0; } }
      else if (!(mx || mz) || true) { const g = groundAt(map, p.x, p.z, p.y); if (g.h < p.y - 1e-4) { p.vy -= 22 * dt; p.y = Math.max(g.h, p.y + p.vy * dt); } }
      if (isH && ph === 'prep') {
        const dx = p.x - this.pen.x, dz = p.z - this.pen.z, d = Math.hypot(dx, dz);
        if (d < this.pen.r) { const k = this.pen.r / (d || 1e-6); p.x = this.pen.x + dx * k; p.z = this.pen.z + dz * k; resolve(map, p, C.PLAYER_R, p.y, hgt); }
      }
      const moved = Math.hypot(p.x - ox, p.z - oz);
      p.vx = (p.x - ox) / dt; p.vz = (p.z - oz) / dt; void ovy;
      if (moved > 1e-4 && (mx || mz)) { const want = Math.atan2(p.vx, p.vz); let d = want - p.yaw; d = Math.atan2(Math.sin(d), Math.cos(d)); p.yaw += d * Math.min(1, dt * 14); }
      if (isH && can && p.stance !== 1 && moved > 1e-4 && ph === 'hunt') {      // cúi = im lặng; nằm = rất khẽ
        p.stride += moved; const L = p.sprinting ? 1.5 : p.stance === 2 ? 0.7 : 1.1;
        if (p.stride >= L) { p.stride = 0; this.emit({ t: 'step', id: p.id, x: p.x, y: p.y, z: p.z, sprint: p.sprinting, soft: p.stance === 2 }); }
      }
      if (can && ph === 'hunt' && p.role === 'seeker' && c.fire) this.tryFire(p);
    }
    tryFire(p) {
      if (p.fireCd > 0 || p.stance === 2 || p.trans > 0) return false;     // không bắn ná khi đang nằm / đang đổi tư thế
      const c = p.ctl, S = C.SLING; p.fireCd = S.cd; p.stat.shots++;
      const ox = p.x, oy_ = p.y + (p.stance === 1 ? 0.95 : S.muzzleY), oz = p.z;
      let dx = c.ax, dy = c.ay, dz = c.az; const L = Math.hypot(dx, dy, dz) || 1; dx /= L; dy /= L; dz /= L;
      const ad = clamp(c.adist || 30, 3, S.range);
      const px = c.px != null ? c.px : ox + dx * ad, py = c.py != null ? c.py : oy_ + dy * ad, pz = c.pz != null ? c.pz : oz + dz * ad;
      let vx = px - ox, vy = py - oy_, vz = pz - oz; const D = Math.hypot(vx, vy, vz) || 1; vx /= D; vy /= D; vz /= D;
      const T = D / S.speed, comp = 0.5 * S.gravity * T * T / D;
      vy += comp; const L2 = Math.hypot(vx, vy, vz); vx /= L2; vy /= L2; vz /= L2;
      const st = { id: this.stoneId++, owner: p.id, x: ox + vx * 0.5, y: oy_ + vy * 0.5, z: oz + vz * 0.5, vx: vx * S.speed, vy: vy * S.speed, vz: vz * S.speed, age: 0, dist: 0 };
      this.stones.push(st); p.yaw = Math.atan2(vx, vz);
      this.emit({ t: 'fire', id: p.id, sid: st.id, x: st.x, y: st.y, z: st.z, vx: st.vx, vy: st.vy, vz: st.vz });
      return true;
    }
    updateStones(dt) {
      const S = C.SLING, keep = [], map = this.map;
      for (const s of this.stones) {
        const n = 2, h = dt / n; let dead = false;
        for (let k = 0; k < n && !dead; k++) {
          const ax = s.x, ay = s.y, az = s.z; s.vy -= S.gravity * h;
          const bx = ax + s.vx * h, by = ay + s.vy * h, bz = az + s.vz * h; let bestT = 2, kind = null, who = null;
          for (const o of map.boxes) { if (o.h < 0.2) continue; const t = segBox3(ax, ay, az, bx, by, bz, o, S.r); if (t >= 0 && t < bestT) { bestT = t; kind = 'wall'; } }
          for (const o of map.circles) { if (o.h < 0.2) continue; const t = segCircle2(ax, az, bx, bz, o, S.r); if (t >= 0 && t < bestT) { const y = ay + (by - ay) * t, b = oy(o); if (y >= b - S.r && y <= b + o.h + S.r) { bestT = t; kind = 'wall'; } } }
          // sàn / trần / cầu thang: đạn cắt qua mặt phẳng (có độ dày)
          for (const sf of map.surfaces) {
            const mx2 = (ax + bx) / 2, mz2 = (az + bz) / 2; if (!covers(sf, mx2, mz2) && !covers(sf, ax, az) && !covers(sf, bx, bz)) continue;
            const ha = heightAt(sf, ax, az), hb = heightAt(sf, bx, bz), da = ay - ha, db = by - hb, ta = ay - (ha - SLAB_T), tb = by - (hb - SLAB_T);
            let t = -1; if (da > 0 && db <= 0) t = da / (da - db); else if (ta < 0 && tb >= 0) t = ta / (ta - tb); else if (da <= 0 && ta >= 0 && (covers(sf, ax, az))) t = 0;
            if (t >= 0 && t < bestT) { const cx = ax + (bx - ax) * t, cz = az + (bz - az) * t; if (covers(sf, cx, cz)) { bestT = t; kind = 'wall'; } }
          }
          if (by <= 0 && by < ay) { const t = ay / (ay - by); if (t < bestT) { bestT = t; kind = 'ground'; } }
          for (const q of this.players.values()) {
            if (q.role !== 'hider' || q.caught || !q.present) continue;
            const t = segCircle2(ax, az, bx, bz, { x: q.x, z: q.z, r: C.PLAYER_R + S.r }, 0);
            if (t >= 0 && t < bestT) { const y = ay + (by - ay) * t; if (y >= q.y && y <= q.y + HEIGHT[q.stance]) { bestT = t; kind = 'hider'; who = q; } }
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
        while (this.t >= p.pingAt) { p.pingAt += C.PING.every; this.emit({ t: 'ping', id: p.id, x: p.x, y: p.y, z: p.z, gain: p.stance === 2 ? C.PING.proneGain : p.stance === 1 ? C.PING.crouchGain : 1 }); }
      }
    }
    leave(id) {
      const p = this.players.get(id); if (!p || !p.present) return; p.present = false; this.emit({ t: 'left', id });
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
  return { Sim, Nav, navOf, prepMap, groundAt, heightAt, covers, hearGain, blockers3, blockersBetween, rayWorld, resolve, cdist, mixHex, hexNum, HEIGHT, NEED, CENTER, STEP_UP, SLAB_T };
});
