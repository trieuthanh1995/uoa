/* Ú òa – hằng số dùng chung (trình duyệt + Node). Mọi con số cân bằng đều nằm ở đây để chỉnh sau khi thử nghiệm. */
(function (root, factory) {
  const mod = factory();
  if (typeof module === 'object' && module.exports) module.exports = mod;
  else { root.UO = root.UO || {}; Object.assign(root.UO, mod); }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const GAME_NAME = 'Ú òa';
  const VERSION = '0.1.0';
  const C = {
    STEP: 1 / 60,
    PLAYER_R: 0.42,          // bán kính va chạm (m)
    CHAR_SCALE: 1.3,         // phóng to nhân vật khi hiển thị (giống game gốc)
    H_STAND: 1.85,           // chiều cao thân người đứng (để tính trúng đạn)
    H_CROUCH: 1.1,           // chiều cao khi cúi
    MAX_PLAYERS: 10,
    MIN_PLAYERS: 2,
    // --- thời gian (giây)
    INTRO: 4,                // thông báo vai trò
    PREP: 60,                // ngụy trang
    HUNT: 180,               // truy tìm
    END_DELAY: 2.2,
    // --- di chuyển (m/s)
    HIDER: { walk: 4.0, sprint: 6.2, sprintTime: 5, sprintCd: 15, crouch: 0.45 },
    SEEKER: { walk: 4.7, crouch: 0.5 },
    // --- ná cao su: 1 phát trúng là bắt; hồi 2 giây; đạn có đường cong 3D
    SLING: { cd: 2, speed: 26, gravity: 6.5, r: 0.13, range: 48, life: 3.2, muzzleY: 1.35 },
    // --- âm thanh định vị
    PING: { every: 5, stagger: true, crouchGain: 0.6, range: 45, wallLoss: 0.45, wallLP: 900 },
    FOOT: { walkRange: 7, sprintRange: 18 },   // tiếng bước chân nghe được trong bán kính (m); cúi = im lặng
    // --- điểm thưởng
    POINTS: { seekCatch: 10, seekWin: 20, seekPlay: 5, hideSurvive: 15, hideWin: 20, hidePlay: 5 },
  };
  // cấp độ bot: err = sai số ngắm (rad), react = phản ứng (s), hear = độ nhạy nghe (0..1), eye = hệ số tầm nhìn, plan = chất lượng chọn chỗ trốn
  const LEVELS = {
    easy:   { id: 'easy',   name: 'Dễ',         err: 0.16, react: 1.2, hear: 0.3, eye: 0.65, plan: 0.3, speed: 0.85 },
    normal: { id: 'normal', name: 'Trung bình', err: 0.11, react: 0.95, hear: 0.5, eye: 0.78, plan: 0.65, speed: 0.95 },
    hard:   { id: 'hard',   name: 'Khó',        err: 0.06, react: 0.55, hear: 0.8, eye: 0.95, plan: 1.0, speed: 1.0 },
  };
  // bảng màu ngụy trang (đen, trắng, xám, đỏ, xanh dương, xanh lá, vàng, nâu, cam + màu pha)
  const PALETTE = [
    ['Đen', '#1d1d22'], ['Trắng', '#f4f4f4'], ['Xám', '#8d8f99'], ['Xám đậm', '#53555f'],
    ['Đỏ', '#d62839'], ['Hồng', '#ff8fab'], ['Cam', '#f77f00'], ['Vàng', '#ffd23f'],
    ['Xanh lá', '#3fa34d'], ['Lá non', '#a7d676'], ['Xanh ngọc', '#2ec4b6'], ['Xanh dương', '#2f6fdb'],
    ['Xanh biển', '#7ec8e3'], ['Tím', '#7b4fc4'], ['Nâu', '#7a4a2a'], ['Be', '#d9bf94'],
    ['Gạch', '#a5482f'], ['Xanh rêu', '#5d6b34'],
  ];
  const ZONES = [['head', 'Đầu'], ['body', 'Thân'], ['arms', 'Tay'], ['legs', 'Chân']];
  return { GAME_NAME, VERSION, C, LEVELS, PALETTE, ZONES };
});
