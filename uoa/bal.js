const U = Object.assign({}, require('./assets/sim.js'), require('./assets/ai.js'), require('./assets/maps.js'), require('./assets/config.js'));
const N = +process.argv[2] || 12;
for (const level of ['easy', 'normal', 'hard']) {
  let hw = 0, ct = 0, tot = 0, games = 0, shots = 0, hits = 0, tEnd = 0;
  for (const map of U.MAPS) for (let s = 0; s < N; s++) {
    const n = 8, players = Array.from({ length: n }, (_, i) => ({ id: 'b' + i, name: 'B' + i, char: 'bear', isBot: true, level, base: 0xc68a55 }));
    const sim = new U.Sim({ mapId: map.id, players, seekers: 2, meId: 'none', roleMode: 'random', seed: 100 + s * 7 });
    new U.AI(sim); sim.start(); let f = 0;
    while (sim.phase !== 'over' && sim.t < 300) { sim.update(1 / 30); for (const e of sim.drain()) if (e.t === 'fire') f++; }
    const r = sim.result; games++; if (r.winner === 'hiders') hw++; ct += r.caught; tot += r.total; shots += f; tEnd += sim.t - 64;
  }
  console.log(level.padEnd(7), 'hiders thắng', (hw / games * 100).toFixed(0) + '%', '| bị bắt TB', (ct / games).toFixed(1) + '/' + (tot / games).toFixed(0), '| phát bắn/ván', (shots / games).toFixed(1), '| hit%', (ct / shots * 100).toFixed(0), '| thời gian hunt TB', (tEnd / games).toFixed(0) + 's');
}
