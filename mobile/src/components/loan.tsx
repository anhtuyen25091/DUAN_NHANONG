import {
  formatDate,
  formatVnd,
  LENDER_TYPE_LABELS,
  LOAN_PLAN_LABELS,
  loanSchedule,
  today,
  VN_BANKS,
  type Debt,
  type DebtPayment,
  type Installment,
  type LenderType,
  type LoanPlan,
} from '@nhanong/shared';
import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { loanTermsOf, type LoanDraft } from '../lib/loanDraft';
import { colors, font } from '../lib/theme';
import { Field, inputStyle } from './fields';
import { Card, Chip, styles } from './ui';

/** Số ngân hàng hiện sẵn; còn lại bấm "Ngân hàng khác" mới hiện (đỡ phải cuộn dài trên điện thoại) */
const BANKS_SHOWN = 6;

/** Chọn loại bên cho vay; ngân hàng thì chọn tên trong danh sách (điền vào ô tên) */
export function LenderFields({ draft, onChange, party, onParty }: { draft: LoanDraft; onChange: (d: LoanDraft) => void; party: string; onParty: (p: string) => void }) {
  const set = (patch: Partial<LoanDraft>) => onChange({ ...draft, ...patch });
  const [allBanks, setAllBanks] = useState(() => VN_BANKS.indexOf(party) >= BANKS_SHOWN);
  return (
    <>
      <Field label="Vay của ai">
        <View style={wrap}>
          {(Object.keys(LENDER_TYPE_LABELS) as LenderType[]).map((t) => (
            <Chip
              key={t}
              label={LENDER_TYPE_LABELS[t]}
              active={draft.lenderType === t}
              // Vay cá nhân thường tính lãi theo tháng
              onPress={() => set({ lenderType: t, rateUnit: t === 'person' ? 'month' : t === 'bank' ? 'year' : draft.rateUnit })}
            />
          ))}
        </View>
      </Field>
      {draft.lenderType === 'bank' && (
        <Field label="Chọn ngân hàng">
          <View style={wrap}>
            {(allBanks ? VN_BANKS : VN_BANKS.slice(0, BANKS_SHOWN)).map((b) => (
              <Chip key={b} label={b} active={party === b} onPress={() => onParty(b)} />
            ))}
            {!allBanks && <Chip label="Ngân hàng khác…" active={false} onPress={() => setAllBanks(true)} />}
          </View>
        </Field>
      )}
    </>
  );
}

/** Phần nhập điều khoản vay: lãi suất, cách trả, kỳ hạn + xem trước tổng lãi */
export function LoanFields({ draft, onChange, party, amount, date }: { draft: LoanDraft; onChange: (d: LoanDraft) => void; party: string; amount: number; date: string }) {
  const set = (patch: Partial<LoanDraft>) => onChange({ ...draft, ...patch });
  const terms = loanTermsOf(draft);
  // Xem trước lịch trả nợ với số liệu đang nhập
  const preview =
    amount > 0 && terms.loan_plan
      ? loanSchedule(
          { id: 'preview', kind: 'loan', party, phone: null, amount, date, due_on: null, garden_id: null, transaction_id: null, supply_id: null, note: null, updated_at: '', deleted_at: null, ...terms },
          [],
          today(),
        )
      : null;

  return (
    <>
      <Field label="Lãi suất">
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <TextInput
            value={draft.rate}
            onChangeText={(t) => set({ rate: t.replace(/[^\d.,]/g, '') })}
            keyboardType="decimal-pad"
            maxLength={6}
            placeholder={draft.rateUnit === 'year' ? 'Ví dụ: 9' : 'Ví dụ: 1,5'}
            placeholderTextColor={colors.muted}
            style={[inputStyle, { flex: 1, minWidth: 80 }]}
            accessibilityLabel="Lãi suất"
          />
          {(['year', 'month'] as const).map((u) => (
            <Chip key={u} label={`%/${u === 'year' ? 'năm' : 'tháng'}`} active={draft.rateUnit === u} onPress={() => set({ rateUnit: u })} />
          ))}
        </View>
      </Field>

      <Field label="Cách trả">
        <View style={{ gap: 8 }}>
          {(Object.keys(LOAN_PLAN_LABELS) as LoanPlan[]).map((p) => (
            <RadioCard key={p} title={LOAN_PLAN_LABELS[p].title} hint={LOAN_PLAN_LABELS[p].hint} checked={draft.plan === p} onPress={() => set({ plan: p })} />
          ))}
          <RadioCard title="Chưa có lịch cố định" hint="Trả lúc nào ghi lúc đó (vay người quen…)." checked={draft.plan === ''} onPress={() => set({ plan: '' })} />
        </View>
      </Field>

      {draft.plan !== '' && (
        <>
          <Field label="Vay trong bao lâu (tháng)">
            <TextInput
              value={draft.term}
              onChangeText={(t) => set({ term: t.replace(/\D/g, '').slice(0, 3) })}
              keyboardType="number-pad"
              placeholder="Ví dụ: 12"
              placeholderTextColor={colors.muted}
              style={inputStyle}
              accessibilityLabel="Vay trong bao lâu (tháng)"
            />
            <View style={[wrap, { marginTop: 8 }]}>
              {[6, 11, 12, 24].map((m) => (
                <Chip key={m} label={`${m} tháng`} active={draft.term === String(m)} onPress={() => set({ term: String(m) })} />
              ))}
            </View>
          </Field>
          {draft.plan !== 'lump_sum' && (
            <Field label="Trả vào ngày mấy hằng tháng">
              <TextInput
                value={draft.payDay}
                onChangeText={(t) => set({ payDay: t.replace(/\D/g, '').slice(0, 2) })}
                keyboardType="number-pad"
                placeholder={`Ví dụ: ${Number(date.slice(8, 10))}`}
                placeholderTextColor={colors.muted}
                style={inputStyle}
                accessibilityLabel="Trả vào ngày mấy hằng tháng"
              />
            </Field>
          )}
        </>
      )}

      {preview && preview.items.length > 0 && (
        <Card style={{ backgroundColor: colors.lossSoft, borderColor: colors.loss }}>
          <Text style={styles.muted}>Dự kiến (nếu trả đúng lịch)</Text>
          <Text style={[styles.body, { marginVertical: 4 }]}>
            Tổng lãi phải trả đến khi tất toán: <Text style={{ fontWeight: '800', color: colors.loss }}>{formatVnd(preview.interestTotal)}</Text>
          </Text>
          <Text style={styles.muted}>
            Tổng phải trả: {formatVnd(amount + preview.interestTotal)} · {preview.items.length} kỳ · kỳ đầu {formatDate(preview.items[0].due)}:{' '}
            {formatVnd(preview.items[0].principal + preview.items[0].interest)} · hết hạn {formatDate(preview.items[preview.items.length - 1].due)}
          </Text>
        </Card>
      )}
    </>
  );
}

/** Lựa chọn dạng thẻ có nút tròn (radio) */
function RadioCard({ title, hint, checked, onPress }: { title: string; hint: string; checked: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ checked }}
      style={{
        flexDirection: 'row',
        gap: 12,
        alignItems: 'flex-start',
        minHeight: 56,
        padding: 12,
        borderRadius: 12,
        borderWidth: checked ? 2 : 1,
        borderColor: checked ? colors.primary : colors.border,
        backgroundColor: checked ? colors.primarySoft : colors.surface,
      }}
    >
      <View style={{ width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: checked ? colors.primary : colors.muted, alignItems: 'center', justifyContent: 'center', marginTop: 1 }}>
        {checked ? <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: colors.primary }} /> : null}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.body, { fontWeight: '700' }]}>{title}</Text>
        <Text style={[styles.muted, { marginTop: 2 }]}>{hint}</Text>
      </View>
    </Pressable>
  );
}

/** Lịch trả nợ của khoản vay: từng kỳ, đã trả / quá hạn, tổng lãi đến khi tất toán */
export function LoanScheduleCard({ debt, payments, onPick }: { debt: Debt; payments: DebtPayment[]; onPick: (it: Installment) => void }) {
  const schedule = loanSchedule(debt, payments, today());
  if (!schedule) return null;
  const { items, interestTotal, interestPaid, interestLeft, next } = schedule;

  return (
    <Card>
      <Text style={{ fontSize: font.body + 1, fontWeight: '700', color: colors.text, marginBottom: 6 }}>
        📅 Lịch trả nợ · {debt.loan_plan ? LOAN_PLAN_LABELS[debt.loan_plan].title.toLowerCase() : ''}
      </Text>
      <Text style={styles.body}>
        Tổng lãi đến khi tất toán: <Text style={{ fontWeight: '800', color: colors.loss }}>{formatVnd(interestTotal)}</Text>
      </Text>
      <Text style={[styles.muted, { marginTop: 2, marginBottom: 8 }]}>
        Đã trả lãi {formatVnd(interestPaid)} · còn dự kiến {formatVnd(interestLeft)}
        {next ? ` · kỳ tới ${formatDate(next.due)}: ${formatVnd(next.principal + next.interest)}` : ''}
      </Text>
      {items
        .filter((it) => it.paid || it.principal + it.interest > 0)
        .map((it) => {
          const isNext = next?.no === it.no;
          return (
            <View
              key={it.no}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 10,
                minHeight: 56,
                paddingVertical: 6,
                paddingHorizontal: 8,
                borderTopWidth: 1,
                borderTopColor: colors.border,
                borderRadius: isNext ? 8 : 0,
                backgroundColor: isNext ? colors.primarySoft : 'transparent',
              }}
            >
              <View style={{ flex: 1 }}>
                <Text style={[styles.body, { fontWeight: '700' }, it.overdue && { color: colors.loss }, it.paid && { color: colors.muted }]}>
                  Kỳ {it.no} · {formatDate(it.due)}
                  {it.overdue ? ' · quá hạn' : ''}
                </Text>
                <Text style={styles.muted}>
                  gốc {formatVnd(it.principal)} · lãi {formatVnd(it.interest)}
                </Text>
              </View>
              {it.paid ? (
                <Text style={{ fontSize: 22 }} accessibilityLabel={`Kỳ ${it.no} đã trả`}>
                  ✅
                </Text>
              ) : (
                <Pressable
                  onPress={() => onPick(it)}
                  accessibilityRole="button"
                  accessibilityLabel={`Trả kỳ ${it.no}`}
                  style={({ pressed }) => ({
                    minHeight: 44,
                    minWidth: 64,
                    paddingHorizontal: 12,
                    borderRadius: 10,
                    borderWidth: 1,
                    borderColor: it.overdue ? colors.loss : colors.primary,
                    alignItems: 'center',
                    justifyContent: 'center',
                    opacity: pressed ? 0.6 : 1,
                  })}
                >
                  <Text style={{ fontSize: font.body, fontWeight: '700', color: it.overdue ? colors.loss : colors.primary }}>{it.overdue ? '⚠️ Trả' : 'Trả'}</Text>
                </Pressable>
              )}
            </View>
          );
        })}
      <Text style={[styles.muted, { marginTop: 8 }]}>Kỳ chưa trả tính theo số còn nợ hiện tại: trả bớt gốc sớm thì lãi các kỳ sau giảm theo.</Text>
    </Card>
  );
}

const wrap = { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 8 };
