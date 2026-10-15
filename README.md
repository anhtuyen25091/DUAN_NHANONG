# Nhà Nông

Ứng dụng cho nhà nông: giá nông sản, giá phân bón và thuốc BVTV, danh bạ điểm mua bán, sổ thu chi theo vườn.

| Thư mục | Nội dung |
|---|---|
| `backend/` | Laravel 13 + MySQL: API (`/api/v1`), crawler, trang quản trị Filament (`/admin`) |
| `web/` | React + Vite (sẽ làm thành PWA) |
| `mobile/` | React Native (Expo) cho Android và iOS |
| `packages/shared/` | Code TypeScript dùng chung: kiểu dữ liệu, định dạng tiền, logic đồng bộ |

Kế hoạch chi tiết: xem file kế hoạch dự án (`text.html` là yêu cầu gốc).

## Yêu cầu
PHP 8.4, Composer, Node 24, Docker.

## Chạy môi trường dev

```bash
# 1. MySQL + Redis
docker compose up -d

# 2. Backend
cd backend
cp .env.example .env   # lần đầu
php artisan key:generate   # lần đầu
php artisan migrate --seed       # tạo bảng + danh mục, khu vực, nguồn giá
php artisan make:filament-user   # tạo tài khoản
php artisan admin:grant email@cua-ban.vn   # cấp quyền vào /admin
composer run dev       # API: http://localhost:8000, admin: /admin

# 3. Web + mobile (chạy ở thư mục gốc)
npm install
npm run web            # http://localhost:5173
npm run mobile         # quét QR bằng app Expo Go
```

## Thu thập giá

```bash
php artisan crawl:run                          # mọi nguồn đang bật, ngày hôm nay
php artisan crawl:run vietbao-ho-tieu --date=2026-10-14
```

Lịch tự động: 8:30 và 14:30 hằng ngày (cần chạy `php artisan schedule:work` hoặc cron `schedule:run`, và `php artisan queue:work`).
Thêm/sửa nguồn, duyệt giá bất thường, gán tên chưa nhận diện: vào `/admin`.

| Nguồn | Dữ liệu |
|---|---|
| vietbao.vn | Cà phê, hồ tiêu theo tỉnh; lúa gạo An Giang |
| baohatinh.vn | Phân bón (chuỗi bài có vẻ đã dừng từ 05/2026, cần nguồn thay thế) |

API: `GET /api/v1/prices`, `/api/v1/products/{code}/history`, `/api/v1/categories`, `/api/v1/regions`.

## Cảnh báo giá (thông báo đẩy)

- App không cần đăng nhập: mỗi máy tự sinh một uuid và gửi trong header `X-Device-Id`.
  - `PUT /api/v1/device`: lưu Expo push token của máy
  - `GET`/`POST /api/v1/alerts`, `DELETE /api/v1/alerts/{id}`: xem, thêm, xóa cảnh báo (tối đa 50 cảnh báo mỗi máy)
- Ba loại cảnh báo:
  - **khi giá thay đổi**: báo 1 lần mỗi ngày có giá mới
  - **khi giá lên tới / xuống tới một mức**: báo 1 lần lúc giá vượt mức; giá quay lại rồi vượt lần nữa thì mới báo tiếp
- Lệnh `php artisan alerts:send` chạy tự động lúc 9:30 và 15:30, sau mỗi lần thu thập giá. Thông báo được gửi qua Expo Push API.
- Thông báo đẩy **không chạy trong Expo Go trên Android**. Muốn thử cần:
  - một development build: `npx eas-cli@latest build --profile development`
  - chạy `eas init` để có `projectId`
  - khai báo FCM (Android) và APNs (iOS) trên EAS
- Bản web chỉ xem giá và biểu đồ; muốn nhận cảnh báo thì cài app.

## Điểm bán / thu mua

```bash
php artisan shops:import-osm                              # lấy từ OpenStreetMap (miễn phí, còn ít dữ liệu)
php artisan shops:import-csv ds-dai-ly.csv --source="Sở NN&MT Đắk Lắk" --verified
```

- File CSV (UTF-8, có dòng tiêu đề) gồm các cột `ten, loai, dia_chi, tinh, sdt, mat_hang, lat, lng`. Chỉ cột `ten` là bắt buộc.
  - `loai` nhận `thu_mua`, `phan_bon`, `thuoc_bvtv`, nhiều loại thì cách nhau bằng `|`. Để trống thì hệ thống tự đoán theo tên.
  - Dùng cho danh sách cơ sở đủ điều kiện buôn bán phân bón / thuốc BVTV mà Sở NN&MT các tỉnh công bố.
- API:
  - `GET /api/v1/shops?type=&province=&q=&lat=&lng=&radius=&page=`: có `lat`/`lng` thì trả điểm trong bán kính (mặc định 30 km), sắp từ gần đến xa
  - `GET /api/v1/provinces`: 34 tỉnh/thành kèm số điểm bán
  - `POST /api/v1/shop-submissions`: người dùng đề xuất điểm mới hoặc báo sai, cần header `X-Device-Id`, tối đa 10 lần mỗi giờ
- Đề xuất của người dùng chỉ hiện sau khi được duyệt trong `/admin` (mục "Người dùng đề xuất").
- Web (`#/diem-ban`) và app (tab Điểm bán) có:
  - lọc theo loại, tỉnh và từ khóa
  - nút "Gần tôi" dùng vị trí của máy
  - nút gọi điện và nút chỉ đường (mở Google Maps)
  - form thêm điểm mới hoặc báo sai
- Chưa có bản đồ để giữ app nhẹ. Khi cần sẽ thêm Leaflet cho web và react-native-maps cho app.

## Sổ thu chi

- Mặc định chỉ lưu trên máy: web dùng IndexedDB, app dùng SQLite. Không gửi gì lên server.
- Phần lõi (vườn, khoản thu chi, tổng kết, sao lưu, bàn phím tiền) nằm ở `packages/shared/src/ledger.ts` và dùng chung cho web và app.
  - Phần lưu trữ của từng nơi: `web/src/ledger/storage.ts` và `mobile/src/lib/ledger.ts`.
- Web: `#/so`. App: tab "📒 Sổ thu chi".
- Sao lưu ra file JSON và nhập lại trong mục Cài đặt sổ.
- **Chế độ Nâng cao** (bật trong Cài đặt sổ; tắt đi thì dữ liệu vẫn giữ):
  - **Mùa vụ:** mỗi vườn có các vụ (từ ngày → đến ngày, không được trùng nhau). Khoản thu chi tự thuộc vụ theo ngày + vườn. Trang vườn xem lời/lỗ theo vụ.
  - **Kho vật tư** (web `#/so/kho`, app `ledger/supplies`): mua vật tư ghi 1 khoản tiền ra "chi chung"; "Dùng cho vườn" chuyển phần tiền tương ứng sang vườn đó (`allocatedEntries`), tổng cả sổ không đổi. Có thể mua thiếu (tự ghi công nợ) hoặc dùng hết ngay cho 1 vườn.
  - **Công nợ** (web `#/so/no`, app `ledger/debts`): mua thiếu / bán chịu ghi vào lời/lỗ lúc phát sinh; mỗi lần trả/thu chỉ làm giảm số còn nợ. Có hẹn ngày trả, báo quá hạn.
  - **Bán cho lái** (web `#/so/ban`, app `ledger/contracts`; dùng cho sầu riêng…):
    - lái đặt cọc trước, sau đó cắt nhiều đợt; mỗi đợt ghi nhiều loại hàng (kg × giá)
    - cọc không tính vào lời/lỗ; tiền vào = giá trị hàng của từng đợt; mỗi đợt tự nhập số trừ cọc
    - kết thúc bằng: đóng hợp đồng (cọc trừ hết), lái bỏ cọc (phần còn lại thành tiền vào), hoặc trả lại cọc (phần đền thêm là tiền ra)
  - **Tiền vay** (loại nợ "Mình đi vay"):
    - tiền gốc không tính vào lời/lỗ
    - mỗi lần trả ghi gốc + lãi; tiền lãi là tiền ra, hạng mục "🏦 Lãi vay"
    - có lãi suất %/năm để ước tính lãi mỗi tháng
  - **Lịch trả nợ vay:**
    - bên cho vay: chọn trong danh sách ngân hàng, hoặc quỹ tín dụng / cá nhân / doanh nghiệp
    - lãi suất %/năm hoặc %/tháng
    - 3 cách trả: lãi hằng tháng gốc cuối kỳ / trả góp gốc đều / trả 1 lần
    - hiện lịch từng kỳ và **tổng lãi đến khi tất toán**
    - thẻ "🔔 Sắp đến hạn" trên trang sổ; app có thông báo nhắc (bật trong Cài đặt sổ, cần bản build riêng trên Android)
  - **Nợ gom theo người:** cửa hàng mua thiếu nhiều lần hiện 1 dòng; "Trả gộp" trừ vào lần nợ cũ nhất trước.
  - **Thẻ "Tình hình tài chính"** trên trang sổ: tiền vay còn phải trả, nợ cửa hàng, người ta còn nợ mình, cọc lái chưa trừ.
  - Phần lõi: `packages/shared/src/ledger.ts` (thao tác) và `packages/shared/src/advanced.ts` (tính toán).
- **Lưu cả trên mạng** (người dùng tự chọn): đăng nhập bằng số điện thoại + mật khẩu (web `#/so/dang-nhap`, app `ledger/sign-in`).
  - Sổ vẫn nằm trên máy; mỗi lần ghi sẽ tự gửi lên sau 1,5 giây, rồi nhận phần mới từ máy khác (bản sửa mới hơn thắng).
  - Tự đồng bộ lại khi: mở sổ, có mạng lại (web), quay lại tab/app, hoặc kéo xuống trên app.
  - Biểu tượng trên trang sổ: ✅ đã lưu, 🔄 đang gửi, ⚠️ chưa gửi được / cần đăng nhập lại.
  - Cài đặt sổ: "Đồng bộ ngay"; "Chuyển về chỉ lưu trên máy" (chọn giữ hoặc xóa hẳn sổ trên mạng).
  - Phần lõi: `packages/shared/src/sync.ts`; khởi động ở `web/src/ledger/sync.ts` và `mobile/src/lib/sync.ts`.
  - API: `POST /api/v1/auth/register|login|logout`, `GET /api/v1/user`, `POST /api/v1/sync/push`, `GET /api/v1/sync/pull?since=`, `DELETE /api/v1/ledger`.
- Bản web là PWA: cài được ra màn hình chính và dùng được khi mất mạng (`web/public/sw.js`, chỉ bật ở bản build).
  - Thử chế độ này bằng: `npm run build -w web && npx vite preview` trong `web/`.

## Phân quyền xem lịch sử giá

- Khách xem 10 ngày gần nhất, tài khoản đăng ký (số điện thoại) xem 30 ngày, tài khoản có gói xem toàn bộ (tới 5 năm). Cấu hình: `backend/config/nhanong.php`.
- Server cắt theo mức tài khoản, tính từ hôm nay; khoảng > 120 ngày gộp theo tuần, > 2 năm gộp theo tháng.
- Gói tháng / năm và giá: `/admin` → Gói xem giá. Kích hoạt / gia hạn / hủy gói cho người dùng: `/admin` → Tài khoản (chưa có thanh toán trong app).
- API: `GET /api/v1/products/{code}/history?days=` (gửi token nếu đã đăng nhập), `GET /api/v1/plans`.

## Đơn mua bán chung 2 bên

- Dành cho thương lái / chi nhánh thu mua / nông dân. Người tạo chọn mình là bên mua hay bên bán; bên kia tham gia bằng **mã 6 ký tự**.
- Mục của đơn: cọc, đợt cân (nhiều loại hàng × kg × giá, trừ cọc, trả ngay), trả tiền, chi phí riêng (chỉ người ghi thấy).
- Cả 2 bên ghi được; mục chờ bên kia **Đồng ý / Báo sai** (kèm lý do); sửa mục đã xác nhận thì phải xác nhận lại.
- Thương lái gộp các đơn mua vào đơn bán để tính **lời cả lô** và hao hụt kg.
- Nối đơn với Sổ thu chi: đợt cân đã xác nhận tự thành tiền vào / tiền ra của vườn đã chọn (đổi vườn được).
- Thông báo khi bên kia ghi / xác nhận: web / app hỏi server 8 giây/lần (`DealWatcher` trong `packages/shared`).
- Web `#/don`, app tab "🤝 Đơn". API: `/api/v1/deals`, `/deals/join`, `/deals/{uuid}/entries`, `/deal-entries/{uuid}/confirm|dispute`, `/deals/{uuid}/sources`.

## Dữ liệu giá cũ, xuất / nạp dữ liệu giá

```bash
php artisan crawl:backfill baoquocte-ca-phe baoquocte-ho-tieu --from=2021-11   # cà phê, tiêu
php artisan crawl:backfill congthuong-lua-gao --from=2021-10                   # lúa gạo An Giang
php artisan crawl:backfill agro-gov --from=2021-10                             # agro.gov.vn: lúa, phân bón An Giang
php artisan crawl:backfill thcl-sau-rieng --from=2024-07                       # sầu riêng
scripts/export-prices.sh                    # xuất danh mục + nguồn + giá → exports/*.sql.gz
gunzip -c exports/nhanong-gia-….sql.gz | mysql --default-character-set=utf8mb4 -u nhanong -p nhanong
```
Chạy lại được: bài / tháng đã lấy thì bỏ qua.

### Ghi nhanh, thu hoạch, nhân công, thông tin tự thêm
- **Khoản hay dùng:** khi ghi tiền, tích "Lưu làm khoản hay dùng"; lần sau bấm 1 lần là điền sẵn. Quản lý trong Cài đặt sổ.
- **Thông tin tự thêm:** tự tạo ô riêng (chữ / số / ngày / lựa chọn) cho vườn, khoản thu chi, vật tư. Giá trị lưu trong `extra` của từng bản ghi.
- **Thu hoạch** (Nâng cao): ghi sản lượng theo vườn, có giá thì tự ghi tiền bán. Trang vườn hiện giá thành đ/kg (tự cộng cả số kg đã cắt bán cho lái).
- **Nhân công** (Nâng cao): người làm + tiền công/ngày, chấm công nhiều người 1 lần. Trả công thì tự ghi khoản "Nhân công" theo từng vườn.
- Phần lõi: `packages/shared/src/ledger.ts` (các bảng `templates`, `harvests`, `workers`, `work_logs`, `custom_fields`) và `extras.ts` (các hàm tính).

## Mobile khi dev

App tự gọi backend theo IP của máy đang chạy Metro, cổng 8000. Vì vậy cần chạy Laravel cho điện thoại cùng mạng truy cập được:

```bash
cd backend && php artisan serve --host=0.0.0.0
```

Hoặc đặt `EXPO_PUBLIC_API_URL=https://...` trong `mobile/.env`. Bản web gọi `/api` qua proxy của Vite; khi build production thì đặt `VITE_API_URL`.

## Kiểm tra

```bash
cd backend && php artisan test   # test backend
npm test                         # test packages/shared
npm run typecheck                # shared + build web + typecheck mobile
```
