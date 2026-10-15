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

/**
 * Mùa vụ của 1 vườn. Khoản thu chi thuộc vụ theo ngày + vườn (tính lúc xem, không lưu season_id),
 * nên sửa ngày bắt đầu/kết thúc vụ thì số liệu tự tính lại.
 */
export interface Season extends SyncRecord {
  garden_id: string;
  name: string;
  started_on: string; // YYYY-MM-DD
  ended_on: string | null; // null = đang làm
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
  season_id: string | null; // chưa dùng: vụ tính theo ngày + vườn (xem Season)
  category_id: string;
  supply_id: string | null; // khoản chi sinh ra khi mua vật tư
  note: string | null;
}

/**
 * Vật tư mua về kho. Lúc mua tự ghi 1 khoản tiền ra "chi chung" (transactions.supply_id = id vật tư);
 * mỗi lần dùng cho vườn nào thì phần tiền tương ứng tính vào vườn đó (xem allocatedEntries).
 */
export interface Supply extends SyncRecord {
  name: string;
  category_id: string; // hạng mục chi: Phân bón, Thuốc…
  product_id: number | null; // liên kết danh mục giá trên server (tùy chọn)
  unit: string; // bao, chai, kg…
  quantity: number;
  unit_price: number; // đồng / 1 đơn vị (có thể lẻ khi nhập thành tiền, ví dụ 1 triệu / 3 chai)
  bought_on: string;
  shop_name: string | null;
  note: string | null;
}

export interface SupplyUsage extends SyncRecord {
  supply_id: string;
  garden_id: string;
  quantity: number;
  used_on: string;
  note: string | null;
}

/** payable: mình nợ người ta (mua thiếu phân, thuốc…); receivable: người ta nợ mình (bán chịu) */
/** loan: mình đi vay tiền (ngân hàng, người quen): tiền gốc không tính lời/lỗ, tiền lãi là tiền ra */
export type DebtKind = 'payable' | 'receivable' | 'loan';

/** Bên cho vay */
export type LenderType = 'bank' | 'credit_fund' | 'person' | 'company';

/**
 * Cách trả khoản vay:
 * - monthly_interest: trả lãi hằng tháng, gốc trả 1 lần cuối kỳ
 * - equal_principal: trả góp gốc chia đều hằng tháng + lãi tính trên dư nợ còn lại
 * - lump_sum: trả 1 lần cuối kỳ cả gốc lẫn lãi
 */
export type LoanPlan = 'monthly_interest' | 'equal_principal' | 'lump_sum';

/**
 * Khoản nợ. Tiền đã tính vào lời/lỗ lúc mua/bán (khoản thu chi transaction_id, nếu có);
 * trả nợ chỉ làm giảm số còn nợ, không tính lại vào lời/lỗ.
 * Khoản vay: không có transaction_id; lãi trả kèm từng lần trả (DebtPayment.interest) mới là tiền ra.
 */
export interface Debt extends SyncRecord {
  kind: DebtKind;
  party: string; // tên đại lý / người mua
  phone: string | null;
  amount: number;
  date: string;
  due_on: string | null;
  garden_id: string | null;
  transaction_id: string | null;
  supply_id: string | null; // nợ sinh ra khi mua vật tư thiếu
  /** Khoản vay: lãi suất (theo rate_unit), có thể trống */
  interest_rate?: number | null;
  /** Lãi suất tính theo năm (ngân hàng) hay theo tháng (vay cá nhân hay dùng); mặc định năm */
  rate_unit?: 'year' | 'month' | null;
  lender_type?: LenderType | null;
  loan_plan?: LoanPlan | null;
  /** Kỳ hạn vay (tháng); có kỳ hạn + cách trả thì app lập lịch trả nợ */
  term_months?: number | null;
  /** Ngày trả hằng tháng (1–31); mặc định theo ngày vay */
  pay_day?: number | null;
  note: string | null;
}

export interface DebtPayment extends SyncRecord {
  debt_id: string;
  amount: number; // tiền gốc trả (giảm số còn nợ)
  /** Tiền lãi trả kèm (khoản vay); ghi thành tiền ra hạng mục "Lãi vay" */
  interest?: number;
  interest_transaction_id?: string | null;
  /** Trả cho kỳ số mấy trong lịch trả nợ (khoản vay); trống = trả thêm ngoài lịch */
  installment?: number | null;
  date: string;
  note: string | null;
}

/**
 * Bán vườn cho lái (sầu riêng…): lái đặt cọc trước, sau đó cắt nhiều đợt.
 * Cọc không tính vào lời/lỗ (là tiền lái trả trước); mỗi đợt ghi tiền vào = giá trị hàng giao.
 */
export type ContractStatus = 'open' | 'done' | 'forfeited' | 'refunded';

export interface HarvestContract extends SyncRecord {
  garden_id: string;
  buyer: string; // tên lái
  phone: string | null;
  crop: string | null;
  deposit: number; // tiền cọc
  date: string; // ngày nhận cọc
  category_id: string; // hạng mục tiền vào của các đợt (mặc định Bán nông sản)
  status: ContractStatus;
  closed_on: string | null;
  /** Khoản thu chi khi kết thúc: tiền vào khi lái bỏ cọc, tiền ra khi mình đền thêm lúc trả cọc */
  settle_transaction_id: string | null;
  note: string | null;
}

/** 1 dòng hàng trong đợt cắt: loại A 1.200 kg × 85.000 đ */
export interface CutLine {
  grade: string;
  kg: number;
  price: number; // đồng / kg
}

export interface HarvestCut extends SyncRecord {
  contract_id: string;
  date: string;
  lines: CutLine[];
  deposit_deduct: number; // số tiền cọc trừ vào đợt này (hai bên tự thỏa thuận)
  transaction_id: string | null; // khoản tiền vào = giá trị hàng của đợt
  note: string | null;
}

export type CustomFieldTarget = 'garden' | 'transaction' | 'supply';
export type CustomFieldType = 'text' | 'number' | 'date' | 'select';

/**
 * Ô thông tin người dùng tự thêm (vd "Số gốc cây", "Giống"). Giá trị lưu trong `extra[key]`
 * của vườn / khoản thu chi / vật tư, nên thêm ô mới không phải đổi cấu trúc dữ liệu.
 */
export interface CustomFieldDef extends SyncRecord {
  target: CustomFieldTarget;
  key: string;
  label: string;
  type: CustomFieldType;
  options: string[] | null; // chỉ dùng cho type 'select'
  sort: number;
}

/** Khoản hay dùng: bấm 1 lần là điền sẵn hạng mục, số tiền, vườn (vd "Xịt thuốc vườn sau – 350.000đ") */
export interface QuickTemplate extends SyncRecord {
  label: string;
  type: EntryType;
  amount: number;
  category_id: string;
  garden_id: string | null;
  note: string | null;
}

/**
 * Sản lượng thu hoạch của 1 vườn. Có giá bán thì tự ghi 1 khoản tiền vào (transaction_id).
 * Dùng để tính giá thành: tiền chi của vườn / số lượng thu được.
 */
export interface Harvest extends SyncRecord {
  garden_id: string;
  date: string;
  crop: string | null;
  quantity: number;
  unit: string; // kg, tạ, tấn, trái…
  price: number | null; // đồng / đơn vị, khi đã bán
  transaction_id: string | null;
  note: string | null;
}

/** Người làm thuê theo ngày */
export interface Worker extends SyncRecord {
  name: string;
  phone: string | null;
  wage: number; // tiền công 1 ngày
  note: string | null;
}

/**
 * 1 lần chấm công: người nào, làm ở vườn nào, bao nhiêu ngày công (1 = cả ngày, 0.5 = nửa ngày).
 * Lúc trả công tự ghi khoản tiền ra "Nhân công" theo từng vườn (transaction_id), paid_on = ngày trả.
 */
export interface WorkLog extends SyncRecord {
  worker_id: string;
  garden_id: string | null;
  date: string;
  days: number;
  wage: number; // tiền công/ngày lúc chấm (đổi giá sau không làm lệch công cũ)
  paid_on: string | null;
  transaction_id: string | null;
  note: string | null;
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
  // Thêm hạng mục mặc định thì luôn thêm ở cuối, để mã cố định (defaultCategoryId) của các mục cũ không đổi
  { type: 'expense', name: 'Lãi vay', icon: '🏦', color: '#b45309' },
];
