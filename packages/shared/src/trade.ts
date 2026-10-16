import { formatNumber } from './format';

/**
 * Sổ giao dịch của điểm thu mua / thương lái: khách quen, phiếu mua / bán (khách vãng lai),
 * danh sách gộp với đợt cân của đơn mua bán, và giấy tờ in ra PDF / Word.
 */

export type TradeKind = 'buy' | 'sell';

export const TRADE_KIND_LABELS: Record<TradeKind, string> = { buy: 'Mua vào', sell: 'Bán ra' };

export interface TradeCustomer {
  id: string;
  name: string;
  phone: string | null;
  address: string | null;
  note: string | null;
  count: number;
  bought: number;
  sold: number;
  /** Mình còn nợ khách (phiếu mua chưa trả đủ) */
  i_owe: number;
  /** Khách còn nợ mình (phiếu bán chưa thu đủ) */
  owes_me: number;
  last_date: string | null;
}

export interface CustomerInput {
  name: string;
  phone?: string | null;
  address?: string | null;
  note?: string | null;
}

/** 1 dòng hàng khi nhập phiếu */
export interface PurchaseLineInput {
  product_code?: string | null;
  name: string;
  kg: number;
  /** Trừ bì / tạp chất (kg) */
  deduct_kg?: number;
  /** Đơn giá theo kg tịnh */
  price: number;
}

export interface PurchaseLine extends Required<Omit<PurchaseLineInput, 'product_code'>> {
  product_code: string | null;
  net_kg: number;
  amount: number;
}

export interface PurchaseInput {
  kind?: TradeKind;
  /** uuid khách có sẵn; không có thì gõ tên (+ SĐT) để tự lưu vào sổ khách */
  customer?: string | null;
  customer_name?: string | null;
  customer_phone?: string | null;
  date: string;
  lines: PurchaseLineInput[];
  paid?: number;
  note?: string | null;
}

/** 1 giao dịch trong sổ: phiếu mua / bán, hoặc 1 đợt cân của đơn mua bán */
export interface TradeRow {
  source: 'purchase' | 'deal';
  /** uuid phiếu, hoặc uuid đợt cân */
  id: string;
  /** "PM-000012" / "Đơn 7KQ2MX" */
  code: string;
  date: string;
  kind: TradeKind;
  counterpart: string;
  phone: string | null;
  /** uuid khách (phiếu) */
  customer: string | null;
  /** uuid đơn mua bán (đợt cân) */
  deal: string | null;
  items: { name: string; kg: number; price: number; amount: number }[];
  kg: number;
  amount: number;
  paid: number;
  owing: number;
  /** Đợt cân chưa được bên kia xác nhận */
  pending: boolean;
  note: string | null;
}

export interface Purchase extends TradeRow {
  source: 'purchase';
  number: number;
  lines: PurchaseLine[];
  customer_address: string | null;
  /** Bản thứ mấy (mỗi lần sửa nội dung / ghi thêm tiền trả là 1 bản mới) */
  version: number;
  /** Chỉ có khi xem 1 phiếu của mình: mã chia sẻ, ai đang xem, tài khoản trùng SĐT khách (chưa gửi), lịch sử */
  share_code?: string | null;
  /** Bản lúc chia sẻ lần đầu; null = chưa chia sẻ */
  shared_version?: number | null;
  history?: PurchaseHistoryItem[];
  shared_with?: { name: string; phone: string | null; via: 'code' | 'phone' }[];
  account_match?: { name: string; phone: string } | null;
}

/** 1 bản trong lịch sử phiếu: thời gian lưu, tổng tiền, đã trả, đổi gì so với bản trước */
export interface PurchaseHistoryItem {
  version: number;
  at: string | null;
  amount: number;
  paid: number;
  changes: string[];
}

/** Phiếu người khác (điểm thu mua, thương lái) gửi cho mình: chỉ xem, tải PDF / Word */
export interface ReceivedPurchase {
  id: string;
  code: string;
  date: string;
  /** Nhìn từ phía mình: người lập phiếu mua vào thì mình là bán ra */
  kind: TradeKind;
  issuer: { name: string; phone: string | null };
  customer_name: string;
  lines: PurchaseLine[];
  kg: number;
  amount: number;
  paid: number;
  owing: number;
  note: string | null;
  updated_at: string | null;
  version: number;
  /** Bản lúc mình nhận và mọi lần sửa sau đó */
  history: PurchaseHistoryItem[];
  edited_after_share: boolean;
  /** Người lập đã xóa phiếu (vẫn giữ để đối chiếu) */
  deleted_at: string | null;
}

export interface TradeTotals {
  count: number;
  buy: { kg: number; amount: number; paid: number; owing: number };
  sell: { kg: number; amount: number; paid: number; owing: number };
}

export interface TradeFilters {
  from?: string;
  to?: string;
  kind?: TradeKind;
  q?: string;
  customer?: string;
}

export interface TradeList {
  data: TradeRow[];
  meta: { from: string; to: string; totals: TradeTotals };
}

/** Giấy tờ in được */
export type DocumentTarget =
  | { type: 'purchase'; id: string }
  | { type: 'deal-entry'; id: string }
  | { type: 'deal'; id: string }
  | { type: 'customer'; id: string; from?: string; to?: string }
  | { type: 'report'; from?: string; to?: string };

export type DocumentFormat = 'pdf' | 'docx';

export const DOCUMENT_FORMAT_LABELS: Record<DocumentFormat, string> = { pdf: 'PDF', docx: 'Word' };

/** Đường dẫn API của giấy tờ (không gồm /api/v1) */
export function documentPath(target: DocumentTarget, format: DocumentFormat): string {
  const params = new URLSearchParams({ format });
  if ((target.type === 'customer' || target.type === 'report') && target.from) params.set('from', target.from);
  if ((target.type === 'customer' || target.type === 'report') && target.to) params.set('to', target.to);
  const path = target.type === 'report' ? '/documents/report' : `/documents/${target.type === 'purchase' ? 'purchases' : target.type === 'deal' ? 'deals' : target.type === 'customer' ? 'customers' : 'deal-entries'}/${encodeURIComponent(target.id)}`;
  return `${path}?${params.toString()}`;
}

/** Tính kg tịnh, thành tiền từng dòng và cả phiếu (giống backend) để xem trước khi lưu */
export function purchaseTotals(lines: PurchaseLineInput[]): { lines: PurchaseLine[]; kg: number; amount: number } {
  const computed = lines.map((line) => {
    const kg = round3(line.kg || 0);
    const deduct = round3(Math.min(line.deduct_kg || 0, kg));
    const net = round3(kg - deduct);
    const price = Math.trunc(line.price || 0);
    return { product_code: line.product_code ?? null, name: line.name, kg, deduct_kg: deduct, net_kg: net, price, amount: Math.round(net * price) };
  });
  return { lines: computed, kg: round3(computed.reduce((s, l) => s + l.net_kg, 0)), amount: computed.reduce((s, l) => s + l.amount, 0) };
}

/** "Cà phê nhân xô: 1.238 kg; Tiêu loại 1: 320 kg" (dấu hai chấm để tên hàng có số không dính vào số kg) */
export function itemsText(items: { name: string; kg: number }[]): string {
  return items.map((i) => `${i.name}: ${formatKg(i.kg)} kg`).join('; ');
}

/** 1238.5 → "1.238,5" */
export function formatKg(kg: number): string {
  // Tự định dạng: Hermes trên Android không có đủ dữ liệu ngôn ngữ cho toLocaleString
  const [whole, fraction] = Math.abs(round3(kg)).toFixed(3).replace(/0+$/, '').replace(/\.$/, '').split('.');
  return `${kg < 0 ? '-' : ''}${formatNumber(Number(whole))}${fraction ? `,${fraction}` : ''}`;
}

/** Chữ người dùng gõ → số kg: "1.250,5" / "1250,5" / "1250.5" → 1250.5; trống / sai → 0 */
export function parseKgText(text: string): number {
  const t = text.trim();
  const normalized = t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t;
  const n = Number(normalized.replace(/[^\d.]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

/** Số kg → chữ để điền sẵn vào ô (0 → trống): 1250.5 → "1250,5" */
export function kgInputText(kg: number): string {
  return kg ? String(kg).replace('.', ',') : '';
}

/** Đầu tháng của 1 ngày "YYYY-MM-DD" */
export function monthStart(date: string): string {
  return `${date.slice(0, 7)}-01`;
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

/** Lời nhắn gửi khách kèm mã phiếu (dán vào Zalo) */
export function purchaseShareText(p: Pick<Purchase, 'code' | 'kind' | 'amount' | 'date'>, shareCode: string, link?: string): string {
  return `Phiếu ${p.kind === 'buy' ? 'mua hàng' : 'bán hàng'} ${p.code} ngày ${p.date.split('-').reverse().join('/')}, ${formatNumber(p.amount)} đ. Mở app Nhà Nông → Đơn → Nhập mã: ${shareCode}${link ? ` · ${link}` : ''}`;
}
