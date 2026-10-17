wards_wikidata.csv: xã / phường / thị trấn và huyện / quận / thị xã / thành phố thuộc tỉnh CŨ (trước sáp nhập 01/07/2025)
kèm tọa độ tâm, lấy từ Wikidata (https://www.wikidata.org), giấy phép CC0 (không cần ghi nguồn, dùng thương mại được).

Cách tạo (truy vấn query.wikidata.org, ngày 17/10/2026):
- các mục có P31 = xã của Việt Nam (Q2389082), phường của Việt Nam (Q687188), thị trấn của Việt Nam (Q1070942),
  thị trấn nông trường (Q16481437), có tọa độ P625; huyện / quận / thị xã / thành phố thuộc tỉnh lấy theo P131
  (Q2582669, Q6644510, Q2112349, Q3249005), tỉnh = P131 của huyện
- bỏ các xã cách tâm huyện của nó > 30 km (mục Wikidata bị gắn nhầm nơi trùng tên)
Dùng ở App\Support\LegacyWards để đặt điểm bán theo địa chỉ cũ ghi trong danh sách của Sở.
