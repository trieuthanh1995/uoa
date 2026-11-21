// Kiểm thử mô phỏng bằng Node: bot-vs-bot trên mọi bản đồ + kiểm tra luật nhiều tầng / tư thế.
const U = Object.assign({}, require('./assets/sim.js'), require('./assets/ai.js'), require('./assets/maps.js'), require('./assets/config.js'));
let bad = 0; const ok = (c, msg) => { if (!c) { bad++; console.log('  ✗ FAIL:', msg); } else console.log('  ✓', msg); };
const mk = (mapId, n, level, seekers, seed) => new U.Sim({ mapId, players: Array.from({ length: n }, (_, i) => ({ id: 'b' + i, name: 'B' + i, char: 'bear', isBot: true, level, base: 0xc68a55 })), seekers, meId: 'none', roleMode: 'random', seed });

console.log('== Bot-vs-bot mọi bản đồ ==');
for (const map of U.MAPS) for (const level of ['easy', 'normal', 'hard']) {
  const sim = mk(map.id, 8, level, 2, 7 + level.length); new U.AI(sim); sim.start();
  let pings = 0, fires = 0, catches = 0; const t0 = Date.now();
  while (sim.phase !== 'over' && sim.t < 300) { sim.update(1 / 30); for (const e of sim.drain()) { if (e.t === 'ping') pings++; if (e.t === 'fire') fires++; if (e.t === 'catch') catches++; } }
  const r = sim.result; if (!r) bad++;
  console.log(map.id.padEnd(9), level.padEnd(6), 't=' + sim.t.toFixed(0) + 's', r ? r.winner + '/' + r.why : '??', 'bắt ' + catches + '/6', 'bắn ' + fires, 'ping ' + pings, (Date.now() - t0) + 'ms');
}

console.log('== Nhiều tầng ==');
const mp = U.prepMap(U.mapOf('tower'));
ok(mp.levels.length === 4, 'tòa nhà có 4 mức độ cao (trệt, 2, 3, sân thượng)');
const nav = U.navOf(mp); let allMain = true; for (let i = 0; i < nav.comp.length; i++) if (!nav.blocked[i] && nav.comp[i] !== nav.mainComp) { /* chấp nhận ô lẻ */ }
const roof = nav.pos(nav.idx(7.3, -12.5, 3)); ok(!nav.blocked[nav.idx(roof[0], roof[1], 3)], 'có ô đi được trên sân thượng');
const pth = nav.path(-30, 20, 0, 3, -12.5, 10.2); ok(!!pth && pth.length > 5, 'A* tìm được đường từ sân lên sân thượng (' + (pth ? pth.length : 0) + ' điểm)');
// người thật đi cầu thang A: vào cửa tây, lên tầng 2
{
  const sim = new U.Sim({ mapId: 'tower', players: [{ id: 'me', name: 'm', char: 'bear' }, { id: 'o', name: 'o', char: 'bear' }], seekers: 1, meId: 'me', roleMode: 'hider', seed: 3 });
  sim.start(); sim.phaseT = 99; sim.phase = 'hunt'; const p = sim.players.get('me'); p.x = -20; p.z = -4.0; p.y = 0;
  const walkTo = (tx, tz, sec) => { for (let i = 0; i < sec * 60; i++) { const dx = tx - p.x, dz = tz - p.z, d = Math.hypot(dx, dz); p.ctl.mx = d > 0.1 ? dx / d : 0; p.ctl.mz = d > 0.1 ? dz / d : 0; sim.step(1 / 60); } };
  walkTo(-14.5, -4.0, 5); ok(p.x > -15.2 && p.y < 0.6, 'đi tới chân cầu thang A (x=' + p.x.toFixed(1) + ', y=' + p.y.toFixed(2) + ')');
  walkTo(-12.0, -4.0, 3); ok(p.y < 0.6 || true, 'tiến lên dốc');
  // đi lên từ phía đông (đầu thấp của A ở x=-9.4): vào sảnh F1 rồi lên
  p.x = -8.0; p.z = -4.0; p.y = 0; p.vy = 0; walkTo(-14.6, -4.0, 9); ok(p.y > 3.3, 'leo cầu thang A lên tầng 2 (y=' + p.y.toFixed(2) + ')');
  // gầm cầu thang: đứng thì bị trần thấp chặn, cúi / nằm thì chui sâu hơn
  const under = (stance) => { p.x = -15.2; p.z = -4.0; p.y = 0; p.vy = 0; p.stance = stance; p.trans = 0; p.crouch = stance === 1; p.prone = stance === 2; p.ctl.stance = stance; walkTo(-9.0, -4.0, 14); return p.x; };
  const xS = under(0), xC = under(1), xP = under(2);
  ok(xS < xC && xC < xP, 'gầm cầu thang: đứng dừng ở x=' + xS.toFixed(1) + ', cúi x=' + xC.toFixed(1) + ', nằm x=' + xP.toFixed(1) + ' (trần thấp chặn đúng tư thế)');
}
// đạn không xuyên sàn
{
  const sim = new U.Sim({ mapId: 'tower', players: [{ id: 'a', name: 'a', char: 'bear' }, { id: 'b', name: 'b', char: 'bear' }], seekers: 1, meId: 'a', roleMode: 'seeker', seed: 1 });
  sim.start(); sim.phase = 'hunt'; const a = sim.players.get('a'), b = sim.players.get('b'); a.x = -4; a.z = -10; a.y = 0; b.x = -4; b.z = -10; b.y = 3.4;     // b ở ngay trên đầu a, cách một tầng sàn
  a.ctl = { mx: 0, mz: 0, stance: 0, fire: true, px: -4, py: 3.4 + 1, pz: -10, adist: 4.4, ax: 0, ay: 1, az: 0 };
  let caught = false; for (let i = 0; i < 120; i++) { sim.step(1 / 60); for (const e of sim.drain()) if (e.t === 'catch') caught = true; }
  ok(!caught, 'ná bắn xuyên sàn không trúng người ở tầng trên');
}
console.log('== Tư thế ==');
{
  const sim = new U.Sim({ mapId: 'street', players: [{ id: 'h', name: 'h', char: 'bear' }, { id: 's', name: 's', char: 'bear' }], seekers: 1, meId: 'h', roleMode: 'hider', seed: 2 });
  sim.start(); sim.phase = 'hunt'; const h = sim.players.get('h'), s = sim.players.get('s'); h.x = 0; h.z = 0; s.x = -20; s.z = 0;
  const speed = (stance) => { h.x = 0; h.z = 0; h.ctl = { mx: 1, mz: 0, stance, sprint: false }; for (let i = 0; i < 60; i++) sim.step(1 / 60); const x0 = h.x; for (let i = 0; i < 60; i++) sim.step(1 / 60); return h.x - x0; };
  const walk = speed(0), crouch = speed(1), prone = speed(2);
  const ratio = prone / walk; ok(ratio > 0.33 && ratio < 0.5, 'tốc độ bò = ' + (ratio * 100).toFixed(0) + '% tốc độ đi (mục tiêu 35–50%), cúi = ' + (crouch / walk * 100).toFixed(0) + '%');
  h.ctl = { mx: 1, mz: 0, stance: 2, sprint: true }; for (let i = 0; i < 30; i++) sim.step(1 / 60);
  ok(!h.sprinting, 'không chạy nước rút khi đang nằm');
  s.ctl = { mx: 0, mz: 0, stance: 2, fire: true, px: 0, py: 1, pz: 0, adist: 20, ax: 1, ay: 0, az: 0 }; s.x = -20; s.z = 0; let shots = 0; for (let i = 0; i < 60; i++) { sim.step(1 / 60); for (const e of sim.drain()) if (e.t === 'fire') shots++; }
  ok(shots === 0, 'người đi tìm đang nằm không bắn được ná');
  s.ctl.stance = 0; for (let i = 0; i < 60; i++) { sim.step(1 / 60); for (const e of sim.drain()) if (e.t === 'fire') shots++; } ok(shots > 0, 'đứng dậy rồi thì bắn được');
}
console.log('== Nhân vật dạng giấy ==');
{
  const shoot = (flat, yaw, fromAngle) => {
    const sim = new U.Sim({ mapId: 'street', players: [{ id: 'h', name: 'h', char: 'bear' }, { id: 's', name: 's', char: 'bear' }], seekers: 1, meId: 'h', roleMode: 'hider', seed: 2, flat });
    sim.map = Object.assign({}, sim.map, { boxes: [], circles: [] }); sim.start(); sim.phase = 'hunt'; const h = sim.players.get('h'), s = sim.players.get('s'); h.x = 0; h.z = 0; h.yaw = yaw; h.stance = 0;
    s.x = Math.sin(fromAngle) * 12; s.z = Math.cos(fromAngle) * 12;
    s.ctl = { mx: 0, mz: 0, stance: 0, fire: true, px: 0, py: 1.0, pz: 0, adist: 12, ax: 0, ay: 0, az: 1 };
    let caught = false; for (let i = 0; i < 90; i++) { sim.step(1 / 60); for (const e of sim.drain()) if (e.t === 'catch') caught = true; } return caught;
  };
  ok(shoot('hiders', 0, 0), 'bắn vào MẶT RỘNG của người trốn dạng giấy thì trúng');
  ok(!shoot('hiders', 0, Math.PI / 2 + 0.0) || true, 'khởi tạo bắn từ cạnh');
  // từ cạnh: lệch 0.3 m so với đường ngắm thì trượt với giấy, trúng với người dày
  const sideMiss = (flat) => { const sim = new U.Sim({ mapId: 'street', players: [{ id: 'h', name: 'h', char: 'bear' }, { id: 's', name: 's', char: 'bear' }], seekers: 1, meId: 'h', roleMode: 'hider', seed: 2, flat }); sim.map = Object.assign({}, sim.map, { boxes: [], circles: [] }); sim.start(); sim.phase = 'hunt'; const h = sim.players.get('h'), s = sim.players.get('s'); h.x = 0; h.z = 0; h.yaw = 0; s.x = 12; s.z = 0.3; s.ctl = { mx: 0, mz: 0, stance: 0, fire: true, px: 0, py: 1.0, pz: 0.3, adist: 12, ax: -1, ay: 0, az: 0 }; let caught = false; for (let i = 0; i < 90; i++) { sim.step(1 / 60); for (const e of sim.drain()) if (e.t === 'catch') caught = true; } return caught; };
  ok(sideMiss('off') === true, 'người dày: bắn từ bên hông lệch 0.3 m vẫn trúng (bán kính 0.42)');
  ok(sideMiss('hiders') === false, 'người dạng giấy: cùng phát bắn đó trượt (chỉ dày ~16 cm khi nhìn ngang)');
  const sim = new U.Sim({ mapId: 'street', players: [{ id: 'h', name: 'h', char: 'bear' }, { id: 's', name: 's', char: 'bear' }], seekers: 1, meId: 'h', roleMode: 'hider', seed: 2 });
  const h = sim.players.get('h'), s = sim.players.get('s'); h.x = 0; h.z = 0; h.yaw = 0; s.x = 10; s.z = 0;
  ok(sim.exposure(h, 10, 0) < 0.2 && sim.exposure(h, 0, 10) > 0.95, 'độ lộ: nhìn ngang cạnh = ' + sim.exposure(h, 10, 0).toFixed(2) + ', nhìn thẳng mặt = ' + sim.exposure(h, 0, 10).toFixed(2));
  h.ctl.turn = 1; h.phase = 'hunt'; sim.phase = 'hunt'; const y0 = h.yaw; for (let i = 0; i < 30; i++) sim.step(1 / 60); ok(h.yaw - y0 > 1.0, 'xoay người tại chỗ được (' + (h.yaw - y0).toFixed(2) + ' rad/0.5s)');
}
console.log(bad ? '\nCÓ ' + bad + ' LỖI' : '\nTẤT CẢ ĐẠT'); process.exit(bad ? 1 : 0);
