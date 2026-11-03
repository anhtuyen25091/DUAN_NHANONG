/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Địa chỉ backend khi build production, ví dụ https://api.nhanong.vn. Để trống = cùng tên miền. */
  readonly VITE_API_URL?: string
  /** Ảnh vệ tinh ở bản đồ chọn vị trí vườn: để trống = Esri World Imagery, "off" = ẩn nút */
  readonly VITE_MAP_SATELLITE_URL?: string
  readonly VITE_MAP_SATELLITE_ATTRIBUTION?: string
}
