/* Ú òa – bản đồ (trình duyệt + Node). Dữ liệu thuần, cố định theo seed để sau này server dùng chung.
 * Hộp:  {x,z,w,d,h,c,tex,k}  – (x,z) là tâm, w theo trục x, d theo trục z, h cao (m), c màu, tex kiểu hoa văn, k loại.
 * Trụ:  {x,z,r,h,c,c2,k}     – cây, cột, thùng phuy…
 * Vật cao >= 1.0 m chắn tầm nhìn / tiếng / đạn; vật thấp hơn chỉ chắn đường đi. */
(function (root, factory) {
  const mod = factory();
  if (typeof module === 'object' && module.exports) module.exports = mod;
  else { root.UO = root.UO || {}; Object.assign(root.UO, mod); }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const rng = (a) => () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

  function Builder(seed) {
    const b = { boxes: [], circles: [], R: rng(seed) };
    b.box = (x, z, w, d, h, c, tex, k) => { b.boxes.push({ x, z, w, d, h, c, tex: tex || 'solid', k: k || 'prop' }); };
    b.cir = (x, z, r, h, c, k, c2) => { b.circles.push({ x, z, r, h, c, k: k || 'pillar', c2 }); };
    // tường thẳng trục x hoặc z, có cửa: gaps = [[từ, đến]] tính theo khoảng cách dọc tường
    b.wall = (x0, z0, x1, z1, t, h, c, tex, gaps) => {
      const horiz = Math.abs(z1 - z0) < 1e-6, len = horiz ? Math.abs(x1 - x0) : Math.abs(z1 - z0);
      const sgn = horiz ? Math.sign(x1 - x0) || 1 : Math.sign(z1 - z0) || 1;
      let parts = [[0, len]];
      for (const [ga, gb] of (gaps || [])) {
        const np = [];
        for (const [pa, pb] of parts) {
          if (gb <= pa || ga >= pb) { np.push([pa, pb]); continue; }
          if (ga > pa) np.push([pa, ga]); if (gb < pb) np.push([gb, pb]);
        }
        parts = np;
      }
      for (const [pa, pb] of parts) {
        const ea = pa === 0 ? t / 2 : 0, eb = pb === len ? t / 2 : 0, a = pa - ea, e = pb + eb, mid = (a + e) / 2, L = e - a;
        if (horiz) b.box(x0 + sgn * mid, z0, L, t, h, c, tex, 'wall'); else b.box(x0, z0 + sgn * mid, t, L, h, c, tex, 'wall');
      }
    };
    // khung chữ nhật 4 tường, doors: { N|S|E|W: [[từ,đến],…] } ; N = z nhỏ, S = z lớn
    b.rect = (x0, z0, x1, z1, t, h, c, tex, doors) => {
      doors = doors || {};
      b.wall(x0, z0, x1, z0, t, h, c, tex, doors.N); b.wall(x0, z1, x1, z1, t, h, c, tex, doors.S);
      b.wall(x0, z0, x0, z1, t, h, c, tex, doors.W); b.wall(x1, z0, x1, z1, t, h, c, tex, doors.E);
    };
    b.fence = (hw, hd, h, c) => {
      const t = 0.5;
      b.box(0, -hd - t / 2, 2 * hw + 2 * t, t, h, c, 'plank', 'fence'); b.box(0, hd + t / 2, 2 * hw + 2 * t, t, h, c, 'plank', 'fence');
      b.box(-hw - t / 2, 0, t, 2 * hd, h, c, 'plank', 'fence'); b.box(hw + t / 2, 0, t, 2 * hd, h, c, 'plank', 'fence');
    };
    return b;
  }
  const out = (b, o) => Object.assign({ boxes: b.boxes, circles: b.circles }, o);

  /* ------------------------------------------------------------------ 1. Khu Phố Nhỏ */
  function street() {
    const b = Builder(11), HW = 28, HD = 22;
    b.fence(HW, HD, 2.4, 0x8d6e4b);
    const T = 0.3, H = 3;
    // hàng nhà phía bắc (z -19..-9, cửa chính mở xuống đường z=-9) và phía nam (z 9..19, cửa chính hướng lên)
    const N = [
      { x0: -26, c: 0xf2a65a, tex: 'brick', in: 0xcfe8ff, kind: 'home' },
      { x0: -7,  c: 0x6ab187, tex: 'solid', in: 0xffe6a7, kind: 'cafe' },
      { x0: 12,  c: 0xd95d5d, tex: 'brick', in: 0xe0d4f7, kind: 'school' },
    ];
    const S = [
      { x0: -26, c: 0x5a8dd6, tex: 'solid', in: 0xffd6e0, kind: 'shop' },
      { x0: -7,  c: 0xe6c84f, tex: 'stripe', in: 0xd3f0d0, kind: 'home' },
      { x0: 12,  c: 0x9b7bd0, tex: 'brick', in: 0xfff0c9, kind: 'garage' },
    ];
    const furn = {
      home(x0, z0, f) { // f=1: cửa phía nam (nhà bắc) ; f=-1: nhà nam lật theo trục z
        const P = (dx, dz) => [x0 + dx, z0 + (f === 1 ? dz : 10 - dz)];
        const add = (dx, dz, w, d, h, c, tex, k) => { const [x, z] = P(dx, dz); b.box(x, z, w, d, h, c, tex, k); };
        add(3, 2, 2.4, 1.0, 0.9, 0x9a6bd1, 'solid', 'sofa'); add(5.4, 4, 1.2, 1.6, 0.75, 0x8a5a33, 'wood', 'table');
        add(1, 6, 1.0, 2.2, 2.0, 0x8a5a33, 'wood', 'wardrobe'); add(10, 2, 2.0, 1.6, 0.6, 0xf3c6d3, 'solid', 'bed');
        add(12.4, 4, 1.0, 2.6, 1.9, 0x8a5a33, 'wood', 'shelf'); add(10.5, 7.8, 2.2, 0.8, 1.0, 0xffffff, 'solid', 'counter');
      },
      cafe(x0, z0, f) {
        const P = (dx, dz) => [x0 + dx, z0 + (f === 1 ? dz : 10 - dz)];
        const add = (dx, dz, w, d, h, c, tex, k) => { const [x, z] = P(dx, dz); b.box(x, z, w, d, h, c, tex, k); };
        add(2.5, 1.2, 1.0, 1.0, 1.1, 0xc96f3b, 'wood', 'table'); add(5.5, 3.5, 1.0, 1.0, 1.1, 0xc96f3b, 'wood', 'table');
        add(9.5, 3.5, 1.0, 1.0, 1.1, 0xc96f3b, 'wood', 'table'); add(12.5, 7.5, 2.4, 0.9, 1.1, 0x2b2d42, 'solid', 'counter');
        add(1.5, 8.6, 0.9, 2.4, 2.0, 0xd9d9d9, 'stripe', 'fridge'); add(7.5, 8.2, 3.2, 0.9, 1.0, 0x3d3d4a, 'solid', 'counter');
      },
      school(x0, z0, f) {
        const P = (dx, dz) => [x0 + dx, z0 + (f === 1 ? dz : 10 - dz)];
        const add = (dx, dz, w, d, h, c, tex, k) => { const [x, z] = P(dx, dz); b.box(x, z, w, d, h, c, tex, k); };
        for (const dx of [2.2, 4.6, 9.4, 11.8]) for (const dz of [2.2, 4.8]) add(dx, dz, 1.3, 0.8, 1.0, 0xe6b86a, 'wood', 'desk');
        add(7, 8.6, 2.6, 0.7, 1.3, 0x2f5d3a, 'solid', 'blackboard'); add(1.2, 8, 0.9, 2.6, 2.0, 0x8a5a33, 'wood', 'shelf');
      },
      shop(x0, z0, f) {
        const P = (dx, dz) => [x0 + dx, z0 + (f === 1 ? dz : 10 - dz)];
        const add = (dx, dz, w, d, h, c, tex, k) => { const [x, z] = P(dx, dz); b.box(x, z, w, d, h, c, tex, k); };
        add(3, 3, 0.8, 3.2, 1.9, 0xff8fab, 'stripe', 'shelf'); add(5.4, 3, 0.8, 3.2, 1.9, 0x7bd3ff, 'stripe', 'shelf');
        add(9.2, 3, 0.8, 3.2, 1.9, 0xffe066, 'stripe', 'shelf'); add(12, 6.8, 2.4, 0.9, 1.0, 0x3d3d4a, 'solid', 'counter');
        add(2, 8.6, 2.2, 0.9, 1.3, 0xffffff, 'solid', 'fridge');
      },
      garage(x0, z0, f) {
        const P = (dx, dz) => [x0 + dx, z0 + (f === 1 ? dz : 10 - dz)];
        const add = (dx, dz, w, d, h, c, tex, k) => { const [x, z] = P(dx, dz); b.box(x, z, w, d, h, c, tex, k); };
        add(3.2, 3, 2.0, 3.6, 1.35, 0x3a86ff, 'solid', 'car'); add(10.6, 3.2, 1.0, 1.0, 1.2, 0xc98b4f, 'wood', 'crate');
        add(12.2, 4.2, 1.0, 1.0, 1.2, 0xc98b4f, 'wood', 'crate'); add(11.4, 4.2, 1.0, 1.0, 2.2, 0xc98b4f, 'wood', 'crate');
        b.cir(7.2 + x0, z0 + (f === 1 ? 8.4 : 1.6), 0.45, 1.0, 0x2a9d8f, 'barrel'); add(1.2, 8.4, 2.0, 0.9, 1.0, 0x555a66, 'solid', 'counter');
      },
    };
    function building(o, row) {
      const x0 = o.x0, x1 = x0 + 14, z0 = row === 'N' ? -19 : 9, z1 = z0 + 10, f = row === 'N' ? 1 : -1;
      const mainSide = row === 'N' ? 'S' : 'N', backSide = row === 'N' ? 'N' : 'S';
      const doors = {}; doors[mainSide] = [[3, 5], [9.5, 11.5]]; doors[backSide] = [[6, 8]]; doors.E = [[4, 6]]; doors.W = [[4, 6]];
      b.rect(x0, z0, x1, z1, T, H, o.c, o.tex, doors);
      // vách ngăn: dọc, có cửa
      b.wall(x0 + 7, z0, x0 + 7, z1, T, H, o.in, 'solid', [[3.6, 5.6]]);
      furn[o.kind](x0, z0, f);
      // thảm màu sàn trong nhà để tạo mảng màu khác nhau (không chắn đường)
    }
    N.forEach((o) => building(o, 'N')); S.forEach((o) => building(o, 'S'));
    // công viên giữa đường
    const R = b.R;
    b.cir(0, 0, 1.0, 3.2, 0x7a4a2a, 'tree', 0x3fa34d); b.cir(-9, 1.5, 0.8, 3.0, 0x7a4a2a, 'tree', 0x5ea84a); b.cir(9, -1.5, 0.8, 3.0, 0x7a4a2a, 'tree', 0x2f8f6b);
    b.cir(-19, -2, 0.7, 2.8, 0x7a4a2a, 'tree', 0x7fc04a); b.cir(19, 2, 0.7, 2.8, 0x7a4a2a, 'tree', 0xf2a65a);
    b.box(-4, 3.4, 2.2, 0.7, 0.5, 0x8a5a33, 'wood', 'bench'); b.box(4, -3.4, 2.2, 0.7, 0.5, 0x8a5a33, 'wood', 'bench');
    b.box(-14, -6.6, 4.4, 1.9, 1.4, 0xd62839, 'solid', 'car'); b.box(15, 6.4, 4.4, 1.9, 1.4, 0xf4f4f4, 'solid', 'car');
    b.box(-11, 6.6, 4.4, 1.9, 1.4, 0x2f6fdb, 'solid', 'car'); b.box(12, -6.6, 4.4, 1.9, 1.4, 0xffd23f, 'solid', 'car');
    for (const [x, z, w, d] of [[-6, -5.2, 4, 0.9], [6, 5.2, 4, 0.9], [-22, 2, 0.9, 4], [22, -2, 0.9, 4], [0, -7.4, 3, 0.9], [0, 7.4, 3, 0.9]]) b.box(x, z, w, d, 1.3, 0x2f8f4a, 'dots', 'hedge');
    b.box(-1.6, 1.6, 1.2, 1.2, 1.5, 0xff8fab, 'stripe', 'slide'); b.box(1.8, 2.2, 1.0, 2.2, 1.0, 0x4cc9f0, 'solid', 'slide');
    for (let i = 0; i < 5; i++) b.cir(-24 + i * 12 + R() * 2, (i % 2 ? -1 : 1) * 20.3, 0.5, 1.2, 0x3fa34d, 'bush');
    return out(b, {
      id: 'street', name: 'Khu Phố Nhỏ', desc: 'Nhà, quán cà phê, trường học và công viên giữa phố',
      HW, HD, sky: 0xbfe3ff, floor: 0x9fb18b, floor2: 0x8fa27d, ground: 'grass',
      spawns: {
        hider: [[-3, 0], [3, 0], [-8, -2], [8, 2], [-14, 2], [14, -2], [-20, 0], [20, 0], [-1, 4], [1, -4]],
        seeker: [[-26.5, 0], [-26.5, 2], [-26.5, -2], [-25, 4], [-25, -4], [-24, 6], [-24, -6], [-27, 5], [-27, -5]],
      },
    });
  }

  /* ------------------------------------------------------------------ 2. Siêu Thị Đèn Vàng */
  function market() {
    const b = Builder(23), HW = 22, HD = 16;
    b.fence(HW, HD, 3.2, 0xe9d8a6);
    const cols = [0xff8fab, 0x7bd3ff, 0xffe066, 0xb5e48c, 0xcdb4db, 0xffb38a];
    // 5 hàng kệ dọc, mỗi hàng 2 đoạn (hở giữa để cắt ngang)
    let ci = 0;
    for (const x of [-15, -9, -3, 3, 9]) {
      for (const [z0, z1] of [[-12, -2.4], [2.4, 11]]) {
        const L = z1 - z0; b.box(x, (z0 + z1) / 2, 1.0, L, 1.9, cols[ci++ % cols.length], 'stripe', 'shelf');
      }
    }
    // dãy tủ lạnh sát tường bắc
    for (let i = 0; i < 5; i++) b.box(-17 + i * 3.6 + 1.1, -15.2, 2.2, 1.2, 2.0, i % 2 ? 0xf4f4f4 : 0xb9e6ff, 'stripe', 'fridge');
    // quầy thu ngân phía đông
    for (const z of [-9, -4, 1, 6]) { b.box(17, z, 2.8, 1.0, 1.1, 0x3d3d4a, 'solid', 'counter'); b.box(19.6, z, 1.6, 0.7, 0.8, 0xffd23f, 'solid', 'counter'); }
    // thùng rau củ, pallet
    for (const [x, z, c] of [[13.2, -12, 0x7ab648], [14.8, -12.2, 0xf77f00], [13.4, 10, 0xd62839], [15, 10.4, 0xffd23f], [-20, 4, 0x7ab648], [-20, 6.2, 0xf77f00], [-20, 8.4, 0xd62839]]) b.box(x, z, 1.3, 1.3, 1.1, c, 'wood', 'crate');
    for (const [x, z] of [[-18, -6], [0, 0], [6, -6], [12, 0]]) b.cir(x, z, 0.5, 2.4, 0xd9d9d9, 'pillar');
    // phòng kho nhỏ phía nam
    b.rect(-21.7, 11.5, -12, 15.7, 0.3, 3.2, 0x9c8f7a, 'brick', { N: [[4, 5.6]] });
    b.box(-17, 14, 2.4, 1.2, 1.6, 0xc98b4f, 'wood', 'crate'); b.box(-14, 13.2, 1.0, 1.0, 1.2, 0xc98b4f, 'wood', 'crate');
    for (const [x, z] of [[-6, 14.5], [-3, 14.5], [0, 14.5], [3, 14.5]]) b.box(x, z, 1.5, 1.2, 1.0, 0x6ab187, 'dots', 'crate');
    b.box(7, 14.3, 5, 1.2, 1.3, 0xff8fab, 'stripe', 'counter');
    return out(b, {
      id: 'market', name: 'Siêu Thị Đèn Vàng', desc: 'Kệ hàng thành mê cung, tủ lạnh và kho nhỏ',
      HW, HD, sky: 0xfff3d6, floor: 0xf1e4c7, floor2: 0xe3d3ae, ground: 'tile', indoor: true,
      spawns: {
        hider: [[-12, -6], [-6, -6], [0, -6], [6, 4], [12, 4], [-12, 6], [-6, 0], [0, 6], [6, -2], [12, -6]],
        seeker: [[20, -13], [20, -11.5], [18.5, -13], [18.5, -11.5], [17, -13], [21, -10], [21, 13], [19, 13], [21, 11.5]],
      },
    });
  }

  /* ------------------------------------------------------------------ 3. Công Viên Vui Chơi */
  function park() {
    const b = Builder(37), HW = 30, HD = 24, R = b.R;
    b.fence(HW, HD, 2.0, 0x6b8e4e);
    const leaf = [0x3fa34d, 0x5ea84a, 0x2f8f6b, 0x7fc04a, 0xf2a65a, 0xd9774f];
    const taken = [];
    const free = (x, z, r) => taken.every(([a, c, q]) => Math.hypot(a - x, c - z) > r + q + 1.6) && Math.abs(x) < HW - 2 && Math.abs(z) < HD - 2;
    const spots = [[0, 0, 7], [-20, -12, 4], [20, 12, 4], [-20, 12, 4], [20, -12, 4], [-26, 0, 3], [26, 0, 3]];
    taken.push(...spots);
    // ao nước ở giữa (thấp, chỉ chắn đường)
    b.cir(0, 0, 4.2, 0.25, 0x4cc9f0, 'pond'); b.cir(0, 0, 4.9, 0.4, 0xd9bf94, 'pondrim');
    // nhà vòm có cột (đông bắc)
    for (const [x, z] of [[-3, -2], [3, -2], [-3, 2], [3, 2]]) b.cir(x + 14, z - 11, 0.35, 2.6, 0xf4f4f4, 'pillar');
    b.box(14, -11, 5, 1.6, 0.55, 0xffd23f, 'stripe', 'bench');
    // khu vui chơi (tây nam): cầu trượt, xích đu, nhà gỗ
    b.box(-20, 12, 4, 3, 2.2, 0xd95d5d, 'plank', 'playhouse'); b.box(-16.6, 12, 1.4, 5.2, 1.2, 0xffd23f, 'stripe', 'slide');
    b.box(-24, 8, 0.4, 3.4, 2.4, 0x4cc9f0, 'solid', 'swing'); b.box(-27, 8, 0.4, 3.4, 2.4, 0x4cc9f0, 'solid', 'swing'); b.box(-25.5, 8, 3.4, 0.3, 2.4, 0x4cc9f0, 'solid', 'swing');
    // nhà vệ sinh (đông nam) có 2 cửa
    b.rect(18, 14, 26, 20, 0.3, 3, 0xe9e9e9, 'brick', { N: [[2.6, 4.2]], S: [[3.6, 5.2]] }); b.wall(22, 14, 22, 20, 0.3, 3, 0xbcdcff, 'solid', [[2.6, 4.2]]);
    // đường rào hoa + bụi + cây rải theo seed
    for (let i = 0; i < 34; i++) {
      const x = (R() * 2 - 1) * (HW - 3), z = (R() * 2 - 1) * (HD - 3), r = 0.6 + R() * 0.5;
      if (!free(x, z, r + 0.3)) continue;
      if (Math.abs(x + 20) < 6 && z > 4) continue; if (x > 16 && z > 12) continue; if (Math.abs(x - 14) < 6 && z < -7) continue;
      taken.push([x, z, r]); b.cir(+x.toFixed(1), +z.toFixed(1), +r.toFixed(2), 3 + R() * 1.2, 0x7a4a2a, 'tree', leaf[Math.floor(R() * leaf.length)]);
    }
    for (let i = 0; i < 20; i++) {
      const x = (R() * 2 - 1) * (HW - 2), z = (R() * 2 - 1) * (HD - 2);
      if (!free(x, z, 0.8)) continue; taken.push([x, z, 0.8]);
      if (i % 2) b.box(+x.toFixed(1), +z.toFixed(1), 3 + R() * 2, 0.9, 1.2, 0x2f8f4a, 'dots', 'hedge'); else b.cir(+x.toFixed(1), +z.toFixed(1), 0.7, 1.2, 0x3fa34d, 'bush');
    }
    for (const [x, z, w, d] of [[-8, 7, 2.2, 0.7], [8, -7, 2.2, 0.7], [7, 8, 0.7, 2.2], [-9, -7.5, 0.7, 2.2]]) b.box(x, z, w, d, 0.5, 0x8a5a33, 'wood', 'bench');
    for (const [x, z, c] of [[-12, 0, 0xc98b4f], [-11.4, 1.3, 0xc98b4f], [12, 2, 0xc98b4f]]) b.box(x, z, 1.2, 1.2, 1.2, c, 'wood', 'crate');
    return out(b, {
      id: 'park', name: 'Công Viên Vui Chơi', desc: 'Cây xanh, ao nước, nhà vòm và khu trò chơi',
      HW, HD, sky: 0xc8ecff, floor: 0x8fc067, floor2: 0x7fb25a, ground: 'grass',
      spawns: {
        hider: [[-6, 8], [6, -8], [-12, -4], [12, 4], [-4, -10], [4, 10], [-16, 2], [16, -2], [0, 14], [0, -14]],
        seeker: [[-28, -21], [-26, -21], [-24, -21], [-28, -19], [-26, -19], [-24, -19], [-22, -21], [-22, -19], [-28, -17]],
      },
    });
  }

  /* ------------------------------------------------------------------ 4. Nhà Kho Cảng */
  function warehouse() {
    const b = Builder(51), HW = 28, HD = 20, R = b.R;
    b.fence(HW, HD, 3.4, 0x6c7a89);
    const cc = [0xd62839, 0x2f6fdb, 0x3fa34d, 0xf77f00, 0xffd23f, 0x7b4fc4, 0x2ec4b6, 0x8d8f99];
    // dãy container (dài 6 x 2.4), xếp thành hành lang có lối thoát
    const rows = [
      [-22, -14, 0], [-14, -14, 0], [-2, -14, 0], [10, -14, 0], [18, -14, 0],
      [-22, -6, 0], [-6, -6, 0], [4, -6, 0], [20, -6, 0],
      [-14, 2, 0], [-2, 2, 0], [12, 2, 0], [22, 2, 0],
      [-22, 10, 0], [-10, 10, 0], [6, 10, 0], [18, 10, 0],
    ];
    rows.forEach(([x, z], i) => { b.box(x, z, 6, 2.4, 2.6, cc[i % cc.length], 'stripe', 'container'); if (i % 3 === 0) b.box(x, z, 6, 2.4, 2.6, cc[(i + 3) % cc.length], 'stripe', 'container'); });
    // container dựng dọc tạo ngõ cụt (thấp để chỗ trống nhìn vẫn nhiều)
    for (const [x, z, c] of [[-26, 0, 0x3fa34d], [0, -17.5, 0xf77f00], [26, -2, 0x2f6fdb], [-4, 17.5, 0xd62839]]) b.box(x, z, 2.4, 6, 2.6, c, 'stripe', 'container');
    // văn phòng quản lý (có 2 cửa)
    b.rect(-6, 13.6, 4, 19.4, 0.3, 3, 0xd9d9d9, 'brick', { N: [[3, 4.6]], E: [[2, 3.6]] }); b.box(-2, 16.6, 2.4, 0.9, 1.0, 0x8a5a33, 'wood', 'desk');
    b.box(2.6, 17.4, 1.0, 2.2, 2.0, 0x555a66, 'solid', 'shelf');
    // pallet + thùng phuy + kệ
    for (let i = 0; i < 14; i++) {
      const x = (R() * 2 - 1) * (HW - 3), z = (R() * 2 - 1) * (HD - 3);
      if (b.boxes.some((o) => Math.abs(o.x - x) < o.w / 2 + 1.8 && Math.abs(o.z - z) < o.d / 2 + 1.8)) continue;
      if (i % 2) b.cir(+x.toFixed(1), +z.toFixed(1), 0.5, 1.1, [0x2a9d8f, 0xd62839, 0xffd23f][i % 3], 'barrel'); else b.box(+x.toFixed(1), +z.toFixed(1), 1.4, 1.4, 1.0 + (i % 3) * 0.5, 0xc98b4f, 'wood', 'crate');
    }
    for (const [x, z] of [[-8, -10], [8, 6], [-18, 6], [16, -10]]) b.box(x, z, 4, 0.9, 2.2, 0xf77f00, 'check', 'shelf');
    return out(b, {
      id: 'warehouse', name: 'Nhà Kho Cảng', desc: 'Container sắc màu, ngõ cụt, văn phòng và thùng phuy',
      HW, HD, sky: 0xaec3d6, floor: 0xb4b8bf, floor2: 0xa5a9b1, ground: 'concrete',
      spawns: {
        hider: [[-18, -10], [-8, -2], [0, 6], [8, -10], [16, 6], [-18, 6], [6, 2], [-12, 14], [14, -2], [24, 14]],
        seeker: [[26, 18], [24, 18], [22, 18], [26, 16], [24, 16], [22, 16], [20, 18], [20, 16], [26, 14]],
      },
    });
  }

  const MAPS = [street(), market(), park(), warehouse()];
  const mapOf = (id) => MAPS.find((m) => m.id === id) || MAPS[0];
  return { MAPS, mapOf };
});
