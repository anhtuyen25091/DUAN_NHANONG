/**
 * Chào bán: nông dân đăng lô hàng sắp thu hoạch (mặt hàng, số kg, ngày, vị trí vườn), điểm mua / lái quanh đó trả giá,
 * nông dân chọn 1 giá; sau khi chọn, 2 bên thấy số điện thoại của nhau.
 */
import { formatKg } from './trade';

export type OfferStatus = 'open' | 'sold' | 'closed' | 'expired';
export type BidStatus = 'pending' | 'accepted' | 'declined' | 'withdrawn';

export const OFFER_STATUS_LABELS: Record<OfferStatus, string> = {
  open: 'Đang nhận giá',
  sold: 'Đã chọn giá',
  closed: 'Đã đóng',
  expired: 'Hết hạn',
};

export const BID_STATUS_LABELS: Record<BidStatus, string> = {
  pending: 'Chờ nông dân chọn',
  accepted: 'Được chọn',
  declined: 'Nông dân chọn giá khác',
  withdrawn: 'Đã rút',
};

export interface OfferBid {
  id: string;
  price: number;
  quantity_kg: number | null;
  note: string | null;
  status: BidStatus;
  updated_at: string | null;
  /** Chỉ nông dân thấy: tên điểm mua / lái, số điện thoại */
  buyer: { name: string; verified: boolean; phone: string | null } | null;
}

export interface ProduceOffer {
  id: string;
  product: { code: string; name: string } | null;
  product_name: string;
  quantity_kg: number;
  expected_price: number | null;
  harvest_date: string;
  province: string | null;
  province_name: string | null;
  place_label: string | null;
  lat: number;
  lng: number;
  /** Chợ: cách vị trí đang xem bao xa */
  distance_km: number | null;
  note: string | null;
  status: OfferStatus;
  expires_at: string;
  created_at: string | null;
  is_mine: boolean;
  /** phone: chỉ có khi là lô của mình, hoặc nông dân đã chọn giá của mình */
  farmer: { name: string | null; phone: string | null };
  bids_count: number;
  best_price: number | null;
  /** Giá mình đã trả (người mua) */
  my_bid: OfferBid | null;
  /** Nông dân: mọi giá được trả (cao trước) */
  bids: OfferBid[] | null;
}

export interface OfferInput {
  product_code?: string | null;
  product_name: string;
  quantity_kg: number;
  expected_price?: number | null;
  harvest_date: string;
  province_code?: string | null;
  lat: number;
  lng: number;
  place_label?: string | null;
  note?: string | null;
}

export interface BidInput {
  price: number;
  quantity_kg?: number | null;
  note?: string | null;
}

export interface OfferMarket {
  data: ProduceOffer[];
  meta: { radius_km: number; can_bid: boolean };
}

/** 3000 → "3 tấn"; 850 → "850 kg" */
export function formatQuantity(kg: number): string {
  if (kg >= 1000) return `${formatKg(Math.round(kg / 100) / 10)} tấn`;
  return `${formatKg(kg)} kg`;
}

/** Tổng tiền ước tính nếu bán cả lô theo 1 giá */
export function offerValue(offer: Pick<ProduceOffer, 'quantity_kg'>, price: number): number {
  return Math.round(offer.quantity_kg * price);
}
