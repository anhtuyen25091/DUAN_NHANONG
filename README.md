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
- Bản web là PWA: cài được ra màn hình chính và dùng được khi mất mạng (`web/public/sw.js`, chỉ bật ở bản build).
  - Thử chế độ này bằng: `npm run build -w web && npx vite preview` trong `web/`.

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
