/**
 * Doanh nghiệp thu mua: chủ + các lái con đi mua giùm. Chủ tạo tài khoản con / gửi mã mời,
 * ứng tiền cho lái, xem thống kê từng lái; lái xem tiền mình đang giữ.
 */
import type { TradeKind, TradeTotals } from './trade';

export type BusinessRole = 'owner' | 'buyer';
export type MemberStatus = 'active' | 'locked';

/** Tiền mặt 1 lái (tính đến nay): đang giữ = đã ứng − nộp lại − đã trả ra + đã thu vào */
export interface MemberCash {
  advanced: number;
  returned: number;
  paid_out: number;
  received: number;
  holding: number;
}

export interface BusinessMemberInfo {
  id: number;
  name: string;
  phone: string | null;
  role: BusinessRole;
  group_name: string | null;
  status: MemberStatus;
  /** Chủ tạo tài khoản (đặt lại mật khẩu được) */
  created_by_owner: boolean;
  joined_at: string | null;
}

export interface Business {
  id: string;
  name: string;
  phone: string | null;
  address: string | null;
  owner: { id: number; name: string };
  my_role: BusinessRole;
  my_status: MemberStatus;
  my_group: string | null;
  /** Chỉ chủ thấy */
  invite_code: string | null;
  members: BusinessMemberInfo[] | null;
  /** Lái: tiền mình đang giữ */
  my_cash: MemberCash | null;
}

export interface BusinessInput {
  name: string;
  phone?: string | null;
  address?: string | null;
}

export interface MemberInput {
  name: string;
  phone: string;
  password: string;
  group_name?: string | null;
}

export interface BusinessSummary {
  members: (BusinessMemberInfo & { totals: TradeTotals; cash: MemberCash })[];
  totals: TradeTotals & { holding: number };
  products: { kind: TradeKind; name: string; kg: number; amount: number }[];
}

export type AdvanceKind = 'advance' | 'return';

export const ADVANCE_KIND_LABELS: Record<AdvanceKind, string> = { advance: 'Chủ ứng cho lái', return: 'Lái nộp lại' };

export interface BusinessAdvance {
  id: string;
  member: { id: number; name: string | null };
  kind: AdvanceKind;
  amount: number;
  date: string;
  note: string | null;
}

export interface AdvanceInput {
  member: number;
  kind: AdvanceKind;
  amount: number;
  date: string;
  note?: string | null;
}

export interface BusinessDeal {
  uuid: string;
  code: string;
  title: string;
  status: string;
  kind: TradeKind;
  member: { id: number | null; name: string | null };
  counterpart: string;
  totals: { delivered: number; kg: number; deposit: number; deducted: number; deposit_left: number; paid: number; balance: number };
  updated_at: string | null;
}

/** Việc mới của 1 lái con để báo chủ: đơn chung có hoạt động mới, phiếu vừa lập / sửa / xóa */
export interface BusinessActivity {
  type: 'deal' | 'purchase';
  /** uuid đơn hoặc uuid phiếu */
  id: string;
  title: string;
  text: string;
  at: string;
}

/** Lời nhắn mời lái vào doanh nghiệp bằng mã */
export function businessInviteText(business: Pick<Business, 'name'>, code: string): string {
  return `Mời bạn vào doanh nghiệp "${business.name}" trên app Nhà Nông để ghi phiếu thu mua. Mở app → Tài khoản → Doanh nghiệp → Nhập mã mời: ${code}`;
}
