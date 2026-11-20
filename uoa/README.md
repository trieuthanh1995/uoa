# Ú òa – Trốn tìm 3D (v0.2)

Game riêng, tách khỏi game súng nước. Dùng lại 100% nhân vật gốc (18 nhân vật, `character.js` chỉ thêm hàm tô màu `setPaint`, không đổi hình dáng).

## Có gì mới ở v0.2
1. **Cọ vẽ tự do (Xưởng tô màu):** vẽ trực tiếp lên mô hình 3D nhân vật. Chọn vùng (đầu, thân trước, thân sau, tay trái/phải, chân trái/phải); cọ cứng / mềm / chấm / tẩy; cỡ cọ, độ mờ, màu tùy chỉnh (hex); hoàn tác – làm lại (Ctrl+Z / Ctrl+Y), xóa nét vùng, về màu gốc, đổ màu vùng / cả người. Nét vẽ bám đúng bề mặt (tính UV + tỉ lệ bề mặt tại điểm chạm), có viền sáng báo vùng đang chỉnh, chỉ tạo texture cho mesh bị đụng tới. Màu trung bình các vùng được tính lại để bot đánh giá độ ngụy trang. Lịch sử nét vẽ lưu dạng dữ liệu gọn (`exportArt`) – sẵn để đồng bộ mạng.
2. **Nằm sấp / bò (phím Z, nút 🛌):** hoạt ảnh nằm úp mặt, ngẩng đầu, bò bằng chu kỳ tay chân. Chỉ đi 40% tốc độ, không chạy nước rút, **không bắn ná khi nằm**, tiếng bước chân rất nhỏ, ping nhỏ hơn, tầm nhìn của bot giảm mạnh, đạn bị vật thấp (từ 0.45 m) chắn. Chui được gầm cầu thang. Đổi tư thế mất 0.45 s; đứng dậy bằng Z / Shift / C.
3. **Bản đồ nhiều tầng “Chung Cư Ú Òa” (64×48 m):** nhà 3 tầng + sân thượng, 6 phòng mỗi tầng có đồ đạc, hành lang, 3 cầu thang trong nhà + 1 lên sân thượng, ban công, lối thoát hiểm ngoài trời, cầu nối sang nhà phụ có mái đi được, gầm cầu thang. Lõi mô phỏng hiểu độ cao: sàn/trần/dốc, trần thấp chặn tư thế, tầm nhìn–tiếng–đạn 3D (sàn chắn), rơi xuống khi bước hụt. Bot đi cầu thang (A* nhiều tầng), nghe/nhìn 3D. Khi bạn vào nhà, các tầng phía trên tự ẩn để nhìn rõ; hành lang hẹp thì camera chuyển sang góc nhìn thứ nhất.

## Chạy
```
node server.js        # rồi mở http://localhost:3000   (Node 18+, không cần cài thư viện)
node test-sim.js      # bot-vs-bot trên cả 5 bản đồ + kiểm thử leo cầu thang, gầm cầu thang, đạn xuyên sàn, tư thế
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
- **Bản đồ gấp 10 lần**: mới 5 bản đồ (1 bản nhiều tầng). Thêm bản đồ = thêm một hàm trong `maps.js` (hộp/trụ có độ cao nền `y`, sàn/cầu thang `surf`, sàn có lỗ `slab`).
- Phụ kiện (mũ, kính…) chưa tô được; cọ vẽ chỉ áp lên các vùng da/lông/áo/quần/giày.
- Hoạt ảnh riêng cho kéo dây ná/bị bắn: đang dùng hoạt ảnh sẵn của nhân vật; “cúi” là ép thấp thân (chưa có tư thế ngồi riêng); nằm sấp là xoay thân + chu kỳ tay chân có sẵn.
- Tùy chỉnh nhân vật/mở khóa phần thưởng: điểm được cộng và lưu, nhưng chưa có gì để mở khóa.
- Chống gian lận “nhìn xuyên tường” chỉ thật sự có hiệu lực khi có server (server không gửi vị trí phe kia).

## Lưu ý cân bằng
Số liệu bot-vs-bot (8 người, 2 người tìm, 4 bản đồ): người trốn thắng khoảng 80% / 33% / 19% khi bot tìm ở mức Dễ / Trung bình / Khó. Đây chỉ là mốc ban đầu từ bot; cần chơi thử với người thật rồi chỉnh trong `config.js`.
Âm thanh 3D và cảm giác điều khiển chưa được nghe/thử bằng tai và tay trên thiết bị thật (mới kiểm tra bằng trình duyệt tự động: không lỗi JS, vào được cả 3 pha, bắn, bị bắt, màn kết quả).
