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
    const b = { boxes: [], circles: [], surfaces: [], buildings: [], y: 0, R: rng(seed) };
    b.box = (x, z, w, d, h, c, tex, k) => { const o = { x, z, w, d, h, c, tex: tex || 'solid', k: k || 'prop' }; if (b.y) o.y = b.y; b.boxes.push(o); };
    b.cir = (x, z, r, h, c, k, c2) => { const o = { x, z, r, h, c, k: k || 'pillar', c2 }; if (b.y) o.y = b.y; b.circles.push(o); };
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
    /** bề mặt đi được: phẳng (y0 = y1) hoặc dốc/cầu thang (dir = hướng đi lên: 'x+','x-','z+','z-') */
    b.surf = (x0, z0, x1, z1, y0, y1, dir, c, tex, k) => { b.surfaces.push({ x0, z0, x1, z1, y0, y1, dir: y0 === y1 ? null : dir, c, tex: tex || 'solid', k: k || (y0 === y1 ? 'floor' : 'stairs') }); };
    /** sàn chữ nhật có lỗ (lỗ cầu thang): tách thành các chữ nhật không chồng nhau */
    b.slab = (x0, z0, x1, z1, y, holes, c, tex, k) => {
      holes = holes || []; const xs = [x0, x1], zs = [z0, z1];
      for (const h of holes) { for (const x of [h[0], h[2]]) if (x > x0 && x < x1) xs.push(x); for (const z of [h[1], h[3]]) if (z > z0 && z < z1) zs.push(z); }
      xs.sort((a, c2) => a - c2); zs.sort((a, c2) => a - c2);
      for (let j = 0; j < zs.length - 1; j++) {
        let runStart = null;
        for (let i = 0; i <= xs.length - 1; i++) {
          const inHole = i < xs.length - 1 && holes.some((h) => (xs[i] + xs[i + 1]) / 2 > h[0] && (xs[i] + xs[i + 1]) / 2 < h[2] && (zs[j] + zs[j + 1]) / 2 > h[1] && (zs[j] + zs[j + 1]) / 2 < h[3]);
          const degenerate = i < xs.length - 1 && xs[i + 1] - xs[i] < 1e-6;
          if (i < xs.length - 1 && !inHole && !degenerate) { if (runStart == null) runStart = xs[i]; }
          if ((i === xs.length - 1 || inHole) && runStart != null) { const endX = xs[i]; b.surf(runStart, zs[j], endX, zs[j + 1], y, y, null, c, tex, k || 'floor'); runStart = null; }
        }
      }
    };
    return b;
  }
  const out = (b, o) => Object.assign({ boxes: b.boxes, circles: b.circles, surfaces: b.surfaces, buildings: b.buildings }, o);

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


  /* ------------------------------------------------------------------ 5. Chung Cư Ú Òa (nhiều tầng) */
  function tower() {
    const b = Builder(71), HW = 32, HD = 24, Hh = 3.4, T = 0.3, WH = 3.1;
    b.fence(HW, HD, 2.6, 0x7b8794);
    const X0 = -16, X1 = 8, Z0 = -14, Z1 = 6, CZ0 = -4.85, CZ1 = -3.15;
    const colEx = [0xf0d9b5, 0xb7d7b0, 0xb6d4ef];                 // màu tường ngoài theo tầng
    const floorC = [0x9aa0a6, 0xd9c8a0, 0xcfd8dc, 0xb9bec4];
    const DOORS = [[0.4, 2.1], [8.3, 10.0], [16.4, 18.1]];       // cửa phòng ↔ hành lang (cùng vị trí 2 phía)
    // ---- cầu thang trong hành lang: mỗi dốc có chiếu nghỉ ở đầu trên và sảnh trống ở đầu dưới
    const RAMPS = [
      [-13.8, CZ0, -9.4, CZ1, 0, 3.4, 'x-'],        // A: tầng trệt → tầng 2 (đầu tây, chiếu nghỉ ở sát tường tây)
      [2.6, CZ0, 7.0, CZ1, 0, 3.4, 'x-'],           // B: tầng trệt → tầng 2 (vào từ cửa phía đông)
      [-5.8, CZ0, -1.4, CZ1, 3.4, 6.8, 'x+'],       // C: tầng 2 → tầng 3
      [1.8, -13.2, 6.2, -11.4, 6.8, 10.2, 'x+'],    // E: tầng 3 → sân thượng (trong phòng đông bắc)
    ];
    for (const r of RAMPS) b.surf(r[0], r[1], r[2], r[3], r[4], r[5], r[6], 0xa58b6a, 'plank', 'stairs');
    // ---- sàn các tầng (có lỗ cho cầu thang)
    const SZ = [X0 - 0.15, Z0 - 0.15, X1 + 0.15, Z1 + 0.15];
    b.slab(SZ[0], SZ[1], SZ[2], SZ[3], 3.4, [[-13.8, CZ0, -9.4, CZ1], [2.6, CZ0, 7.0, CZ1]], floorC[1], 'plank', 'floor');
    b.slab(SZ[0], SZ[1], SZ[2], SZ[3], 6.8, [[-5.8, CZ0, -1.4, CZ1]], floorC[2], 'plank', 'floor');
    b.slab(SZ[0], SZ[1], SZ[2], SZ[3], 10.2, [[1.8, -13.2, 6.2, -11.4]], floorC[3], 'check', 'roof');
    b.y = 6.8; b.box(4, -11.3, 4.4, 0.2, 4.5, 0xa58b6a, 'plank', 'rail'); b.y = 0;          // lan can bên dốc E
    // ---- đồ đạc theo phòng; bỏ món nào chắn cửa / lối lên cầu thang
    const furnT = {
      bedroom: [[1.2, 1.5, 2.0, 2.4, 0.6, 0xf3c6d3, 'solid', 'bed'], [7.1, 2.4, 1.0, 2.4, 2.0, 0x8a5a33, 'wood', 'wardrobe'], [4.4, 0.7, 1.8, 0.8, 0.8, 0xc98b4f, 'wood', 'desk'], [1.0, 6.4, 0.9, 0.9, 0.9, 0xc98b4f, 'wood', 'crate']],
      office: [[2, 3, 1.6, 0.8, 0.8, 0xe6b86a, 'wood', 'desk'], [6, 3, 1.6, 0.8, 0.8, 0xe6b86a, 'wood', 'desk'], [4, 0.45, 3.4, 0.5, 2.0, 0x555a66, 'solid', 'shelf'], [7.3, 6, 0.7, 1.6, 1.5, 0x6a7a8a, 'solid', 'cabinet']],
      living: [[2.5, 2.6, 2.6, 1.0, 0.9, 0x9a6bd1, 'solid', 'sofa'], [2.5, 4.4, 1.4, 0.8, 0.5, 0x8a5a33, 'wood', 'table'], [2.5, 0.4, 2.0, 0.5, 0.7, 0x333344, 'solid', 'tv'], [7.5, 3, 0.5, 3, 2.0, 0x8a5a33, 'wood', 'shelf']],
      kitchen: [[4, 0.4, 6, 0.7, 1.0, 0xf4f4f4, 'solid', 'counter'], [4, 3.8, 2.4, 1.0, 1.0, 0x7bd3ff, 'solid', 'counter'], [7.4, 2, 0.8, 0.8, 1.9, 0xd9d9d9, 'stripe', 'fridge'], [1, 6.8, 1.0, 1.0, 1.1, 0xc98b4f, 'wood', 'crate']],
      storage: [[1.5, 1.5, 1.1, 1.1, 1.1, 0xc98b4f, 'wood', 'crate'], [1.5, 2.8, 1.1, 1.1, 2.2, 0xc98b4f, 'wood', 'crate'], [5.5, 1, 4, 0.6, 2.0, 0x6c7a89, 'stripe', 'shelf'], [5.5, 4, 4, 0.6, 2.0, 0x6c7a89, 'stripe', 'shelf'], [7.2, 7, 1.2, 1.2, 1.1, 0x6ab187, 'dots', 'crate']],
      classroom: [[2, 2.6, 1.3, 0.8, 0.9, 0xe6b86a, 'wood', 'desk'], [4.6, 2.6, 1.3, 0.8, 0.9, 0xe6b86a, 'wood', 'desk'], [2, 5, 1.3, 0.8, 0.9, 0xe6b86a, 'wood', 'desk'], [4.6, 5, 1.3, 0.8, 0.9, 0xe6b86a, 'wood', 'desk'], [6.9, 0.5, 2, 0.5, 1.3, 0x2f5d3a, 'solid', 'blackboard']],
    };
    const rooms = [['NW', X0, Z0, 1], ['NM', -8, Z0, 1], ['NE', 0, Z0, 1], ['SW', X0, -3, -1], ['SM', -8, -3, -1], ['SE', 0, -3, -1]];
    const plan = [
      ['storage', 'kitchen', 'living', 'office', 'living', 'storage'],
      ['bedroom', 'office', 'classroom', 'bedroom', 'living', 'kitchen'],
      ['classroom', 'bedroom', 'office', 'office', 'bedroom', 'living'],
    ];
    const zonesFor = (k) => {
      const Z = [];
      for (const [a, c] of DOORS) { Z.push([X0 + a - 0.3, -7.6, X0 + c + 0.3, -5], [X0 + a - 0.3, -3, X0 + c + 0.3, -0.4]); }
      for (const x of [-8, 0]) { Z.push([x - 2.2, -10.2, x + 2.2, -7.9], [x - 2.2, 0.9, x + 2.2, 3.1]); }
      if (k === 0) Z.push([-13.3, 3.6, -10.9, 6], [-4.9, 3.6, -3.1, 6], [3, 3.6, 5.5, 6], [-5.7, -14, -3, -11.6]);
      else Z.push([-6.8, 3.6, -4.3, 6]);
      if (k === 1) Z.push([5.6, -0.4, 8, 2.4]);
      if (k === 2) Z.push([0.2, -14, 6.8, -10.6]);
      return Z;
    };
    const roomCol = [0xf7e7a8, 0xcfe8ff, 0xd3f0d0, 0xffd6e0, 0xe0d4f7, 0xffe0c2];
    void roomCol;
    for (let k = 0; k < 3; k++) {
      b.y = k * Hh; const c = colEx[k];
      const dS = k === 0 ? [[3, 4.7], [11.6, 13.3], [19.4, 21.1]] : [[9.6, 11.3]];          // cửa/ban công mặt nam
      const dN = k === 0 ? [[10.8, 12.5]] : [];
      const dW = k === 0 ? [[9.15, 10.85]] : [];
      const dE = k === 0 ? [[9.15, 10.85]] : (k === 1 ? [[14, 16]] : []);
      b.rect(X0, Z0, X1, Z1, T, WH, c, k === 0 ? 'brick' : 'solid', { N: dN, S: dS, W: dW, E: dE });
      b.wall(X0, -5, X1, -5, T, WH, 0xe9edf2, 'solid', DOORS); b.wall(X0, -3, X1, -3, T, WH, 0xe9edf2, 'solid', DOORS);
      for (const x of [-8, 0]) { b.wall(x, Z0, x, -5, T, WH, 0xffe9a8, 'solid', [[3.9, 5.9]]); b.wall(x, -3, x, Z1, T, WH, 0xffc9d6, 'solid', [[3.9, 5.9]]); }
      const zs = zonesFor(k);
      rooms.forEach(([name, rx, rz, f], i) => {
        for (const [dx, dz, w, d, h, col, tex, kind] of furnT[plan[k][i]]) {
          const x = rx + dx, z = f === 1 ? rz + dz : rz + 9 - dz;
          if (zs.some((q) => x + w / 2 > q[0] && x - w / 2 < q[2] && z + d / 2 > q[1] && z - d / 2 < q[3])) continue;
          b.box(x, z, w, d, h, col, tex, kind);
        }
      });
    }
    b.y = 0;
    // ---- ban công (tầng 2 và 3) + lan can
    const rail = (x, z, w, d, y) => { const save = b.y; b.y = y; b.box(x, z, w, d, 1.1, 0xb0b8c0, 'plank', 'rail'); b.y = save; };
    b.surf(-7, Z1 + 0.15, -3, 8.0, 3.4, 3.4, null, 0xc9b79c, 'plank', 'floor'); b.surf(-7, Z1 + 0.15, -3, 8.0, 6.8, 6.8, null, 0xc9b79c, 'plank', 'floor');
    for (const y of [3.4, 6.8]) { rail(-5, 8.1, 4.2, 0.2, y); rail(-2.9, 7.1, 0.2, 2.2, y); }
    rail(-7.1, 7.1, 0.2, 2.2, 6.8);
    // ---- lối thoát hiểm ngoài trời: dốc bám tường nam dẫn lên ban công tầng 2
    b.surf(-12.5, 6.25, -7, 8.0, 0, 3.4, 'x+', 0x8a97a5, 'plank', 'stairs');
    b.y = 0; b.box(-9.75, 8.1, 5.5, 0.2, 4.5, 0x8a97a5, 'plank', 'rail');
    // ---- cầu nối từ tầng 2 sang mái nhà phụ
    b.surf(8.15, 0, 14, 2, 3.4, 3.4, null, 0xb9bec4, 'check', 'floor'); rail(11.1, -0.1, 5.9, 0.2, 3.4); rail(11.1, 2.1, 5.9, 0.2, 3.4);
    // ---- sân thượng: lan can, bể nước, máy lạnh
    for (const [x, z, w, d] of [[-4, Z0, 24, 0.3], [-4, Z1, 24, 0.3], [X0, -4, 0.3, 20], [X1, -4, 0.3, 20]]) rail(x, z, w, d, 10.2);
    b.y = 10.2; b.cir(-12, -10, 1.1, 2.4, 0x7a8896, 'tank'); b.cir(-9, -11.4, 0.8, 1.8, 0x7a8896, 'tank'); b.box(-3, -12, 2.2, 1.0, 1.1, 0xd9d9d9, 'stripe', 'ac'); b.box(-6, -8, 1.0, 2.2, 1.1, 0xd9d9d9, 'stripe', 'ac'); b.box(3, 0, 2.0, 1.0, 1.1, 0xd9d9d9, 'stripe', 'ac');
    b.box(-4, 3, 3, 0.8, 1.2, 0xc98b4f, 'wood', 'crate'); b.box(5, 3.5, 1.2, 1.2, 1.2, 0xc98b4f, 'wood', 'crate'); b.y = 0;
    // ---- nhà phụ 1 tầng (mái đi được)
    const AX0 = 14, AX1 = 26, AZ0 = -9, AZ1 = 5;
    b.rect(AX0, AZ0, AX1, AZ1, T, WH, 0xe8b86d, 'brick', { W: [[7.8, 9.8]], S: [[2.8, 4.8], [7.8, 9.8]], N: [[4.8, 6.8]] });
    b.wall(22.5, AZ0, 22.5, AZ1, T, WH, 0xd0c4a8, 'solid', [[3.8, 5.8], [9.8, 11.8]]);
    b.surf(16.6, 2.8, 21.8, 4.6, 0, 3.4, 'x+', 0xa58b6a, 'plank', 'stairs'); b.box(19.2, 2.7, 5.2, 0.2, 4.5, 0xa58b6a, 'plank', 'rail');
    b.slab(AX0 - 0.15, AZ0 - 0.15, AX1 + 0.15, AZ1 + 0.15, 3.4, [[16.6, 2.8, 21.8, 4.6]], 0xb9bec4, 'check', 'roof');
    for (const [x, z, w, d] of [[20, AZ0, 12, 0.3], [20, AZ1, 12, 0.3], [AX1, -2, 0.3, 14]]) rail(x, z, w, d, 3.4);
    rail(AX0, -5.1, 0.3, 7.8, 3.4); rail(AX0, 3.5, 0.3, 3, 3.4);
    for (const [x, z, w, d, h, c, t, k] of [[17, -6, 1.2, 1.2, 1.1, 0xc98b4f, 'wood', 'crate'], [18.4, -6, 1.2, 1.2, 2.2, 0xc98b4f, 'wood', 'crate'], [16, -2.5, 4, 0.7, 2.0, 0x6c7a89, 'stripe', 'shelf'], [19, 0, 4, 0.7, 2.0, 0x6c7a89, 'stripe', 'shelf'], [24, -6, 1.3, 1.3, 1.2, 0x6ab187, 'dots', 'crate'], [24.4, -2, 2.2, 1.0, 1.0, 0xe6b86a, 'wood', 'counter'], [24, 2.5, 1.4, 1.4, 1.1, 0xd62839, 'solid', 'crate']]) b.box(x, z, w, d, h, c, t, k);
    b.y = 3.4; b.box(24, -6, 2, 1.0, 1.1, 0xd9d9d9, 'stripe', 'ac'); b.box(17, 0, 1.2, 1.2, 1.2, 0xc98b4f, 'wood', 'crate'); b.cir(24.5, 2.5, 0.8, 1.8, 0x7a8896, 'tank'); b.y = 0;
    // ---- sân: xe, cây, bụi, ghế, container
    const R = b.R;
    for (const [x, z, c] of [[-26, 12, 0xd62839], [-20, 14, 0x2f6fdb], [2, 12, 0xffd23f], [12, 14, 0xf4f4f4]]) { b.box(x, z, 4.4, 1.9, 1.4, c, 'solid', 'car'); }
    for (const [x, z, c2] of [[-25, -4, 0x3fa34d], [-22, -16, 0x5ea84a], [-12, 14.5, 0x2f8f6b], [10, 18, 0x7fc04a], [30, 10, 0xf2a65a], [-28, 4, 0x7fc04a], [18, 16, 0x5ea84a]]) b.cir(x, z, 0.8, 3.0, 0x7a4a2a, 'tree', c2);
    for (const [x, z, w, d] of [[-19, 2, 4, 0.9], [-19, -8, 0.9, 4], [12, -14, 4, 0.9], [11, 9, 4, 0.9], [27, 12, 0.9, 4], [-4, 14, 3, 0.9], [-8, 18, 5, 0.9], [14, -20, 5, 0.9]]) b.box(x, z, w, d, 1.3, 0x2f8f4a, 'dots', 'hedge');
    for (const [x, z] of [[-3, 11], [6, 10], [-22, -8], [15, 12]]) b.box(x, z, 2.2, 0.7, 0.5, 0x8a5a33, 'wood', 'bench');
    b.box(-6, -19, 6, 2.4, 2.6, 0x3a86ff, 'stripe', 'container'); b.box(0, -19, 6, 2.4, 2.6, 0xf77f00, 'stripe', 'container'); b.box(28, -14, 2.4, 6, 2.6, 0x3fa34d, 'stripe', 'container');
    for (let i = 0; i < 8; i++) b.cir(-30 + i * 3.2 + R(), (i % 2 ? 1 : -1) * 22.4, 0.5, 1.2, 0x3fa34d, 'bush');
    for (const [x, z] of [[-2, 17], [4, 20], [20, 20], [-14, 20]]) b.box(x, z, 1.3, 1.3, 1.2, 0xc98b4f, 'wood', 'crate');
    b.buildings.push({ x0: X0 - 0.3, z0: Z0 - 0.3, x1: X1 + 0.3, z1: Z1 + 0.3 }, { x0: AX0 - 0.3, z0: AZ0 - 0.3, x1: AX1 + 0.3, z1: AZ1 + 0.3 });
    return out(b, {
      id: 'tower', name: 'Chung Cư Ú Òa', desc: 'Tòa nhà 3 tầng + sân thượng: cầu thang, ban công, cầu nối, lối thoát hiểm, gầm cầu thang',
      HW, HD, sky: 0xc6e6ff, floor: 0x93b27c, floor2: 0x86a56f, ground: 'grass', multi: true,
      spawns: {
        hider: [[-24, 0], [-22, 11], [-2, 15], [10, 16], [28, 6], [-26, -12], [10, -17], [-9, -17], [22, 12], [-26, 18]],
        seeker: [[-30.5, 22], [-29, 22], [-27.5, 22], [-30.5, 20.5], [-29, 20.5], [-27.5, 20.5], [-26, 22], [-26, 20.5], [-30.5, 19]],
      },
    });
  }

  const MAPS = [street(), market(), park(), warehouse(), tower()];
  const mapOf = (id) => MAPS.find((m) => m.id === id) || MAPS[0];
  return { MAPS, mapOf };
});
