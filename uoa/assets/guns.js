/* Duy Anh Battle – mô hình súng cầm trên tay nhân vật (thay cho vợt pickleball)
 * Hai loại: 'rifle' = Súng nước · 'sniper' = Ná cao su. Dùng chung cho trận đấu, menu, tủ đồ, màn thiết lập. */
(function (PP) {
  'use strict';
  const T = window.THREE;
  const lin = (hex) => new T.Color(hex).convertSRGBToLinear();
  const mat = (hex, o) => new T.MeshStandardMaterial(Object.assign({ color: lin(hex), roughness: 0.5, metalness: 0 }, o || {}));
  const NAMES = { rifle: 'Súng nước', sniper: 'Ná cao su' };
  const ICONS = { rifle: '💦', sniper: '🎯' };

  /** Dựng 1 khẩu súng hướng về +z, gốc ở giữa thân. color = màu thân (lấy từ "Màu súng" trong tủ đồ) */
  function make(kind, color) {
    const g = new T.Group();
    const col = color == null ? 0x4cc9f0 : color;
    if (kind === 'sniper') {
      const wood = mat(col, { roughness: 0.6 }), dark = mat(0x2b2d42, { roughness: 0.3 });
      const stock = new T.Mesh(new T.BoxGeometry(0.075, 0.09, 0.5), wood); stock.position.set(0, 0, 0.12); g.add(stock);
      for (const s of [-1, 1]) {
        const arm = new T.Mesh(new T.BoxGeometry(0.035, 0.2, 0.035), wood); arm.position.set(s * 0.08, 0.1, 0.4); arm.rotation.z = -s * 0.35; g.add(arm);
      }
      const band = new T.Mesh(new T.CylinderGeometry(0.012, 0.012, 0.3, 6), mat(0xffd23f, { emissive: lin(0xffd23f), emissiveIntensity: 0.3 }));
      band.rotation.z = Math.PI / 2; band.position.set(0, 0.2, 0.3); g.add(band);
      const scope = new T.Mesh(new T.CylinderGeometry(0.035, 0.035, 0.26, 12), dark); scope.rotation.x = Math.PI / 2; scope.position.set(0, 0.095, 0.14); g.add(scope);
      const lens = new T.Mesh(new T.SphereGeometry(0.032, 10, 8), mat(0x6fe3ff, { emissive: lin(0x6fe3ff), emissiveIntensity: 0.7 })); lens.position.set(0, 0.095, 0.27); g.add(lens);
    } else {
      const body = mat(col, { roughness: 0.35 }), white = mat(0xffffff, { roughness: 0.3 });
      const b = new T.Mesh(new T.BoxGeometry(0.11, 0.12, 0.34), body); b.position.set(0, 0, 0.06); g.add(b);         // thân (children[0] = phần đổi màu)
      const nozzle = new T.Mesh(new T.CylinderGeometry(0.03, 0.045, 0.2, 12), white); nozzle.rotation.x = Math.PI / 2; nozzle.position.set(0, 0.015, 0.31); g.add(nozzle);
      const tip = new T.Mesh(new T.CylinderGeometry(0.018, 0.03, 0.06, 10), mat(0xffd23f)); tip.rotation.x = Math.PI / 2; tip.position.set(0, 0.015, 0.43); g.add(tip);
      const tank = new T.Mesh(new T.CylinderGeometry(0.075, 0.075, 0.13, 16), new T.MeshStandardMaterial({ color: lin(0x7fdcff), transparent: true, opacity: 0.8, roughness: 0.08 }));
      tank.position.set(0, 0.125, 0.04); g.add(tank);
      const cap = new T.Mesh(new T.CylinderGeometry(0.05, 0.05, 0.03, 12), white); cap.position.set(0, 0.2, 0.04); g.add(cap);
      const grip = new T.Mesh(new T.BoxGeometry(0.06, 0.13, 0.07), white); grip.position.set(0, -0.11, -0.03); grip.rotation.x = 0.25; g.add(grip);
    }
    g.traverse((m) => { if (m.isMesh) m.castShadow = true; });
    return g;
  }
  const disposeGroup = (g) => g.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
  const colorFrom = (def, look) => {
    if (look && look.paddle) { const n = parseInt(String(look.paddle).replace('#', ''), 16); if (Number.isFinite(n)) return n; }
    return def && def.paddle != null ? def.paddle : 0x4cc9f0;
  };

  /** Gắn súng vào tay phải của nhân vật `ch` (kết quả của PP.Character.build) và ẩn chiếc vợt. */
  function attach(ch, kind, color) {
    ch.root.traverse((o) => { if (o.userData && o.userData.paddle) o.visible = false; });
    const holder = new T.Group(); ch.root.add(holder);
    let cur = null, k = kind, col = color;
    const v = new T.Vector3();
    function setKind(nk, ncol) {
      if (ncol != null) col = ncol;
      k = nk;
      if (cur) { holder.remove(cur); disposeGroup(cur); }
      cur = make(k, col); holder.add(cur);
    }
    /** Gọi sau mỗi lần ch.update: súng bám theo bàn tay (kick = độ giật 0..1.6) */
    function sync(kick) {
      kick = kick || 0;
      ch.getHandWorld('R', v); ch.root.worldToLocal(v);
      holder.position.set(v.x, v.y + 0.03, v.z + 0.12 - kick * 0.06);
      holder.rotation.x = -kick * 0.18;
    }
    setKind(kind, color);
    return { setKind, sync, group: holder, get kind() { return k; }, dispose() { if (cur) disposeGroup(cur); ch.root.remove(holder); } };
  }

  PP.Guns = { make, attach, colorFrom, NAMES, ICONS };
})(window.PP = window.PP || {});
