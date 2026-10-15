const UNITS: Array<[number, string]> = [
  [1_000_000_000, 'tỷ'],
  [1_000_000, 'triệu'],
  [1_000, 'nghìn'],
];

/** 1500000 -> "1.500.000 đ" */
export function formatVnd(amount: number): string {
  const sign = amount < 0 ? '-' : '';
  const digits = Math.round(Math.abs(amount))
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${sign}${digits} đ`;
}

/**
 * Đọc số tiền theo kiểu dễ hiểu để người dùng kiểm tra số 0.
 * 1500000 -> "1 triệu 500 nghìn đồng", 2030000000 -> "2 tỷ 30 triệu đồng"
 */
export function readVnd(amount: number): string {
  let rest = Math.round(Math.abs(amount));
  if (rest === 0) return '0 đồng';

  const parts: string[] = [];
  for (const [size, name] of UNITS) {
    const count = Math.floor(rest / size);
    if (count > 0) {
      // Phần trên 1000 tỷ vẫn đọc theo "tỷ", ví dụ "1500 tỷ"
      parts.push(`${count} ${name}`);
      rest %= size;
    }
  }
  if (rest > 0) parts.push(String(rest));

  return `${amount < 0 ? 'âm ' : ''}${parts.join(' ')} đồng`;
}

/** Bỏ mọi ký tự không phải số: "1.500.000 đ" -> 1500000 */
export function parseVnd(input: string): number {
  const digits = input.replace(/\D/g, '');
  return digits ? Number(digits) : 0;
}
