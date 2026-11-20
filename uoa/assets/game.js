/* Ú òa – điều phối trò chơi: menu, trận đấu, HUD, bảng tô màu, kết quả. */
(function (UO) {
  'use strict';
  const T = window.THREE, PP = window.PP, C = UO.C, R = UO.Render, A = UO.Audio, In = UO.Input;
  const $ = (s) => document.querySelector(s), $$ = (s) => [...document.querySelectorAll(s)];
  const store = { get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* bỏ qua */ } } };
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  let S = { char: 'bear', total: 6, seekers: 2, role: 'random', map: 'random', level: 'normal', q: 1, vol: 80, sens: 100 };
  try { Object.assign(S, JSON.parse(store.get('uoa.settings') || '{}')); } catch (e) { /* bỏ qua */ }
  let points = +store.get('uoa.points') || 0;
  const save = () => store.set('uoa.settings', JSON.stringify(S));

  const canvas = $('#view');
  let renderer;
  try { renderer = new T.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' }); }
  catch (e) { $('#loading').innerHTML = '<div style="padding:20px;text-align:center">Trình duyệt của bạn không hỗ trợ WebGL nên không chạy được game 3D.</div>'; return; }
  renderer.outputEncoding = T.sRGBEncoding; renderer.toneMapping = T.ACESFilmicToneMapping; renderer.toneMappingExposure = 0.95;
  renderer.setClearColor(0x14203a);
  let match = null, paused = false, skipPause = false, lastT = 0;

  /* ============================== MENU ============================== */
  let preview = null;
  function showChar() { const d = PP.CHARACTERS.find((c) => c.id === S.char) || PP.CHARACTERS[0]; $('#charName').textContent = d.emoji + ' ' + d.name; $$('#charGrid button').forEach((b) => b.classList.toggle('on', b.dataset.id === d.id)); if (preview) { preview.set(d, null, 'sniper'); preview.setAnim('idle'); } }
  function initMenu() {
    const grid = $('#charGrid');
    for (const d of PP.CHARACTERS) { const b = document.createElement('button'); b.textContent = d.emoji; b.title = d.name; b.dataset.id = d.id; b.onclick = () => { S.char = d.id; save(); A.ui('click'); showChar(); }; grid.append(b); }
    try { preview = PP.Character.createPreview($('#pv')); } catch (e) { preview = null; }
    const sel = $('#mapSel'); sel.innerHTML = '<option value="random">🎲 Ngẫu nhiên</option>' + UO.MAPS.map((m) => '<option value="' + m.id + '">' + m.name + '</option>').join('');
    sel.value = S.map; sel.onchange = () => { S.map = sel.value; save(); mapDesc(); }; mapDesc();
    function mapDesc() { const m = UO.MAPS.find((x) => x.id === S.map); $('#mapDesc').textContent = m ? m.desc + ' · ' + m.HW * 2 + '×' + m.HD * 2 + ' m' : 'Mỗi trận chọn ngẫu nhiên một bản đồ'; }
    const seg = (id, key, conv) => { const el = $(id); const sync = () => $$(id + ' button').forEach((b) => b.classList.toggle('on', String(b.dataset.v) === String(S[key]))); sync(); el.onclick = (e) => { const b = e.target.closest('button'); if (!b) return; S[key] = conv ? conv(b.dataset.v) : b.dataset.v; save(); A.ui('click'); sync(); }; };
    seg('#segRole', 'role'); seg('#segLevel', 'level'); seg('#segQ', 'q', Number);
    const tot = $('#total'), sk = $('#seekers');
    const norm = () => {
      S.total = clamp(Math.round(+tot.value) || C.MIN_PLAYERS, C.MIN_PLAYERS, C.MAX_PLAYERS);
      S.seekers = clamp(Math.round(+sk.value) || 1, 1, Math.min(9, S.total - 1));
      tot.value = S.total; sk.value = S.seekers; sk.max = Math.min(9, S.total - 1);
      $('#seekHint').textContent = '→ ' + (S.total - S.seekers) + ' người đi trốn'; save();
    };
    tot.onchange = sk.onchange = norm; tot.value = S.total; sk.value = S.seekers; norm();
    $$('.stepper button').forEach((b) => { b.onclick = () => { const el = $('#' + b.dataset.step); el.value = (+el.value || 0) + (+b.dataset.d); A.ui('click'); norm(); }; });
    $('#btnStart').onclick = startMatch; $('#btnHelp').onclick = () => $('#help').classList.add('show'); $('#btnHelpX').onclick = () => $('#help').classList.remove('show');
    $('#ptsTotal').textContent = points; showChar();
  }

  /* ============================== TRẬN ĐẤU ============================== */
  function startMatch() {
    A.ensure(); A.setVolume(S.vol / 100);
    if (match) disposeMatch();
    const maps = UO.MAPS, mapId = S.map === 'random' ? maps[Math.floor(Math.random() * maps.length)].id : S.map;
    const mine = PP.CHARACTERS.find((c) => c.id === S.char) || PP.CHARACTERS[0];
    const others = PP.CHARACTERS.filter((c) => c.id !== mine.id).sort(() => Math.random() - 0.5);
    const players = [{ id: 'me', name: 'Bạn', char: mine.id, isBot: false, base: mine.body }];
    for (let i = 0; i < S.total - 1; i++) { const d = others[i % others.length]; players.push({ id: 'b' + i, name: d.name, char: d.id, isBot: true, level: S.level, base: d.body }); }
    const sim = new UO.Sim({ mapId, players, seekers: S.seekers, roleMode: S.role, meId: 'me', seed: (Date.now() & 0x7fffffff) || 1 });
    new UO.AI(sim);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, [1, 1.5, 2][S.q] || 1.5));
    const world = R.buildWorld(renderer, sim.map, S.q), fx = new R.Fx(world), cam = new R.OrbitCam();
    const avatars = new Map(); for (const p of sim.players.values()) avatars.set(p.id, new R.Avatar(world, p, p.id === 'me'));
    const me = sim.players.get('me');
    cam.yaw = Math.atan2(-me.x, -me.z); cam.pitch = 0.4;
    match = { sim, world, fx, cam, avatars, me, studio: null, studioOpen: false, lowAt: 0, tickAt: -1, hintUntil: 0, spec: null, over: false, pingFlash: 0, resultShown: false };
    resize();
    document.body.classList.toggle('seeker-role', me.role === 'seeker'); document.body.classList.toggle('hider-role', me.role === 'hider');
    $('#hud').classList.toggle('hider', me.role === 'hider');
    const rb = $('#roleBadge'); rb.className = 'pill ' + me.role; rb.textContent = me.role === 'seeker' ? '🎯 Người đi tìm' : '🫣 Người đi trốn';
    $('#barALbl').textContent = me.role === 'seeker' ? 'Ná cao su' : 'Chạy nước rút (Shift)';
    $('#cross').style.display = 'none'; $('#blind').classList.remove('show'); $('#paint').classList.remove('show'); $('#specTxt').textContent = ''; $('#feed').innerHTML = '';
    if (me.role === 'hider') { match.studio = new UO.PaintStudio(avatars.get('me')); avatars.get('me').useStudio = true; buildPaintUI(); }
    $('#brushRing').classList.remove('on'); document.body.classList.remove('studio'); In.studio = false;
    $('#menu').classList.remove('show'); $('#result').classList.remove('show'); $('#pause').classList.remove('show'); $('#hud').classList.add('show');
    $('#bars').style.display = ''; paused = false; In.enabled = true; In.resetButtons();
    if (preview) preview.setAnim('idle');
    sim.start(); handleEvents();
  }
  function disposeMatch() {
    if (!match) return; if (match.studio) match.studio.dispose(); for (const a of match.avatars.values()) a.dispose(); match.fx.clear(); match.world.dispose(); match = null;
  }
  function endMatchToMenu() {
    disposeMatch(); In.enabled = false; In.unlock(); paused = false;
    $('#hud').classList.remove('show'); $('#result').classList.remove('show'); $('#pause').classList.remove('show'); $('#menu').classList.add('show');
    document.body.classList.remove('seeker-role', 'hider-role', 'locked', 'studio', 'paint-able'); In.studio = false; $('#brushRing').classList.remove('on'); $('#ptsTotal').textContent = points; if (preview) { preview.resize(); showChar(); }
    renderer.setClearColor(0x14203a);
  }

  /* ---------- HUD tiện ích ---------- */
  let bannerT = 0, toastT = 0;
  function banner(html, ms) { const b = $('#banner'); b.innerHTML = html; b.classList.add('show'); clearTimeout(bannerT); bannerT = setTimeout(() => b.classList.remove('show'), ms || 2500); }
  function toast(txt, ms) { const t = $('#toast'); t.textContent = txt; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), ms || 1800); }
  function feed(txt) { const f = $('#feed'), d = document.createElement('div'); d.textContent = txt; f.append(d); setTimeout(() => d.remove(), 5500); while (f.children.length > 4) f.firstChild.remove(); }
  function hint(txt, sec) { $('#hint').textContent = txt; match.hintUntil = match.sim.t + (sec || 8); }
  const nameOf = (id) => { const p = match.sim.players.get(id); return p ? (p.id === 'me' ? 'Bạn' : p.name) : '?'; };

  /* ---------- xưởng tô màu (cọ vẽ tự do) ---------- */
  const ZONE_BTNS = [['all', 'Tất cả'], ['head', 'Đầu'], ['bodyF', 'Thân trước'], ['bodyB', 'Thân sau'], ['armL', 'Tay trái'], ['armR', 'Tay phải'], ['legL', 'Chân trái'], ['legR', 'Chân phải']];
  const STUDIO_TOOL = { tool: 'paint' };
  function brushPx() { const m = match, cam = m.world.camera, ppm = window.innerHeight / (2 * m.cam.sdist * Math.tan(cam.fov * Math.PI / 360)); return m.studio.brush.size * 2 * ppm; }
  function updateRing(x, y) {
    const r = $('#brushRing'); if (!match || !match.studioOpen || STUDIO_TOOL.tool !== 'paint') { r.classList.remove('on'); return; }
    const d = Math.max(6, brushPx()); r.style.width = r.style.height = d + 'px'; if (x != null) { r.style.left = x + 'px'; r.style.top = y + 'px'; } r.classList.add('on');
    r.style.borderColor = match.studio.brush.erase ? '#ff8a8a' : '#fff';
  }
  function buildPaintUI() {
    const m = match, ps = m.studio; if (!ps) return;
    const sw = $('#swatches'); sw.innerHTML = '';
    for (const [n, c] of UO.PALETTE) { const b = document.createElement('button'); b.style.background = c; b.title = n; b.dataset.c = c; b.onclick = () => setBrushColor(c); sw.append(b); }
    const zn = $('#zones'); zn.innerHTML = '';
    for (const [k, n] of ZONE_BTNS) { const b = document.createElement('button'); b.dataset.z = k; b.textContent = n; b.onclick = () => { ps.zone = k; ps.setHighlight(k); A.ui('click'); refreshPaintUI(); }; zn.append(b); }
    $('#segTool').onclick = (e) => { const b = e.target.closest('button'); if (!b) return; STUDIO_TOOL.tool = b.dataset.v; A.ui('click'); refreshPaintUI(); };
    $('#segKind').onclick = (e) => { const b = e.target.closest('button'); if (!b) return; if (b.dataset.v === 'erase') ps.brush.erase = !ps.brush.erase; else { ps.brush.kind = b.dataset.v; ps.brush.erase = false; } A.ui('click'); refreshPaintUI(); };
    $('#customColor').oninput = (e) => setBrushColor(e.target.value);
    $('#hexIn').onchange = (e) => { let v = e.target.value.trim(); if (!v.startsWith('#')) v = '#' + v; if (/^#[0-9a-fA-F]{6}$/.test(v)) setBrushColor(v.toLowerCase()); else refreshPaintUI(); };
    $('#brushSize').oninput = (e) => { ps.brush.size = +e.target.value * 0.007; refreshPaintUI(); };
    $('#brushOp').oninput = (e) => { ps.brush.opacity = +e.target.value / 100; refreshPaintUI(); };
    $('#pUndo').onclick = () => { if (ps.undo()) A.ui('click'); };
    $('#pRedo').onclick = () => { if (ps.redo()) A.ui('click'); };
    $('#pFillZone').onclick = () => { if (!ps.fill(ps.zone === 'all' ? 'all' : ps.zone, ps.brush.color) && ps.actions.length >= 300) toast('Đã đạt giới hạn hoàn tác'); A.ui('click'); };
    $('#pFillAll').onclick = () => { ps.fill('all', ps.brush.color); A.ui('click'); };
    $('#pClearZone').onclick = () => { ps.clearStrokes(ps.zone); A.ui('click'); };
    $('#pResetZone').onclick = () => { ps.reset(ps.zone); A.ui('click'); };
    $('#paintX').onclick = closeStudio;
    ps.onChange = () => { applySummary(); refreshPaintUI(); };
    ps.brush.size = +$('#brushSize').value * 0.007; ps.brush.opacity = +$('#brushOp').value / 100; ps.brush.color = $('#customColor').value;
    refreshPaintUI();
  }
  function setBrushColor(c) { const ps = match.studio; ps.brush.color = c; ps.brush.erase = false; $('#customColor').value = c; $('#hexIn').value = c; A.ui('click'); refreshPaintUI(); }
  function applySummary() { const m = match; if (!m || !m.studio) return; m.sim.setPaint('me', m.studio.hasArt() ? m.studio.summary() : null, m.studio.exportArt()); }
  function refreshPaintUI() {
    const m = match; if (!m || !m.studio) return; const ps = m.studio, b = ps.brush;
    $$('#segTool button').forEach((x) => x.classList.toggle('on', x.dataset.v === STUDIO_TOOL.tool));
    $$('#segKind button').forEach((x) => x.classList.toggle('on', x.dataset.v === 'erase' ? b.erase : (!b.erase && x.dataset.v === b.kind)));
    $$('#zones button').forEach((x) => x.classList.toggle('on', x.dataset.z === ps.zone));
    $$('#swatches button').forEach((x) => x.classList.toggle('on', x.dataset.c === b.color));
    $('#brushSizeV').textContent = (b.size * 200).toFixed(1).replace(/\.0$/, '') + ' cm'; $('#brushOpV').textContent = Math.round(b.opacity * 100) + '%';
    $('#pUndo').disabled = !ps.canUndo; $('#pRedo').disabled = !ps.canRedo; updateRing();
  }
  function openStudio() {
    const m = match; if (!m || !m.studio || m.me.role !== 'hider' || !m.sim.canPaint() || m.studioOpen) return;
    m.studioOpen = true; In.studio = true; In.setProne(false); In.unlock(); document.body.classList.add('studio');
    const av = m.avatars.get('me'); m.cam.yaw = av.p.yaw + Math.PI; m.cam.pitch = 0.12; m.cam.sdist = 2.7;
    $('#paint').classList.add('show'); m.studio.setHighlight(m.studio.zone); refreshPaintUI(); $('#bPaint').style.display = 'none';
  }
  function closeStudio() {
    const m = match; if (!m || !m.studioOpen) return; if (m.studio.live) m.studio.end();
    m.studioOpen = false; In.studio = false; document.body.classList.remove('studio'); $('#paint').classList.remove('show'); $('#brushRing').classList.remove('on'); $('#bPaint').style.display = '';
    m.studio.setHighlight(null); applySummary(); m.cam.yaw = m.me.yaw; m.cam.pitch = 0.4;
  }
  function togglePaint() { const m = match; if (!m || m.me.role !== 'hider' || !m.sim.canPaint()) return; if (m.studioOpen) closeStudio(); else openStudio(); }
  function ndcOf(e) { const r = canvas.getBoundingClientRect(); return [((e.clientX - r.left) / r.width) * 2 - 1, -(((e.clientY - r.top) / r.height) * 2 - 1)]; }
  let drawing = null;
  function strokeTo(e) {
    const m = match, ps = m.studio; const last = drawing.last, dx = e.clientX - last[0], dy = e.clientY - last[1], dist = Math.hypot(dx, dy);
    const sp = Math.max(2.5, brushPx() * (ps.brush.kind === 'dots' ? 1.15 : 0.3)), n = Math.max(1, Math.floor(dist / sp));
    for (let i = 1; i <= n; i++) { const x = last[0] + dx * i / n, y = last[1] + dy * i / n, nd = ndcOf({ clientX: x, clientY: y }); ps.addHit(ps.pick(m.world.camera, nd[0], nd[1])); }
    drawing.last = [e.clientX, e.clientY];
  }
  function bindStudioPointer() {
    canvas.addEventListener('pointerdown', (e) => {
      const m = match; if (!m || !m.studioOpen || e.button === 2) return;
      if (STUDIO_TOOL.tool === 'rotate') { drawing = { rot: true, last: [e.clientX, e.clientY] }; canvas.setPointerCapture(e.pointerId); return; }
      if (!m.studio.begin()) { toast('Đã đạt giới hạn số nét vẽ'); return; }
      drawing = { last: [e.clientX, e.clientY], id: e.pointerId }; canvas.setPointerCapture(e.pointerId);
      const nd = ndcOf(e); m.studio.addHit(m.studio.pick(m.world.camera, nd[0], nd[1]));
    });
    canvas.addEventListener('pointermove', (e) => {
      const m = match; if (!m || !m.studioOpen) return; updateRing(e.clientX, e.clientY);
      if (!drawing) return;
      if (drawing.rot) { m.cam.rotate(e.clientX - drawing.last[0], e.clientY - drawing.last[1], 0.006); drawing.last = [e.clientX, e.clientY]; return; }
      if ((e.buttons & 2) && !(e.buttons & 1)) return; strokeTo(e);
    });
    const up = () => { const m = match; if (!drawing) return; if (!drawing.rot && m && m.studio) m.studio.end(); drawing = null; };
    canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
    canvas.addEventListener('pointerleave', () => $('#brushRing').classList.remove('on'));
  }

  /* ---------- sự kiện mô phỏng ---------- */
  function listenerOf() { const m = match, me = m.me; if (me.caught && m.spec) { const q = m.sim.players.get(m.spec); if (q) return q; } return me; }
  const canHear = () => match.me.role === 'seeker' || match.me.caught;
  function handleEvents() {
    const m = match, sim = m.sim, me = m.me; const evs = sim.drain();
    for (const e of evs) {
      switch (e.t) {
        case 'phase': onPhase(e); break;
        case 'ping': {
          const src = sim.players.get(e.id);
          if (canHear()) { const L = listenerOf(), h = UO.hearGain(sim.map, L.x, L.y, L.z, e.x, e.y, e.z, C.PING.range, e.gain); A.ping(e.id, e.x, e.z, me.caught ? Math.max(h.gain, 0.35) : h.gain, h.walls, e.y); }
          else if (e.id === 'me') { A.ui('selfping'); m.pingFlash = 0.35; }
          void src; break;
        }
        case 'step': {
          if (e.sprint || Math.random() < 0.4) m.fx.dust(e.x, e.z, e.sprint, e.y);
          if (canHear()) { const L = listenerOf(), rng = (e.sprint ? C.FOOT.sprintRange : C.FOOT.walkRange) * (e.soft ? 0.35 : 1), h = UO.hearGain(sim.map, L.x, L.y, L.z, e.x, e.y, e.z, rng, 1); if (h.gain > 0) A.step(e.x, e.z, h.gain, e.sprint, h.walls, e.y); }
          break;
        }
        case 'sprint': if (e.id === 'me') A.ui('sprint'); break;
        case 'fire': m.fx.launch(e); A.twang(e.x, e.z, e.id === 'me', e.y); if (e.id === 'me') m.cam.shake = 0.05; break;
        case 'stone_end': {
          m.fx.endStone(e);
          if (e.kind === 'hider') { m.fx.burst(e.x, e.y, e.z, 0xffd23f, 16, 4.2, 0.7, 0.09); m.fx.burst(e.x, e.y, e.z, 0xff6fae, 8, 3, 0.6, 0.07); A.thud(e.x, e.z, 'hider', e.y); }
          else if (e.kind !== 'range') { m.fx.burst(e.x, e.y, e.z, e.kind === 'ground' ? 0xd9cdb4 : 0xe8e2d0, 7, 2.2, 0.4, 0.06); A.thud(e.x, e.z, 'wall', e.y); }
          break;
        }
        case 'catch': {
          const v = sim.players.get(e.id), by = sim.players.get(e.by);
          m.fx.ring(v.x, v.z, 0xffd23f, v.y); m.fx.burst(v.x, v.y + 1.2, v.z, 0xffffff, 18, 4, 0.9, 0.08, 1.5);
          feed('🎯 ' + nameOf(e.by) + ' đã bắt ' + nameOf(e.id) + ' (còn ' + e.left + ')');
          if (e.id === 'me') { A.ui('caught'); banner('BẠN ĐÃ BỊ BẮT!<small>Bạn có thể xem tiếp trận đấu (nhấp chuột để đổi người xem)</small>', 3200); m.cam.shake = 0.3; startSpectate(); }
          else if (e.by === 'me') { A.ui('catch'); toast('🎯 Đã bắt ' + nameOf(e.id) + '!', 1800); }
          void by; break;
        }
        case 'left': feed(nameOf(e.id) + ' đã rời trận'); break;
        case 'over': onOver(e.result); break;
        case 'over_screen': showResult(); break;
        default: break;
      }
    }
  }
  function onPhase(e) {
    const m = match, me = m.me, sim = m.sim;
    if (e.phase === 'intro') {
      const nh = sim.hiders.length, ns = sim.seekers.length;
      if (me.role === 'seeker') banner('BẠN LÀ NGƯỜI ĐI TÌM<small>' + ns + ' người tìm · ' + nh + ' người trốn · hãy lắng nghe tiếng kêu định vị</small>', 3800);
      else banner('BẠN LÀ NGƯỜI ĐI TRỐN<small>' + ns + ' người tìm · ' + nh + ' người trốn · tô màu và tìm chỗ nấp</small>', 3800);
      A.ui('ready');
    } else if (e.phase === 'prep') {
      A.ui('start');
      if (me.role === 'seeker') { $('#blind').classList.add('show'); $('#blindTxt').textContent = 'Người đi trốn đang ngụy trang. Bạn sẽ được mở mắt khi hết giờ.'; $('#hint').textContent = ''; }
      else { hint('🎨 Vẽ ngụy trang lên nhân vật rồi bấm Xong để đi tìm chỗ nấp (' + (In.touch ? 'nút 🎨' : 'phím E') + ' mở lại xưởng). Người đi tìm không nhìn thấy bạn lúc này.', 20); }
      document.body.classList.toggle('paint-able', me.role === 'hider'); if (me.role === 'hider') setTimeout(openStudio, 350);
    } else if (e.phase === 'hunt') {
      closeStudio(); $('#blind').classList.remove('show'); document.body.classList.remove('paint-able');
      A.ui('go'); banner('TRUY TÌM!', 1500);
      if (me.role === 'seeker') { hint('Nghe tiếng kêu: to = gần, nhỏ = xa. Tường làm tiếng nhỏ và đục. Ná bay theo đường cong, hãy ngắm đón đầu!', 10); $('#cross').style.display = 'block'; }
      else hint('Giữ yên: cúi (C) hoặc nằm sấp (Z) để khó bị thấy · chạy nước rút (Shift) khi bị phát hiện · mỗi 5 giây bạn phát một tiếng kêu!', 10);
    }
  }
  function onOver(r) {
    const m = match, me = m.me; m.over = true; In.unlock(); $('#cross').style.display = 'none';
    const win = (r.winner === 'seekers') === (me.role === 'seeker'); A.ui(win ? 'win' : 'lose');
    banner((win ? '🏆 CHIẾN THẮNG!' : 'THẤT BẠI') + '<small>' + (r.winner === 'seekers' ? 'Người đi tìm đã bắt hết người trốn' : r.why === 'time' ? 'Hết giờ, người đi trốn sống sót' : 'Người đi trốn thắng') + '</small>', 2200);
  }
  function showResult() {
    const m = match; if (!m || m.resultShown) return; m.resultShown = true; const r = m.sim.result, me = m.me;
    const win = (r.winner === 'seekers') === (me.role === 'seeker'), mine = r.rows.find((x) => x.id === 'me');
    if (mine) { points += mine.pts; store.set('uoa.points', String(points)); }
    $('#resTitle').textContent = (win ? '🏆 Bạn thắng!' : '😵 Bạn thua'); $('#resSub').textContent = (r.winner === 'seekers' ? 'Phe người đi tìm' : 'Phe người đi trốn') + ' chiến thắng';
    $('#resStats').innerHTML = '<div><b>' + r.caught + '/' + r.total + '</b>đã bị bắt</div><div><b>' + r.survived + '</b>sống sót</div><div><b>' + Math.floor(r.time / 60) + ':' + ('0' + (r.time % 60)).slice(-2) + '</b>thời gian truy tìm</div><div><b>+' + (mine ? mine.pts : 0) + '</b>điểm thưởng</div>';
    $('#resTable').innerHTML = '<tr><th>Người chơi</th><th>Vai</th><th>Kết quả</th><th>Điểm</th></tr>' + r.rows.map((x) => '<tr class="' + (x.id === 'me' ? 'me' : '') + '"><td>' + (x.id === 'me' ? 'Bạn' : x.name) + '</td><td>' + (x.role === 'seeker' ? '🎯 Tìm' : '🫣 Trốn') + '</td><td>' + (x.role === 'seeker' ? x.catches + ' bắt' : x.caught ? 'bị bắt' : 'sống sót') + '</td><td>+' + x.pts + '</td></tr>').join('');
    $('#result').classList.add('show');
  }

  /* ---------- xem tiếp khi bị bắt ---------- */
  function specList() { const m = match; return [...m.sim.players.values()].filter((p) => p.id !== 'me' && p.present && !p.caught); }
  function startSpectate() { const l = specList(); match.spec = l.length ? l[0].id : null; $('#bars').style.display = 'none'; $('#cross').style.display = 'none'; }
  function cycleSpectate() { const m = match; if (!m || !m.me.caught || m.over) return; const l = specList(); if (!l.length) return; const i = l.findIndex((p) => p.id === m.spec); m.spec = l[(i + 1) % l.length].id; A.ui('click'); }

  /* ---------- vòng lặp ---------- */
  function resize() {
    const w = window.innerWidth, h = window.innerHeight; renderer.setSize(w, h, false);
    if (match) { match.world.camera.aspect = w / h; match.world.camera.fov = w / h < 0.9 ? 78 : 62; match.world.camera.updateProjectionMatrix(); }
    if (preview) preview.resize();
  }
  window.addEventListener('resize', resize);
  const fmt = (s) => { s = Math.max(0, Math.ceil(s)); return Math.floor(s / 60) + ':' + ('0' + (s % 60)).slice(-2); };

  function updateMatch(dt) {
    const m = match, sim = m.sim, me = m.me, cam = m.cam, camera = m.world.camera;
    // điều khiển → ctl
    const cy = Math.cos(cam.yaw), sy = Math.sin(cam.yaw), mv = In.move;
    const mx = sy * mv.y - cy * mv.x, mz = cy * mv.y + sy * mv.x;
    const stance = m.studioOpen ? 0 : In.proneOn ? 2 : In.crouch ? 1 : 0;
    const ctl = m.studioOpen ? { mx: 0, mz: 0, sprint: false, stance: 0, fire: false } : { mx, mz, sprint: In.sprint, stance, fire: me.role === 'seeker' && In.fire && !paused };
    const skip = m.world.cut(me.x, me.y, me.z);                                  // mở mái khi vào nhà
    if (me.role === 'seeker' && sim.phase === 'hunt') {
      const cp = camera.position, f = cam.fwd, d = UO.rayWorld(sim.map, cp.x, cp.y, cp.z, f.x, f.y, f.z, 70, 0.2, skip);
      ctl.px = cp.x + f.x * d; ctl.py = cp.y + f.y * d; ctl.pz = cp.z + f.z * d; ctl.adist = d;
    }
    sim.setCtl('me', ctl);
    sim.update(dt); handleEvents();
    // nhân vật
    const hideSeekers = me.role === 'hider' && sim.phase === 'prep', hideHiders = me.role === 'seeker' && sim.phase === 'prep';
    for (const [id, av] of m.avatars) {
      const p = av.p, upstairs = skip && id !== 'me' && p.y + 0.1 >= skip.above && p.x >= skip.rect.x0 && p.x <= skip.rect.x1 && p.z >= skip.rect.z0 && p.z <= skip.rect.z1;
      av.sync(dt, sim, !p.present || upstairs || (m.tooClose && id === m.camTarget) || (p.role === 'seeker' && hideSeekers) || (p.role === 'hider' && hideHiders));
    }
    // camera
    let tp = me; if (me.caught && m.spec) { const q = sim.players.get(m.spec); if (q && !q.caught) tp = q; else { const l = specList(); m.spec = l.length ? l[0].id : null; } }
    if (m.studioOpen) cam.studioUpdate(dt, camera, me.x, me.y + 1.0, me.z);
    else { const sk2 = tp === me ? skip : m.world.cut(tp.x, tp.y, tp.z); cam.update(dt, camera, sim.map, tp.x, tp.y + (tp.prone ? 0.7 : tp.crouch ? 1.15 : 1.6), tp.z, me.role === 'seeker' && sim.phase === 'hunt' && !me.caught, tp.y, sk2); }
    m.camTarget = tp.id; m.tooClose = !m.studioOpen && cam.cur < 1.2;           // hành lang hẹp: camera sát mặt thì ẩn nhân vật (góc nhìn thứ nhất)
    A.listener(tp.x, tp.y + 1.5, tp.z, cam.fwd.x, cam.fwd.z);
    // gợi ý khi bị trần thấp chặn (gầm cầu thang)
    if (!m.studioOpen && !me.caught && (mv.x || mv.y) && sim.t > m.lowAt && !(me.stance === 2)) {
      const px = me.x + mx * 0.7, pz = me.z + mz * 0.7, g = UO.groundAt(sim.map, px, pz, me.y);
      if (g.clear < UO.NEED[me.stance] && g.clear > UO.NEED[2]) { m.lowAt = sim.t + 3; toast('Trần thấp! Giữ C để cúi hoặc nhấn Z để bò', 1800); A.ui('lowceil'); }
    }
    for (const [mesh, rad] of m.world.canopies) mesh.visible = mesh.position.distanceTo(camera.position) > rad + 0.7;   // tán cây không che camera
    m.fx.update(dt);
    m.world.sun.position.set(tp.x - 18, 34, tp.z + 14); m.world.sun.target.position.set(tp.x, 0, tp.z);
    updateHud(dt);
  }
  function updateHud(dt) {
    const m = match, sim = m.sim, me = m.me, ph = sim.phase;
    const remain = ph === 'intro' ? C.INTRO - sim.phaseT : ph === 'prep' ? C.PREP - sim.phaseT : ph === 'hunt' ? C.HUNT - sim.phaseT : 0;
    $('#phaseTxt').textContent = ph === 'intro' ? 'CHUẨN BỊ' : ph === 'prep' ? 'NGỤY TRANG' : ph === 'hunt' ? 'TRUY TÌM' : ph === 'over' ? 'KẾT THÚC' : '';
    $('#timer').textContent = ph === 'over' ? '—' : fmt(remain);
    const low = (ph === 'hunt' || ph === 'prep') && remain <= 10; $('#timer').classList.toggle('low', low);
    if (low) { const s = Math.ceil(remain); if (s !== m.tickAt) { m.tickAt = s; A.ui('tick'); } } else m.tickAt = -1;
    const left = sim.hidersLeft(), tot = sim.hiders.length;
    $('#counts').textContent = '🫣 ' + left + '/' + tot + ' · 🎯 bắt ' + (tot - left);
    if (me.caught) $('#specTxt').textContent = m.spec ? '👁 Đang xem: ' + nameOf(m.spec) + ' (nhấp để đổi)' : ''; else $('#specTxt').textContent = '';
    if (sim.t > m.hintUntil) $('#hint').textContent = '';
    // thanh
    const bar = $('#barAFill'), barA = $('#barA');
    if (me.role === 'seeker') { const v = clamp(1 - me.fireCd / C.SLING.cd, 0, 1); bar.style.width = v * 100 + '%'; barA.classList.toggle('cool', v < 1); $('#cross').classList.toggle('cd', me.fireCd > 0); }
    else { const v = me.sprinting ? me.sprintLeft / C.HIDER.sprintTime : me.sprintCd > 0 ? 1 - me.sprintCd / C.HIDER.sprintCd : 1; bar.style.width = clamp(v, 0, 1) * 100 + '%'; barA.classList.toggle('cool', !me.sprinting && me.sprintCd > 0);
      if (ph === 'hunt' && !me.caught) { $('#barPFill').style.width = clamp(1 - (me.pingAt - sim.t) / C.PING.every, 0, 1) * 100 + '%'; } else $('#barPFill').style.width = '0%';
      m.pingFlash = Math.max(0, m.pingFlash - dt); $('#barP').classList.toggle('fire', m.pingFlash > 0); }
    $('#stanceTxt').textContent = me.caught ? '' : (me.stance === 2 ? '🛌 Nằm sấp' : me.stance === 1 ? '🧎 Cúi' : '🧍 Đứng') + (sim.map.levels.length > 1 ? ' · tầng ' + (sim.map.levelOf(me.y) + 1 > 3 ? 'sân thượng' : sim.map.levelOf(me.y) + 1) : '');
  }

  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.1, lastT ? (now - lastT) / 1000 : 0.016); lastT = now;
    if (match) { if (!paused) updateMatch(dt); renderer.render(match.world.scene, match.world.camera); }
  }

  /* ---------- tạm dừng / điều khiển ---------- */
  function setPause(v) {
    if (!match || match.over) return; if (v && match.studioOpen && match.studio.live) match.studio.end(); paused = v; match.sim.paused = v; $('#pause').classList.toggle('show', v); In.enabled = !v;
    if (v) { skipPause = true; In.unlock(); setTimeout(() => { skipPause = false; }, 100); In.resetButtons(); }
  }
  function bindUI() {
    In.init(canvas);
    In.cb.look = (dx, dy) => { if (match && !paused) match.cam.rotate(dx, dy, In.sens * S.sens / 100); };
    In.cb.zoom = (d) => { if (match) match.cam.zoom(d, match.studioOpen); };
    In.cb.undo = () => { if (match && match.studio) match.studio.undo(); }; In.cb.redo = () => { if (match && match.studio) match.studio.redo(); };
    In.cb.paint = togglePaint;
    In.cb.pause = () => { if (match && !match.over) setPause(!paused); };
    In.cb.lock = () => { if (!match || In.touch) return; if (In.locked) { skipPause = true; In.unlock(); setTimeout(() => { skipPause = false; }, 100); } else In.lock(); };
    In.cb.click = () => {
      if (!match || paused) return; A.ensure();
      if (match.me.caught) { cycleSpectate(); return; }
      if (!In.touch && !In.locked && match.sim.phase === 'hunt' && match.me.role === 'seeker') In.lock();
    };
    In.cb.unlocked = () => { if (match && !paused && !match.over && !skipPause && match.sim.phase === 'hunt') setPause(true); };
    window.addEventListener('keydown', (e) => { if (e.code === 'Tab' && match) { e.preventDefault(); cycleSpectate(); } });
    $('#btnPause').onclick = () => setPause(true); $('#btnResume').onclick = () => setPause(false); $('#btnQuit').onclick = endMatchToMenu;
    $('#btnAgain').onclick = startMatch; $('#btnMenu').onclick = endMatchToMenu;
    const vol = $('#volume'), sens = $('#sens'); vol.value = S.vol; sens.value = S.sens;
    vol.oninput = () => { S.vol = +vol.value; A.setVolume(S.vol / 100); save(); }; sens.oninput = () => { S.sens = +sens.value; save(); };
    document.addEventListener('visibilitychange', () => { if (document.hidden && match && !match.over) setPause(true); });
  }

  function boot() {
    initMenu(); bindUI(); bindStudioPointer(); resize(); requestAnimationFrame(frame);
    $('#loading').classList.remove('show');
    UO.debug = { get match() { return match; }, startMatch, S };
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})(window.UO = window.UO || {});
