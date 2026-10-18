import { fitSize, orphanPhotos, photosToSync, RECEIPT_QUALITY, type Ledger } from '@nhanong/shared';
import { Directory, File, Paths } from 'expo-file-system';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { api } from './api';

/**
 * Ảnh hóa đơn trên app: thư mục tài liệu của app `receipts/{id}.jpg`, không nằm trong sổ.
 * Danh sách ảnh đã gửi lên mạng ghi ở `receipts/uploaded.json`. Nén trước khi lưu: cạnh dài ≤ 1280 px, JPEG 0,7.
 */
const dir = () => {
  const d = new Directory(Paths.document, 'receipts');
  if (!d.exists) d.create();
  return d;
};
const photoFile = (id: string) => new File(dir(), `${id}.jpg`);
const uploadedFile = () => new File(dir(), 'uploaded.json');

function readUploaded(): Set<string> {
  const f = uploadedFile();
  try {
    return new Set(f.exists ? (JSON.parse(f.textSync()) as string[]) : []);
  } catch {
    return new Set();
  }
}

function writeUploaded(ids: Set<string>) {
  const f = uploadedFile();
  if (!f.exists) f.create();
  f.write(JSON.stringify([...ids]));
}

const randomId = () =>
  'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });

/** Lưu ảnh vừa chụp / chọn (đã nén), trả id để gắn vào khoản thu chi */
export async function savePhoto(uri: string, width: number, height: number): Promise<string> {
  const size = fitSize(width, height);
  const result = await manipulateAsync(uri, size.width < width ? [{ resize: size }] : [], { compress: RECEIPT_QUALITY, format: SaveFormat.JPEG });
  const id = randomId();
  new File(result.uri).copy(photoFile(id));
  return id;
}

/** Đường dẫn ảnh trên máy; chưa có (ghi ở máy khác, chưa tải về) thì null */
export function photoUri(id: string): string | null {
  const f = photoFile(id);
  return f.exists ? f.uri : null;
}

const localPhotos = () => dir().list().filter((item): item is File => item instanceof File && item.name.endsWith('.jpg'));

/**
 * Xóa ảnh thừa trên máy: khoản đã xóa (quá 1 ngày) hoặc đã thay ảnh khác. Chạy khi mở sổ và sau mỗi lần đồng bộ.
 * Ảnh trên máy chủ do lệnh receipts:prune dọn theo cùng quy tắc.
 */
export function prunePhotos(ledger: Ledger): number {
  const files = localPhotos();
  const ids = orphanPhotos(
    ledger.getSnapshot(),
    files.map((f) => ({ id: f.name.replace(/\.jpg$/, ''), savedAt: f.modificationTime ?? null })),
  );
  if (ids.length === 0) return 0;
  const uploaded = readUploaded();
  for (const id of ids) {
    try {
      photoFile(id).delete();
    } catch {
      // Lần sau xóa
    }
    uploaded.delete(id);
  }
  writeUploaded(uploaded);
  return ids.length;
}

/** Sau mỗi lần đồng bộ sổ: gửi ảnh chưa gửi, tải ảnh ghi ở máy khác, rồi dọn ảnh thừa */
export async function syncPhotos(ledger: Ledger, token: string): Promise<void> {
  const has = new Set(localPhotos().map((f) => f.name.replace(/\.jpg$/, '')));
  const uploaded = readUploaded();
  const { upload, download } = photosToSync(ledger.getSnapshot(), { has, uploaded });

  for (const id of upload) {
    const form = new FormData();
    form.append('photo', { uri: photoFile(id).uri, name: `${id}.jpg`, type: 'image/jpeg' } as unknown as Blob);
    await api.uploadReceiptPhoto(token, id, form);
    uploaded.add(id);
    writeUploaded(uploaded);
  }
  for (const id of download) {
    try {
      const data = await api.receiptPhoto(token, id);
      const f = photoFile(id);
      f.create();
      f.write(new Uint8Array(data));
      uploaded.add(id);
      writeUploaded(uploaded);
    } catch {
      // Máy ghi khoản chưa gửi ảnh lên: lần sau tải
    }
  }
  prunePhotos(ledger);
}
