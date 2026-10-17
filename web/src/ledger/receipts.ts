import { fitSize, photosToSync, RECEIPT_QUALITY, type Ledger } from '@nhanong/shared'
import { api } from '../api'

/**
 * Ảnh hóa đơn trên web: lưu trong IndexedDB riêng ("nhanong-photos"), không nằm trong sổ.
 * Mỗi ảnh: { id, blob, uploaded } (uploaded = đã gửi lên mạng). Nén trước khi lưu: cạnh dài ≤ 1280 px, JPEG 0,7.
 */
interface StoredPhoto {
  id: string
  blob: Blob
  uploaded: boolean
}

const DB = 'nhanong-photos'
const STORE = 'photos'

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB, 1)
    request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: 'id' })
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function tx<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open()
  return new Promise((resolve, reject) => {
    const request = run(db.transaction(STORE, mode).objectStore(STORE))
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

const put = (photo: StoredPhoto) => tx('readwrite', (s) => s.put(photo))
const get = (id: string) => tx<StoredPhoto | undefined>('readonly', (s) => s.get(id))
const all = () => tx<StoredPhoto[]>('readonly', (s) => s.getAll())

/** Nén ảnh chụp / chọn từ máy: thu nhỏ bằng canvas rồi lưu JPEG */
async function compress(file: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(file)
  const size = fitSize(bitmap.width, bitmap.height)
  const canvas = document.createElement('canvas')
  canvas.width = size.width
  canvas.height = size.height
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, size.width, size.height)
  bitmap.close()
  return new Promise((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Không đọc được ảnh'))), 'image/jpeg', RECEIPT_QUALITY))
}

/** Lưu ảnh mới, trả id để gắn vào khoản thu chi */
export async function savePhoto(file: Blob): Promise<string> {
  const id = crypto.randomUUID()
  await put({ id, blob: await compress(file), uploaded: false })
  return id
}

/** Đường dẫn tạm để hiện ảnh (nhớ URL.revokeObjectURL khi không dùng); máy chưa có ảnh thì null */
export async function photoUrl(id: string): Promise<string | null> {
  const photo = await get(id)
  return photo ? URL.createObjectURL(photo.blob) : null
}

/** Sau mỗi lần đồng bộ sổ: gửi ảnh chưa gửi, tải ảnh ghi ở máy khác */
export async function syncPhotos(ledger: Ledger, token: string): Promise<void> {
  const photos = await all()
  const { upload, download } = photosToSync(ledger.getSnapshot(), {
    has: new Set(photos.map((p) => p.id)),
    uploaded: new Set(photos.filter((p) => p.uploaded).map((p) => p.id)),
  })
  for (const id of upload) {
    const photo = photos.find((p) => p.id === id)!
    const form = new FormData()
    form.append('photo', photo.blob, `${id}.jpg`)
    await api.uploadReceiptPhoto(token, id, form)
    await put({ ...photo, uploaded: true })
  }
  for (const id of download) {
    try {
      const data = await api.receiptPhoto(token, id)
      await put({ id, blob: new Blob([data], { type: 'image/jpeg' }), uploaded: true })
    } catch {
      // Máy ghi khoản chưa gửi ảnh lên: lần sau tải
    }
  }
}
