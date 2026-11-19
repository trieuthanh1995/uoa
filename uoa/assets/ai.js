/* Ú òa – bot (trình duyệt + Node). Bot chỉ dùng thông tin hợp lệ: thấy được (tầm nhìn + ngụy trang + vật che) hoặc nghe được (âm định vị).
 * Bot trốn: chọn chỗ kín, tô màu theo nền chỗ đó, nằm yên (cúi), bỏ chạy khi bị phát hiện và thỉnh thoảng đổi chỗ.
 * Bot tìm: tuần tra có ngẫu nhiên, nghe ping → ước lượng hướng (có sai số) → kiểm tra, thấy mục tiêu → áp sát và bắn có dẫn đầu. */
(function (root, factory) {
  const isNode = typeof module === 'object' && module.exports;
  const mod = factory(isNode ? require('./config.js') : root.UO, isNode ? require('./sim.js') : root.UO);
  if (isNode) module.exports = mod; else { root.UO = root.UO || {}; Object.assign(root.UO, mod); }
})(typeof self !== 'undefined' ? self : this, function (cfg, S) {
  'use strict';
  const { C, PALETTE } = cfg;
  const { hearGain, blockersBetween, cdist, hexNum } = S;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const hexStr = (n) => '#' + ('000000' + (n >>> 0).toString(16)).slice(-6);
  const angDiff = (a, b) => { const d = a - b; return Math.atan2(Math.sin(d), Math.cos(d)); };

  /** điểm ẩn nấp ứng viên của bản đồ: càng bị vật cao bao quanh càng tốt */
  function spotsOf(sim) {
    const nav = sim.nav; if (nav._spots) return nav._spots;
    const out = [], map = sim.map, step = 2;
    for (let x = -map.HW + 1; x < map.HW; x += step) for (let z = -map.HD + 1; z < map.HD; z += step) {
      const k = nav.idx(x, z); if (nav.blocked[k] || nav.comp[k] !== nav.mainComp) continue;
      let blocked = 0; const N = 16;
      for (let i = 0; i < N; i++) { const a = i / N * Math.PI * 2; if (blockersBetween(map, x, z, x + Math.sin(a) * 7, z + Math.cos(a) * 7) > 0) blocked++; }
      const bd = sim.backdrop(x, z), near = bd.dist < 1.4 ? 0.3 : 0;
      out.push({ x, z, score: blocked / N + near });
    }
    out.sort((a, b) => b.score - a.score); nav._spots = out; return out;
  }

  class AI {
    constructor(sim) { this.sim = sim; this.spots = spotsOf(sim); sim.ai = this; }
    rnd() { return this.sim.R(); }
    update(sim, dt) {
      for (const p of sim.players.values()) {
        if (!p.isBot || !p.present) continue;
        const m = p.mem; m.think = (m.think == null ? this.rnd() * 0.3 : m.think) - dt;
        if (m.think <= 0) { m.think = 0.1 + this.rnd() * 0.06; p.role === 'hider' ? this.thinkHider(sim, p, 0.13) : this.thinkSeeker(sim, p, 0.13); }
        this.drive(sim, p, dt);
      }
    }
    /* ---------- đi theo đường ---------- */
    goTo(sim, p, x, z) {
      const path = sim.nav.path(p.x, p.z, x, z); p.mem.path = path; p.mem.wp = 0; p.mem.goal = path ? path[path.length - 1] : null; return !!path;
    }
    drive(sim, p, dt) {
      const m = p.mem, c = p.ctl; c.mx = c.mz = 0;
      if (p.caught) return;
      if (m.path && m.wp < m.path.length) {
        const w = m.path[m.wp], dx = w[0] - p.x, dz = w[1] - p.z, d = Math.hypot(dx, dz);
        if (d < 0.45) { m.wp++; if (m.wp >= m.path.length) { m.path = null; m.arrived = true; } }
        else { c.mx = dx / d; c.mz = dz / d; }
        // bị kẹt?
        m.stuckT = (m.stuckT || 0) + dt; if (m.stuckT > 1.6) { if (Math.hypot(p.x - (m.sx || 0), p.z - (m.sz || 0)) < 0.35 && m.goal) { this.goTo(sim, p, m.goal[0], m.goal[1]); } m.stuckT = 0; m.sx = p.x; m.sz = p.z; }
      }
    }
    /* ---------- bot trốn ---------- */
    chooseSpot(sim, p, avoid) {
      const lv = p.level, spots = this.spots, N = spots.length;
      const top = Math.max(6, Math.floor(N * (0.55 - 0.43 * lv.plan)));
      for (let tries = 0; tries < 40; tries++) {
        const s = spots[Math.floor(Math.pow(this.rnd(), 1.4) * top)];
        if (Math.hypot(s.x - sim.pen.x, s.z - sim.pen.z) < 10) continue;
        let bad = false;
        for (const q of sim.players.values()) if (q !== p && q.role === 'hider' && q.mem.spot && Math.hypot(q.mem.spot.x - s.x, q.mem.spot.z - s.z) < 3) { bad = true; break; }
        if (bad) continue;
        if (avoid && (Math.hypot(s.x - avoid.x, s.z - avoid.z) < 16 || blockersBetween(sim.map, avoid.x, avoid.z, s.x, s.z) === 0)) continue;
        return s;
      }
      return spots[Math.floor(this.rnd() * top)];
    }
    paintFor(sim, p, spot) {
      const lv = p.level, bg = sim.backdrop(spot.x, spot.z).col, nearest = () => { let b = PALETTE[0], bd = 9; for (const e of PALETTE) { const d = cdist(e[1], bg); if (d < bd) { bd = d; b = e; } } return b[1]; };
      const rndC = () => PALETTE[Math.floor(this.rnd() * PALETTE.length)][1];
      const z = {};
      for (const k of ['head', 'body', 'arms', 'legs']) {
        if (this.rnd() < (1 - lv.plan) * 0.7) z[k] = rndC();
        else z[k] = lv.plan > 0.9 ? hexStr(bg) : nearest();
      }
      return z;
    }
    thinkHider(sim, p, dt) {
      const m = p.mem, ph = sim.phase;
      if (ph === 'over') return;
      if (p.caught) { m.path = null; return; }
      if (!m.spot && (ph === 'intro' || ph === 'prep')) {
        m.spot = this.chooseSpot(sim, p); m.paintAt = sim.t + 2 + this.rnd() * 14; m.state = 'goto';
        this.goTo(sim, p, m.spot.x, m.spot.z);
      }
      if (m.paintAt != null && sim.t >= m.paintAt && sim.canPaint()) { sim.setPaint(p.id, this.paintFor(sim, p, m.spot)); m.paintAt = null; }
      if (ph !== 'hunt') { p.ctl.crouch = !m.path && m.spot; p.ctl.sprint = false; return; }
      if (m.paintAt != null && sim.canPaint()) m.paintAt = null;
      // phát hiện mối đe dọa: người đi tìm nhìn thấy / ở rất gần
      let threat = null, td = 1e9;
      for (const s of sim.seekers) {
        const d = Math.hypot(s.x - p.x, s.z - p.z), los = blockersBetween(sim.map, p.x, p.z, s.x, s.z) === 0;
        if (((los && d < 9.5) || d < 3.2) && d < td) { td = d; threat = s; }
      }
      if (threat) { m.threatT = (m.threatT || 0) + dt; } else m.threatT = Math.max(0, (m.threatT || 0) - dt * 0.5);
      const stoneNear = p.level.plan > 0.6 && sim.stones.some((st) => { const dx = p.x - st.x, dz = p.z - st.z, d = Math.hypot(dx, dz); return d < 9 && (dx * st.vx + dz * st.vz) / (d * Math.hypot(st.vx, st.vz) + 1e-6) > 0.93; });
      if (stoneNear && this.rnd() < 0.5 * p.level.plan) { const a = Math.atan2(p.vx || 0.1, p.vz || 0.1) + (this.rnd() < 0.5 ? 1.4 : -1.4); p.ctl.mx = Math.sin(a); p.ctl.mz = Math.cos(a); m.path = null; m.dodge = 0.35; }
      if (threat && m.threatT >= p.level.react && m.state !== 'flee') {
        m.state = 'flee'; m.spot = this.chooseSpot(sim, p, threat); m.fleeT = 0; m.holdT = 0;
        this.goTo(sim, p, m.spot.x, m.spot.z);
      }
      if (m.state === 'flee') {
        m.fleeT += dt; p.ctl.crouch = false; p.ctl.sprint = p.sprintCd <= 0 || p.sprinting;
        if (!m.path || (m.fleeT > 2.5 && !threat)) { m.state = 'hold'; m.holdT = 0; m.nextMove = 20 + this.rnd() * 30 / Math.max(0.4, p.level.plan); }
      } else if (m.state === 'goto') {
        p.ctl.crouch = false; p.ctl.sprint = false; if (!m.path) { m.state = 'hold'; m.holdT = 0; m.nextMove = 18 + this.rnd() * 30; }
      } else {      // hold
        m.holdT = (m.holdT || 0) + dt; p.ctl.sprint = false;
        p.ctl.crouch = !m.path && (p.level.plan > 0.5 || this.rnd() < 0.6);
        if (!m.path && !m.dodge && m.holdT > (m.nextMove || 30) && !threat && p.level.plan > 0.3) {   // thỉnh thoảng đổi chỗ
          m.spot = this.chooseSpot(sim, p); m.state = 'goto'; this.goTo(sim, p, m.spot.x, m.spot.z); sim.setPaint(p.id, p.paint);
        }
      }
      if (m.dodge) { m.dodge -= dt; if (m.dodge <= 0) { m.dodge = 0; if (m.spot) this.goTo(sim, p, m.spot.x, m.spot.z); } else { p.ctl.sprint = true; p.ctl.crouch = false; } }
    }
    /* ---------- bot tìm ---------- */
    seenFactor(sim, s, h) {
      const d = Math.hypot(h.x - s.x, h.z - s.z); if (d > 40) return 0;
      if (blockersBetween(sim.map, s.x, s.z, h.x, h.z) > 0) return 0;
      const a = Math.atan2(h.x - s.x, h.z - s.z); if (d > 4 && Math.abs(angDiff(a, s.yaw)) > 1.25) return 0;     // ngoài tầm mắt ~70°
      const range = 15 * (0.25 + 0.75 * sim.conspicuity(h)) * s.level.eye * (h.sprinting ? 1.3 : Math.hypot(h.vx, h.vz) > 0.3 ? 1.15 : 0.85) * (h.crouch ? 0.6 : 1);
      return d < range ? 1 - d / range * 0.5 : 0;
    }
    thinkSeeker(sim, p, dt) {
      const m = p.mem, lv = p.level;
      p.ctl.fire = false; p.ctl.crouch = false;
      if (sim.phase !== 'hunt' || p.caught) return;
      // 1. nhìn
      let best = null, bs = 0;
      for (const h of sim.hiders) { if (h.caught) continue; const f = this.seenFactor(sim, p, h); if (f > bs) { bs = f; best = h; } }
      if (best) { m.spotT = (m.spotT || 0) + dt; m.lostT = 0; if (m.spotT >= lv.react) { m.target = best.id; m.state = 'chase'; } m.last = { x: best.x, z: best.z }; }
      else { m.spotT = 0; m.lostT = (m.lostT || 0) + dt; }
      const tgt = m.target ? sim.players.get(m.target) : null;
      if (m.state === 'chase') {
        if (!tgt || tgt.caught || m.lostT > 1.4) { m.state = m.last ? 'investigate' : 'patrol'; m.target = null; if (m.last) this.goTo(sim, p, m.last.x, m.last.z); m.wait = 0; }
        else if (best) this.chase(sim, p, tgt, dt);
        else if (m.last && !m.path) this.goTo(sim, p, m.last.x, m.last.z);
        return;
      }
      // 2. tuần tra / kiểm tra
      if (!m.path) {
        m.wait = (m.wait || 0) - dt;
        if (m.wait > 0) { p.yaw += Math.sin(sim.t * 1.7 + p.mem.ph) * 0.03; return; }       // dừng lại nhìn quanh
        if (!m.ph) m.ph = this.rnd() * 6;
        m.visited = m.visited || [];
        const mine = { x: p.x, z: p.z }; let pick = null;
        for (let i = 0; i < 25 && !pick; i++) {
          const s = this.spots[Math.floor(this.rnd() * this.spots.length)], d = Math.hypot(s.x - mine.x, s.z - mine.z);
          if (d < 5 || d > 34 || m.visited.some((v) => Math.hypot(v.x - s.x, v.z - s.z) < 5)) continue; pick = s;
        }
        pick = pick || this.spots[Math.floor(this.rnd() * this.spots.length)];
        m.visited.push(pick); if (m.visited.length > 10) m.visited.shift();
        m.state = 'patrol'; this.goTo(sim, p, pick.x, pick.z); m.wait = 0.4 + this.rnd() * 1.4;
      }
    }
    chase(sim, p, tgt, dt) {
      const m = p.mem, c = p.ctl, d = Math.hypot(tgt.x - p.x, tgt.z - p.z), los = blockersBetween(sim.map, p.x, p.z, tgt.x, tgt.z) === 0;
      if (d > 11 || !los) { if (!m.path || (m.rp = (m.rp || 0) + dt) > 0.6) { m.rp = 0; this.goTo(sim, p, tgt.x, tgt.z); } }
      else m.path = null;
      // ngắm có dẫn đầu + sai số theo cấp độ
      const S0 = C.SLING, T = d / S0.speed, lead = 0.55 + 0.45 * p.level.plan;
      const hy = tgt.crouch ? 0.65 : 1.05, ex = (this.rnd() - 0.5) * 2 * p.level.err * d, ez = (this.rnd() - 0.5) * 2 * p.level.err * d, ey = (this.rnd() - 0.5) * p.level.err * d * 0.6;
      c.px = tgt.x + tgt.vx * T * lead + ex; c.pz = tgt.z + tgt.vz * T * lead + ez; c.py = hy + ey;
      c.adist = d;
      p.yaw += angDiff(Math.atan2(c.px - p.x, c.pz - p.z), p.yaw) * 0.35;
      if (los && d < 30 && p.fireCd <= 0) c.fire = true;
    }
    /* ---------- nghe ---------- */
    onEvent(sim, e) {
      if (e.t !== 'ping' || sim.phase !== 'hunt') return;
      for (const p of sim.players.values()) {
        if (!p.isBot || p.role !== 'seeker' || !p.present) continue;
        const m = p.mem; if (m.state === 'chase') continue;
        const h = hearGain(sim.map, p.x, p.z, e.x, e.z, C.PING.range, e.gain), g = h.gain * p.level.hear;
        if (g < 0.05 || this.rnd() > 0.12 + 0.3 * p.level.hear) continue;
        const sigma = (1.3 - p.level.hear) * 1.2 / (0.3 + h.gain), dir = Math.atan2(e.x - p.x, e.z - p.z) + (this.rnd() - 0.5) * 2 * sigma;
        const dist = Math.max(3, h.d * (1 + (this.rnd() - 0.5) * 1.1));
        const [tx, tz] = sim.nav.nearestFree(clamp(p.x + Math.sin(dir) * dist, -sim.map.HW + 1, sim.map.HW - 1), clamp(p.z + Math.cos(dir) * dist, -sim.map.HD + 1, sim.map.HD - 1));
        if (m.state === 'investigate' && m.heard != null && m.heard > g && sim.t - m.heardT < 6) continue;
        m.state = 'investigate'; m.heard = g; m.heardT = sim.t; m.wait = 0.5 + this.rnd(); this.goTo(sim, p, tx, tz);
      }
    }
  }
  return { AI };
});
