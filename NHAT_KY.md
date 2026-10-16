# Nhật ký dự án Nhà Nông

File này ghi lại các việc đã làm theo từng ngày. Mục mới nhất nằm trên cùng.

- Kế hoạch gốc: `text.html` (yêu cầu) và README (cách chạy).
- Mỗi mục ghi các phần sau:
  - **Đã làm**
  - **Kiểm tra**: đã thử gì, kết quả ra sao
  - **Còn tồn**: lỗi đã biết, việc chưa xong
  - **Tiếp theo**

---

## 16/10/2026 (chiều): Xuất lại file giá, lọc điểm bán theo tỉnh, tổng hợp cho thương lái ✅

### Xuất lại file dữ liệu giá
- `exports/nhanong-gia-20261016-1446.sql.gz` (892 KB): **35.513 giá** (01/10/2021 → 15/10/2026, đều đã duyệt), 44 mặt hàng.
- Đã nạp thử vào DB tạm (`root`) rồi xóa DB tạm: đủ số dòng.

### Lọc điểm bán theo tỉnh (tự điền tỉnh từ tọa độ)
- `PlaceSearch::provinceAt(lat, lng)`: tra ngược qua Photon (`GEOCODER_REVERSE_URL`), lấy kết quả gần nhất có ghi tỉnh.
  - Thành phố trực thuộc TW (Cần Thơ, Hà Nội, TP.HCM…) Photon ghi ở `city`, nên đọc cả `city`.
  - Tra ra thì lưu cache 90 ngày.
  - Không ra thì để trống, không đoán theo tâm tỉnh để tránh điền sai.
- Nhập điểm bán OSM (`shops:import-osm`) tự tra tỉnh khi OSM không ghi.
- Lệnh `php artisan shops:fill-provinces` điền tỉnh cho điểm cũ (giãn 1 giây / lần): **41/42 điểm đã có tỉnh**. Còn 1 điểm (Kubota Thiên Trường) nằm ở vùng OSM chưa có dữ liệu tỉnh.

### Tổng hợp cho thương lái (Sổ giao dịch → tab "Tổng hợp", web + app)
- `GET /transactions/summary?from=&to=`:
  - **lãi gộp** = tiền bán − tiền mua trong khoảng ngày, kèm bảng **theo tháng**
  - **còn nợ 2 chiều tính đến hôm nay** (mình nợ người bán / người mua nợ mình, gồm cả phiếu và đợt cân của đơn)
  - **lời từng lô** (đơn bán đã gộp các đơn mua, dùng `DealSummary::lot`)
- Hàng mua về chưa bán hết thì ghi chú "lãi gộp còn thấp / âm".

### Kiểm tra
- Backend: thêm 2 test điểm bán (tỉnh từ tọa độ, thành phố trực thuộc TW, lệnh điền tỉnh để trống khi không ra) và 1 test tổng hợp (theo tháng, còn nợ tính đến nay, lời lô 10 tr). 159 test pass, Pint sạch.
- Typecheck web + app, lint web sạch. Bấm thử tab Tổng hợp trên Chrome bằng `0900000002`.

---

## 16/10/2026: Admin xem giao dịch người dùng (chỉ xem, có nhật ký) ✅

**Câu hỏi:** `/admin` có quản lý / xem được giao dịch không, nhất là khi khách bật "Lưu cả trên mạng"?
- Trước đây: **không**. Admin chỉ có giá, mặt hàng, điểm bán, tài khoản, gói xem giá…
- Dữ liệu thì có trên server:
  - sổ thu chi đồng bộ ở `ledger_records` (JSON, không mã hóa)
  - đơn mua bán, phiếu, doanh nghiệp

**Bạn đã chọn:**
- Xem **cả 4 loại**: sổ thu chi đồng bộ, đơn mua bán, phiếu + khách, doanh nghiệp.
- **Chỉ xem + thống kê**, không sửa / xóa.
- **Ghi nhật ký mỗi lần xem** và **báo trước** cho người dùng.

### Đã làm
- **Nhóm menu mới "Giao dịch người dùng"** (chỉ xem: không có trang tạo / sửa, không có nút xóa):
  - **Sổ thu chi đồng bộ** (`/admin/ledger-accounts`)
    - mỗi dòng 1 tài khoản: số vườn, số khoản, tổng thu / chi, đồng bộ lần cuối
    - chi tiết: tổng, theo vườn, từng khoản (ngày, vườn, hạng mục, tiền, ghi chú), công nợ còn lại, bán cho lái
    - `App\Support\LedgerReader` đọc JSON, nối tên vườn / hạng mục, bỏ bản ghi đã xóa
  - **Đơn mua bán** (`/admin/deals`)
    - lọc trạng thái / có báo sai / doanh nghiệp
    - chi tiết: 2 bên, số liệu (bỏ mục báo sai), từng mục kèm trạng thái và lý do báo sai
    - nút **Tải PDF** quyết toán
  - **Phiếu mua / bán** (`/admin/purchases`)
    - gồm cả phiếu đã xóa; lọc doanh nghiệp / người lập / sửa sau khi gửi khách
    - chi tiết: dòng hàng, lịch sử sửa, khách được xem
    - nút **Tải PDF**
  - **Doanh nghiệp** (`/admin/businesses`)
    - từng lái (mua / bán tháng này, đã ứng, đang giữ), tiền ứng gần đây
    - nút **Tải báo cáo tháng (PDF)**
- **Nhóm "Hệ thống" → Nhật ký xem dữ liệu** (`/admin/admin-view-logs`, bảng `admin_view_logs`):
  - ghi lúc nào, admin nào, xem / tải, mục nào, của người dùng nào, bản ghi nào
  - **chỉ ghi khi mở trang chi tiết hoặc tải PDF**; danh sách thì không ghi
  - mở lại cùng thứ trong 10 phút chỉ ghi 1 lần (`App\Support\AdminAudit`)
- **Trang chủ admin:** widget "Người dùng ghi chép giao dịch". Chỉ đếm / cộng tổng, không hiện dữ liệu riêng:
  - số người bật lưu trên mạng, khoản đồng bộ 30 ngày
  - đơn đang mở, đơn có mục báo sai
  - phiếu tháng này và tổng tiền
  - doanh nghiệp, lái con
- **Tài khoản:** cột "Lưu trên mạng" và nút "Xem sổ".
- **Báo trước cho người dùng** (`CLOUD_PRIVACY_NOTE` trong shared): "Sổ lưu trên máy chủ Nhà Nông. Quản trị viên có thể xem để hỗ trợ khi bạn cần; mỗi lần xem đều được ghi lại."
  - hiện ở chọn nơi lưu, đăng nhập để lưu trên mạng, và cài đặt sổ (web + app)
- Xếp lại thứ tự nhóm menu admin (Giá theo khu vực lên sau Giá cả).

### Kiểm tra
- `AdminUserDataTest` (4 test):
  - `LedgerReader`: bỏ bản ghi đã xóa (cả 2 kiểu), nối tên, cộng đúng, công nợ còn lại
  - 4 trang chi tiết mở được, hiện đúng ngày / tiền trong từng dòng; ghi đúng 4 dòng nhật ký, mở lại không ghi thêm, sau 10 phút ghi lại
  - không có trang tạo / sửa, không có nút sửa / xóa; tải PDF có ghi nhật ký "tải"
  - người không phải admin bị chặn
- 156 test backend pass, Pint sạch. Shared 101 test pass, typecheck web + app sạch, lint web sạch.
- **Bấm thử trên Chrome** bằng `admin@nhanong.local`: trang chủ có thống kê; mở 4 loại chi tiết; nhật ký có đủ 4 lần xem.
  - **Lỗi tìm ra khi xem ảnh chụp, đã sửa:** cột tiền / ngày trong các bảng hiện "0 đ" / trống. Hàm định dạng của Filament nhận giá trị theo tên tham số phải là `$state`, mình đặt `$v`. Đã thêm test kiểm tra số trong từng dòng.

---

## 16/10/2026: Chủ doanh nghiệp nhận thông báo việc của lái ✅

**Vấn đề:** Lái Tèo (`0900000021`) tạo / xử lý đơn mua bán với Chi nhánh Tân Phú. Chi nhánh nhận thông báo, nhưng chủ (`0900000020`) thì không, vì chủ không đứng trong đơn.

**Đã làm**
- `GET /business/activity?since=` (chỉ chủ; người khác nhận danh sách rỗng để app hỏi chung không lỗi). Mỗi việc mới của các lái gồm:
  - **Đơn chung của lái:**
    - hoạt động mới nhất của đơn, của lái hay của bên kia ("Chi nhánh Tân Phú đồng ý Cọc 30.000.000 đ")
    - đơn vừa tạo chưa có hoạt động: "Lái Tèo tạo đơn "…" (bán cho Chi nhánh Tân Phú)"
  - **Phiếu của lái:** "Lái Tèo lập phiếu PM-000003 mua của …: 27.900.000 đ" / "sửa phiếu …: <đổi gì>" / "đã xóa phiếu …".
- `DealWatcher` hỏi thêm phần này trong cùng vòng 8 giây.
  - Thông báo có `businessDealUuid` (mở mục "Đơn chung" của doanh nghiệp, vì chủ không mở trang đơn của lái) hoặc `businessPurchaseId` (mở phiếu, chế độ chỉ xem).
  - Lần đầu theo dõi từng loại (phiếu được gửi, việc của lái) trên 1 máy chỉ ghi nhận, không báo dồn việc cũ. Có khóa đánh dấu riêng nên lần sau vẫn báo đủ.
- Web: nút "Xem" trên thông báo mở đúng chỗ; tab đang ẩn thì hiện thông báo của trình duyệt.
- App: băng thông báo mở `/business?tab=deals` hoặc màn phiếu.

**Kiểm tra**
- Backend: thêm 1 test (tạo đơn, chi nhánh tham gia, lái sửa phiếu → chủ thấy đúng câu; lái gọi thì rỗng); 152 test pass.
- Shared: thêm 1 test cho bộ theo dõi của chủ; 101 test pass. Typecheck web + app sạch, lint web sạch.
- Bấm thử trên Chrome. Chủ đang mở web:
  - Tèo tạo đơn bán cho Chi nhánh Tân Phú: sau 6,8 giây chủ thấy thông báo.
  - Chi nhánh tham gia rồi đồng ý cọc: sau 7,9 giây chủ thấy "Chi nhánh Tân Phú đồng ý Cọc 30.000.000 đ".
  - Tèo lập phiếu: sau 7,9 giây chủ thấy.
  - Bấm "Xem": phiếu mở trang phiếu (chỉ xem); đơn mở mục Đơn chung.

**Lưu ý**
- Mỗi đơn chỉ báo hoạt động **mới nhất** trong mỗi vòng 8 giây. Ví dụ tham gia đơn rồi đồng ý cọc ngay trong 8 giây thì chỉ báo "đồng ý cọc", giống cách báo cho 2 bên trong đơn.
- Chỉ báo khi web / app đang mở (thông báo đẩy khi app đóng: mục 9 "Việc còn lại").

---

## 16/10/2026: Doanh nghiệp thu mua: chủ + các lái con đi mua giùm ✅

**Yêu cầu:** chủ một doanh nghiệp thu mua vừa và nhỏ, có 3–4 nhóm lái đi thu mua lẻ. Chủ tạo tài khoản chính, phân tài khoản con cho các lái mua giùm, và vẫn thống kê được chi tiết.

**Bạn đã chọn:**
- **Tạo tài khoản con:** cả 2 cách: chủ tạo thẳng (tên, SĐT, mật khẩu ban đầu, nhóm), hoặc gửi mã mời cho người đã có tài khoản.
- **Quyền của lái:** ghi phiếu, chỉ thấy của mình; chủ thấy tất cả.
- **Tiền ứng:** có, đối chiếu tiền từng lái đang giữ.
- **Đơn mua bán chung 2 bên:** gộp cả đơn chung của lái vào doanh nghiệp.

### Backend
- **Migration** `create_businesses_tables`:
  - `businesses`: tên, SĐT, địa chỉ (in trên phiếu), mã mời
  - `business_members`: mỗi tài khoản tối đa 1 doanh nghiệp; vai trò chủ / lái; nhóm; đang dùng / bị khóa; chủ có tạo tài khoản này không
  - `business_advances`: chủ ứng tiền / lái nộp lại
  - `business_id` cho `purchases`, `customers`, `deals`; thêm `deals.business_user_id` (lái đứng trong đơn)
- **Lái con:**
  - Lập phiếu hoặc tạo / tham gia đơn chung thì tự thuộc doanh nghiệp.
  - Sổ khách dùng chung cả doanh nghiệp: 1 nông dân bán cho 2 lái vẫn là 1 khách. Lái chỉ thấy khách của mình và chỉ cộng phiếu của mình.
  - **Số phiếu đánh chung cả doanh nghiệp** (PM-000001, PM-000002… không trùng giữa các lái).
  - Bị khóa thì không lập phiếu / đơn mới (403) và bị đăng xuất.
- **Chủ:**
  - Xem phiếu của lái ở chế độ chỉ xem, có lịch sử sửa. Lái vẫn tự sửa phiếu của mình; mọi lần sửa đều được ghi lại.
  - Tải phiếu, phiếu cân, quyết toán đơn của lái.
  - Đổi nhóm, khóa / mở khóa, đặt lại mật khẩu (chỉ tài khoản chủ đã tạo), gỡ lái. Gỡ thì phiếu / đơn / tiền ứng cũ vẫn ở lại doanh nghiệp.
- **Tiền lái đang giữ** (`App\Businesses\BusinessStats::cash`, tính đến nay) = đã ứng − đã nộp lại − đã trả ra + đã thu vào.
  - Đã trả ra: phiếu mua; trong đơn chung (lái là bên mua): cọc, trả lúc cân, các lần trả.
  - Đã thu vào: phiếu bán; trong đơn chung (lái là bên bán): các khoản tương tự.
  - Bỏ mục bị báo sai và đơn đã hủy.
- **Thống kê:** `BusinessStats::summary` và `TransactionFeed::forBusiness`: từng lái (mua, bán, còn nợ người bán, tiền đang giữ), cả doanh nghiệp, theo mặt hàng; sổ cả doanh nghiệp lọc theo lái.
- **Giấy tờ:**
  - Phiếu do lái lập in **tên doanh nghiệp + "Người lập: Lái Tèo · SĐT"**.
  - **Báo cáo doanh nghiệp** (PDF / Word, trang ngang): theo từng lái (nhóm, số giao dịch, kg, tiền mua, còn nợ, tiền bán, đã ứng, đang giữ), theo mặt hàng, chi tiết có cột lái.
- **API** `/business`:
  - `show`, `store`, `update`
  - `members` (thêm / sửa / gỡ), `invite`, `join`, `leave`
  - `summary`, `transactions?member=`, `deals`, `advances`
  - `/documents/business-report`
- **Mã:** mã mời không trùng mã đơn / mã phiếu.

### Web + app
- **Trang "🏢 Doanh nghiệp"** (web `#/doanh-nghiep`, app `/business`). Lối vào: Tài khoản, Sổ giao dịch.
  - **Chưa có doanh nghiệp:** nhập mã mời (lái), hoặc tạo doanh nghiệp (chủ).
  - **Chủ** có 6 tab:
    - Tổng quan: khoảng ngày; tổng; từng lái (bấm vào ra giao dịch của lái); theo mặt hàng; in báo cáo
    - Lái: tạo tài khoản, mã mời, đổi nhóm, đặt lại mật khẩu, khóa, gỡ
    - Tiền ứng: ghi ứng / nộp lại; thấy ngay lái đó đang giữ bao nhiêu
    - Giao dịch: lọc lái, mua / bán
    - Đơn chung: số liệu, gửi quyết toán
    - Thông tin
  - **Lái:** thẻ "Tiền đang giữ" (đã ứng, đã nộp, đã trả, đã thu), các lần ứng / nộp lại, nút lập phiếu, rời doanh nghiệp.
- **Phiếu:** hiện "🏢 doanh nghiệp · lái lập phiếu"; chủ xem thì ẩn sửa / xóa / chia sẻ / ghi tiền trả.
- Web: tách phần dùng chung của sổ giao dịch ra `pages/trade/parts.tsx` và `useRange.ts`.

### Kiểm tra
- Backend: thêm `BusinessApiTest` (4 test). 151 test pass, Pint sạch.
  - tạo tài khoản lái → lái đăng nhập; SĐT đã có tài khoản thì báo dùng mã mời; mã mời
  - lái lập phiếu: thuộc doanh nghiệp, số phiếu chung, khách chung, lái khác không thấy; chủ xem chỉ xem, sổ cả doanh nghiệp lọc theo lái, phiếu in tên doanh nghiệp + người lập
  - tiền đang giữ: 200 − 90 − 20 − 10 + 5 = 85 tr, sau khi nộp lại 80 tr còn 5 tr; đợt bị báo sai không tính
  - khóa lái thì không lập phiếu / đơn; gỡ lái thì dữ liệu vẫn ở lại
- Shared 100 test pass. Typecheck web + app sạch, lint web sạch. App bundle 1737 module.
- Bấm thử trên Chrome (web):
  1. tạo doanh nghiệp, tạo tài khoản 2 lái kèm nhóm, tạo mã mời
  2. 2 lái đăng nhập, lập phiếu
  3. chủ ứng 200 tr cho Tèo → "Lái Tèo đang giữ 50.000.000 đ" (đã trả 150 tr)
  4. tổng quan từng lái, tải báo cáo PDF (đúng số)
  5. chủ mở phiếu của Tèo: chỉ xem
  6. Tèo thấy tiền đang giữ
- Bản web của app: tổng quan, tab Lái, màn của lái.

### Còn tồn
- Chưa thử trên điện thoại thật.
- ~~Chủ chưa nhận thông báo khi lái lập phiếu~~ → đã làm, xem mục "Chủ doanh nghiệp nhận thông báo việc của lái".
- Lái tự trả tiền riêng khi chưa được ứng thì "đang giữ" bị âm (đã ghi chú trên màn hình).
- Dữ liệu demo: xem bảng tài khoản thử (`0900000020` chủ, `0900000021` / `0900000022` lái).

---

## 16/10/2026: Thông báo cho khách khi phiếu được gửi / sửa / xóa ✅

**Đã làm**
- `GET /received-purchases?since=`: chỉ trả phiếu mới đổi, hoặc mới được gửi cho mình, sau thời điểm đó.
- Mỗi phiếu kèm `activity` (việc mới nhất nhìn từ phía khách):
  - "Lái Tư gửi phiếu PM-000009 cho bạn (74.400.000 đ)": khi người lập bấm "Gửi vào app của khách"
  - "Lái Tư sửa phiếu PM-000009: Đã trả: 0 đ → 40.000.000 đ": kèm tối đa 2 thay đổi của lần sửa mới nhất
  - "Lái Tư đã xóa phiếu PM-000009"
  - Tự nhập mã là việc của mình (`by_me`), nên không báo.
- `DealWatcher` (shared) hỏi thêm phiếu được gửi trong cùng vòng 8 giây với đơn mua bán.
  - Mỗi thông báo có `purchaseId` (phiếu) hoặc `dealUuid` (đơn).
  - Lỗi khi hỏi phiếu thì bỏ qua, không làm hỏng phần đơn.
  - Lần đầu chạy trên máy chỉ ghi nhận, không báo dồn.
- **Web:**
  - Thông báo nổi có nút "Xem" mở đúng phiếu.
  - Tab đang ẩn thì hiện thông báo của trình duyệt (như đơn mua bán).
  - Danh sách "📄 Phiếu được gửi cho bạn" và trang phiếu đang mở tự tải lại.
- **App:** băng thông báo trên cùng mở đúng màn phiếu; tab Đơn và màn phiếu tự tải lại.

**Kiểm tra**
- Backend: thêm 1 test (gửi, `since` không có gì mới, sửa, xóa, tự nhập mã thì không báo); 147 test pass.
- Shared: thêm 1 test cho bộ theo dõi phiếu; 100 test pass. Typecheck web + app sạch, lint web sạch.
- Bấm thử trên Chrome:
  1. Chú Ba đang mở trang Đơn; Lái Tư gửi phiếu vào app Chú Ba. Sau 6,9 giây Chú Ba thấy thông báo, danh sách tự có phiếu mới.
  2. Chú Ba bấm "Xem" trên thông báo: mở đúng phiếu.
  3. Lái Tư ghi tiền trả. Sau 7,5 giây Chú Ba thấy thông báo "sửa phiếu"; trang phiếu tự cập nhật còn nợ và lịch sử.

**Còn tồn**
- Giống đơn mua bán: chỉ báo khi web / app đang mở. App đóng hẳn thì cần thông báo đẩy từ server (cần development build, mục 9 trong "Việc còn lại").

---

## 16/10/2026: Chia sẻ phiếu mua / bán với khách + lịch sử sửa phiếu ✅

**Câu hỏi:** SĐT khách trên phiếu trùng tài khoản đã đăng ký thì khách có thấy phiếu không?
- Trước đây: **không**. Phiếu chỉ người lập xem được; SĐT chỉ để in lên phiếu.

**Bạn đã chọn:**
- Khách **chỉ xem và tải phiếu** (PDF / Word), không xác nhận, không sửa.
- SĐT trùng tài khoản thì **hỏi trước rồi gửi**: trang phiếu hiện tên tài khoản và nút "Gửi vào app của khách", người lập bấm mới gửi.
- Lưu ý thêm của bạn: **khách phải nhận đúng phiếu như lúc được chia sẻ**. Người lập sửa phiếu thì vẫn giữ đủ thông tin cũ và mới, để không "tạo rồi sửa lại" làm sai lệch cho người nhận.

### Đã làm
- **Chia sẻ** (migration `2026_10_16_104346_add_sharing_to_purchases`):
  - `purchases.share_code`: mã 6 ký tự, không trùng mã đơn mua bán, nên nhập chung 1 ô "🔑 Nhập mã đơn / phiếu". Mã đơn thì tham gia đơn, mã phiếu thì nhận phiếu.
  - `purchase_viewers`: ai được xem phiếu, nhận bằng mã hay được gửi vào app (`via`).
  - SĐT khách có dấu cách hay +84 vẫn nhận ra tài khoản (`User::normalizePhone`).
  - API:
    - `POST/DELETE /purchases/{id}/share`: tạo / thu hồi mã
    - `POST /purchases/{id}/send`: gửi vào app khách
    - `POST /received-purchases {code}`: khách nhập mã
    - `GET /received-purchases(/{id})`: khách xem
  - Khách được chia sẻ tải được PDF / Word của phiếu.
- **Lịch sử phiên bản** (migration `2026_10_16_104553_create_purchase_versions_table`):
  - Mỗi lần lưu có đổi nội dung (khách, ngày, dòng hàng, đã trả, ghi chú) là 1 bản mới trong `purchase_versions`, bản cũ không sửa. Lưu lại y nguyên thì không sinh bản mới.
  - `purchases.shared_version`: bản lúc chia sẻ lần đầu. Khách thấy từ bản đó trở đi (các lần sửa nháp trước khi gửi khách không cần thấy).
  - `PurchaseVersion::changes` ghi đổi gì cho dễ đọc, ví dụ:
    - "Sầu riêng Ri6 loại A: cân 1.500 kg → 1.520 kg"
    - "Tổng tiền: 53.460.000 đ → 54.180.000 đ"
    - "Đã trả: 20.000.000 đ → 54.000.000 đ"
  - **Không xóa dấu vết:**
    - Người lập xóa phiếu: khách vẫn thấy phiếu, có ghi "Người lập đã xóa lúc …", vẫn tải được.
    - "Thu hồi mã" chỉ chặn người mới nhập mã; khách đã nhận vẫn giữ phiếu.
  - Phiếu PDF / Word in thêm bảng **"Lịch sử sửa phiếu sau khi gửi khách"** (bản gửi khách, sửa lần 1, 2…). Ghi chú cuối phiếu có "đây là bản thứ N", và "người lập đã xóa" nếu có.
- **Web + app:**
  - Trang phiếu của người lập có thêm:
    - mục "🔗 Chia sẻ phiếu với khách": gửi vào app khách khi SĐT trùng; tạo mã; gửi mã qua Zalo; thu hồi mã; danh sách ai đang xem
    - mục "🕘 Lịch sử sửa phiếu"
  - Form sửa phiếu đã gửi báo trước: "lần sửa này được lưu thành bản mới, khách thấy cả bản cũ và bản mới".
  - Trang Đơn có mục **"📄 Phiếu được gửi cho bạn"**, nhãn "Đã sửa sau khi gửi" / "Người lập đã xóa".
  - Trang xem phiếu được gửi (web `#/giao-dich/nhan/:id`, app `/trade/received/[id]`):
    - ghi đúng chiều phía khách ("mình bán cho Lái Tư")
    - dòng hàng, đã trả, còn nợ
    - tải / gửi PDF / Word
    - lịch sử sửa
  - Bảng hàng trên web điện thoại: chữ nhỏ hơn cho đủ 6 cột.

### Kiểm tra
- Backend: thêm 3 test (chia sẻ bằng mã, gửi vào app khi SĐT trùng, lịch sử sửa / xóa sau khi chia sẻ); 146 test pass, Pint sạch.
- Shared 99 test pass. Typecheck web + app sạch, lint web sạch. App bundle 1735 module.
- Bấm thử trên Chrome với 3 tài khoản:
  1. Lái Tư lập phiếu cho Chú Ba (SĐT `0900 000 001`): hiện "tài khoản Nhà Nông của Chú Ba", gửi vào app, tạo mã.
  2. Lái Tư sửa số kg rồi ghi thêm tiền trả: lịch sử ghi đúng 2 lần sửa.
  3. Chú Ba: thấy phiếu trong trang Đơn kèm nhãn "Đã sửa sau khi gửi"; mở ra thấy bản gửi và 2 lần sửa, ghi "mình bán cho Lái Tư".
  4. Chi nhánh nhập mã phiếu ở ô "Nhập mã đơn / phiếu": mở đúng phiếu.
  5. Lái Tư xóa phiếu: Chú Ba vẫn xem được, có ghi đã xóa; PDF có bảng lịch sử sửa.
- Bản web của app: tab Đơn có phiếu được gửi, trang phiếu được gửi, mục chia sẻ trên trang phiếu.

### Còn tồn
- Chưa thử trên điện thoại thật.
- ~~Khách chưa nhận thông báo khi phiếu được gửi hoặc bị sửa~~ → đã làm, xem mục "Thông báo cho khách khi phiếu được gửi / sửa / xóa".
- Dữ liệu thử: phiếu PM-000007, PM-000008 của Lái Tư gửi Chú Ba ("Thử chia sẻ (Claude)", đã xóa), chi nhánh `0900000003` đã nhận PM-000008.

---

## 16/10/2026: Sổ giao dịch cho điểm thu mua / thương lái, in phiếu PDF / Word ✅

**Yêu cầu:** điểm thu mua hoặc cá nhân chuyên thu mua cần quản lý tất cả giao dịch, và in giao dịch ra PDF hoặc Word để gửi khách.

**Bạn đã chọn:**
- Làm cả 2 loại giao dịch:
  - **phiếu mua / bán** ghi nhanh cho khách vãng lai, không cần khách có tài khoản
  - **gộp chung với các đợt cân của đơn mua bán 2 bên**
- In 3 loại giấy:
  - phiếu cân / biên nhận
  - bảng kê / quyết toán khách
  - báo cáo tổng hợp
- Định dạng: PDF và Word.

### Backend
- **Thư viện mới:** `barryvdh/laravel-dompdf` (PDF, font DejaVu Sans có đủ dấu tiếng Việt, chỉ nhúng chữ có dùng nên file khoảng 35 KB) và `phpoffice/phpword` (Word).
- **Migration** `2026_10_16_095903_create_customers_table`:
  - `customers`: khách quen của từng người dùng (tên, SĐT, địa chỉ, ghi chú)
  - `purchases`: phiếu mua (`PM-000001`) / phiếu bán (`PB-000001`), đánh số riêng theo người dùng
    - dòng hàng: cân (kg), trừ bì / tạp chất, kg tịnh, đơn giá theo kg tịnh, thành tiền
    - đã trả, còn nợ
    - chép tên / SĐT khách lúc lập phiếu, nên sửa khách sau này không đổi phiếu đã in
- **Gõ tên khách mới khi lập phiếu thì tự lưu vào sổ khách.** Trùng SĐT (hoặc trùng tên khi không có SĐT) thì dùng lại khách cũ.
- **`App\Transactions\TransactionFeed`:** gộp phiếu với các đợt cân của đơn mua bán thành 1 danh sách cùng dạng.
  - Mình là bên mua thì giao dịch là "mua vào", bên bán thì là "bán ra".
  - Trừ cọc tính là đã trả.
  - Bỏ đợt cân bị báo sai và đơn đã hủy. Đợt cân chờ xác nhận vẫn tính, có ghi chú "chờ".
- **Giấy tờ** (`App\Documents`): `TransactionDocuments` lập nội dung 1 lần, rồi `PdfRenderer` / `DocxRenderer` cùng vẽ, nên PDF và Word giống nhau.
  - Phiếu mua / bán: có dòng "Bằng chữ" (`App\Support\VietnameseNumber`, đọc đúng "mốt", "tư", "lăm", "linh", "không trăm") và chỗ ký 2 bên.
  - Phiếu cân 1 đợt của đơn mua bán.
  - Bảng quyết toán đơn: mọi đợt cân, cọc, tiền đã trả, còn lại.
  - Bảng kê 1 khách trong khoảng ngày.
  - Báo cáo tổng hợp (trang ngang): mua vào / bán ra theo mặt hàng (giá bình quân), theo khách, chi tiết từng giao dịch.
  - Bên lập phiếu lấy từ hồ sơ điểm mua (tên, SĐT, địa chỉ); chưa có hồ sơ thì lấy tên và SĐT tài khoản.
- **API (cần đăng nhập):**
  - `GET/POST/PATCH/DELETE /customers`
  - `POST/GET/PATCH/DELETE /purchases`
  - `GET /transactions?from=&to=&kind=&q=&customer=`
  - `GET /documents/{purchases|deal-entries|deals|customers}/{uuid}?format=pdf|docx`, `GET /documents/report?from=&to=`. Mỗi lần xem / in tối đa 400 ngày.
- **Sửa lỗi giới hạn tần suất:**
  - `throttle:30,1` lồng trong nhóm `throttle:120,1` dùng chung bộ đếm theo người dùng, nên chỉ việc app hỏi đơn mới mỗi 8 giây cũng làm hết lượt (bị 429).
  - Đổi sang giới hạn có tên, bộ đếm riêng (`AppServiceProvider`): `documents`, `places`, `deal-join` (nhập mã tham gia đơn), `buyer-prices` (đăng giá).

### Web + app
- **Màn "📒 Sổ giao dịch"** (web `#/giao-dich`, app `/trade`): 3 tab.
  - **Giao dịch:** lọc theo khoảng ngày, mua / bán, tìm tên khách / số phiếu / mặt hàng. Có tổng mua vào, bán ra, còn nợ 2 chiều. Bấm 1 giao dịch: phiếu thì mở phiếu, đợt cân thì mở đơn.
  - **Khách hàng:** còn nợ 2 chiều, thêm / sửa khách.
  - **Báo cáo:** theo mặt hàng, nút in báo cáo.
- **Lập / sửa phiếu:**
  - gõ tên thì gợi ý khách cũ
  - chọn mặt hàng từ danh mục, hoặc tự gõ tên hàng
  - cân, trừ bì, đơn giá; thấy ngay kg tịnh và thành tiền
  - nút "Trả đủ" / "Chưa trả"
- **Trang phiếu:** ghi thêm tiền trả, in / gửi.
- **Trang khách:** các phiếu trong khoảng ngày, in bảng kê.
- **Đơn mua bán:** mỗi đợt cân có nút "In / Gửi phiếu cân đợt này"; cuối đơn có nút bảng quyết toán.
- **Lối vào:** trang Đơn và trang Điểm mua.
- **Cách tải file:**
  - Web: tải file; điện thoại có chia sẻ file thì thêm nút "📤 Gửi PDF".
  - App: tạo file trong bộ nhớ đệm, rồi mở bảng chia sẻ của máy (Zalo, Messenger, lưu Tệp, in) bằng `expo-file-system` + `expo-sharing` có sẵn.
- **Shared** (`packages/shared/src/trade.ts`): kiểu dữ liệu, `purchaseTotals` (tính giống backend để xem trước), `formatKg` (tự định dạng, không dùng `toLocaleString` vì Hermes), `parseKgText`, `documentPath`, `api.downloadDocument`.

### Kiểm tra
- Backend: thêm `TransactionApiTest` (6 test) và `VietnameseNumberTest`; 143 test pass, Pint sạch.
  - Test bắt được 3 lỗi đã sửa: sửa phiếu bắt nhập lại tên khách; gộp danh sách bị lỗi; lọc "đến ngày" bỏ sót phiếu cùng ngày khi cột ngày lưu kèm giờ (SQLite).
- Shared: 99 test pass. Typecheck web + app sạch, lint web sạch.
- Mở PDF tạo ra: phiếu mua, quyết toán đơn, bảng kê, báo cáo đều đủ dấu, cộng đúng (1.238 kg × 93.000 = 115.134.000 đ).
- File Word:
  - đã kiểm tra XML: bảng độ rộng cố định, số nguyên
  - ban đầu độ rộng là số lẻ / phần trăm nên nhiều trình xem bỏ qua, đã sửa
  - máy này không có Word / LibreOffice để mở thử; bản xem trước Quick Look của macOS vẫn tự co bảng
- Bấm thử trên Chrome (web):
  - lập phiếu 2 loại hàng có trừ bì, trả 1 phần
  - xem phiếu, tải PDF + Word
  - tab khách, bảng kê khách, báo cáo Word
  - đơn mua bán: in phiếu cân + quyết toán
  - sửa lỗi form tràn ngang trên màn hẹp
- App: bundle Android đủ 1734 module. Bản web của app mở được sổ giao dịch, khách, form lập phiếu, trang phiếu có nút "Gửi PDF / Gửi Word".

### Còn tồn
- Chưa thử nút "Gửi PDF / Word" trên điện thoại thật (bảng chia sẻ → Zalo).
- Chưa mở thử file Word bằng Microsoft Word / WPS thật.
- Dữ liệu thử trên máy dev: tài khoản `0900000002` (Lái Tư) có vài phiếu PM-000001…000006 (khách Chú Năm Lộc, Cô Sáu Mận), và 1 đơn thử "Thử in phiếu (Claude)" đã hủy.

---

## 16/10/2026: Giá quanh tôi: tìm xã / phường để lấy đúng vị trí, gợi ý mặt hàng ở xa hơn ✅

**Vấn đề:** người dùng `0900000101` chọn tỉnh Đắk Lắk, gõ "buôn hồ" vào ô tên chỗ ở, bán kính 10 km. Kết quả "Giá quanh tôi" chỉ có cà phê, hồ tiêu. Có 2 nguyên nhân:
1. Tên tự gõ không đổi chỗ tìm. Không bật GPS thì vẫn tìm quanh **trung tâm tỉnh** (Buôn Ma Thuột, cách Buôn Hồ khoảng 40 km), nhưng thanh vị trí lại ghi "buôn hồ, Đắk Lắk".
2. Sầu riêng, chanh dây có giá ở cách 12–23 km, ngoài bán kính 10 km, nên bị ẩn mà không báo gì.

**Đã làm**
- **Tìm địa danh** `GET /api/v1/places?q=&province=` (`App\Support\PlaceSearch`):
  - gọi Photon (dữ liệu OpenStreetMap, miễn phí, không cần khóa); đã có tên xã / phường mới sau sáp nhập 2025, và tên huyện / thị xã cũ (ghi "(cũ)")
  - chỉ nhận địa danh hành chính và khu dân cư, bỏ cửa hàng, sông hồ, đường; tỉnh đang chọn xếp trước
  - cache 30 ngày; giới hạn 30 lần/phút; dịch vụ lỗi thì trả 503 kèm lời nhắn
  - đổi dịch vụ: biến `GEOCODER_URL` (`config/nhanong.php`)
  - máy dev này chặn `nominatim.openstreetmap.org` (trỏ về 127.0.0.1) nên dùng Photon
- **Ô chọn khu vực** (web + app):
  - mục "Chỗ ở": gõ xã / phường / thôn → Tìm → chọn trong danh sách thì lấy tọa độ địa danh đó; hoặc "dùng vị trí của máy" (GPS)
  - chưa chọn chỗ ở thì báo rõ "đang tìm quanh trung tâm tỉnh …"
  - bỏ ô tên tự gõ khi không có tọa độ (chỉ còn khi dùng GPS, để đặt tên cho vị trí)
- `describeLocation`: không có tọa độ thật thì luôn ghi "Trung tâm <tỉnh>", kể cả khi tài khoản cũ còn lưu tên tự gõ.
- **Gợi ý xa hơn:**
  - `GET /local-prices` trả thêm `meta.farther`: các mặt hàng chỉ có giá ngoài bán kính (tìm tới 100 km), kèm điểm mua gần nhất cách bao xa và số điểm mua
  - web + app hiện "Xa hơn 10 km còn có giá: …" và nút "Mở rộng ra 20 km" (bán kính nhỏ nhất đủ tới điểm gần nhất)

**Kiểm tra**
- Thêm 3 test backend (gợi ý xa hơn, tìm địa danh + cache, dịch vụ lỗi): 128 test pass, Pint sạch.
- Thêm test shared (`radiusToReach`, `placeLabel`, `describeLocation`): 94 test pass.
- Typecheck web và mobile sạch, lint sạch ở các file đã sửa.
- Bấm thử trên Chrome đúng tình huống của người dùng:
  - thanh vị trí ghi "Trung tâm Đắk Lắk · 10 km"
  - có gợi ý sầu riêng, chanh dây ở xa hơn; bấm "Mở rộng ra 20 km" thì sầu riêng vào danh sách
  - tìm "Buôn Hồ" ra Phường Buôn Hồ và Thị xã Buôn Hồ (cũ); chọn Phường Buôn Hồ thì lưu đúng tọa độ (12,8961, 108,2454)

**Còn tồn**
- Photon là dịch vụ miễn phí dùng chung. Khi chạy thật nhiều người dùng, nên tự chạy Photon, hoặc dùng dịch vụ trả phí, rồi đổi `GEOCODER_URL`.
- Chưa thử ô tìm địa danh trên điện thoại thật.

---

## 16/10/2026: Thêm mặt hàng chanh dây (chanh leo) ✅

**Tìm nguồn giá:** không có nguồn nào đăng giá chanh dây đều đặn để lấy tự động.
- agro.gov.vn (CSDL giá của Bộ): không có chanh dây trong 230 mặt hàng.
- Sở Công Thương Đắk Lắk: bảng giá nông sản chỉ có cà phê, hồ tiêu.
- banggianongsan.com, nhabeagri.com: có sầu riêng, bơ, điều… nhưng không có chanh dây.
- Báo Gia Lai, Nông nghiệp & Môi trường, Tuổi Trẻ: chỉ có bài lẻ khi giá biến động, vài tháng 1 bài.
  - Ví dụ Báo Gia Lai 06/03/2026: chanh múc 23–27 nghìn/kg, loại xuất khẩu 32–40 nghìn/kg.
- Các trang "giá chanh dây hôm nay" (canhdieuviet, kingfoodmart, dongnaitv…): nội dung cũ, số liệu lệch nhau, không dùng.

**Cách lấy giá đã chọn:** điểm mua đăng giá theo khu vực (vựa, thương lái, nhà máy ở Gia Lai, Đắk Lắk), cộng với admin nhập tay giá tham khảo vào /admin → Giá. Không có dữ liệu cũ 5 năm.

**Đã làm**
- `CatalogSeeder`:
  - danh mục mới `chanh-day` "Chanh dây (chanh leo)", loại Nông sản
  - 3 mặt hàng (đ/kg):
    - `chanh-day-xuat-khau`: loại xuất khẩu (loại 1)
    - `chanh-day-loai-2`: loại 2
    - `chanh-day-muc`: múc / xô
  - khu vực mới `son-la` (Sơn La)
- Điểm mua loại "thu mua nông sản" đăng được giá chanh dây ngay (đăng giá lọc theo loại danh mục, không cần sửa code).
- `LocalPriceDemoSeeder`:
  - thêm 2 điểm mua ở Gia Lai: Vựa chanh dây Ba Tâm `0900000109` và Nhà máy chế biến nông sản Ia Grai `0900000110`
  - Thương lái Tư Hùng (Đắk Lắk) đăng thêm giá chanh dây
  - mật khẩu demo như các điểm mua khác

**Kiểm tra**
- `GET /categories` có danh mục chanh dây với 3 mặt hàng.
- `GET /local-prices` quanh Chư Păh (Gia Lai) trả 2 điểm mua: 33.000–34.000 đ/kg loại xuất khẩu.
- Toàn bộ 125 test backend pass, Pint sạch.

**Còn tồn**
- Bảng giá chính (trang chủ) chỉ hiện chanh dây khi admin đã nhập giá tham khảo, hoặc khi có nguồn crawl.
- Máy khác: chạy `php artisan db:seed --class=CatalogSeeder`, rồi `php artisan db:seed --class=LocalPriceDemoSeeder` nếu muốn dữ liệu demo.

---

## 15/10/2026 (tối): Giá theo khu vực do điểm mua đóng góp + "Khu vực của tôi" ✅

**Yêu cầu:** giá crawl là giá chung, nhưng thực tế mỗi khu vực mua bán một giá khác. Cần:
- cho điểm mua (doanh nghiệp, đại lý, thương lái, điểm bán lẻ) đăng giá từng mặt hàng theo khu vực và ngày
- người dùng chọn khu vực của mình để được gợi ý giá và dịch vụ quanh đó

**Bạn đã chọn:**
- Chỉ **điểm mua admin đã duyệt** mới đăng giá được.
- Giá **hiện ngay**; giá lệch nhiều thì **chờ duyệt**.
- Khu vực = **tỉnh + chấm vị trí**, gợi ý theo bán kính.

### Bước A: Backend ✅
**Đã làm**
- Migration `2026_10_15_210000_create_buyers_and_price_reports`:
  - `buyers`: hồ sơ điểm mua (1 tài khoản 1 hồ sơ)
    - loại: Doanh nghiệp / Đại lý / Thương lái / Điểm bán lẻ
    - mua/bán gì: thu mua nông sản / bán phân / bán thuốc
    - SĐT, địa chỉ, tỉnh, tọa độ
    - trạng thái: chờ duyệt / đã duyệt / không duyệt / tạm khóa; có dấu xác minh ✓
  - `price_reports`: giá 1 điểm mua đăng cho 1 mặt hàng trong 1 ngày (khóa duy nhất, đăng lại trong ngày thì sửa). Lưu kèm vị trí, giá tham chiếu, lý do chờ duyệt, số lượt báo sai.
  - `price_report_flags`: báo giá sai, mỗi máy 1 lần cho 1 giá.
  - `users.home_*`: khu vực của tôi (tỉnh, tọa độ, tên chỗ ở, bán kính).
- **Quy tắc:**
  - Hồ sơ mới thì chờ duyệt. Hồ sơ bị từ chối mà gửi lại thì chờ duyệt lại. Hồ sơ đã duyệt sửa thông tin thì vẫn giữ duyệt.
  - Admin duyệt thì tự tạo một **điểm bán** (`source = buyer`) để hiện trong Điểm bán / Dịch vụ quanh đây. Tạm khóa hoặc từ chối thì ẩn điểm bán đó.
  - Đăng giá phải đúng nhóm hàng đã chọn trong hồ sơ: nông sản cần "thu mua", phân bón cần "bán phân", thuốc cần "bán thuốc".
  - Đăng bổ sung được tối đa 7 ngày trước; không đăng cho ngày tương lai.
  - **Giá tham chiếu:** giá giữa của các điểm mua khác trong 50 km / 14 ngày (cần ít nhất 2 giá). Không đủ thì lấy giá chung crawl mới nhất của tỉnh (14 ngày). **Lệch hơn 30% thì chờ duyệt**, có ghi lý do, ví dụ "Lệch 61% so với giá chung đắk lắk (93.000 đ)".
  - Đủ 3 máy khác nhau báo sai thì giá chuyển sang chờ duyệt.
- **API** (`/api/v1`):
  - `GET local-prices?lat&lng&radius&days&type&product`: không cần đăng nhập.
    - Gom theo mặt hàng: số điểm mua, thấp nhất, cao nhất, giá giữa, giá chung của tỉnh để so, danh sách điểm mua (khoảng cách, SĐT).
    - Mỗi điểm mua chỉ lấy giá mới nhất. Nông sản xếp điểm trả giá cao trước; phân / thuốc xếp điểm bán rẻ trước.
  - `POST local-prices/{id}/flag`: báo giá sai (cần header `X-Device-Id`).
  - `PUT me/location`: lưu khu vực của tôi; không gửi tọa độ thì lấy trung tâm tỉnh. `GET user` có thêm `location`, `buyer_status`.
  - `GET/PUT me/buyer`, `GET/POST me/buyer/prices`, `DELETE me/buyer/prices/{id}`.
- `App\Support\Geo`: tọa độ trung tâm 34 tỉnh, tính khoảng cách, lọc theo bán kính. `ShopController` dùng chung hàm này.
- Trang `/admin`, nhóm menu mới **"Giá theo khu vực"**:
  - "Điểm mua đăng giá": duyệt, xác minh ✓, không duyệt / tạm khóa kèm lý do
  - "Giá điểm mua đăng": danh sách chờ duyệt có lý do, giá tham chiếu, số lần báo sai; cho hiện / gỡ, chọn nhiều để duyệt hàng loạt
- Thêm factory `BuyerFactory` (có state `approved`) và `PriceReportFactory`.

**Kiểm tra:** 125 test backend qua (thêm 10 test):
- phải được duyệt mới đăng giá, duyệt thì tạo điểm bán
- sai nhóm hàng thì bị chặn
- đăng lại trong ngày thì sửa giá; giới hạn ngày đăng bổ sung
- lệch 61% so với giá chung thì chờ duyệt
- ưu tiên giá giữa của điểm mua gần đó làm tham chiếu
- gom theo bán kính, loại điểm xa / chưa duyệt / giá chờ duyệt
- phân bón xếp rẻ trước, lọc theo nhóm
- 3 máy báo sai thì chờ duyệt (cùng máy báo 2 lần chỉ tính 1)
- khu vực của tôi lấy trung tâm tỉnh khi không có GPS
- gửi lại hồ sơ bị từ chối; không xóa được giá của người khác

**Lỗi tìm thấy nhờ test, đã sửa:**
- Controller dùng `$request->user()->buyer` thì có thể nhận kết quả "chưa có hồ sơ" đã nạp sẵn. Đã đổi sang truy vấn thẳng (`myBuyer`).
- Cột `prices.date` là chuỗi, gọi `toDateString()` bị lỗi 500. Đã đọc lại bằng `CarbonImmutable::parse`.

### Bước B: Phần dùng chung (`packages/shared/src/local.ts`) ✅
- Kiểu dữ liệu: `BuyerProfile`, `BuyerReport`, `LocalPriceProduct` / `LocalPriceEntry`, `MyLocation`; các nhãn `BUYER_KIND_LABELS`, `BUYER_STATUS_LABELS`; `RADIUS_OPTIONS` (10 / 20 / 30 / 50 km).
- `PROVINCE_CENTERS` (giống backend), `provinceLocation` (khu vực = trung tâm tỉnh), `nearestProvince` (đoán tỉnh từ GPS), `describeLocation`.
- `compareToReference`: so với giá chung. Nông sản giá cao hơn thì tốt cho người bán; phân / thuốc giá thấp hơn thì tốt cho người mua.
- API client: `localPrices`, `flagLocalPrice`, `saveMyLocation`, `myBuyer`, `saveBuyer`, `myBuyerPrices`, `postBuyerPrice`, `deleteBuyerPrice`. `AccountUser` có thêm `location`, `buyer_status`.
- **Kiểm tra:** 92 test shared qua (thêm 3 test); typecheck shared, web, mobile sạch.

### Bước C: Giao diện web ✅
**Đã làm**
- **Khu vực của tôi** (`web/src/myLocation.ts`, `components/LocationPicker.tsx`):
  - chọn tỉnh; "📍 Dùng vị trí của tôi" (GPS, tự đoán tỉnh); tên chỗ ở; bán kính 10 / 20 / 30 / 50 km
  - lưu trên trình duyệt; đã đăng nhập thì lưu cả vào tài khoản; máy mới đăng nhập thì tự lấy khu vực đã lưu ở tài khoản
  - Lưu ý: trình duyệt chỉ cho lấy GPS khi trang mở bằng https hoặc localhost. Mở qua http://192.168.1.10 thì báo rõ và dùng trung tâm tỉnh.
- **`#/gia-quanh-toi`**:
  - khu vực của tôi ở trên cùng; tab Nông sản / Phân bón / Thuốc BVTV
  - mỗi mặt hàng: **giá giữa**, thấp nhất – cao nhất, số điểm mua, **so với giá chung của tỉnh** (xanh là có lợi cho mình)
  - danh sách điểm mua: ✓ đã xác minh, loại, khoảng cách, ngày; nút 📞 Gọi và "Báo giá sai"
  - "🏪 Dịch vụ quanh đây": điểm thu mua / bán phân / bán thuốc trong bán kính
- **Bảng giá**: dải "📍 Giá quanh tôi" trên cùng. **Trang mặt hàng**: mục "Giá các điểm mua quanh bạn".
- **`#/diem-mua`** (vào từ Tài khoản hoặc cuối trang Giá quanh tôi):
  - chưa đăng nhập thì mời đăng nhập
  - đăng ký hồ sơ: tên, loại, mua/bán gì, SĐT, địa chỉ, tỉnh, vị trí
  - xem trạng thái chờ duyệt / lý do không duyệt; sửa và gửi lại
  - đã duyệt: form **Đăng giá** (chỉ hiện mặt hàng đúng nhóm, ngày trong 7 ngày); **"Đăng lại cho hôm nay"** bấm "Giữ giá …" 1 lần; danh sách giá đã đăng 30 ngày kèm trạng thái / lý do chờ duyệt, nút xóa
- Trang Tài khoản có link "🏪 Đăng giá của điểm mua" và "📍 Khu vực của tôi".

### Bước E (một phần): Dữ liệu demo `LocalPriceDemoSeeder` ✅
- Chạy: `php artisan db:seed --class=LocalPriceDemoSeeder` (chỉ chạy được khi APP_ENV=local; chạy lại thì cập nhật, không tạo trùng).
- 7 điểm mua đã duyệt:
  - quanh **Buôn Ma Thuột**: Công ty Cà phê Tây Nguyên Xanh ✓, Đại lý Hai Lúa ✓, Thương lái Tư Hùng, Cửa hàng vật tư Ba Thành, Vựa sầu riêng Bảy Lợi ✓
  - quanh **Cần Thơ**: Nhà máy xay xát Mười Hạnh ✓, Đại lý vật tư Sáu Phước
  - mỗi điểm có giá 3 ngày gần đây
- Thêm 1 điểm chờ duyệt (Đại lý Năm Tèo) và 1 giá chờ duyệt (tiêu 210.000 đ) để thử trang admin.
- Tài khoản demo: 0900000101 → 0900000108, mật khẩu `nhanong-demo` (chỉ máy dev).

**Kiểm tra web** (Chrome headless)
- Chọn Đắk Lắk 20 km:
  - cà phê có 3 điểm, giá giữa 93.000 đ
  - tiêu 140.500 đ, cao hơn giá chung 1%
  - phân bón xếp rẻ trước (Hai Lúa 545.000 đ, Ba Thành 560.000 đ)
  - dịch vụ quanh đây có các điểm mua vừa duyệt
- Trang mặt hàng cà phê có mục giá quanh bạn.
- Đăng nhập Hai Lúa (0900000102) → thấy "✅ Đã duyệt" → đăng cà phê 93.800 đ → "Đã đăng giá".
- Typecheck, lint sạch. Backend 125 test vẫn qua.

**Lỗi tìm thấy khi bấm thử, đã sửa:** "Đăng lại cho hôm nay" hiện cả mặt hàng đã đăng hôm nay và kèm **giá cũ nhất**. Nguyên nhân: `new Map(...)` giữ bản cuối, mà danh sách xếp mới nhất trước. Đã sửa thành giữ bản mới nhất, rồi bỏ mặt hàng đã đăng hôm nay.

### Bước D: Giao diện app (Expo) ✅
**Đã làm**
- `lib/myLocation.ts`: giống web (lưu trên máy bằng kv-store; đăng nhập thì lưu cả lên tài khoản; máy mới tự lấy khu vực đã lưu).
- `components/LocationPicker.tsx`:
  - "📍 Dùng vị trí của tôi" bằng `expo-location`, tự đoán tỉnh
  - chọn tỉnh bằng ô gõ để tìm + nút bấm
  - tên chỗ ở, bán kính
- Màn mới `local-prices` (Giá quanh tôi) và `buyer` (Điểm mua đăng giá), cùng các chức năng như web.
  - Màn Điểm mua có nút "📍 Dùng vị trí hiện tại" để đứng tại điểm mua lấy tọa độ chính xác.
- Tab Bảng giá có thẻ "📍 Giá quanh tôi" trên cùng. Trang mặt hàng có mục "Giá các điểm mua quanh bạn". Tài khoản có nút sang Điểm mua và Khu vực của tôi.
- Cả web và app: chênh lệch so với giá chung hiện 1 chữ số lẻ. Trước đây chênh 300 đ trên 93.000 đ bị làm tròn thành "cao hơn 0%"; giờ hiện "0,3% (+300 đ)".

**Kiểm tra**
- Typecheck mobile sạch. Metro build bundle Android đủ 1723 module.
- Bấm thử trên bản web export của app:
  - chưa chọn khu vực thì thẻ mời chọn → chọn Đắk Lắk, 20 km → hiện cà phê (3 điểm, giá giữa 93.300 đ) và dịch vụ quanh đây
  - đăng nhập Hai Lúa → "✅ Đã duyệt" → đăng tiêu 141.500 đ → "Đã đăng giá"
- `expo export --platform web` crash 4 lần (139 / 138), lần thứ 5 mới qua.
- **Chưa thử GPS trên điện thoại thật.**

### Kết quả
Xong chức năng giá theo khu vực trên backend, web và app.

**Cách thử**
1. Web http://192.168.1.10:5173 → Bảng giá → "📍 Giá quanh tôi" → chọn Đắk Lắk (hoặc Cần Thơ).
2. Điểm mua demo: đăng nhập `0900000102` / `nhanong-demo` (Đại lý Hai Lúa) → Tài khoản → "🏪 Đăng giá của điểm mua".
3. Admin `/admin` → nhóm "Giá theo khu vực": duyệt "Đại lý Năm Tèo"; xem giá tiêu 210.000 đ đang chờ duyệt.

**Còn tồn / làm sau**
- Bản đồ các điểm mua (hiện chỉ có danh sách và khoảng cách).
- Thông báo cho điểm mua khi hồ sơ được duyệt, hoặc giá bị đưa về chờ duyệt.
- Nhắc điểm mua đăng giá hằng ngày (thông báo đẩy, cần development build).
- Khu vực theo xã / phường: bạn đã chọn tỉnh + vị trí; nếu sau cần thì nạp danh sách xã.

---

## 15/10/2026 (tối): Dữ liệu demo cho tài khoản 0900000003
- Tạo dữ liệu demo trên server (máy dev Docker) để thử các chức năng mục 19 trên app.
  - Script chạy đúng `Ledger` + `SyncEngine` của dự án, qua `vite.runnerImport`. Script nằm ở thư mục tạm, không nằm trong repo.
  - Đăng nhập API → `sync.enable` (lấy dữ liệu sẵn có để không tạo trùng) → tạo dữ liệu → `syncNow`.
- Dữ liệu đã tạo:
  - 2 vườn: "Vườn cà phê nhà" (1 ha) và "Rẫy sầu riêng" (0,5 ha).
  - 5 ô tự thêm:
    - vườn: Số gốc cây, Giống, Năm trồng
    - khoản thu chi: Người mua
    - vật tư: Hạn dùng
  - 4 khoản hay dùng: Xịt thuốc rầy vườn cà phê 350.000 đ, Tiền điện bơm tưới 450.000 đ, Đổ xăng máy cắt cỏ 120.000 đ, Bán sầu riêng lẻ ở chợ 2.000.000 đ. Trong đó 3 lần đã ghi bằng mẫu.
  - 4 lần thu hoạch:
    - cà phê 1.200 kg × 45.000 đ (đã bán, Người mua: Đại lý Tư Hùng) và 800 kg chưa bán
    - sầu riêng 1.500 kg × 62.000 đ (Người mua: Vựa Bảy Lợi) và 40 trái
  - 3 người làm: Anh Ba 300.000 đ/ngày, Chị Tư 250.000 đ/ngày, Út Năm 280.000 đ/ngày.
    - 11 ngày công ở 2 vườn
    - Anh Ba đã được trả 1 lần (tự ghi khoản Nhân công theo từng vườn); còn lại chưa trả
  - 7 khoản chi phí mấy tháng gần đây, 1 vật tư (Actara, Hạn dùng 30/06/2027).
- Trên server: 55 bản ghi (`ledger_version` = 55).
- Muốn thấy trên app: Sổ thu chi → ⚙️ Cài đặt → Nơi lưu → "☁️ Bật lưu cả trên mạng" → "Dùng tài khoản này". Sau đó bật Chế độ Nâng cao. Chế độ Nâng cao là cài đặt riêng từng máy, không đồng bộ.

---

## 15/10/2026 (tối): Mục 17 + 19 trong "Việc còn lại"

### Mục 17: Lịch chọn ngày tiếng Việt cho bản web ✅
**Đã làm**
- Component mới `web/src/components/DateField.tsx`, giống lịch của app:
  - ô hiện "📅 Thứ Năm, 15/10/2026"; bấm vào mở lịch (thẻ `<dialog>`, bấm Esc hoặc bấm ra ngoài thì đóng)
  - tuần bắt đầu từ Thứ 2, Chủ Nhật màu đỏ, ngày hôm nay có viền, ngày ngoài giới hạn bị mờ và không bấm được
  - lật tháng trước/sau, có nút nhanh "Hôm nay" và "Hôm qua"; ô không bắt buộc thì có nút "Bỏ ngày"
- Thay toàn bộ **13** ô `<input type="date">` của trình duyệt, vì mỗi trình duyệt hiện một kiểu, có máy hiện tiếng Anh hoặc đảo tháng/ngày:
  - Ghi tiền, Vụ (bắt đầu / kết thúc), Công nợ (4 ô), Kho vật tư (2 ô), Bán cho lái (2 ô), Đơn mua bán (2 ô)
- Chuyển 2 hàm tính lịch sang `packages/shared/src/format.ts` (`addDays`, `calendarCells`), web và app dùng chung. App bỏ bản viết riêng.

**Kiểm tra**
- Thêm 3 test lịch: qua tháng, qua năm, năm nhuận; tháng bắt đầu Thứ Năm / Chủ Nhật. Typecheck web + mobile sạch, lint sạch.
- Bấm thử trong Chrome (form Ghi tiền):
  - mở lịch được; ngày 16–31/10 bị khóa vì ngày ghi không được sau hôm nay
  - lùi về tháng 9, chọn ngày 14: lịch tự đóng, ô hiện "Thứ Hai, 14/09/2026", dòng tóm tắt đổi theo
  - nút Hôm qua / Hôm nay đổi đúng ngày

### Mục 19: Khoản hay dùng, thu hoạch, nhân công, ô tự thêm ✅

#### 19.1 Phần lõi dùng chung ✅
**Đã làm** (`packages/shared`)
- 5 bảng mới: `templates`, `harvests`, `workers`, `work_logs`, `custom_fields`.
  - Backend đã cho phép sẵn các bảng này nên đồng bộ chạy được ngay, không phải sửa server.
  - Web nâng IndexedDB lên phiên bản 4 để tạo kho cho các bảng mới.
- **Khoản hay dùng:**
  - `addTemplate`, `templateFromEntry` (lưu từ khoản đã ghi), `updateTemplate`, `removeTemplate`
  - `useTemplate`: ghi 1 khoản theo mẫu, đổi được số tiền và ngày lúc ghi. Vườn của mẫu đã bị xóa thì ghi vào chi chung.
- **Thu hoạch:**
  - `addHarvest` / `updateHarvest` / `removeHarvest`. Có giá bán thì tự ghi khoản tiền vào "Bán nông sản"; bỏ giá thì xóa khoản đó.
  - Cây trồng mặc định lấy theo vườn.
  - Xóa khoản tiền bán ở sổ thì xóa luôn sản lượng, để số liệu không lệch.
- **Nhân công:**
  - Người làm: `addWorker`, `updateWorker`, `removeWorker` (không cho xóa nếu còn công chưa trả).
  - Chấm công: `addWorkDay` (nhiều người cùng ngày, cả ngày / nửa ngày), `updateWorkLog`, `removeWorkLog` (không sửa / xóa được ngày công đã trả).
  - Trả công: `payWorker` ghi khoản tiền ra "Nhân công", mỗi vườn 1 khoản để tiền công tính đúng vào vườn đã làm. `unpayWork` bỏ lần trả; xóa khoản trả công ở sổ cũng bỏ lần trả.
  - Mỗi ngày công lưu tiền công lúc chấm, nên đổi giá công sau không làm lệch công cũ.
  - Xóa vườn thì ngày công của vườn chuyển sang "chi chung".
- **Ô tự thêm:**
  - `addCustomField` / `updateCustomField` / `removeCustomField` cho vườn, khoản thu chi, vật tư. Loại ô: chữ, số, ngày, lựa chọn.
  - `setExtra` ghi giá trị vào `extra`, giữ nguyên các khóa khác (như mã đơn mua bán).
  - Mỗi ô có mã cố định riêng, nên đổi tên ô thì giá trị đã nhập vẫn còn.
- Các hàm tính trong `extras.ts`:
  - `harvestTotals`: sản lượng theo vườn; quy tạ/tấn ra kg; **tự cộng cả số kg đã cắt bán cho lái**, không phải ghi lại
  - `costPerUnit`: giá thành / kg
  - `workerBalances`: công còn nợ, đã trả, ngày làm gần nhất
  - `fieldLines`, `parseFieldInput`: hiển thị và đọc giá trị ô tự thêm
- `formatQtyGrouped` ("1.200 kg") chỉ dùng để hiển thị.
  - **Không đổi `formatQty`**, vì `qtyText` dùng nó để điền sẵn số vào ô nhập, mà `parseQty` đọc "." là dấu thập phân.
  - Nếu đổi `formatQty` thì sửa vật tư 1.200 kg sẽ bị đọc thành 1,2 kg.

**Kiểm tra:** 89 test `packages/shared` qua (thêm 18 test); typecheck shared, web, mobile sạch.

#### 19.2 Giao diện web ✅
**Đã làm**
- **Khoản hay dùng:**
  - Màn Ghi tiền có hàng "⭐ Khoản hay dùng" ở trên lưới icon. Bấm một mẫu là điền sẵn hạng mục, số tiền, vườn, ghi chú rồi nhảy thẳng sang bước số tiền; chỉ cần bấm Lưu (2 lần bấm). Gõ phím số đầu tiên thì thay số của mẫu.
  - Khi ghi khoản mới có ô tích "⭐ Lưu làm khoản hay dùng".
  - Trang `#/so/mau` (vào từ Cài đặt sổ): Ghi ngay, Sửa tên / số tiền, Xóa (có hoàn tác).
- **Thu hoạch** (chế độ Nâng cao), mục "🌾 Thu hoạch" trong trang vườn:
  - sản lượng theo vụ / năm đang xem (tự cộng số kg đã cắt bán cho lái)
  - **giá thành đ/kg** (tiền chi ÷ số kg) và danh sách các lần thu hoạch
- Form `#/so/vuon/:id/thu-hoach-moi` và `#/so/thu-hoach/:id`:
  - nhập sản lượng; đơn vị kg / tạ / tấn / trái / buồng / bao
  - tích "Đã bán" và nhập giá thì tự ghi tiền vào
  - nút xóa (kèm khoản tiền bán)
- **Nhân công** (chế độ Nâng cao):
  - Ô lối tắt "👷 Nhân công" ở trang chính, hiện công chưa trả.
  - `#/so/cong`: danh sách người làm và số tiền còn nợ.
  - `#/so/cong/cham`: chấm công 1 ngày cho nhiều người. Mỗi người chọn Nghỉ / Nửa ngày / Cả ngày hoặc gõ số khác; nút Lưu hiện luôn tổng tiền.
  - `#/so/cong/nguoi/:id`: các ngày công; nút "💵 Trả công" (chọn được ngày trả); nút ↩ bỏ lần trả.
- **Ô tự thêm:**
  - `#/so/o-tu-them` (vào từ Cài đặt sổ): thêm ô cho Vườn / Khoản thu chi / Vật tư, loại Chữ / Số / Ngày / Chọn 1 trong danh sách; đổi tên, xóa.
  - Các ô hiện trong form vườn, form vật tư, và phần "Ngày · ghi chú · thông tin thêm" của màn Ghi tiền.
  - Giá trị hiện ở trang vườn, trang vật tư và danh sách khoản.
- Khoản tự ghi từ thu hoạch hoặc trả công: bấm vào thì mở lần thu hoạch / người làm; xóa thì báo rõ sẽ xóa gì.
- Hàm `extraTexts` / `saveExtra` tách ra `web/src/ledger/extra.ts`, vì lint báo file component không nên export kèm hàm thường.

**Kiểm tra** (bấm thử trong Chrome headless, sổ mới, bật Nâng cao)
- Khoản hay dùng: ghi Thuốc 350.000 đ và tích lưu mẫu → lần sau bấm mẫu được 🧪 Thuốc, 350.000 đ, đúng vườn → gõ phím 4 thì số thành 4 đ (thay chứ không nối).
- Ô tự thêm: thêm "Số gốc cây" (số) → nhập 1200 ở form vườn → trang vườn hiện "Số gốc cây: 1.200".
- Thu hoạch: 1.200 kg × 45.000 đ → tự ghi tiền vào 54.000.000 đ; giá thành 4.256.000 ÷ 1.200 = **3.547 đ/kg** (đúng).
- Nhân công: thêm Anh Ba 300.000 đ/ngày → chấm cả ngày → nợ 300.000 đ → Trả công → còn 0 đ; sổ có khoản "Nhân công · Trả công Anh Ba: 1 ngày −300.000 đ" đúng vườn.
- Lint, typecheck sạch.
- Lưu ý khi viết test: script bấm theo chữ có thể bấm nhầm (chữ "5" khớp với ô ngày "15/10/2026"), nên bàn phím số phải bấm đúng `.keypad button`.

#### 19.3 Giao diện app (Expo) ✅
**Đã làm**
- Màn Ghi tiền:
  - hàng "⭐ Khoản hay dùng" cuộn ngang
  - ô tích "Lưu làm khoản hay dùng"
  - ô tự thêm trong phần "Ghi chú · thông tin thêm"
- Form vườn, form vật tư: có ô tự thêm. Trang vườn, trang vật tư, danh sách khoản: hiện giá trị các ô.
- Trang vườn (Nâng cao): mục "🌾 Thu hoạch" có sản lượng, giá thành đ/kg, danh sách, nút "＋ Ghi thu hoạch".
- Màn mới:
  - `ledger/harvest-form`: ghi / sửa thu hoạch
  - `ledger/templates`: khoản hay dùng
  - `ledger/custom-fields`: thông tin tự thêm
  - `ledger/workers` (danh sách + nút nổi "✅ Chấm công"), `ledger/workers/form`, `ledger/workers/[id]` (trả công; bấm ngày công đã trả để bỏ lần trả), `ledger/workers/work-day`
- Trang chính (Nâng cao) có ô lối tắt "👷 Nhân công". Cài đặt sổ có mục "Ghi nhanh & thông tin riêng".
- Khoản tự ghi từ thu hoạch / trả công: bấm vào thì mở lần thu hoạch / người làm; xóa thì báo rõ sẽ xóa gì.
- Hàm `extraTexts` / `saveExtra` chuyển vào `packages/shared/src/extras.ts`, web và app dùng chung.
- Thêm `mobile/metro.config.js` (cấu hình mặc định của Expo + đuôi `.wasm`).
  - Trước đây build bản web của app (`expo export --platform web`) báo lỗi không nạp được `expo-sqlite/web/wa-sqlite.wasm`. Lỗi có từ trước, không do phần mới.

**Kiểm tra**
- Typecheck mobile sạch.
- `expo export --platform android` build được bundle 3,8 MB.
- Bấm thử trên bản web export của app, mở bằng server tĩnh trong Chrome headless:
  - Khoản hay dùng: Thuốc 350.000 đ, tích lưu mẫu → lần sau có nút "Khoản hay dùng Thuốc, 350.000 đ" → bấm là điền sẵn.
  - Ô tự thêm: thêm "Số gốc cây" → nhập 1200 ở form vườn → trang vườn hiện "Số gốc cây: 1.200".
  - Thu hoạch: 1.200 kg × 45.000 đ → tiền vào 54.000.000 đ; giá thành (4.250.000 + 350.000) ÷ 1.200 = **3.833 đ/kg** (đúng).
  - Nhân công: Anh Ba chấm cả ngày → nợ 300.000 đ → trả công → còn 0 đ; sổ có khoản "Trả công Anh Ba: 1 ngày".
- **Chưa thử trên điện thoại thật bằng Expo Go.**

**Ghi chú môi trường (máy dev Docker, Node 24.15, macOS 26.2)**
- Metro / `expo export` bị crash ngẫu nhiên (exit 139 / 133), kể cả khi chạy với `--max-workers 1`.
  - Chạy lại 1–2 lần thì được (lần này export Android thành công lần 1, web thành công lần 2).
  - Khi cần thử giao diện app trên máy này, dùng `expo export --platform web` rồi mở bằng server tĩnh, thay cho dev server.

**Kết quả mục 19:** xong khoản hay dùng, thu hoạch, nhân công, ô tự thêm trên cả web và app.

---

## 15/10/2026 (tối): Pull code mới + nạp backup giá trên máy dev Docker (192.168.1.10)
- **Pull:** từ `1c8353b` lên `a1a330a` (25 commit).
  - Lần pull đầu bị ngắt giữa chừng, để lại `.git/index.lock` và đã chép dở một phần file.
  - Đã so từng file với `origin/main`: tất cả đều giống bản trên server, không có sửa đổi riêng nào. Đã cất vào `git stash` ("ban-chep-do-dang-cua-lan-pull-bi-ngat-15-10") rồi pull lại.
- **Migration:** chạy 4 migration mới (gói xem giá, đơn mua bán).
- **Nạp backup** `nhanong-gia-20261015-1618.sql.gz` qua container MySQL (`docker exec -i dnnhnng-mysql-1 mysql …`), vì máy không có lệnh `mysql`.
  - File chỉ thay 8 bảng giá: categories, products, regions, price_sources, prices, unmatched_names, crawl_logs, plans.
  - Kết quả: 23.072 giá (10/2021 → 15/10/2026), 41 mặt hàng, 10 nguồn, 2 gói.
  - Bảng users, shops, sổ thu chi, đơn mua bán giữ nguyên.
  - Đã sao lưu 8 bảng cũ trước khi nạp: `/private/tmp/claude-501/db-backup/truoc-khi-nap-20261015.sql.gz` (thư mục tạm).
- **Đang chạy:** backend `:8000`, web `:5173` (mở từ Wi-Fi bằng http://192.168.1.10:5173).
- **Metro (Expo Go) bị segfault (exit 139)** ngay khi build bundle, và cả khi chạy ngoài sandbox, nên đây là lỗi thật trên máy này (Node 24.15, macOS 26.2, arm64). Đây cũng là lý do Expo Go trên điện thoại báo "Something went wrong": app chưa từng gọi tới server.
  - Cách tìm ra: `npx expo export --platform android --max-workers 1` thì build thành công; build song song nhiều tiến trình thì crash.
  - **Cách sửa: luôn chạy Metro với `--max-workers 1`.** Sau khi sửa, bundle Android build đủ 1708 module trong khoảng 3 giây.
- **Tài khoản trên máy dev này:**
  - admin `admin@nhanong.local`: dùng cho web `/admin`; không có số điện thoại nên không đăng nhập được trên app.
  - nông dân thử `0900000001`: dùng để đăng nhập app và web ("Lưu cả trên mạng"). Mật khẩu không ghi ở đây.
- Lệnh chạy app cho điện thoại:

```bash
cd mobile && REACT_NATIVE_PACKAGER_HOSTNAME=192.168.1.10 npx expo start --go --lan --port 8081 --max-workers 1 --clear
```
  - Lệnh này tự in mã QR; Expo Go mở link `exp://192.168.1.10:8081`.

---

## Link xem thử khi chạy dưới máy

Các link chỉ mở được khi các server đang chạy (xem "Cách chạy lại" bên dưới). Máy dev hiện tại (máy 2, từ 15/10/2026) chạy web ở cổng **5180**, vì cổng 5173 đang bị dự án khác dùng.

**Trên máy tính**

| Chức năng | Link |
|---|---|
| Bảng giá nông sản, phân bón, thuốc BVTV | http://localhost:5180/ |
| Biểu đồ giá một mặt hàng (khóa 🔒 theo mức tài khoản) | http://localhost:5180/#/san-pham/ca-phe-robusta |
| Tài khoản: đăng nhập / đăng ký / gói xem giá | http://localhost:5180/#/tai-khoan |
| Đơn mua bán chung 2 bên | http://localhost:5180/#/don |
| Sổ thu chi | http://localhost:5180/#/so |
| Kho vật tư / Công nợ & tiền vay / Bán cho lái (bật Chế độ Nâng cao) | http://localhost:5180/#/so/kho · http://localhost:5180/#/so/no · http://localhost:5180/#/so/ban |
| Điểm bán / thu mua | http://localhost:5180/#/diem-ban |
| Trang quản trị (giá, nguồn, tài khoản + kích hoạt gói, gói xem giá) | http://localhost:8000/admin |
| Kiểm tra API còn chạy không | http://localhost:8000/api/v1/health |

**Trên điện thoại** (cùng Wi-Fi GODY.VN với máy tính; IP máy lúc ghi là `192.168.1.13`, có thể đổi)

| Chức năng | Link |
|---|---|
| Web | http://192.168.1.13:5180 |
| App trong Expo Go (cần Expo Go cho **SDK 57**) | `exp://192.168.1.13:8081` |

**Tài khoản thử trên máy dev** (mật khẩu không ghi vào file này vì file được commit; đặt lại bằng lệnh ở dưới)

| Đăng nhập | Tên | Dùng để thử |
|---|---|---|
| 0900000001 | Chú Ba (nông dân) | tài khoản thường (xem giá 30 ngày), nhập mã tham gia đơn, nối sổ |
| 0900000002 | Lái Tư (thương lái) | có gói 1 năm, tạo đơn mua / bán, gộp lô |
| 0900000003 | Chi nhánh Tân Phú | có gói, tham gia đơn bán của lái |
| 0900000020 | Anh Hai (chủ DN) | chủ doanh nghiệp "Công ty Nông sản Hai Lúa" |
| 0900000021 | Lái Tèo | lái con (Nhóm Krông Pắc), được ứng 200 tr, có 1 phiếu mua |
| 0900000022 | Lái Tí | lái con (Nhóm Ea Kar), có 1 phiếu mua |
| admin@nhanong.local (email) | Quản trị | vào /admin |

```bash
# Đặt lại mật khẩu 1 tài khoản (máy dev)
cd backend && php artisan tinker --execute 'App\Models\User::where("phone","0900000001")->first()->update(["password" => "mat-khau-moi"]);'
# Tạo admin mới
php artisan make:filament-user && php artisan admin:grant email@cua-ban.vn
```

**Cần biết khi xem thử**
- Bản app chạy trên trình duyệt chỉ để xem giao diện. Nút "Gần tôi", thông báo nhắc hạn và thông báo đẩy phải thử trên điện thoại thật.
- Metro / Vite trên ổ `/Volumes/MacOS` không tự nhận file đã sửa (máy chưa có watchman): sửa code xong phải khởi động lại. Metro thì thêm `--clear`, và xem log "Android Bundled … (≈1700 modules)"; nếu chỉ khoảng 1360 module là thiếu màn hình, phải chạy lại.
- Thông báo trong đơn mua bán chỉ đến khi web/app đang mở (hỏi server 8 giây/lần).

**Cách chạy lại (máy dev hiện tại)**

```bash
# 1. MySQL 8 + Redis: máy này dùng DBngin (cổng 3306 / 6379), không cần Docker.
#    Máy khác thì dùng: docker compose up -d --wait
#    DB: nhanong, user nhanong / secret (giống backend/.env.example)

# 2. Backend (cổng 8000)
cd backend && php artisan serve --host=0.0.0.0 --port=8000

# 3. Web (cổng 5180)
cd web && npx vite --host 0.0.0.0 --port 5180 --strictPort

# 4. App cho điện thoại (Expo Go), ép dùng IP Wi-Fi vì máy có 2 mạng
cd mobile && REACT_NATIVE_PACKAGER_HOSTNAME=192.168.1.13 npx expo start --go --lan --port 8081 --max-workers 1 --clear
#    Xem app trên trình duyệt: cd mobile && CI=1 npx expo start --web --port 8082

# Lấy giá hôm nay / lấy dữ liệu cũ (chạy lại được, bỏ qua bài đã lấy)
cd backend && php artisan crawl:run
php artisan crawl:backfill baoquocte-ca-phe baoquocte-ho-tieu --from=2021-11
php artisan crawl:backfill congthuong-lua-gao --from=2021-10

# Xuất dữ liệu giá sang máy khác / nạp vào máy khác (máy nhận đã chạy php artisan migrate)
scripts/export-prices.sh                      # → exports/nhanong-gia-YYYYMMDD-HHMM.sql.gz
gunzip -c exports/nhanong-gia-….sql.gz | mysql --default-character-set=utf8mb4 -h 127.0.0.1 -u nhanong -p nhanong
```

---

## Tiến độ theo kế hoạch

| Giai đoạn | Nội dung | Trạng thái |
|---|---|---|
| 0. Khởi tạo | Monorepo, docker-compose, Laravel + Filament + Sanctum, Vite React, Expo | ✅ Xong |
| 1. Dữ liệu giá | Crawler, admin duyệt giá và gán tên, API giá | ✅ Xong. Thiếu nguồn giá thuốc BVTV; nguồn phân bón baohatinh có vẻ đã dừng |
| 2. Hiển thị giá | Danh sách + biểu đồ trên web/app, cảnh báo giá, thông báo đẩy | ✅ Xong. Thông báo đẩy chưa thử trên máy thật |
| 5. Điểm bán | Nhập điểm từ OSM/CSV, danh sách, gần tôi, gọi điện, chỉ đường, người dùng đề xuất + duyệt | ✅ Xong. Chưa có bản đồ |
| 3. Sổ thu chi Cơ bản (lưu trên máy) | Vườn, Tiền vào/ra, tổng kết, xuất/nhập file | ✅ Xong (web + app + PWA). Chưa thử với nông dân thật |
| 4. Đồng bộ | Lưu trên máy + server, API sync, giao diện web/app | ✅ Xong. Chưa thử trên điện thoại thật; chưa có quên mật khẩu (cần OTP SMS) |
| 4b. Sổ thu chi Nâng cao | Mùa vụ, kho vật tư, công nợ, nhân công, thu hoạch (giá thành/kg), khoản hay dùng, ô tự thêm | ✅ Xong (web + app). Chưa thử trên điện thoại thật |
| 1b. Dữ liệu giá cũ | Lấy lại giá 2021 → nay từ báo / cơ sở dữ liệu nhà nước | 🔄 Cà phê, tiêu, lúa gạo đang chạy; phân bón An Giang, sầu riêng (từ 10/2024) xong |
| 7. Phân quyền xem giá | Khách 10 ngày, đăng ký 30 ngày, có gói xem toàn bộ; gói tháng / năm | ✅ Xong. Thanh toán trong app chưa làm (admin kích hoạt tay) |
| 8. Đơn mua bán chung | Thương lái / chi nhánh / nông dân: mã tham gia, xác nhận 2 bên, lời cả lô, nối sổ, thông báo | ✅ Xong (web + app). Chưa có thông báo đẩy khi app đóng |
| 6. Phát hành | EAS build, CH Play / App Store, VPS | ⏳ Chưa làm |

---

## Việc còn lại (thống kê 16/10/2026, 15:00)

Đã xong từ lần thống kê trước (15/10):
- lấy giá cũ 5 năm (giá "cần duyệt" còn 0), xuất lại file giá
- phiếu cân / sổ giao dịch / PDF + Word
- lịch tiếng Việt cho web, trường tự thêm / mẫu / thu hoạch / nhân công
- chia sẻ phiếu có lịch sử sửa, doanh nghiệp (chủ + lái), thông báo cho khách / chủ
- giá quanh tôi (tìm xã / phường), chanh dây, admin xem giao dịch
- lọc điểm bán theo tỉnh (tự điền tỉnh), màn tổng hợp cho thương lái

### A. Dữ liệu giá
| # | Việc | Ghi chú |
|---|---|---|
| 1 | Giá thuốc BVTV | Chưa có nguồn đăng giá hằng ngày |
| 2 | Phân bón theo vùng / thương hiệu | Mới có An Giang; agro.gov.vn có thêm DAP, Urê Trung Quốc nếu thêm mặt hàng |
| 3 | Sầu riêng trước 10/2024 | Báo đăng bảng giá dạng ảnh |
| 4 | Nguồn phân bón báo Hà Tĩnh | Đã ngừng, cần nguồn khác |
| 5 | Chanh dây | Không có nguồn crawl; giá từ điểm mua đăng và admin nhập tay |

### B. Chức năng chưa làm
| # | Việc | Ghi chú |
|---|---|---|
| 6 | Thanh toán gói xem giá | Làm sau theo yêu cầu; cần chọn cách thu tiền (chuyển khoản QR / mã kích hoạt / cổng thanh toán) |
| 7 | Thông báo đẩy khi app đóng | Cần development build (mục 16) |
| 8 | Cập nhật tức thì (WebSocket) | Hiện hỏi server 8 giây / lần |
| 9 | Link mã đơn / phiếu mở thẳng app | Cần build riêng có scheme / app link |
| 10 | Quên mật khẩu | Cần OTP qua SMS (trả phí); lái con thì chủ đặt lại được |
| 11 | Bản đồ điểm bán | Hiện danh sách + chỉ đường |
| 12 | Ghi chú giọng nói, chụp ảnh hóa đơn | |
| 13 | Đợt cắt bán cho lái: "lái còn nợ" | Hiện giả định lái trả đủ mỗi đợt |
| 14 | App tự gửi sổ khi có mạng lại (NetInfo); hỏi lại khi đổi tài khoản trên máy đang có sổ | |
| 15 | Chủ doanh nghiệp mở thẳng trang đơn chung của lái | Hiện xem số liệu + tải quyết toán |

### C. Phát hành (cần bạn chuẩn bị)
| # | Việc | Cần |
|---|---|---|
| 16 | Build app bằng EAS (bản thử nội bộ → phát hành) | Tài khoản Expo |
| 17 | CH Play / App Store | Tài khoản Google (25 USD), Apple (99 USD/năm) |
| 18 | Backend lên VPS: tên miền, HTTPS, lịch lấy giá, hàng đợi, sao lưu DB | VPS, tên miền |
| 19 | Dịch vụ tìm địa danh riêng (đang dùng Photon miễn phí) | Tự cài Photon hoặc thuê |
| 20 | Bảo mật trước khi chạy thật | Đổi mật khẩu admin, xóa tài khoản / dữ liệu thử, `APP_DEBUG=false` |

### D. Danh sách thử trên điện thoại thật / với người dùng thật
Dùng app qua Expo Go (QR từ Metro), cùng Wi-Fi với máy dev. Tài khoản thử ở bảng "Tài khoản thử".
1. **Sổ thu chi:**
   - ghi thu / chi, tắt mạng ghi tiếp, bật lại thì đồng bộ
   - đổi máy đăng nhập thấy đủ sổ
   - nhắc hạn trả nợ (tắt / mở app)
2. **Đơn mua bán giữa 2 máy:**
   - 1 máy `0900000001`, 1 máy `0900000002`
   - tạo đơn, nhập mã, ghi đợt cân, đồng ý / báo sai
   - xem thông báo đến sau bao lâu
3. **Sổ giao dịch:**
   - lập phiếu (gõ số kg có dấu phẩy)
   - "Gửi PDF / Gửi Word" qua Zalo: mở file trên điện thoại người nhận được không, chữ có đủ dấu không
4. **Chia sẻ phiếu:**
   - gửi vào app khách (SĐT trùng), nhập mã phiếu
   - sửa phiếu thì khách thấy lịch sử
5. **Doanh nghiệp:**
   - chủ `0900000020` tạo lái mới
   - lái đăng nhập trên máy khác, lập phiếu: chủ nhận thông báo
   - ứng tiền, tiền đang giữ
6. **Giá quanh tôi:** "Dùng vị trí của máy" (GPS thật), tìm xã / phường, mở rộng bán kính.
7. **Người dùng thật** (5–10 người: nông dân, thương lái, chủ điểm thu mua):
   - thời gian ghi 1 khoản / lập 1 phiếu, số lần bấm nhầm
   - chữ có dễ hiểu không
   - cách tính chi chung / cọc / lãi vay / tiền đang giữ có đúng thói quen không
8. Mở file Word bằng Microsoft Word / WPS trên máy tính.

**Thứ tự đề xuất:** D (thử thật) → C16 + C18 (build riêng + VPS) → B7, B9 → B6 (thanh toán).

---

## 15/10/2026: Tổng kết cả ngày

Máy dev mới (clone từ GitHub, MySQL/Redis của DBngin, web cổng 5180, app qua Expo Go cùng Wi-Fi). Mỗi phần làm xong đều có test, thử tự động trên trình duyệt (web + bản web của app), rồi commit và push.

**Đã làm trong ngày** (chi tiết ở các mục bên dưới)
1. Dựng lại môi trường trên máy mới; đồng bộ sổ thu chi web/app (giai đoạn 4).
2. Sổ thu chi Nâng cao: mùa vụ, kho vật tư, công nợ (giai đoạn 4b).
3. Chạy app trên điện thoại bằng Expo Go: sửa lỗi `expo-notifications` làm sập app trên Expo Go Android.
4. Chọn ngày bằng lịch tiếng Việt trên app.
5. Bán cho lái (sầu riêng: cọc + cắt nhiều đợt nhiều loại hàng) và nút Hoàn tất + bảng quyết toán.
6. Tiền vay: bên cho vay (danh sách ngân hàng), 3 cách trả, lịch trả nợ, tổng lãi đến khi tất toán, nhắc hạn (thẻ trong app + thông báo trên máy).
7. Phân quyền xem lịch sử giá + trang Tài khoản + quản lý gói trong /admin.
8. Lấy dữ liệu giá cũ 5 năm (`crawl:backfill`) từ 4 nguồn; sửa nhiều lỗi đọc bảng giá; sửa giá bị kẹt "cần duyệt".
9. Đơn mua bán chung 2 bên (thương lái / chi nhánh / nông dân), lời cả lô, tự ghi vào sổ.
10. Thông báo khi bên kia ghi / xác nhận đơn, nút gọn đều; nông dân chọn / đổi vườn nhận tiền của đơn.
11. Script xuất dữ liệu giá `scripts/export-prices.sh`.

**Kiểm tra cuối ngày:** backend 115 test, shared 67 test, build + lint web, typecheck mobile đều qua.

### Dữ liệu giá trong DB dev (lúc 15:55, việc lấy dữ liệu cũ còn đang chạy)

| Mặt hàng | Từ | Số ngày có giá | Nguồn |
|---|---|---|---|
| Cà phê Robusta (Đắk Lắk, Lâm Đồng, Gia Lai, Đắk Nông) | 11/2021 | 955 (đang chạy, tới 07/2024) | baoquocte.vn + vietbao.vn |
| Hồ tiêu (6 tỉnh) | 11/2021 | 982 (đang chạy) | baoquocte.vn + vietbao.vn |
| Lúa IR 50404 / OM 5451 / OM 18 / Đài thơm 8, gạo IR 504 (An Giang) | 10/2021 | 380–716 (đang chạy, tới 01/2023) | agro.gov.vn + congthuong.vn |
| Urê Phú Mỹ, NPK 20-20-15 Bình Điền (bán lẻ An Giang, đ/bao = đ/kg × 50) | 10/2021 | khoảng 500 (tới 06/2025) | agro.gov.vn |
| Sầu riêng Ri6 / Thái loại A (ĐBSCL, Đông Nam Bộ, Tây Nguyên, vài tỉnh) | 10/2024 | khoảng 730 | thuonghieucongluan.com.vn (chạy hằng ngày) |
| Phân bón sỉ Vinacam | 10/2026 | 1 | vinacam.com.vn |

- Tổng khoảng 19.000 giá. 137 giá nhảy mạnh đang chờ admin duyệt (/admin → Giá → "Cần duyệt").
- Không có nguồn miễn phí đủ 5 năm cho:
  - sầu riêng trước 10/2024 (7–9/2024 bảng giá là ảnh);
  - phân bón theo vùng / Kali;
  - thuốc BVTV.
- File xuất dữ liệu giá: `exports/nhanong-gia-20261015-1555.sql.gz`. Không đưa lên git (thư mục `exports/` nằm trong `.gitignore`). Đã thử nạp vào DB trống: đủ 19.081 giá, 41 mặt hàng, 10 nguồn, tiếng Việt đúng.
- Khi việc lấy dữ liệu cũ chạy xong cần:
  1. xét lại giá "cần duyệt" (việc lấy dữ liệu khởi động trước bản sửa so giá);
  2. xuất lại file bằng `scripts/export-prices.sh`.

### Đơn mua bán: thông báo, nút, chọn vườn (bổ sung chiều 15/10)
- Server ghi "hoạt động mới nhất" của đơn ("Chú Ba đồng ý Đợt cân …"). `GET /deals?since=` chỉ trả đơn mới đổi.
- `DealWatcher` (dùng chung web + app) hỏi server 8 giây/lần. Bên nhận thấy:
  - thông báo nổi / băng thông báo có nút Xem;
  - số đỏ trên mục / tab "Đơn" (web còn hiện ở tiêu đề tab);
  - trang đơn đang mở tự cập nhật.

  Bên gửi thấy "Đã gửi cho …, chờ xác nhận". Thử thật: thông báo đến sau khoảng 6–7 giây.
- Lỗi tìm thấy: thanh thông báo "Đã lưu…" trên web chỉ được vẽ ở trang Sổ thu chi, nên trang Đơn không bao giờ hiện thông báo. Đã đưa ra dùng chung.
- Nút Đồng ý / Báo sai / Kết thúc / Hủy cùng cỡ. Đơn chưa có đợt cân xác nhận ghi "Chưa có đợt cân nào được xác nhận" (trước ghi nhầm "Đã thanh toán đủ").
- Phần Sổ thu chi trong đơn: chọn / đổi vườn (hoặc Chi chung) và hạng mục bất cứ lúc nào, các khoản đã ghi chuyển theo; nút "＋ Thêm vườn" rồi quay lại đơn. Trong sổ, bấm khoản tự ghi từ đơn thì mở đơn.
- Chưa có: thông báo đẩy khi app đóng (cần bản build riêng + server gửi), WebSocket (cập nhật tức thì).

### ⏭️ Việc tiếp theo (đề xuất)
- Màn hình tổng hợp cho thương lái (lời các lô theo tháng / vụ, tổng nợ nông dân, tổng chi nhánh nợ mình), phiếu cân / biên nhận gửi bên kia.
- Thông báo đẩy từ server cho đơn mua bán (cần development build: `eas build --profile development`).
- Thanh toán gói xem giá (VietQR + webhook ngân hàng, hoặc mã kích hoạt).
- Giai đoạn 6: phát hành (EAS build, CH Play / App Store, VPS cho backend).

---

## 15/10/2026: Phân quyền xem giá, dữ liệu giá cũ, đơn mua bán chung 2 bên

### Phân quyền xem lịch sử giá ✅
- Khách xem 10 ngày, đăng ký miễn phí xem 30 ngày, có gói (tháng 29.000 đ / năm 199.000 đ, sửa trong /admin) xem toàn bộ.
- Server cắt theo mức tài khoản tính từ hôm nay. Khoảng dài thì gộp điểm theo tuần/tháng.
- Thanh toán làm sau: admin bấm "Kích hoạt gói" trong /admin → Tài khoản.
- Web `#/tai-khoan`, app nút 👤 trên tab Bảng giá; biểu đồ có mốc 🔒.

### Dữ liệu giá cũ (đang chạy)
- Lệnh `php artisan crawl:backfill {nguồn…} --from=Y-m --to=Y-m`:
  - duyệt sitemap theo tháng, ngày giá lấy theo ngày đăng bài;
  - chạy lại được (bỏ qua bài đã lấy); mặc định không lưu HTML.
- Nguồn `baoquocte-ca-phe` (4 tỉnh) và `baoquocte-ho-tieu` (6 tỉnh), 11/2021 → nay. Log: `backend/storage/logs/backfill-baoquocte.log`.
- vietbao chỉ có dữ liệu từ khoảng 04/2026.
- Không có nguồn miễn phí đủ 5 năm cho sầu riêng (chỉ có từ khoảng 07/2024) và phân bón theo vùng (chỉ có giá bán lẻ An Giang).
- Lúa gạo, phân bón An Giang, sầu riêng: agent đang làm (agro.gov.vn, congthuong.vn, thuonghieucongluan.com.vn).
- Lỗi đã sửa trong bộ trích giá:
  - bài gộp cà phê + tiêu (tách theo H2);
  - bảng lồng trong bảng;
  - nhiều tỉnh dùng chung 1 giá;
  - giá FOB lọt vào (thêm khoảng giá hợp lý);
  - hàng tiêu đề thiếu ô đầu (làm cà phê 04–05/2022 không có giá, đã lấy lại).

### Đơn mua bán chung 2 bên ✅
**Yêu cầu:** thương lái nhỏ mua của nông dân rồi bán lại cho chi nhánh lớn, hoặc chi nhánh đi mua, đặt cọc. Đơn tạo ra có mã để bên kia tham gia, 2 bên cùng xem chi tiết.

**Quy tắc** (anh chọn):
- cả 2 bên ghi, bên kia xác nhận;
- vai trò tính theo từng đơn, không chọn vai trò khi đăng ký;
- nối đơn mua với đơn bán để tính lời lô;
- tự ghi vào Sổ thu chi khi đã xác nhận.

**Đã làm**
- **Backend:**
  - bảng `deals` (bên bán / bên mua, mã 6 ký tự bỏ 0/O/1/I), `deal_entries` (cọc, đợt cân nhiều loại hàng, trả tiền, chi phí riêng), `deal_sources`;
  - API `/deals`, `/deals/join`, `/deal-entries/{id}/confirm|dispute`, `/deals/{id}/sources`;
  - `DealSummary` chỉ tính mục đã xác nhận.
- **Lõi:** `Ledger.linkDeal` / `applyDeal`. Đợt cân đã xác nhận thành tiền vào (bên bán) / tiền ra (bên mua, hạng mục "Mua nông sản"); chi phí riêng thành tiền ra. Mã khoản = mã mục, nên chạy lại không trùng. Sửa hoặc bỏ xác nhận thì tự gỡ.
- **Web** `#/don`; **app** có tab "🤝 Đơn" (agent làm theo bản web, Claude kiểm lại).

**Kiểm tra**
- 101 test backend, 64 test shared.
- Web, 3 trình duyệt (lái, nông dân, chi nhánh): 11/11 bước qua. App (Expo web): 15/15 bước qua.
- Ví dụ thử: cọc 100tr → đợt cân 1200 + 300 kg → báo sai "1250 kg" → sửa → đồng ý → 124,25tr, thanh toán đủ → sổ nông dân tiền vào 124,25tr → lái bán chi nhánh 1500 kg × 90k, chi phí xe 2tr → lời cả lô 8,75tr, hao hụt 50 kg.

**Còn tồn**
- Chưa có thông báo đẩy khi bên kia ghi / xác nhận. Hiện là thẻ "🔔 chờ bạn xác nhận" và tự tải lại 30 giây/lần.
- Link mã chỉ mở bản web; app phải nhập mã tay.
- Chưa thử trên điện thoại thật.

---

## 15/10/2026: Bán cho lái: nút Hoàn tất + bảng quyết toán ✅

**Lỗi anh Tuyên gặp:** cọc 100 triệu, cắt 2 lần, nhưng không có nút hoàn tất để ra số liệu.
- Nguyên nhân: nút "Cắt xong, đóng hợp đồng" chỉ hiện khi cọc đã trừ hết. Các đợt chưa trừ đủ cọc thì chỉ thấy "Lái bỏ cọc" / "Trả lại cọc".

**Đã sửa**
- Luôn có nút **"✅ Hoàn tất hợp đồng"**. Bấm vào thì hiện **bảng quyết toán**: tiền hàng các đợt (kg), tiền cọc, đã trừ cọc, cọc còn dư.
- Cọc còn dư thì chọn 1 trong 3 cách (`Ledger.settleContract`):
  1. **Trừ nốt vào tiền hàng** (mặc định): trừ thêm vào đợt cuối trước. Chỉ chọn được khi tiền hàng đủ để trừ.
  2. **Trả lại lái** phần dư: không đổi lời/lỗ. Muốn đền thêm thì bấm "Trả lại cọc kèm tiền đền…".
  3. **Lái bỏ cọc** phần dư: thành tiền vào.
- Hợp đồng đã xong có bảng **📋 Quyết toán** (`contractSettlement`): tiền hàng, lái bỏ cọc / trả lại / đền thêm, tiền lái thực trả, **phần tính vào lời/lỗ của vườn**, giá bình quân/kg. Vẫn mở lại được.

**Kiểm tra**
- 61 test shared (thêm 3).
- Web 8/8 bước qua: cọc 100 triệu, 2 đợt (trừ 30 + 20 triệu) → hoàn tất trừ nốt → đợt 2 trừ 70 triệu; lời/lỗ 161 triệu, giá bình quân 84.737 đ/kg.
- App (Expo web) 3/3 bước qua.

---

## 15/10/2026: Khoản vay: bên cho vay, lịch trả nợ, tổng lãi, nhắc hạn ✅

**Yêu cầu:**
- Khoản vay phải ghi được vay của ai; vay ngân hàng thì chọn từ danh sách tên ngân hàng.
- Ghi ngày phải trả, và trả theo tháng hay trả 1 lần.
- Nhắc người dùng khi đến hạn.
- Biết được tới lúc trả hết thì tổng tiền lãi là bao nhiêu.

**Thiết kế**
- **Bên cho vay:** Ngân hàng / Quỹ tín dụng / Cá nhân / Doanh nghiệp, cửa hàng.
  - Chọn Ngân hàng thì hiện danh sách 26 ngân hàng (`VN_BANKS`: Agribank, NH Chính sách xã hội, Vietcombank, BIDV…); vẫn gõ được tên khác.
- **Lãi suất:** theo %/năm (ngân hàng) hoặc %/tháng (vay cá nhân, chọn Cá nhân thì tự chuyển sang tháng).
- **Cách trả** (`loan_plan`), kèm kỳ hạn (tháng) và ngày trả hằng tháng:
  1. Trả lãi hằng tháng, gốc trả cuối kỳ: lãi mỗi kỳ = dư nợ × lãi suất tháng.
  2. Trả góp: gốc chia đều mỗi tháng + lãi tính trên dư nợ còn lại (giảm dần).
  3. Trả 1 lần cuối kỳ: lãi = gốc × lãi suất tháng × số tháng.
  4. Chưa có lịch cố định: trả lúc nào ghi lúc đó.
- **Lịch trả nợ** (`loanSchedule`):
  - Kỳ đã trả dùng số thật; kỳ chưa trả tính lại theo dư nợ hiện tại, nên trả bớt gốc sớm thì lãi các kỳ sau tự giảm.
  - **Tổng lãi đến khi tất toán** = lãi đã trả + lãi dự kiến các kỳ còn lại.
  - Hạn trả hết nợ tự tính theo kỳ hạn và ngày trả.
- **Trả nợ:** form điền sẵn gốc + lãi của kỳ tới. Có thể "Trả thêm ngoài lịch" để trả bớt gốc. Bấm "Trả" ở một dòng trong lịch thì chọn đúng kỳ đó.
- **Nhắc hạn:**
  - Thẻ "🔔 Sắp đến hạn" trên trang sổ: kỳ vay và các khoản nợ có hẹn ngày trong 7 ngày tới, hoặc đã quá hạn (`dueReminders`).
  - App: thông báo nhắc lúc 08:00 hôm trước và 07:00 đúng ngày, tối đa 60 thông báo vì iOS chỉ giữ 64. Bấm vào thông báo thì mở khoản nợ.
  - Bật/tắt nhắc trong Cài đặt sổ; app chỉ xin quyền thông báo khi bật.
  - Không chạy trong Expo Go Android và bản web; ở đó vẫn có thẻ nhắc trong app.

**Đã làm**
- Lõi: thêm các trường cho khoản vay (`lender_type`, `rate_unit`, `loan_plan`, `term_months`, `pay_day`) và `DebtPayment.installment`; các hàm `loanSchedule`, `dueReminders`, `addMonths`, `formatDateTime`.
- Web:
  - `Loan.tsx` (`LenderFields`, `LoanFields` có xem trước tổng lãi, `LoanScheduleCard`)
  - form vay: chọn bên cho vay trước, rồi mới tới tên
  - trang chi tiết khoản vay có lịch trả nợ; trang sổ có thẻ "Sắp đến hạn"
- App (agent làm theo bản web, Claude kiểm lại):
  - `components/loan.tsx`; `lib/reminders.ts` (thông báo nhắc hạn); công tắc nhắc hạn trong Cài đặt sổ
  - danh sách ngân hàng hiện 6 ngân hàng hay dùng, bấm "Ngân hàng khác…" để xem hết

**Lỗi tìm thấy và đã sửa**
- Hạn trả hết nợ không theo "ngày trả hằng tháng" (vay ngày 10, trả ngày 15 thì hạn bị ghi ngày 10), làm app báo quá hạn sớm vài ngày. Agent phát hiện; đã sửa và thêm test.
- App còn 2 chỗ dùng `toLocaleString('vi-VN')`, có thể sai trên Android (Hermes). Đã thay bằng `formatDateTime`.

**Kiểm tra**
- 58 test shared (thêm 6: 3 cách trả, trả bớt gốc sớm, nhắc hạn, ngày cuối tháng), 81 test backend, build + lint web, typecheck mobile: đều qua.
- Web, bấm tự động (11/11 bước qua):
  - vay Agribank 100 triệu, 9%/năm, trả lãi hằng tháng, 11 tháng → tổng lãi 8.250.000 đ, kỳ đầu 750.000 đ
  - lịch 11 kỳ; thẻ nhắc hạn hiện kỳ 1; trả kỳ 1 → ✅, form chuyển sang kỳ 2
  - trả bớt 40 triệu gốc → lãi còn dự kiến 4.500.000 đ
  - vay Chú Sáu 50 triệu, 1,5%/tháng, trả 1 lần sau 6 tháng → tổng lãi 4.500.000 đ
- App (Expo web), agent bấm thử 22/22 bước qua. **Thông báo trên điện thoại thật chưa thử được.**

---

## 15/10/2026: Bán cho lái (cọc + cắt nhiều đợt), tiền vay, ngày chọn bằng lịch ✅

**Yêu cầu** (anh Tuyên)
- **Sầu riêng:** lái kiểm tra vườn và đặt cọc trước (ví dụ 100 triệu). Mùa thu hoạch tháng 8–10 cắt nhiều đợt, mỗi đợt tính tiền rồi trừ cọc. Cà phê, hồ tiêu không có trường hợp này.
- **Tiền vay:** ví dụ vay ngân hàng 100 triệu cho tất cả các vườn, và mua thiếu phân của cửa hàng A 5 lần (khoảng 100 triệu). Trang tổng phải cho biết đúng lời/lỗ.

**Quy tắc tính** (anh chọn khi được hỏi)
- **Trừ cọc:** mỗi đợt tự nhập số tiền trừ cọc, không theo tỷ lệ cố định.
- **Mỗi đợt ghi nhiều loại hàng:** Loại A/B/C, hàng dạt, hàng kem; mỗi loại có kg × giá.
- **Lời/lỗ tính theo giá trị hàng giao:**
  - cọc chưa tính vào lời/lỗ;
  - mỗi đợt, tiền vào = giá trị hàng;
  - "lái trả thêm" = giá trị hàng − số trừ cọc.
- **Có nút kết thúc hợp đồng:**
  - lái bỏ cọc: phần cọc chưa trừ thành tiền vào (hạng mục Thu khác);
  - trả lại cọc: không đổi lời/lỗ; nếu phải đền thêm thì phần đền là tiền ra;
  - cọc đã trừ hết thì đóng hợp đồng; mở lại được.
- **Tiền vay:**
  - tiền gốc không tính vào lời/lỗ, vì là tiền mượn và tiền đã chi cho vườn đã nằm trong các khoản tiền ra;
  - lãi trả kèm từng lần là tiền ra, hạng mục mới **"🏦 Lãi vay"**. Sổ cũ tự được thêm hạng mục này khi mở.
- **Nợ cửa hàng nhiều lần:** dùng "Mua vật tư → Mua thiếu" như cũ. Trang công nợ gom theo người ("Cửa hàng A · 5 lần"); "Trả gộp" trừ vào lần nợ cũ nhất trước.

**Đã làm**
- Phần dùng chung:
  - 2 bảng mới `harvest_contracts`, `harvest_cuts`
  - các hàm `addContract`, `addCut`, `forfeitDeposit`, `refundDeposit`, `closeContract`, `reopenContract`
  - `DebtKind` thêm `loan`; `payDebt` nhận thêm tiền lãi; thêm `payParty`
  - hàm tính `contractSummaries`, `debtsByParty`, `interestPaid`, `monthlyInterest`
  - không cho xóa vườn khi còn hợp đồng bán
- Backend: đồng bộ thêm 2 bảng mới. IndexedDB của web lên version 3.
- Web: `#/so/ban` (danh sách, nhận cọc, chi tiết, ghi/sửa đợt cắt); trang công nợ gom theo người; `#/so/no/nguoi/:loai/:ten` (trả gộp); form "Mình đi vay"; trả gốc + lãi; thẻ **Tình hình tài chính** trên trang sổ.
- App: các màn hình tương ứng (`ledger/contracts/*`, `ledger/debts/party`). Agent làm theo bản web, Claude kiểm lại.
- App: **chọn ngày bằng lịch tiếng Việt** (`DatePicker`):
  - hiện "Thứ Năm, 15/10/2026", tuần bắt đầu từ Thứ 2, nút Hôm nay / Hôm qua
  - khóa ngày tương lai, hoặc ngày trước ngày bắt đầu
  - ô ngày ở Ghi tiền giờ hiện sẵn

**Kiểm tra**
- 53 test shared (thêm 6), 81 test backend, build + lint web, typecheck mobile: đều qua.
- Web, bấm tự động (14/14 bước qua):
  - cọc 100 triệu → trang sổ vẫn "Lời 0 đ"
  - đợt 1: 1200 kg × 85k + 300 kg × 60k = 120 triệu, trừ cọc 30 triệu → lái trả thêm 90 triệu
  - đợt 2: tự điền loại hàng + giá đợt trước, trừ nốt 70 triệu → đóng hợp đồng
  - vay Agribank 100 triệu, 9%/năm → ước tính lãi 750 nghìn/tháng; trả lãi 750 nghìn
  - mua thiếu Cửa hàng A 2 lần → hiện 1 dòng "2 lần"; trả gộp 30 triệu → còn nợ 20 triệu
  - trang sổ: Lời = 205 triệu − 50 triệu phân − 750 nghìn lãi = 154.250.000 đ; thẻ tài chính hiện vay 100 triệu, nợ cửa hàng 20 triệu
- App (Expo web), agent bấm thử 29 bước qua; Claude xem lại ảnh chụp.
- Lịch chọn ngày trên app: 6/6 bước qua.

**Còn tồn**
- Chưa thử trên điện thoại thật; chưa hỏi nông dân xem cách tính cọc / lãi vay có đúng thói quen không.
- Đợt cắt chưa có "lái còn nợ" (giả định lái trả tiền ngay mỗi đợt). Nếu lái trả chậm thì tạm ghi thêm ở Công nợ → "Mình bán chịu", bỏ chọn "Ghi luôn vào sổ".
- Bản web vẫn dùng ô chọn ngày của trình duyệt (dạng ngày theo ngôn ngữ của máy).

---

## 15/10/2026: Thử app trên điện thoại thật bằng Expo Go

**Cách chạy** (máy tính và điện thoại cùng Wi-Fi GODY.VN, IP máy lúc ghi là `192.168.1.13`):
```bash
cd mobile && REACT_NATIVE_PACKAGER_HOSTNAME=192.168.1.13 npx expo start --go --lan --port 8081
```
- Phải ép IP Wi-Fi, vì máy còn mạng dây `172.16.100.x` và Expo có thể chọn nhầm.
- Link mở trong Expo Go: `exp://192.168.1.13:8081`. App tự gọi backend ở `http://192.168.1.13:8000`.
- Chạy không cần `CI=1` vẫn không bị segfault.

**Lỗi gặp và cách sửa**
- Expo Go trên Android là bản cho **SDK 58** (bản thử nghiệm), còn dự án dùng **SDK 57** (bản ổn định mới nhất).
  - Cách sửa: cài Expo Go cho SDK 57 từ https://expo.dev/go?sdkVersion=57&platform=android&device=true.
- **Lỗi code:** `expo-notifications` được nạp ngay khi mở app. Từ SDK 53, Expo Go trên Android báo lỗi khi nạp thư viện này, làm sập `_layout`, `alerts`, `product/[code]` ("ErrorBoundary of undefined").
  - Cách sửa: `mobile/src/lib/push.ts` chỉ nạp thư viện khi máy hỗ trợ (`require` khi cần). Trên web và Expo Go Android thì báo "Cần cài bản build riêng của app" thay vì sập.
  - Phần mở thông báo trong `_layout.tsx` chuyển sang `onNotificationOpened()`.
- **Metro và Vite không nhận thay đổi file** trên ổ `/Volumes/MacOS` (máy chưa có watchman).
- Đôi khi Metro khởi động mà không quét thấy file nào trong `src/app`: bundle chỉ khoảng 1.360 module (bình thường khoảng 1.700) và app mở ra màn hình trống. Cách sửa: khởi động lại Metro rồi xem dòng log "Android Bundled … (N modules)" để chắc đủ module. Sửa code xong phải khởi động lại, Metro thì thêm `--clear`. Có thể cài watchman (`brew install watchman`) để thử khắc phục.

---

## 15/10/2026: Giai đoạn 4b, Sổ thu chi Nâng cao: mùa vụ, kho vật tư, công nợ ✅

**Cách tính (quyết định thiết kế)**
- Tất cả nằm sau công tắc **"Chế độ Nâng cao"** trong Cài đặt sổ (`meta.advanced`), để bản Cơ bản vẫn gọn cho người lớn tuổi. Tắt đi thì dữ liệu vẫn giữ, số liệu vẫn tính đúng.
- **Mùa vụ** tính theo ngày + vườn, không lưu `season_id` vào từng khoản. Sửa ngày vụ thì số liệu tự tính lại, và không phải đồng bộ hàng loạt bản ghi. Hai vụ của cùng một vườn không được trùng ngày.
- **Kho vật tư:** lúc mua ghi 1 khoản tiền ra "chi chung" (`transactions.supply_id`). Mỗi lần "dùng cho vườn A" sinh 2 khoản ảo khi tính (`allocatedEntries`): +tiền ở vườn A, −tiền ở chi chung. Nhờ vậy tổng cả sổ không đổi, mỗi vườn biết đã tốn bao nhiêu vật tư, và phần chưa dùng nằm ở chi chung ("gồm X đ vật tư còn trong kho").
- **Công nợ:** mua thiếu / bán chịu tính vào lời/lỗ ngay lúc phát sinh (tùy chọn "Ghi luôn vào sổ thu chi", mặc định bật). Trả nợ chỉ giảm số còn nợ, không tính lại vào lời/lỗ.
- Khoản sinh ra từ vật tư / nợ: bấm vào thì mở vật tư / khoản nợ để sửa. Xóa khoản đó thì xóa luôn vật tư / khoản nợ, có Hoàn tác, để hai bên không lệch nhau.

**Đã làm**
- `packages/shared`:
  - thêm 5 bảng `seasons`, `supplies`, `supply_usages`, `debts`, `debt_payments`
  - thao tác thêm/sửa/xóa có hoàn tác (`removeRecords`)
  - hàm tính trong `advanced.ts`
  - không dùng `toLocaleString('vi-VN')`, vì Hermes trên Android có thể không có dữ liệu locale
- Backend: cho phép đồng bộ bảng `debt_payments` (các bảng kia đã khai báo sẵn từ trước).
- Web:
  - `#/so/kho`, `#/so/kho/mua`, `#/so/kho/:id`, `#/so/no`, `#/so/no/moi`, `#/so/no/:id`, `#/so/vuon/:id/vu-moi`
  - trang vườn có chọn vụ (`?vu=`), "Kết thúc vụ hôm nay", "Vật tư đã dùng"
  - lối tắt Kho / Công nợ trên trang sổ
  - ô nhập tiền tự thêm dấu chấm và đọc thành chữ
  - ô "Thành tiền" tự tính ngược ra giá 1 đơn vị (giá lẻ được giữ nguyên, ví dụ 1 triệu / 3 chai)
  - IndexedDB lên version 2 để tạo bảng mới
- App (Claude giao cho một agent làm theo bản web, rồi tự kiểm lại):
  - các màn hình `ledger/supplies`, `ledger/debts`, `ledger/season-form`
  - trang vườn và tab Sổ thu chi giống web
  - nhập ngày bằng chữ `năm-tháng-ngày` như màn hình Ghi tiền, vì chưa có thư viện chọn ngày
  - `confirmAsync`: dùng `Alert` trên máy thật, `window.confirm` trên bản web (`Alert.alert` của RN-web không làm gì)

**Lỗi tìm thấy và đã sửa**
- Vite dev server không nhận thay đổi file (trả bản cũ của `LedgerSettings.tsx`), khởi động lại thì được. Nếu sửa code mà web không đổi thì khởi động lại Vite.
- Agent làm app phát hiện 2 lỗi ở phần lõi, đã sửa và thêm test:
  - Sửa giá vật tư mua thiếu xuống thấp hơn số đã trả nợ → giờ báo lỗi.
  - Sửa số tiền của khoản nợ đi theo vật tư làm lệch với thành tiền vật tư → giờ báo "Hãy sửa số lượng / giá ở vật tư".

**Kiểm tra**
- 46 test shared (thêm 8 test Nâng cao), 81 test backend (thêm test đồng bộ 5 bảng mới), build + lint web, typecheck mobile: đều qua.
- Web, bấm tự động (18/18 bước qua):
  - mua thiếu 10 bao NPK × 600.000 đ → dùng 6 bao cho vườn A, "2,5" bao cho vườn B → còn 1,5 bao; dùng quá thì báo lỗi
  - trang sổ: A lỗ 3.600.000 đ, B lỗ 1.500.000 đ, chi chung −900.000 đ, tổng vẫn 6.000.000 đ
  - trả 2 triệu → còn nợ 4 triệu; bán chịu 20 triệu hẹn 01/10 → "Quá hạn"
  - vụ 2026 của vườn A: Lời 16.400.000 đ; thêm vụ trùng ngày → báo lỗi
  - xóa khoản mua NPK → kho trống, nợ mất; Hoàn tác → quay lại đủ; tải lại trang → dữ liệu còn
- Đồng bộ 2 trình duyệt cùng tài khoản: vật tư, lần dùng và khoản nợ đều sang máy kia, lời/lỗ của vườn khớp. Bài thử đồng bộ cũ (web ↔ web 10/10, app ↔ web 7/7) vẫn qua.
- App (Expo web), agent bấm thử toàn bộ luồng: mua (chỉ nhập thành tiền), dùng, trả hết nợ, bán chịu, thêm vụ, xóa + hoàn tác; không có lỗi trang.

**Còn tồn**
- Chưa thử trên điện thoại thật; chưa thử với nông dân thật xem có dễ hiểu không (nhất là cách tính "chi chung" khi có kho).
- `npx expo export --platform web` lỗi vì Metro không đọc được file `.wasm` của `expo-sqlite` (đã có từ trước, không do phần này). Cần thêm `metro.config.js` khi muốn xuất bản web của app.
- Chưa làm: trường tự thêm (`custom_fields`), mẫu ghi nhanh (`templates`), thu hoạch, nhân công (các bảng đã khai báo trên backend).

### ⏭️ Việc làm tiếp
- **Giai đoạn 6, Phát hành:** EAS build (development build để thử thông báo đẩy, SQLite, vị trí trên máy thật), CH Play / App Store, VPS cho backend.

---

## 15/10/2026: Giai đoạn 4, Đồng bộ: giao diện web + app ✅

### Dựng lại môi trường trên máy mới (clone từ GitHub)
- `git clone` vào `DUAN_NHANONG/`, `composer install`, `npm install` (ở thư mục gốc), `cp .env.example .env`, `php artisan key:generate`, `php artisan migrate --seed`.
- Máy này đã có **MySQL 8.0 và Redis của DBngin** chạy sẵn ở cổng 3306/6379, nên `docker compose up` báo trùng cổng.
  - Cách làm: dùng luôn MySQL/Redis của DBngin; tạo database `nhanong` và user `nhanong` / `secret` (giống `.env.example`), không phải sửa `.env`.
- Cổng 5173 đang bị một dự án khác dùng, nên chạy web ở cổng **5180**: `cd web && npx vite --host 0.0.0.0 --port 5180`. Proxy `/api` vẫn trỏ về cổng 8000.
- Máy dùng Node 22 / npm 10 (README ghi Node 24). Chạy được, nhưng `npm install` sửa `package-lock.json` (bỏ trường `libc`); đã hoàn lại để không commit thay đổi thừa.
- Lấy lại dữ liệu: `crawl:run` hôm nay + ngày 14/10, `shops:import-osm` (33 điểm).
- Kiểm tra ban đầu: 80 test backend, 38 test shared, build web + typecheck mobile đều qua.

### Bước 4.3: Giao diện web ✅
**Đã làm**
- `web/src/ledger/sync.ts`: tạo 1 `SyncEngine` khi mở sổ; đồng bộ lại khi có mạng trở lại (`online`) và khi quay lại tab (`visibilitychange`).
- Trang mới `#/so/dang-nhap` (`SignIn.tsx`): 2 thẻ "Tạo tài khoản mới" / "Đã có tài khoản", số điện thoại, mật khẩu, ô "Hiện mật khẩu".
  - Lỗi hiện ngay dưới ô nhập (số sai định dạng, số đã có tài khoản, sai mật khẩu); mất mạng thì báo ở cuối form.
  - Phiên hết hạn: mở thẻ "Đã có tài khoản", điền sẵn số điện thoại.
- Thẻ "☁️ Lưu cả trên mạng" ở màn chọn nơi lưu đã bấm được (bỏ chữ "Sắp có").
- Trang sổ có dòng trạng thái ✅ / 🔄 / ⚠️ (`SyncBadge.tsx`), kèm nút "Thử lại" khi mất mạng và "Đăng nhập" khi hết phiên. Chỉ lưu trên máy thì không hiện.
- Cài đặt sổ, mục "Nơi lưu":
  - đang chỉ lưu trên máy: nút "☁️ Bật lưu cả trên mạng"
  - đang lưu trên mạng: tên + số điện thoại, trạng thái, lần đồng bộ cuối, nút "Đồng bộ ngay", nút "Chuyển về chỉ lưu trên máy" → hỏi "Giữ lại trên mạng" / "Xóa hẳn trên mạng" / "Hủy"
  - "Xóa hết sổ trên máy này" khi đang lưu trên mạng: đăng xuất máy này, sổ trên mạng vẫn giữ (câu hỏi xác nhận nói rõ điều này)

**Lỗi tìm thấy và đã sửa**
- Service worker (PWA) cache mọi `GET /api/...`, kể cả `/sync/pull` và `/user`. Hậu quả: dữ liệu sổ riêng tư nằm lại trong Cache Storage sau khi đăng xuất, và khi mất mạng thì trả bản cũ nên trang hiện "✅ Đã lưu" sai. Đã sửa: request có header `Authorization` không đi qua cache.

### Bước 4.4: Giao diện app ✅
**Đã làm**
- `mobile/src/lib/sync.ts`: giống web; đồng bộ lại mỗi khi app quay lại màn hình (`AppState` = `active`).
- Màn hình `ledger/sign-in` giống bản web; thẻ ☁️ ở màn chọn nơi lưu đã bấm được.
- Tab Sổ thu chi: dòng trạng thái ✅ / 🔄 / ⚠️; **kéo xuống để đồng bộ** (chỉ khi đang lưu trên mạng).
- Cài đặt sổ: mục "Nơi lưu" giống bản web. `Button` có thêm kiểu `danger` (viền đỏ) cho nút "Xóa hẳn trên mạng".
- App chưa có thư viện theo dõi mạng (NetInfo). Có mạng lại thì app gửi bù khi: ghi khoản tiếp theo, quay lại app, kéo xuống, hoặc bấm "Thử lại".

### Bước 4.5: Thử 2 máy cùng tài khoản ✅
Script tự bấm bằng Chrome headless (Chrome DevTools Protocol, mỗi "máy" là 1 hồ sơ trình duyệt riêng).

**Web ↔ web** (10/10 bước qua)
- Máy A tạo tài khoản → dùng vườn mẫu → tự gửi lên ("✅ Đã lưu lên mạng").
- Máy B đăng nhập bằng "+84 9xx xxx xxx" (số được chuẩn hóa), sai mật khẩu thì báo "Số điện thoại hoặc mật khẩu không đúng.", đúng thì nhận đủ 4 khoản, "Lời 4.750.000 đ", 9 hạng mục không trùng.
- B xóa 1 khoản → A tải lại thấy ngay.
- A mất mạng rồi xóa 1 khoản → hiện "⚠️ Chưa gửi được"; có mạng lại tự gửi bù → B nhận được.
- A chuyển về chỉ lưu trên máy, chọn "Xóa hẳn trên mạng" → sổ trên máy A còn nguyên; trong MySQL còn 0 bản ghi của tài khoản, token của A đã bị thu hồi.

**App (Expo web) ↔ web** (7/7 bước qua)
- App tạo tài khoản + vườn mẫu → web đăng nhập nhận đủ sổ.
- Web xóa khoản 9 triệu → app ẩn đi rồi quay lại thì tự nhận ("Lỗ 4.250.000 đ").
- App chuyển về chỉ lưu trên máy, chọn "Giữ lại trên mạng" → web vẫn đồng bộ bình thường.

**Kiểm tra:** 80 test backend, 38 test shared, build + lint web, typecheck mobile đều qua.

**Còn tồn**
- Chưa thử trên điện thoại thật (SQLite + AppState thật). Cần development build.
- Chưa có "Quên mật khẩu": cần OTP qua SMS (nhà cung cấp trả phí). Tạm thời người dùng quên mật khẩu chỉ còn sổ trên máy.
- App chưa tự gửi ngay khi có mạng lại (chưa có NetInfo); xem phần trên.
- Đăng nhập tài khoản khác trên máy đang có sổ thì sổ trên máy được gộp vào tài khoản mới. Đúng như thiết kế "không mất bên nào", nhưng cần cân nhắc hỏi lại người dùng khi đổi tài khoản.

### ⏭️ Việc làm tiếp
- Giai đoạn 4b (đã làm, xem mục phía trên).

---

## 15/10/2026: Đưa mã nguồn lên GitHub ✅
- Repo: https://github.com/anhtuyen25091/DUAN_NHANONG (nhánh `main`)
- Commit đầu tiên `2df37bf` "Khởi tạo dự án Nhà Nông": 329 file.
- Trước khi push đã kiểm tra:
  - Không đưa lên các thư mục `.env`, `vendor/`, `node_modules/`, `dist/`, database SQLite (đã có trong `.gitignore`).
  - Quét nội dung các file: không có mật khẩu admin, APP_KEY hay khóa bí mật nào.
  - `DB_PASSWORD=secret` trong `backend/.env.example` là mật khẩu MySQL mặc định của môi trường dev (giống `docker-compose.yml`).
- Cấu hình git riêng cho dự án này (không đổi cấu hình chung của máy): tên `anhtuyen25091`, email `tuyencnt10@gmail.com`.
- Từ nay, làm xong mỗi phần sẽ commit và push để dễ theo dõi.

---

## 14/10/2026: Giai đoạn 4, Đồng bộ (lưu trên máy + trên mạng), đang làm

### Bước 4.1: Backend: tài khoản và API đồng bộ ✅
**Đã làm**
- Đăng nhập bằng **số điện thoại + mật khẩu**, dùng token Sanctum.
  - Số điện thoại được chuẩn hóa: "+84 912 345 678" thành "0912345678".
  - Chưa làm OTP qua SMS vì cần nhà cung cấp SMS trả phí; để giai đoạn sau.
- Bảng `users`: thêm `phone` (không trùng) và `ledger_version`; cột `email` cho phép trống, vì chỉ tài khoản admin mới cần email.
- Bảng mới `ledger_records`:
  - mỗi dòng là 1 bản ghi của máy, lưu nguyên JSON, gồm `user_id`, `tbl`, `uuid`, `data`, `client_updated_at`, `is_deleted`, `version`
  - một bảng chung cho mọi loại dữ liệu, nên các bảng của chế độ Nâng cao (mùa vụ, vật tư…) không cần thêm migration
- API (`/api/v1`):
  - `POST auth/register`, `POST auth/login` (giới hạn 10 lần/phút), `POST auth/logout`, `GET user`
  - `POST sync/push`:
    - gửi tối đa 500 mục mỗi lần
    - bản có `updated_at` mới hơn thắng; gửi trùng hoặc bản cũ hơn thì bỏ qua
    - khóa dòng user khi ghi, để 2 máy gửi cùng lúc không bị trùng `version`
  - `GET sync/pull?since=`: lấy các mục có `version` lớn hơn lần trước, mỗi lần 500 mục, có `has_more`
  - `DELETE ledger`: xóa hết sổ trên server khi người dùng chuyển về "chỉ lưu trên máy"
- Mục đã xóa vẫn được giữ lại và đồng bộ (dạng "đánh dấu đã xóa"), để máy khác biết mà xóa theo.

**Kiểm tra:** 80 test backend qua (thêm 9 test):
- đăng ký, đăng nhập, trùng số điện thoại
- chưa đăng nhập thì không đồng bộ được
- gửi từ máy này, nhận ở máy khác
- bản mới hơn thắng, gửi trùng không tăng version
- đồng bộ mục đã xóa
- 2 người dùng không xem được dữ liệu của nhau
- chặn tên bảng lạ và thời gian sai định dạng
- chia trang khi có 600 mục
- xóa dữ liệu trên server

**Lỗi tìm thấy khi viết, đã sửa trước khi chạy:**
- So sánh thời gian bằng chuỗi sẽ sai khi máy gửi số chữ số thập phân khác nhau (`…00Z` và `…00.123Z`). Đã chuẩn hóa về cùng 1 dạng trước khi so.
- `(int) $x['since'] ?? 0` báo lỗi khi máy không gửi `since`. Đã sửa thứ tự.

Đã chạy migration trên MySQL dev.

### Bước 4.2: Phần đồng bộ dùng chung (`packages/shared/src/sync.ts`) ✅
**Đã làm**
- `api.ts`: thêm `register`, `login`, `logout`, `me`, `syncPush`, `syncPull`, `deleteServerLedger`. Token truyền vào từng lần gọi, không lưu ở biến chung.
- `LedgerMeta` có thêm:
  - `account`: token, tên, số điện thoại
  - `sync_version`: đã nhận từ server tới đâu
  - `last_pushed_at`: mốc đã gửi lên
  - `last_synced_at`
- `Ledger.changedSince(mốc)`: lấy các mục đổi sau lần gửi trước, để mỗi lần chỉ gửi phần thay đổi.
- Class `SyncEngine`:
  - `syncNow()`: gửi phần đã đổi (mỗi lần 500 mục) → nhận phần mới (theo trang) → gộp, bản mới hơn thắng.
  - `start()`: tự đồng bộ sau mỗi lần ghi, chờ 1,5 giây để gom nhiều lần bấm thành 1 lần gửi. Nếu đang đồng bộ thì chạy thêm 1 lần ngay sau đó.
  - `enable(token, user)`: bật "lưu cả trên mạng"; gửi toàn bộ sổ trên máy lên rồi nhận về những gì đã có trên mạng. Khi đổi máy, hai bên được gộp, không mất bên nào.
  - `disable(xóaTrênMạng)`: về "chỉ lưu trên máy"; nếu chọn xóa thì gọi `DELETE /ledger`. Không có mạng thì báo lỗi và không đổi gì, để người dùng không tưởng là đã xóa.
  - Trạng thái hiển thị (`SYNC_STATUS_LABELS`): 📱 off, ✅ saved, 🔄 syncing, ⚠️ offline, ⚠️ expired (cần đăng nhập lại).

**Lỗi tìm thấy nhờ test, đã sửa** (cả 3 là lỗi thật, không chỉ của test)
1. **Hai thao tác trong cùng 1 mili-giây**, ví dụ tạo rồi xóa ngay một khoản, có cùng `updated_at`, nên server bỏ qua lệnh xóa.
   - Cách sửa: đồng hồ của sổ luôn tăng. Mỗi lần ghi lớn hơn lần trước ít nhất 1 ms và lớn hơn mọi bản nhận từ máy khác.
   - Nhờ vậy, sửa trên máy luôn thắng bản cũ, kể cả khi đồng hồ máy kia chạy nhanh.
2. **Hạng mục bị trùng:** mỗi máy tạo hạng mục mặc định với mã ngẫu nhiên, nên khi đồng bộ 2 máy sẽ thấy "Phân bón" 2 lần.
   - Cách sửa: hạng mục mặc định dùng mã cố định (`defaultCategoryId`), hai máy tự gộp làm một.
   - Lưu ý: sổ đã tạo trên máy dev trước bản sửa này vẫn giữ mã cũ (ngẫu nhiên). Chưa có người dùng thật nên không ảnh hưởng.
3. **Ghi khoản đúng lúc đang đồng bộ** thì khoản đó chưa được gửi, phải đợi tới lần ghi sau. Đã sửa: chạy thêm 1 lần ngay sau đó.
- Đã bỏ việc "tự chạy lại khi còn mục chưa gửi", vì có thể lặp mãi khi đồng hồ máy khác chạy nhanh.

**Kiểm tra**
- 38 test `packages/shared` qua, thêm 8 test đồng bộ dùng server giả mô phỏng 2 máy:
  - máy 2 nhận đủ sổ và không trùng hạng mục
  - sửa và xóa truyền sang máy kia
  - mất mạng thì báo ⚠️, có mạng lại thì gửi bù
  - lần sau chỉ gửi phần đã đổi
  - token hết hạn
  - tắt đồng bộ và xóa trên mạng
  - tự gửi sau khi ghi
  - ghi đúng lúc đang đồng bộ
- Typecheck web và mobile không lỗi. 80 test backend vẫn qua.

### ⏭️ Việc làm tiếp (ngày mai)
- **Bước 4.3, giao diện web:**
  - Màn hình đăng nhập/đăng ký bằng số điện thoại khi chọn thẻ "☁️ Lưu cả trên mạng" (bỏ chữ "Sắp có").
  - Biểu tượng trạng thái ✅ / 🔄 / ⚠️ trên trang sổ.
  - Cài đặt sổ: đổi nơi lưu; khi chuyển về "chỉ lưu trên máy" thì hỏi có xóa trên mạng không.
  - Tự đồng bộ khi có mạng lại (sự kiện `online`) và khi quay lại tab.
- **Bước 4.4, giao diện app:** giống web; đồng bộ khi app quay lại màn hình (`AppState`).
- **Bước 4.5:** thử 2 máy thật (2 trình duyệt) cùng tài khoản, rồi cập nhật README.
- Sau đó: **giai đoạn 4b** (Sổ thu chi Nâng cao), rồi **giai đoạn 6** (Phát hành).

---

## 14/10/2026: Giai đoạn 3, Sổ thu chi Cơ bản (lưu trên máy) ✅

### Bước 3.1: Phần lõi dùng chung (`packages/shared/src/ledger.ts`) ✅
**Đã làm**
- Class `Ledger` giữ dữ liệu trong bộ nhớ và ghi xuống máy qua interface `LedgerStorage`. Web sẽ dùng IndexedDB, app dùng SQLite.
- Vườn: thêm, sửa, xóa.
  - Xóa vườn thì các khoản của vườn chuyển thành "chi chung" để không mất tiền.
  - Có hoàn tác.
- Khoản Tiền vào / Tiền ra: thêm, sửa, xóa, có hoàn tác. App nhớ vườn dùng gần nhất.
- Lần đầu mở tự tạo các hạng mục mặc định (Phân bón, Thuốc, Nhân công…). Có thể tạo "Vườn mẫu" để bấm thử.
- Sao lưu và nhập file JSON. Khi gộp dữ liệu, bản ghi có `updated_at` mới hơn sẽ thắng; nhập lại cùng một file không bị trùng.
- Các hàm tổng kết:
  - `totals`: lời/lỗ
  - `monthlyTotals`: theo tháng
  - `totalsByCategory`: theo hạng mục
  - `groupByDate`: gom theo ngày
- Bàn phím tiền `pressAmountKey`: có phím số, "000", "nghìn", "triệu", xóa.

**Kiểm tra:** 30 test `packages/shared` qua (thêm 12 test cho sổ thu chi), typecheck không lỗi.

### Bước 3.2: Giao diện Sổ thu chi trên web ✅
**Đã làm**
- Dữ liệu sổ lưu trong IndexedDB của trình duyệt (`web/src/ledger/storage.ts`).
- Phần sổ được tải riêng (code splitting, file `LedgerRoutes` khoảng 8 KB gzip), nên trang bảng giá không nặng thêm.
- Menu đầu trang có thêm mục "Sổ thu chi", và gọn lại 1 dòng trên điện thoại.
- Các trang:
  - `#/so`, mở lần đầu: hỏi lưu ở đâu bằng 2 thẻ lớn. "📱 Chỉ lưu trên máy này" dùng được ngay; "☁️ Lưu cả trên mạng" ghi "Sắp có", chờ giai đoạn 4.
  - `#/so`: chọn Tháng này / Năm nay / Tất cả.
    - Thẻ Lời/Lỗ: xanh là lời, đỏ là lỗ.
    - Danh sách vườn kèm lời/lỗ từng vườn, mục "Chi chung", các khoản ghi gần đây.
    - Nút nổi "＋ Ghi tiền".
    - Chưa có vườn thì có nút "Thêm vườn" và "Dùng vườn mẫu để bấm thử".
  - `#/so/ghi`: ghi 1 khoản trong 3 bước: chọn Tiền ra / Tiền vào và bấm icon hạng mục → nhập số tiền → Lưu.
    - Bàn phím số to, có phím 000, nghìn, triệu, xóa, xóa hết. Bàn phím máy tính cũng gõ được.
    - Dưới số tiền có dòng đọc chữ, ví dụ "350 nghìn đồng".
    - Vườn mặc định là vườn dùng gần nhất. Ngày và ghi chú ẩn trong mục mở thêm.
    - `?sua=id` để sửa khoản đã ghi; phím số đầu tiên thay số cũ chứ không gõ nối vào.
  - `#/so/vuon/:id`: lời/lỗ năm nay và từ trước tới nay, biểu đồ cột thu chi 6 tháng, các khoản gom theo ngày, nút xóa có "Hoàn tác" trong 6 giây, nút xóa vườn.
  - `#/so/vuon-moi`, `#/so/vuon/:id/sua`: thêm hoặc sửa vườn (tên, cây trồng, diện tích, ghi chú).
  - `#/so/cai-dat`: tải file sao lưu JSON, nhập lại từ file, xóa hết sổ trên máy (có hỏi xác nhận).

**Kiểm tra**
- Typecheck, lint và build đều qua.
- Viết script tự bấm trong Chrome headless (`/private/tmp/claude-501/e2e/cdp.mjs`, dùng Chrome DevTools Protocol) và chạy hết luồng sau:
  - Chọn "Chỉ lưu trên máy" → dùng vườn mẫu → Ghi tiền → Phân bón → bấm 3, 5, 0, nghìn ra 350.000 đ → Lưu. Lời tính lại đúng: 9.000.000 − 4.250.000 − 350.000 = 4.400.000 đ.
  - Xóa 1 khoản rồi Hoàn tác: còn đủ 5 khoản. Sửa 1 khoản: bấm 7 thì số thành 7 đ, không nối vào số cũ.
  - Tải lại trang: dữ liệu vẫn còn, 5 khoản.

**Lỗi tìm thấy và đã sửa**
- Khi sửa một khoản, bấm số thì số mới bị gõ nối vào số cũ, dễ sai thành vài trăm tỷ. Đã sửa: phím số đầu tiên thay số cũ.
- Thanh menu bị xuống dòng trên màn hình điện thoại. Đã sửa.

### Bước 3.3: Sổ thu chi trên app mobile ✅
**Đã làm**
- Dữ liệu lưu trong SQLite trên điện thoại (`mobile/src/lib/ledger.ts`):
  - 1 bảng `records` (tên bảng, id, dữ liệu JSON) và 1 bảng `meta`
  - Lưu dạng JSON nên sau này thêm trường mới không phải đổi cấu trúc bảng
  - Riêng bản xem trước trên trình duyệt (Expo web) dùng localStorage
- Tab mới "📒 Sổ thu chi", đứng thứ 2 sau Bảng giá, có nút "⚙️ Cài đặt" ở góc trên.
- Các màn hình giống bản web:
  - mở lần đầu: chọn nơi lưu
  - trang chính: Tháng này / Năm nay / Tất cả, thẻ Lời/Lỗ, danh sách vườn, các khoản ghi gần đây, nút "＋ Ghi tiền"
  - `ledger/add`: ghi khoản trong 3 bước, bàn phím số to, khi sửa thì phím đầu tiên thay số cũ
  - `ledger/garden/[id]`: chi tiết vườn, biểu đồ cột 6 tháng (react-native-svg), nút xóa vườn
  - `ledger/garden-form`: thêm/sửa vườn
  - `ledger/settings`: sao lưu, nhập file, xóa hết
- Xóa một khoản thì hiện thông báo kèm nút "Hoàn tác" trong 6 giây (`ToastHost` đặt ở layout gốc).
- Sao lưu: ghi file JSON vào bộ nhớ đệm rồi mở bảng chia sẻ (`expo-sharing`), để gửi qua Zalo hoặc lưu Google Drive. Nhập lại bằng `File.pickFileAsync` của `expo-file-system`, nên không cần cài `expo-document-picker`.
- Cài thêm `expo-file-system` và `expo-sharing`. Hai thư viện này cần build lại development build.
- Thêm `accessibilityRole="button"` cho phím số, nút xóa, nút Hoàn tác và các nút trên thanh tiêu đề, để trình đọc màn hình đọc đúng.

**Kiểm tra**
- Typecheck mobile không lỗi.
- Bấm tự động trên bản app chạy trong trình duyệt (Expo web):
  - chọn nơi lưu → vườn mẫu (Lời 4.750.000 đ) → Ghi tiền → Thuốc → bấm 2, 5, 0, nghìn ra 250.000 đ → Lưu → còn Lời 4.500.000 đ (đúng)
  - mở trang vườn được, xóa khoản 9 triệu thì thành "Lỗ 4.250.000 đ", bấm Hoàn tác thì về lại "Lời 4.750.000 đ"
- **Chưa thử trên điện thoại thật**: phần lưu SQLite và bảng chia sẻ file chỉ chạy được trên máy thật hoặc development build.

**Ghi chú môi trường**
- Expo thỉnh thoảng bị segfault (exit 139) ngay cả khi chạy với `CI=1`; chạy lại thì được.
- Đổi file route thì phải khởi động lại Expo để nó sinh lại `.expo/types`, nếu không typecheck sẽ báo lỗi đường dẫn.

### Bước 3.4: Bản web thành PWA (cài ra màn hình chính, dùng khi mất mạng) ✅
**Đã làm**
- `web/public/manifest.webmanifest`:
  - tên app, màu chủ đạo, icon 192 và 512 (tạo từ icon của app mobile)
  - lối tắt "Ghi tiền" và "Bảng giá"
- `web/public/sw.js` (service worker tự viết, không thêm thư viện):
  - trang, JS, CSS: lấy từ cache trước
  - API giá: lấy mạng trước, mất mạng thì dùng bản đã lưu gần nhất
  - đổi `VERSION` trong file để xóa cache cũ
- Chỉ đăng ký service worker ở bản build, không bật khi dev để tránh giữ file cũ lúc sửa code.
- Thay favicon mặc định của Vite (màu tím) bằng icon của app. Thêm `theme-color` và `apple-touch-icon`.

**Kiểm tra** (chạy bản build bằng `vite preview`, dùng Chrome headless)
- Service worker ở trạng thái `activated`; có 6 file trong cache trang và 2 phản hồi API.
- Ngắt mạng rồi tải lại trang:
  - Sổ thu chi vẫn mở, đủ dữ liệu ("Lời 4.750.000 đ")
  - Bảng giá vẫn hiện giá đã lưu
- Dung lượng tải lúc đầu khoảng 68 KB JS gzip, đạt mục tiêu dưới 200 KB. Phần sổ tải riêng khoảng 8 KB.

**Kết quả giai đoạn 3:** xong bản Cơ bản trên cả web và app.

**Còn tồn**
- Chưa thử với nông dân thật (kế hoạch: 5–10 người, đo thời gian ghi 1 khoản và số lần bấm nhầm).
- Chưa thử app trên điện thoại thật.
- Chưa có nhập ghi chú bằng giọng nói riêng (vẫn dùng được nút micro của bàn phím điện thoại) và chưa có chụp ảnh hóa đơn.

---

## 14/10/2026: Chạy thử toàn bộ dưới máy

**Đã làm**
- Bật Docker Desktop, chạy `docker compose up -d --wait` để có MySQL 8.4 và Redis 7.
- `php artisan migrate --seed`: tạo bảng, danh mục, khu vực, nguồn giá.
- Lấy dữ liệu thật:
  - `php artisan crawl:run`: được 33 giá hôm nay (cà phê, hồ tiêu, lúa gạo, phân bón sỉ Vinacam).
  - `php artisan crawl:run --date=...` cho 14 ngày trước: lấy thêm được giá hồ tiêu và lúa gạo ngày 03/10 và 30/09.
  - Kết quả: 65 giá.
  - Nguồn Vinacam lưu giá theo "ngày cập nhật" ghi trên trang (02/10), nên chạy nhiều ngày chỉ ghi đè đúng 1 bản ghi. Đây là hành vi đúng.
- `php artisan shops:import-osm`: thêm 33 điểm bán từ OpenStreetMap.
- Tạo tài khoản admin dev `admin@nhanong.local`. Mật khẩu không ghi vào đây; muốn đặt lại thì chạy `php artisan make:filament-user`.
- Chạy 3 server:
  - Backend: `php artisan serve --host=0.0.0.0 --port=8000`
  - Web: `npx vite --host 0.0.0.0 --port 5173` (trong `web/`)
  - Bản xem trước app trên trình duyệt: `CI=1 npx expo start --web --port 8081` (trong `mobile/`)
- Cài thêm `react-native-web` cho mobile để xem app ngay trên trình duyệt.

**Lỗi gặp và cách sửa**
- Expo báo `Cannot find module 'expo-router/_ctx-shared'`.
  - Nguyên nhân: `expo-router`, `react-native-reanimated`, `react-native-gesture-handler`, `react-native-worklets` và `react-is` bị npm đặt riêng trong `mobile/node_modules`, trong khi `@expo/router-server` nằm ở `node_modules` gốc nên không tìm thấy chúng.
  - Cách sửa: xóa các mục `mobile/node_modules/*` trong `package-lock.json`, xóa `mobile/node_modules`, rồi chạy lại `npm install`. Các gói đã về thư mục gốc.
- App chạy trên web bị crash vì `Notifications.getLastNotificationResponse` không có trên web.
  - Cách sửa: trong `mobile/src/app/_layout.tsx`, bỏ qua phần thông báo đẩy khi `Platform.OS === 'web'`.
- Expo chạy ở chế độ theo dõi file thì bị segfault (exit 139), phải chạy với `CI=1`.
  - Hệ quả: sửa code xong phải khởi động lại Expo, không tự nạp lại.
  - Có thể chỉ xảy ra trong môi trường chạy lệnh của Claude Code. Cần thử `npm run mobile` trên terminal thường.

**Kiểm tra**
- Đã gọi thật các API: `/health`, `/prices`, `/shops`, `/shops?lat=&lng=` (ra 8 điểm trong 50 km quanh TP.HCM), `/admin/login`. Tất cả trả về đúng.
- Đã chụp màn hình bằng Chrome headless và thấy hiển thị đúng:
  - Web: bảng giá, trang mặt hàng, danh sách điểm bán, form thêm điểm
  - App (Expo web): tab Bảng giá, tab Điểm bán

**Còn tồn**
- Nhiều điểm bán từ OSM không có tỉnh, nên lọc theo tỉnh chỉ ra được vài điểm. Cách xử lý dự kiến: suy ra tỉnh từ tọa độ khi nhập.
- Biểu đồ giá còn ít điểm dữ liệu vì mới bắt đầu thu thập. Dữ liệu sẽ tăng dần theo ngày.
- `php artisan test` bị segfault, phải chạy `php vendor/bin/phpunit`.

---

## 14/10/2026: Điểm bán / thu mua (giai đoạn 5)

**Đã làm**
- Backend:
  - Bảng `shops` và `shop_submissions`
  - API `GET /shops` (lọc theo loại, tỉnh, từ khóa, hoặc theo vị trí + bán kính), `GET /provinces`, `POST /shop-submissions`
  - Lệnh `shops:import-osm` và `shops:import-csv`
  - Trang admin Filament: quản lý điểm bán, duyệt đề xuất của người dùng
- `packages/shared`:
  - Kiểu dữ liệu `Shop`, `ShopFilters`, `ShopSubmission`
  - Các hàm `api.shops()`, `api.provinces()`, `api.submitShop()`
  - Hàm tạo link `telHref`, `directionsUrl` và hàm hiển thị khoảng cách `formatDistance`
- Web:
  - Trang `#/diem-ban`: lọc theo loại, tỉnh, từ khóa; nút "Gần tôi"; gọi điện; chỉ đường; báo sai; xem thêm
  - Trang `#/diem-ban/de-xuat`: form thêm điểm hoặc báo sai
  - Thanh menu đầu trang: Bảng giá / Điểm bán
  - Trình duyệt tự sinh mã máy (uuid) và lưu trong localStorage, dùng để gửi đề xuất
- Mobile:
  - Tab "Điểm bán", có nút nổi "＋ Thêm điểm", cuộn tới cuối thì tự tải thêm
  - Màn hình `shop/new`
  - Cài `expo-location` cho nút "Gần tôi". Thư viện này cần build lại development build.

**Kiểm tra**
- 71 test backend qua.
- 18 test `packages/shared` qua.
- Build web và typecheck mobile không lỗi.

---

## 14/10/2026: Giai đoạn 0–2 (khởi tạo, giá, cảnh báo)

**Đã làm**
- Monorepo gồm `backend/` (Laravel 13), `web/` (React + Vite), `mobile/` (Expo), `packages/shared/`. MySQL và Redis chạy bằng docker-compose.
- Crawler:
  - Các adapter `SitemapArticleAdapter` (đọc bài báo giá hằng ngày) và `PageTableAdapter` (đọc bảng giá cố định)
  - Lưu HTML gốc vào `crawl_logs`, ánh xạ tên sản phẩm, đánh dấu giá bất thường
  - Lịch chạy 8:30 và 14:30
- Nguồn giá: vietbao (cà phê, hồ tiêu, lúa gạo), baohatinh (phân bón), Vinacam (phân bón sỉ).
- Trang admin Filament tại `/admin`; lệnh `admin:grant` để cấp quyền admin.
- API giá: `/prices`, `/products/{code}/history`, `/categories`, `/regions`.
- Web và app có bảng giá và trang mặt hàng với biểu đồ 7/30/90 ngày.
- Cảnh báo giá:
  - Nhận diện máy bằng header `X-Device-Id`
  - 3 loại cảnh báo: khi giá thay đổi, khi giá lên tới, khi giá xuống tới
  - Lệnh `alerts:send` chạy lúc 9:30 và 15:30, gửi qua Expo Push
