import { createApi, randomUuid } from '@nhanong/shared'

const DEVICE_KEY = 'device_id'
let memoryId: string | null = null

/** uuid ngẫu nhiên của trình duyệt (cần khi gửi đề xuất điểm bán); không lưu được thì dùng tạm trong phiên */
function deviceId(): string {
  try {
    let id = localStorage.getItem(DEVICE_KEY)
    if (!id) {
      id = randomUuid()
      localStorage.setItem(DEVICE_KEY, id)
    }
    return id
  } catch {
    return (memoryId ??= randomUuid())
  }
}

export const api = createApi({ baseUrl: import.meta.env.VITE_API_URL ?? '', getDeviceId: deviceId })
