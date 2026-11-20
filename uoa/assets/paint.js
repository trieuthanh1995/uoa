/* Ú òa – Xưởng tô màu: cọ vẽ tự do lên mô hình 3D của nhân vật (chỉ chạy ở trình duyệt).
 *  • Raycast từ con trỏ lên mesh → lấy UV + ma trận tỉ lệ bề mặt → vẽ nét vào texture canvas RIÊNG của từng mesh (nét bám bề mặt, không méo).
 *  • Vùng: đầu · thân trước · thân sau · tay trái/phải · chân trái/phải. Chọn vùng nào chỉ vẽ được vùng đó; chỉ vẽ lên mặt đang nhìn thấy.
 *  • Lịch sử = danh sách hành động (nét vẽ / đổ màu / xóa) → Undo/Redo bằng cách phát lại; đây cũng là dữ liệu nhỏ gọn để đồng bộ mạng sau này.
 *  • Chỉ tạo canvas khi mesh bị đụng tới (lười), 64–256 px tùy kích thước mesh → nhẹ cho FPS. Mesh nhỏ chỉ được đổ màu phẳng. */
(function (UO) {
  'use strict';
  const T = window.THREE;
  const MAX_ACTIONS = 300, MAX_DABS = 12000;
  const hex2 = (n) => ('0' + Math.max(0, Math.min(255, Math.round(n))).toString(16)).slice(-2);
  const rgbaOf = (hex, a) => { const n = parseInt(hex.replace('#', ''), 16) || 0; return 'rgba(' + (n >> 16 & 255) + ',' + (n >> 8 & 255) + ',' + (n & 255) + ',' + a + ')'; };
  const tmpV = [new T.Vector3(), new T.Vector3(), new T.Vector3(), new T.Vector3(), new T.Vector3(), new T.Vector3()];
  const ZONE_TO_ITEMS = {
    all: () => true, head: (z) => z === 'head', body: (z) => z === 'body' || z === 'pelvis', bodyF: (z) => z === 'body' || z === 'pelvis', bodyB: (z) => z === 'body' || z === 'pelvis',
    armL: (z) => z === 'armL', armR: (z) => z === 'armR', legL: (z) => z === 'legL', legR: (z) => z === 'legR',
  };
  const DOWN = document.createElement('canvas'); DOWN.width = DOWN.height = 8; const DCTX = DOWN.getContext('2d', { willReadFrequently: true });

  class PaintStudio {
    /** avatar: R.Avatar của người chơi (có .ch, .holder, .p) */
    constructor(avatar) {
      this.av = avatar; this.ch = avatar.ch; this.actions = []; this.redoStack = []; this.live = null; this.dabCount = 0;
      this.brush = { color: '#7a8f5a', size: 0.035, opacity: 0.9, kind: 'hard', erase: false };
      this.zone = 'all'; this.ray = new T.Raycaster(); this.onChange = null;
      this.items = this.ch.getPaintables().map((it) => this._mkItem(it));
      this.allMeshes = []; this.ch.root.traverse((o) => { if (o.isMesh && o.visible !== false) this.allMeshes.push(o); });
      this.byMesh = new Map(this.items.map((it) => [it.mesh, it]));
    }
    _mkItem(it) {
      const g = it.mesh.geometry; if (!g.boundingSphere) g.computeBoundingSphere();
      const R = g.boundingSphere.radius * Math.max(it.mesh.scale.x, it.mesh.scale.y, it.mesh.scale.z);
      const o = { mesh: it.mesh, zone: it.zone, base: it.base, orig: it.orig, R, w: R * R, tiny: R < 0.06, size: R >= 0.22 ? 256 : R >= 0.1 ? 128 : 64,
        baseColor: null, display: null, layer: null, tmp: null, tex: null, mat: null, flat: null, hasLayer: false, origAvg: null };
      return o;
    }
    /* ---------- canvas / vật liệu ---------- */
    _ensure(it) {
      if (it.display) return;
      const S = it.size, mk = () => { const c = document.createElement('canvas'); c.width = c.height = S; return c; };
      it.display = mk(); it.layer = mk(); it.tmp = mk();
      it.tex = new T.CanvasTexture(it.display); it.tex.encoding = T.sRGBEncoding; it.tex.anisotropy = 4; it.tex.wrapS = it.tex.wrapT = T.RepeatWrapping;
      it.mat = it.orig.clone(); it.mat.map = it.tex; it.mat.needsUpdate = true;
    }
    _origHex(it) { const c = it.orig.color.clone().convertLinearToSRGB(); return '#' + c.getHexString(); }
    _compose(it, preview) {
      const forceOrig = !it.baseColor && !it.hasLayer && !preview;
      if (forceOrig) { if (it.mesh.userData.painted) { it.mesh.material = it.orig; it.mesh.userData.painted = false; } return; }
      if (it.tiny) return;
      this._ensure(it); const ctx = it.display.getContext('2d'), S = it.size; ctx.globalAlpha = 1; ctx.clearRect(0, 0, S, S);
      if (it.baseColor) { ctx.fillStyle = it.baseColor; ctx.fillRect(0, 0, S, S); }
      else if (it.orig.map && it.orig.map.image) { ctx.drawImage(it.orig.map.image, 0, 0, S, S); }
      else { ctx.fillStyle = this._origHex(it); ctx.fillRect(0, 0, S, S); }
      ctx.drawImage(it.layer, 0, 0);
      if (preview && !preview.erase) { ctx.globalAlpha = preview.opacity; ctx.drawImage(it.tmp, 0, 0); ctx.globalAlpha = 1; }
      it.tex.needsUpdate = true;
      // màu vật liệu: có map gốc & không đổ màu thì giữ màu gốc (thường trắng); còn lại để trắng để canvas hiển thị đúng
      if (it.baseColor || !it.orig.map) it.mat.color.setRGB(1, 1, 1); else it.mat.color.copy(it.orig.color);
      if (!it.mesh.userData.painted) { it.mesh.material = it.mat; it.mesh.userData.painted = true; }
    }
    _flat(it, hex) {       // mesh nhỏ: đổ màu phẳng
      if (!hex) { if (it.mesh.userData.painted) { it.mesh.material = it.orig; it.mesh.userData.painted = false; } return; }
      if (!it.flat) it.flat = it.orig.clone(); it.flat.map = null; it.flat.color.set(new T.Color(hex).convertSRGBToLinear()); it.flat.needsUpdate = true;
      it.mesh.material = it.flat; it.mesh.userData.painted = true;
    }
    /* ---------- hình học: ma trận mét → UV tại điểm chạm ---------- */
    _jacobian(hit) {
      const g = hit.object.geometry, pos = g.attributes.position, uv = g.attributes.uv, f = hit.face, M = hit.object.matrixWorld;
      const A = tmpV[0].fromBufferAttribute(pos, f.a).applyMatrix4(M), B = tmpV[1].fromBufferAttribute(pos, f.b).applyMatrix4(M), Cc = tmpV[2].fromBufferAttribute(pos, f.c).applyMatrix4(M);
      const e1 = tmpV[3].subVectors(B, A), e2 = tmpV[4].subVectors(Cc, A), l1 = e1.length(); if (l1 < 1e-7) return null;
      const t1 = e1.clone().divideScalar(l1), n = new T.Vector3().crossVectors(e1, e2); if (n.lengthSq() < 1e-14) return null; n.normalize();
      const t2 = new T.Vector3().crossVectors(n, t1), p = e2.dot(t1), q = e2.dot(t2); if (Math.abs(q) < 1e-7) return null;
      const wrap = (d) => d - Math.round(d);
      const d1u = wrap(uv.getX(f.b) - uv.getX(f.a)), d1v = uv.getY(f.b) - uv.getY(f.a), d2u = wrap(uv.getX(f.c) - uv.getX(f.a)), d2v = uv.getY(f.c) - uv.getY(f.a);
      return [d1u / l1, (-d1u * p + d2u * l1) / (l1 * q), d1v / l1, (-d1v * p + d2v * l1) / (l1 * q)];
    }
    /** raycast từ toạ độ màn hình; trả về { item, hit } đầu tiên thấy được (không vẽ xuyên mặt trước) */
    pick(camera, ndcX, ndcY) {
      this.ray.setFromCamera({ x: ndcX, y: ndcY }, camera);
      const hits = this.ray.intersectObjects(this.allMeshes, false); if (!hits.length) return null;
      const hit = hits[0], item = this.byMesh.get(hit.object); if (!item || !hit.uv || item.tiny) return null;
      if (this.zone !== 'all') {
        if (!ZONE_TO_ITEMS[this.zone](item.zone)) return null;
        if (this.zone === 'bodyF' || this.zone === 'bodyB') {          // trước/sau theo hướng pháp tuyến so với hướng nhìn của nhân vật
          const nrm = hit.face.normal.clone().transformDirection(hit.object.matrixWorld), yaw = this.av.p.yaw, front = nrm.x * Math.sin(yaw) + nrm.z * Math.cos(yaw) >= 0;
          if ((this.zone === 'bodyF') !== front) return null;
        }
      }
      return { item, hit };
    }
    /* ---------- vẽ ---------- */
    _dab(ctx, it, d, b) {            // d = [itemIdx,u,v,m00,m01,m10,m11,r]
      const S = it.size, u = d[1], v = d[2], K = [S * d[3], -S * d[5], S * d[4], -S * d[6]], r = d[7];
      const rad = r * Math.max(Math.hypot(K[0], K[1]), Math.hypot(K[2], K[3])), offs = (u * S - rad < 0) ? [0, S] : (u * S + rad > S) ? [0, -S] : [0];
      for (const ox of offs) {
        ctx.save(); ctx.translate(u * S + ox, (1 - v) * S); ctx.transform(K[0], K[1], K[2], K[3], 0, 0);
        if (b.erase) { ctx.globalCompositeOperation = 'destination-out'; ctx.fillStyle = rgbaOf('#000000', b.opacity * (b.kind === 'soft' ? 0.5 : 1)); }
        if (b.kind === 'soft' && !b.erase) { const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r); g.addColorStop(0, rgbaOf(b.color, 0.9)); g.addColorStop(0.55, rgbaOf(b.color, 0.45)); g.addColorStop(1, rgbaOf(b.color, 0)); ctx.fillStyle = g; }
        else if (!b.erase) ctx.fillStyle = b.color;
        ctx.beginPath(); ctx.arc(0, 0, b.kind === 'dots' ? r * 0.5 : r, 0, Math.PI * 2); ctx.fill(); ctx.restore();
      }
    }
    begin() { if (this.actions.length >= MAX_ACTIONS || this.dabCount > MAX_DABS) return false; this.live = { t: 'stroke', b: Object.assign({}, this.brush), dabs: [], touched: new Set(), last: null }; return true; }
    /** thêm một chấm tại điểm chạm; spacing do người gọi kiểm soát */
    addHit(p) {
      const L = this.live; if (!L || !p) return false; const it = p.item, J = this._jacobian(p.hit); if (!J) return false;
      const b = L.b, d = [this.items.indexOf(it), +p.hit.uv.x.toFixed(4), +p.hit.uv.y.toFixed(4), +J[0].toFixed(3), +J[1].toFixed(3), +J[2].toFixed(3), +J[3].toFixed(3), b.size];
      this._ensure(it); L.dabs.push(d); L.touched.add(it); this.dabCount++;
      this._dab(b.erase ? it.layer.getContext('2d') : it.tmp.getContext('2d'), it, d, b);
      if (b.erase) it.hasLayer = true;
      this._compose(it, b.erase ? null : b); return true;
    }
    end() {
      const L = this.live; this.live = null; if (!L) return;
      if (!L.dabs.length) return;
      for (const it of L.touched) { if (!L.b.erase) { const ctx = it.layer.getContext('2d'); ctx.globalAlpha = L.b.opacity; ctx.drawImage(it.tmp, 0, 0); ctx.globalAlpha = 1; it.tmp.getContext('2d').clearRect(0, 0, it.size, it.size); it.hasLayer = true; } this._compose(it, null); }
      this.actions.push({ t: 'stroke', b: L.b, dabs: L.dabs }); this.redoStack.length = 0; this._changed();
    }
    cancel() { const L = this.live; this.live = null; if (!L) return; for (const it of L.touched) { it.tmp.getContext('2d').clearRect(0, 0, it.size, it.size); } this.rebuild(); }
    /* ---------- hành động khác ---------- */
    _items(zone) { const f = ZONE_TO_ITEMS[zone] || ZONE_TO_ITEMS.all; return this.items.filter((it) => f(it.zone)); }
    fill(zone, color) { this._push({ t: 'fill', zone, color }); }
    reset(zone) { this._push({ t: 'reset', zone }); }
    clearStrokes(zone) { this._push({ t: 'clear', zone }); }
    _push(a) { if (this.actions.length >= MAX_ACTIONS) return false; this.actions.push(a); this.redoStack.length = 0; this.rebuild(); this._changed(); return true; }
    undo() { if (this.live || !this.actions.length) return false; this.redoStack.push(this.actions.pop()); this.rebuild(); this._changed(); return true; }
    redo() { if (this.live || !this.redoStack.length) return false; this.actions.push(this.redoStack.pop()); this.rebuild(); this._changed(); return true; }
    get canUndo() { return this.actions.length > 0; } get canRedo() { return this.redoStack.length > 0; }
    _applyAction(a) {
      if (a.t === 'fill') for (const it of this._items(a.zone)) { it.baseColor = a.color; this._wipeLayer(it); }
      else if (a.t === 'reset') for (const it of this._items(a.zone)) { it.baseColor = null; this._wipeLayer(it); }
      else if (a.t === 'clear') for (const it of this._items(a.zone)) this._wipeLayer(it);
      else if (a.t === 'stroke') {
        const touched = new Set(); const b = a.b;
        for (const d of a.dabs) { const it = this.items[d[0]]; if (!it) continue; this._ensure(it); touched.add(it); this._dab(b.erase ? it.layer.getContext('2d') : it.tmp.getContext('2d'), it, d, b); }
        for (const it of touched) { if (!b.erase) { const ctx = it.layer.getContext('2d'); ctx.globalAlpha = b.opacity; ctx.drawImage(it.tmp, 0, 0); ctx.globalAlpha = 1; it.tmp.getContext('2d').clearRect(0, 0, it.size, it.size); } it.hasLayer = true; }
      }
    }
    _wipeLayer(it) { if (it.layer) { it.layer.getContext('2d').clearRect(0, 0, it.size, it.size); it.tmp.getContext('2d').clearRect(0, 0, it.size, it.size); } it.hasLayer = false; }
    /** phát lại toàn bộ lịch sử từ trạng thái gốc */
    rebuild() {
      for (const it of this.items) { it.baseColor = null; this._wipeLayer(it); }
      this.dabCount = 0; for (const a of this.actions) { this._applyAction(a); if (a.dabs) this.dabCount += a.dabs.length; }
      for (const it of this.items) { if (it.tiny) { let c = null; for (const a of this.actions) if (a.t === 'fill' && ZONE_TO_ITEMS[a.zone](it.zone)) c = a.color; else if (a.t === 'reset' && ZONE_TO_ITEMS[a.zone](it.zone)) c = null; this._flat(it, c); } else this._compose(it, null); }
    }
    _changed() { if (this.onChange) this.onChange(); }
    /* ---------- màu trung bình từng vùng (để tính độ ngụy trang) + dữ liệu nét vẽ ---------- */
    _avg(it) {
      let src;
      if (it.tiny) { const a = it.mesh.userData.painted && it.flat ? '#' + it.flat.color.clone().convertLinearToSRGB().getHexString() : null; return a ? this._rgb(a) : this._origRGB(it); }
      if (!it.display || (!it.baseColor && !it.hasLayer)) return this._origRGB(it);
      src = it.display; DCTX.clearRect(0, 0, 8, 8); DCTX.drawImage(src, 0, 0, 8, 8); const d = DCTX.getImageData(0, 0, 8, 8).data; let r = 0, g = 0, b = 0, n = 0;
      for (let i = 0; i < d.length; i += 4) { r += d[i]; g += d[i + 1]; b += d[i + 2]; n++; } return [r / n, g / n, b / n];
    }
    _rgb(h) { const n = parseInt(h.replace('#', ''), 16) || 0; return [n >> 16 & 255, n >> 8 & 255, n & 255]; }
    _origRGB(it) {
      if (it.origAvg) return it.origAvg;
      if (it.orig.map && it.orig.map.image) { DCTX.clearRect(0, 0, 8, 8); DCTX.drawImage(it.orig.map.image, 0, 0, 8, 8); const d = DCTX.getImageData(0, 0, 8, 8).data; let r = 0, g = 0, b = 0, n = 0; for (let i = 0; i < d.length; i += 4) { r += d[i]; g += d[i + 1]; b += d[i + 2]; n++; } const tint = it.orig.color.clone().convertLinearToSRGB(); it.origAvg = [r / n * tint.r, g / n * tint.g, b / n * tint.b]; }
      else it.origAvg = this._rgb(this._origHex(it));
      return it.origAvg;
    }
    summary() {
      const out = {};
      for (const base of ['head', 'body', 'arms', 'legs']) {
        let r = 0, g = 0, b = 0, w = 0;
        for (const it of this.items) { if (it.base !== base) continue; const c = this._avg(it); r += c[0] * it.w; g += c[1] * it.w; b += c[2] * it.w; w += it.w; }
        if (w > 0) out[base] = '#' + hex2(r / w) + hex2(g / w) + hex2(b / w);
      }
      return out;
    }
    /** dữ liệu nét vẽ gọn (để lưu / đồng bộ mạng sau này) */
    exportArt() { return { v: 1, actions: this.actions }; }
    importArt(art) { if (art && art.v === 1) { this.actions = art.actions.slice(); this.redoStack.length = 0; this.rebuild(); this._changed(); } }
    hasArt() { return this.actions.length > 0; }
    /** viền sáng quanh vùng đang chỉnh */
    setHighlight(zone) {
      for (const o of this._hl || []) { if (o.parent) o.parent.remove(o); } this._hl = [];
      if (!zone || zone === 'all') return;
      if (!this._hlMat) this._hlMat = new T.MeshBasicMaterial({ color: 0xffd23f, side: T.BackSide, transparent: true, opacity: 0.85, depthWrite: false });
      const f = ZONE_TO_ITEMS[zone];
      for (const it of this.items) { if (!f(it.zone) || it.R < 0.05) continue; const o = new T.Mesh(it.mesh.geometry, this._hlMat); o.scale.setScalar(1.07); o.raycast = () => {}; o.renderOrder = -1; it.mesh.add(o); this._hl.push(o); }
    }
    dispose() { this.setHighlight(null); for (const it of this.items) { if (it.tex) it.tex.dispose(); if (it.mat) it.mat.dispose(); if (it.flat) it.flat.dispose(); } }
  }
  UO.PaintStudio = PaintStudio;
})(window.UO = window.UO || {});
