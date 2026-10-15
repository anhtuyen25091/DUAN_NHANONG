# Nhật ký dự án Nhà Nông

File này ghi lại các việc đã làm theo từng ngày. Mục mới nhất nằm trên cùng.

- Kế hoạch gốc: `text.html` (yêu cầu) và README (cách chạy).
- Mỗi mục ghi các phần sau:
  - **Đã làm**
  - **Kiểm tra**: đã thử gì, kết quả ra sao
  - **Còn tồn**: lỗi đã biết, việc chưa xong
  - **Tiếp theo**

---

## Link xem thử khi chạy dưới máy

Các link chỉ mở được khi các server đang chạy. Cách bật server: xem mục "Cách chạy lại" bên dưới.

**Trên máy tính**

| Chức năng | Link |
|---|---|
| Bảng giá nông sản, phân bón, thuốc BVTV | http://localhost:5173/ |
| Biểu đồ giá một mặt hàng (ví dụ cà phê) | http://localhost:5173/#/san-pham/ca-phe-robusta |
| Danh sách điểm bán / thu mua | http://localhost:5173/#/diem-ban |
| Form thêm điểm bán mới | http://localhost:5173/#/diem-ban/de-xuat |
| Sổ thu chi (web) | http://localhost:5173/#/so |
| Kho vật tư / Công nợ (web, cần bật Chế độ Nâng cao) | http://localhost:5173/#/so/kho · http://localhost:5173/#/so/no |
| Kho vật tư / Công nợ (app) | http://localhost:8081/ledger/supplies · http://localhost:8081/ledger/debts |
| Đăng nhập để lưu cả trên mạng (web) | http://localhost:5173/#/so/dang-nhap |
| Đăng nhập để lưu cả trên mạng (app) | http://localhost:8081/ledger/sign-in |
| Sổ thu chi (app, tab 📒) | http://localhost:8081/ledger |
| App điện thoại xem trên trình duyệt (tab Bảng giá, Điểm bán, Cảnh báo) | http://localhost:8081/ |
| Trang quản trị | http://localhost:8000/admin |
| Kiểm tra API còn chạy không | http://localhost:8000/api/v1/health |

**Trên điện thoại** (dùng chung wifi với máy tính; IP máy lúc ghi là `192.168.1.10`, IP có thể đổi)

| Chức năng | Link |
|---|---|
| Web | http://192.168.1.10:5173 |
| App (bản chạy trên trình duyệt) | http://192.168.1.10:8081 |

**Tài khoản quản trị (chỉ dùng trên máy dev)**
- Email: `admin@nhanong.local`
- Mật khẩu: không ghi vào file này, vì file có thể được commit lên git. Quên mật khẩu thì tạo tài khoản mới rồi cấp quyền:

```bash
cd backend
php artisan make:filament-user
php artisan admin:grant email@cua-ban.vn
```

**Dữ liệu có sẵn lúc ghi (14/10/2026)**
- 65 giá lấy thật từ báo: cà phê, hồ tiêu, lúa gạo, phân bón.
- 33 điểm bán lấy từ OpenStreetMap.

**Cần biết khi xem thử**
- Bản app chạy trên trình duyệt chỉ để xem giao diện. Nút "Gần tôi" và thông báo đẩy phải thử trên điện thoại thật.
- Nhiều điểm bán từ OpenStreetMap không ghi tỉnh, nên lọc theo tỉnh hiện chỉ ra vài điểm.
- Sửa code app xong phải khởi động lại Expo mới thấy thay đổi, vì Expo đang chạy với `CI=1` (chế độ tự nạp lại code bị crash).

**Cách chạy lại**

```bash
# 1. Mở Docker Desktop, rồi bật MySQL + Redis
docker compose up -d --wait

# 2. Backend (cổng 8000)
cd backend && php artisan serve --host=0.0.0.0 --port=8000

# 3. Web (cổng 5173), mở terminal khác
cd web && npx vite --host 0.0.0.0 --port 5173

# 4. App xem trên trình duyệt (cổng 8081), mở terminal khác
cd mobile && CI=1 npx expo start --web --port 8081

# Lấy giá mới, nhập thêm điểm bán (khi cần)
cd backend && php artisan crawl:run && php artisan shops:import-osm
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
| 4b. Sổ thu chi Nâng cao | Mùa vụ, kho vật tư, công nợ | ✅ Xong (web + app). Chưa thử trên điện thoại thật |
| 6. Phát hành | EAS build, CH Play / App Store, VPS | ⏳ Chưa làm |

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
