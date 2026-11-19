// Kiểm thử mô phỏng bằng Node: chạy bot-vs-bot nhiều ván trên mọi bản đồ.
const U = Object.assign({}, require('./assets/sim.js'), require('./assets/ai.js'), require('./assets/maps.js'), require('./assets/config.js'));
const lv = ['easy', 'normal', 'hard'];
let bad = 0;
for (const map of U.MAPS) for (const level of lv) {
  const n = 8, players = Array.from({ length: n }, (_, i) => ({ id: 'b' + i, name: 'B' + i, char: 'bear', isBot: true, level, base: 0xc68a55 }));
  const sim = new U.Sim({ mapId: map.id, players, seekers: 2, meId: 'none', roleMode: 'random', seed: 7 + level.length });
  new U.AI(sim); sim.start();
  let pings = 0, fires = 0, catches = 0, steps = 0; const t0 = Date.now();
  while (sim.phase !== 'over' && sim.t < 300) { sim.update(1 / 30); for (const e of sim.drain()) { if (e.t === 'ping') pings++; if (e.t === 'fire') fires++; if (e.t === 'catch') catches++; if (e.t === 'step') steps++; } }
  const r = sim.result; if (!r) bad++;
  console.log(map.id.padEnd(9), level.padEnd(6), 'kết thúc t=' + sim.t.toFixed(0) + 's', r ? r.winner + '/' + r.why : '??', 'bắt ' + catches + '/' + (n - 2), 'bắn ' + fires, 'ping ' + pings, 'step ' + steps, (Date.now() - t0) + 'ms');
}
process.exit(bad ? 1 : 0);
