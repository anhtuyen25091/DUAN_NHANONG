/**
 * Kiểu dữ liệu sổ thu chi, dùng chung cho web (IndexedDB), mobile (SQLite) và API đồng bộ.
 * Mọi bản ghi có uuid do client sinh + updated_at/deleted_at để đồng bộ (last-write-wins).
 */

export type StorageMode = 'local' | 'sync';

export interface SyncRecord {
  id: string; // uuid
  updated_at: string; // ISO 8601
  deleted_at: string | null;
  /** Giá trị các trường người dùng tự thêm, theo custom_field_defs */
  extra?: Record<string, string | number | null>;
}

export interface Garden extends SyncRecord {
  name: string;
  area_m2: number | null;
  crop: string | null;
  note: string | null;
}

export interface Season extends SyncRecord {
  garden_id: string;
  name: string;
  started_on: string; // YYYY-MM-DD
  ended_on: string | null;
}

export type EntryType = 'income' | 'expense';

export interface LedgerCategory extends SyncRecord {
  type: EntryType;
  name: string;
  icon: string; // emoji
  color: string;
  sort: number;
}

export interface Transaction extends SyncRecord {
  type: EntryType;
  amount: number; // VND
  date: string; // YYYY-MM-DD
  garden_id: string | null; // null = chi chung
  season_id: string | null;
  category_id: string;
  supply_id: string | null; // khoản chi sinh ra khi mua vật tư
  note: string | null;
}

export interface Supply extends SyncRecord {
  name: string;
  product_id: number | null; // liên kết danh mục giá trên server (tùy chọn)
  unit: string;
  quantity: number;
  unit_price: number;
  bought_on: string;
  shop_name: string | null;
}

export interface SupplyUsage extends SyncRecord {
  supply_id: string;
  garden_id: string;
  quantity: number;
  used_on: string;
}

export type CustomFieldTarget = 'garden' | 'transaction' | 'supply';
export type CustomFieldType = 'text' | 'number' | 'date' | 'select';

export interface CustomFieldDef extends SyncRecord {
  target: CustomFieldTarget;
  key: string;
  label: string;
  type: CustomFieldType;
  options: string[] | null;
}

export interface QuickTemplate extends SyncRecord {
  label: string;
  type: EntryType;
  amount: number;
  category_id: string;
  garden_id: string | null;
}

/** Hạng mục mặc định cho chế độ Cơ bản (người dùng có thể thêm/sửa) */
export const DEFAULT_CATEGORIES: Array<Pick<LedgerCategory, 'type' | 'name' | 'icon' | 'color'>> = [
  { type: 'expense', name: 'Phân bón', icon: '🌱', color: '#16a34a' },
  { type: 'expense', name: 'Thuốc', icon: '🧪', color: '#9333ea' },
  { type: 'expense', name: 'Nhân công', icon: '👷', color: '#ea580c' },
  { type: 'expense', name: 'Tưới nước', icon: '💧', color: '#0284c7' },
  { type: 'expense', name: 'Xăng dầu', icon: '⛽', color: '#78716c' },
  { type: 'expense', name: 'Giống cây', icon: '🌿', color: '#65a30d' },
  { type: 'expense', name: 'Khác', icon: '📦', color: '#64748b' },
  { type: 'income', name: 'Bán nông sản', icon: '💰', color: '#15803d' },
  { type: 'income', name: 'Thu khác', icon: '💵', color: '#0f766e' },
];
