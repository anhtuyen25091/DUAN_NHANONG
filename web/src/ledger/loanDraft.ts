import type { Debt, LenderType, LoanPlan } from '@nhanong/shared'

/** Điều khoản vay đang nhập trong form (chữ giữ nguyên để gõ được "1,5") */
export interface LoanDraft {
  lenderType: LenderType
  rate: string
  rateUnit: 'year' | 'month'
  plan: LoanPlan | ''
  term: string
  payDay: string
}

export function loanDraft(debt?: Debt): LoanDraft {
  return {
    lenderType: debt?.lender_type ?? 'bank',
    rate: debt?.interest_rate ? String(debt.interest_rate).replace('.', ',') : '',
    rateUnit: debt?.rate_unit ?? 'year',
    plan: debt?.loan_plan ?? 'monthly_interest',
    term: debt?.term_months ? String(debt.term_months) : '',
    payDay: debt?.pay_day ? String(debt.pay_day) : '',
  }
}

const num = (t: string) => Number(t.replace(',', '.')) || 0

/** Điều khoản để lưu (Ledger.addDebt / updateDebt) */
export function loanTermsOf(d: LoanDraft) {
  const term = Math.round(num(d.term))
  return {
    lender_type: d.lenderType,
    interest_rate: num(d.rate) || null,
    rate_unit: d.rateUnit,
    loan_plan: d.plan && term > 0 ? d.plan : null,
    term_months: d.plan && term > 0 ? term : null,
    pay_day: Math.round(num(d.payDay)) || null,
  }
}
