# Ú òa – Trốn tìm 3D

Game riêng, tách khỏi game súng nước. Dùng lại 100% nhân vật gốc (18 nhân vật, `character.js` chỉ thêm hàm tô màu `setPaint`, không đổi hình dáng).

## Chạy
```
node server.js        # rồi mở http://localhost:3000   (Node 18+, không cần cài thư viện)
node test-sim.js      # chạy bot-vs-bot trên cả 4 bản đồ, kiểm tra lõi luật chơi
node bal.js 12        # thống kê cân bằng (tỉ lệ thắng, số phát bắn…) theo cấp bot
```

## Đã có (bản 0.1 – chơi cùng bot, 1 máy)
- Phòng tối đa 10 nhân vật (người + bot), ô nhập số người đi tìm (1–9, tự tính số người trốn), vai ngẫu nhiên hoặc tự chọn.
- Quy trình 4 pha: phân vai (4 s) → ngụy trang 60 s (hai phe không thấy nhau, không bắn được) → truy tìm 180 s → kết quả + điểm thưởng.
- Camera ngôi thứ ba xoay 360° (giữ chuột phải, hoặc khóa chuột; vuốt trên điện thoại), tránh xuyên tường, zoom bằng cuộn chuột.
- Tô màu ngụy trang: bảng 18 màu + màu tùy chỉnh, chế độ nhanh (cả người) và từng vùng (đầu/thân/tay/chân), hiện thẳng lên mô hình 3D.
- Ná cao su: hồi 2 s, đạn bay cong 3D, chạm tường thì dừng, trúng người trốn là bắt. Ngắm theo tâm màn hình, đạn được bù độ rơi nên mục tiêu đứng yên thì trúng đúng tâm; mục tiêu chạy phải ngắm đón đầu.
- Âm thanh định vị 5 s/lần (mỗi người một cao độ, so le nhau), âm 3D theo hướng camera, nhỏ dần theo khoảng cách, tường làm nhỏ và đục. Không có mũi tên hay chấm chỉ vị trí.
- Chạy nước rút 5 s / hồi 15 s (tiếng bước chân to hơn), cúi thấp (im lặng, khó thấy, đi chậm).
- Bot 3 cấp. Bot chỉ dùng thông tin hợp lệ: nhìn (tầm nhìn phụ thuộc độ lệch màu so với nền, vật che, tầm mắt) và nghe (ước lượng hướng có sai số). Bot trốn chọn chỗ kín, tô màu theo nền, đổi chỗ, bỏ chạy, né đạn (cấp cao).
- 4 bản đồ: Khu Phố Nhỏ, Siêu Thị Đèn Vàng, Công Viên Vui Chơi, Nhà Kho Cảng (có tường, cửa nhiều lối, nhà nhiều phòng, đồ vật nhiều màu).
- Điện thoại: cần ảo, vuốt xoay, nút chạy/cúi/bắn/bảng màu. Có tạm dừng, âm lượng, độ nhạy, 3 mức đồ họa.

## Kiến trúc (để mở rộng)
- `config.js`: mọi con số cân bằng (thời gian, tốc độ, hồi chiêu, tầm nghe…).
- `maps.js`: bản đồ là dữ liệu thuần. Thêm bản đồ = thêm một hàm và đưa vào `MAPS`.
- `sim.js` + `ai.js`: lõi luật chơi và bot, **không phụ thuộc trình duyệt** (chạy được bằng Node) – sẵn để đưa lên server quyết định va chạm/trúng đạn khi làm online.
- `render.js`, `audio.js`, `input.js`, `game.js`: phần chỉ có ở client.

## Chưa làm (nói thẳng)
- **Chơi mạng với bạn bè**: lõi mô phỏng đã tách để server dùng, nhưng chưa có phòng online/đồng bộ. Hiện chỉ chơi 1 người + bot.
- **Bản đồ gấp 10 lần**: mới 4 bản đồ, một tầng (chưa có nhà nhiều tầng/cầu thang, chưa có mái nhà). Mỗi bản đồ ~ 44×32 đến 60×48 m.
- Hoạt ảnh riêng cho ngồi/kéo dây ná/bị bắn: đang dùng hoạt ảnh sẵn của nhân vật (đứng, chạy, buồn, ăn mừng); cúi thấp làm bằng cách ép thấp thân; bị bắn dùng hoạt ảnh “buồn”.
- Tùy chỉnh nhân vật/mở khóa phần thưởng: điểm được cộng và lưu, nhưng chưa có gì để mở khóa.
- Chống gian lận “nhìn xuyên tường” chỉ thật sự có hiệu lực khi có server (server không gửi vị trí phe kia).

## Lưu ý cân bằng
Số liệu bot-vs-bot (8 người, 2 người tìm, 4 bản đồ): người trốn thắng khoảng 80% / 33% / 19% khi bot tìm ở mức Dễ / Trung bình / Khó. Đây chỉ là mốc ban đầu từ bot; cần chơi thử với người thật rồi chỉnh trong `config.js`.
Âm thanh 3D và cảm giác điều khiển chưa được nghe/thử bằng tai và tay trên thiết bị thật (mới kiểm tra bằng trình duyệt tự động: không lỗi JS, vào được cả 3 pha, bắn, bị bắt, màn kết quả).
