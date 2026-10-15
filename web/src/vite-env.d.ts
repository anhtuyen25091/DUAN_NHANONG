/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Địa chỉ backend khi build production, ví dụ https://api.nhanong.vn. Để trống = cùng tên miền. */
  readonly VITE_API_URL?: string
}
