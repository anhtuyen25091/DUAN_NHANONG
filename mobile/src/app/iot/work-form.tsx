import {
  FARM_LOG_KIND_LABELS,
  FARM_LOG_KINDS,
  formatQty,
  RAIN_FREE_PRESETS,
  randomUuid,
  REENTRY_PRESETS,
  today,
  WITHHOLDING_PRESETS,
  type IotPlotEvent,
  type IotPlotEventInput,
  type IotWorkAdvice,
  type IotWorkKind,
} from '@nhanong/shared';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { Text } from '../../components/AppText';
import { DatePicker } from '../../components/DatePicker';
import { workTime } from '../../components/farmWork';
import { FormInput, FormMessage, FormSection, NO_ERRORS, toFormErrors } from '../../components/iotForm';
import { Button, Card, Chip, Status, styles } from '../../components/ui';
import { confirmAsync } from '../../lib/confirm';
import { syncFarmWork } from '../../lib/farmwork';
import { iotApi } from '../../lib/iot';
import { parseQty } from '../../lib/qty';
import { colors, font } from '../../lib/theme';
import { showToast } from '../../lib/toast';
import { useAsync } from '../../lib/useAsync';

type When = 'now' | 'at' | 'plan';

const TITLE_HINTS: Record<IotWorkKind, string> = {
  spray: 'Tên thuốc, VD Regent 800WG',
  fertilize: 'Tên phân, VD NPK 20-20-15',
  water: 'VD Tưới gốc 2 giờ',
  prune: 'VD Tỉa cành tược, làm cỏ gốc',
  other: 'VD Bao trái, quét vôi gốc',
};

/** Ghi 1 việc làm vườn trên lô (param plot, kind), hoặc sửa (param id) */
export default function IotWorkFormScreen() {
  const { plot, kind, id } = useLocalSearchParams<{ plot: string; kind?: IotWorkKind; id?: string }>();
  const events = useAsync(() => (id ? iotApi.plotEvents(Number(plot)) : Promise.resolve([] as IotPlotEvent[])), [plot, id]);
  if (events.state.status !== 'ok') return <Status state={events.state} retry={events.reload} />;
  const event = id ? events.state.data.find((e) => e.id === Number(id)) : undefined;
  if (id && !event) return <Text style={[styles.body, { padding: 16 }]}>Không tìm thấy việc này (có thể đã xóa).</Text>;
  return <WorkForm plotId={Number(plot)} event={event} initialKind={event?.kind ?? (kind && FARM_LOG_KINDS.includes(kind) ? kind : 'spray')} />;
}

const pad = (n: number) => String(n).padStart(2, '0');
const hhmm = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
const localDate = (iso: string) => today(new Date(iso));

/** "7:30" / "730" / "07:30" → "07:30"; sai thì null */
function parseTime(text: string): string | null {
  const m = /^(\d{1,2})[:h.]?(\d{2})?$/.exec(text.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2] ?? 0);
  return h < 24 && min < 60 ? `${pad(h)}:${pad(min)}` : null;
}

const numText = (n: number | null | undefined) => (n ? String(n) : '');
const digits = (t: string) => t.replace(/\D/g, '').slice(0, 3);

function WorkForm({ plotId, event, initialKind }: { plotId: number; event?: IotPlotEvent; initialKind: IotWorkKind }) {
  const [kind, setKind] = useState<IotWorkKind>(initialKind);
  const [title, setTitle] = useState(event?.title ?? '');
  const [qty, setQty] = useState(event?.quantity ? formatQty(event.quantity) : '');
  const [unit, setUnit] = useState(event?.unit ?? '');
  const [target, setTarget] = useState(event?.target ?? '');
  const [withholding, setWithholding] = useState(numText(event?.withholding_days));
  const [reentry, setReentry] = useState(numText(event?.reentry_hours));
  const [rainFree, setRainFree] = useState(numText(event?.rain_free_hours));
  const [worker, setWorker] = useState(event?.worker ?? '');
  const [note, setNote] = useState(event?.note ?? '');
  const [when, setWhen] = useState<When>(event ? (event.planned ? 'plan' : 'at') : 'now');
  const [date, setDate] = useState(event ? localDate(event.done_at) : today());
  const [time, setTime] = useState(event ? hhmm(new Date(event.done_at)) : hhmm(new Date()));
  const [errors, setErrors] = useState(NO_ERRORS);
  const [busy, setBusy] = useState(false);

  const spray = kind === 'spray';
  // Kiểm tra thời tiết trước khi phun / bón (không cần khi ghi lại việc đã làm từ trước)
  const adviceKind = (kind === 'spray' || kind === 'fertilize') && when !== 'at' ? kind : null;
  const rainFreeHours = spray && Number(rainFree) > 0 ? Number(rainFree) : null;
  // Kết quả gắn với lần hỏi: đổi loại việc / giờ chờ khô thì kết quả cũ không dùng nữa (hiện "Đang xem…")
  const adviceFor = `${plotId}|${adviceKind}|${rainFreeHours}`;
  const [fetched, setFetched] = useState<{ key: string; advice: IotWorkAdvice } | null>(null);
  const advice = fetched?.key === adviceFor ? fetched.advice : null;
  useEffect(() => {
    if (!adviceKind) return;
    let active = true;
    iotApi.workAdvice(plotId, adviceKind, rainFreeHours).then(
      (a) => active && setFetched({ key: adviceFor, advice: a }),
      () => {},
    );
    return () => {
      active = false;
    };
  }, [plotId, adviceKind, rainFreeHours, adviceFor]);

  const save = async () => {
    let doneAt: string | null = null;
    if (when !== 'now') {
      const t = parseTime(time);
      if (!t) return setErrors({ fields: { done_at: ['Nhập giờ dạng 07:30'] }, message: null });
      // Giờ Việt Nam, ghi rõ +07:00 (máy chủ cảm biến lưu theo giờ Việt Nam)
      doneAt = `${date}T${t}:00+07:00`;
      if (when === 'at' && new Date(doneAt) > new Date()) return setErrors({ fields: { done_at: ['Giờ làm không được sau bây giờ. Việc chưa làm thì chọn “Lên kế hoạch”.'] }, message: null });
      if (when === 'plan' && new Date(doneAt) < new Date()) return setErrors({ fields: { done_at: ['Giờ kế hoạch phải sau bây giờ.'] }, message: null });
    }
    if (when === 'now' && advice?.level === 'avoid') {
      const ok = await confirmAsync('Thời tiết chưa phù hợp', `${advice.items.filter((i) => i.level === 'avoid').map((i) => i.text).join('\n')}\nVẫn ghi?`, 'Vẫn ghi');
      if (!ok) return;
    }
    const input: IotPlotEventInput = {
      kind,
      title: title.trim(),
      quantity: parseQty(qty) || null,
      unit: unit.trim() || null,
      target: spray ? target.trim() || null : null,
      withholding_days: spray ? Number(withholding) || null : null,
      reentry_hours: spray ? Number(reentry) || null : null,
      rain_free_hours: spray ? Number(rainFree) || null : null,
      worker: worker.trim() || null,
      note: note.trim() || null,
      planned: when === 'plan',
      done_at: doneAt,
    };
    setBusy(true);
    setErrors(NO_ERRORS);
    try {
      if (event) await iotApi.updatePlotEvent(event.id, input);
      else await iotApi.savePlotEvent(plotId, { ...input, uuid: randomUuid(), source: 'manual' });
      showToast({ message: when === 'plan' ? `Đã lên kế hoạch, sáng hôm đó app nhắc` : `Đã ghi: ${input.title}` });
      void syncFarmWork(true);
      router.back();
    } catch (error) {
      setErrors(toFormErrors(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: event ? 'Sửa việc' : FARM_LOG_KIND_LABELS[kind] }} />
      <FormSection label="Việc" error={errors.fields.kind}>
        {FARM_LOG_KINDS.map((k) => (
          <Chip key={k} small label={FARM_LOG_KIND_LABELS[k]} active={k === kind} onPress={() => setKind(k)} />
        ))}
      </FormSection>

      <FormSection label="Lúc làm" error={errors.fields.done_at}>
        <Chip small label="Vừa làm xong" active={when === 'now'} onPress={() => setWhen('now')} />
        <Chip
          small
          label="Đã làm lúc…"
          active={when === 'at'}
          onPress={() => {
            setWhen('at');
            if (date > today()) setDate(today());
          }}
        />
        <Chip
          small
          label="📅 Lên kế hoạch"
          active={when === 'plan'}
          onPress={() => {
            setWhen('plan');
            if (date < today()) setDate(today());
          }}
        />
      </FormSection>
      {when !== 'now' && (
        <View style={{ marginBottom: 12, gap: 8 }}>
          <DatePicker value={date} onChange={setDate} max={when === 'at' ? today() : undefined} min={when === 'plan' ? today() : undefined} />
          <FormInput label="Giờ" value={time} onChange={setTime} keyboardType="numbers-and-punctuation" placeholder="07:30" maxLength={5} />
          {when === 'plan' && <Text style={styles.muted}>6 giờ sáng hôm đó app nhắc. Làm xong bấm “✓ Đã làm” trên trang lô.</Text>}
        </View>
      )}

      {adviceKind && <AdviceBox advice={advice} />}

      <FormInput label={spray ? 'Tên thuốc *' : kind === 'fertilize' ? 'Tên phân *' : 'Việc làm *'} value={title} onChange={setTitle} error={errors.fields.title} placeholder={TITLE_HINTS[kind]} maxLength={191} />
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <View style={{ flex: 1 }}>
          <FormInput label="Liều lượng" value={qty} onChange={setQty} error={errors.fields.quantity} keyboardType="decimal-pad" />
        </View>
        <View style={{ flex: 1 }}>
          <FormInput label="Đơn vị" value={unit} onChange={setUnit} error={errors.fields.unit} placeholder="chai, gói, kg" maxLength={32} />
        </View>
      </View>

      {spray && (
        <>
          <FormInput label="Trị sâu bệnh gì" value={target} onChange={setTarget} error={errors.fields.target} placeholder="VD sâu đục thân, nấm hồng" maxLength={191} />
          <FormInput
            label="Cách ly thu hoạch (ngày)"
            value={withholding}
            onChange={(t) => setWithholding(digits(t))}
            error={errors.fields.withholding_days}
            keyboardType="number-pad"
            placeholder="VD 14"
            hint="Theo nhãn thuốc. Chưa hết ngày cách ly thì chưa nên thu hoạch."
          />
          <Presets values={WITHHOLDING_PRESETS} unit="ngày" value={withholding} onChange={setWithholding} />
          <FormInput
            label="Không vào lô (giờ)"
            value={reentry}
            onChange={(t) => setReentry(digits(t))}
            error={errors.fields.reentry_hours}
            keyboardType="number-pad"
            placeholder="VD 12"
            hint="Theo nhãn thuốc. App báo mọi người chưa được vào lô."
          />
          <Presets values={REENTRY_PRESETS} unit="giờ" value={reentry} onChange={setReentry} />
          <FormInput
            label="Chờ thuốc khô, không tưới trên tán (giờ)"
            value={rainFree}
            onChange={(t) => setRainFree(digits(t).slice(0, 2))}
            error={errors.fields.rain_free_hours}
            keyboardType="number-pad"
            placeholder="6"
            hint="Để trống là 6 giờ. Máy tưới trên tán của lô tự tạm dừng tới lúc đó."
          />
          <Presets values={RAIN_FREE_PRESETS} unit="giờ" value={rainFree} onChange={setRainFree} />
        </>
      )}

      <FormInput label="Người làm" value={worker} onChange={setWorker} error={errors.fields.worker} placeholder="VD Anh Tư" maxLength={100} />
      <FormInput label="Ghi chú" value={note} onChange={setNote} error={errors.fields.note} placeholder={spray ? 'VD pha 2 chai / phuy 200 lít' : undefined} maxLength={500} />
      <FormMessage errors={errors} />
      <Button label={busy ? 'Đang lưu…' : when === 'plan' ? '📅 Lưu kế hoạch' : 'Lưu'} onPress={save} disabled={busy || title.trim() === ''} />
    </ScrollView>
  );
}

function Presets({ values, unit, value, onChange }: { values: number[]; unit: string; value: string; onChange: (v: string) => void }) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: -4, marginBottom: 12 }}>
      {values.map((d) => (
        <Chip key={d} small label={`${d} ${unit}`} active={value === String(d)} onPress={() => onChange(value === String(d) ? '' : String(d))} />
      ))}
    </View>
  );
}

const ADVICE_ICON = { ok: '✓', info: 'ℹ️', caution: '⚠️', avoid: '⛔' } as const;

/** "Kiểm tra trước khi làm": mưa, gió, nắng, độ ẩm đất (máy chủ tính theo dự báo + cảm biến của lô) */
function AdviceBox({ advice }: { advice: IotWorkAdvice | null }) {
  const color = (level: keyof typeof ADVICE_ICON) => (level === 'avoid' ? colors.error : level === 'caution' ? colors.accentText : level === 'ok' ? colors.primary : colors.muted);
  const border = advice?.level === 'avoid' ? colors.error : advice?.level === 'caution' ? colors.star : colors.cardBorder;
  return (
    <Card style={{ borderColor: border, borderWidth: advice && advice.level !== 'ok' ? 2 : 1 }}>
      <Text style={[styles.body, { fontWeight: '700', marginBottom: 6 }]}>🌤️ Kiểm tra trước khi làm</Text>
      {!advice && <Text style={styles.muted}>Đang xem thời tiết…</Text>}
      {advice?.items.map((item) => (
        <Text key={item.text} style={{ fontSize: font.body, color: color(item.level), marginBottom: 4 }}>
          {ADVICE_ICON[item.level]} {item.text}
        </Text>
      ))}
      {advice?.best_time && <Text style={[styles.body, { fontWeight: '700', marginTop: 4 }]}>Giờ phù hợp gần nhất: {workTime(advice.best_time)}</Text>}
    </Card>
  );
}
