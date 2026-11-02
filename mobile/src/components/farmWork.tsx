import { canControl, formatQty, workStatusLines, type IotActuator, type IotPlot, type IotPlotEvent, type IotRole, type IotWorkKind, type IotWorkStatus } from '@nhanong/shared';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Text } from './AppText';
import { confirmAsync } from '../lib/confirm';
import { syncFarmWork } from '../lib/farmwork';
import { iotApi, useIotAuth } from '../lib/iot';
import { colors, font } from '../lib/theme';
import { showToast } from '../lib/toast';
import { SectionTitle } from './iot';
import { Button, Card, styles } from './ui';

export const WORK_ICONS: Record<IotWorkKind, string> = { spray: '🧴', fertilize: '🌱', water: '💧', prune: '✂️', other: '📝' };

/** "14:30 02/11" theo giờ máy */
export function workTime(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())} ${p(d.getDate())}/${p(d.getMonth() + 1)}`;
}

function levelStyle(level: 'danger' | 'warn' | 'info') {
  if (level === 'danger') return { card: { borderColor: colors.error, backgroundColor: colors.lossSoft }, text: colors.loss };
  if (level === 'warn') return { card: { borderColor: colors.star, backgroundColor: colors.accentSoft }, text: colors.accentText };
  return { card: { borderColor: colors.infoBorder, backgroundColor: colors.infoSoft }, text: colors.muted };
}

/** Cảnh báo trên đầu trang lô: không vào lô, cách ly, tạm dừng tưới trên tán, vừa bón phân */
export function WorkBanners({ work }: { work: IotWorkStatus | undefined }) {
  return (
    <>
      {workStatusLines(work).map((line) => {
        const s = levelStyle(line.level);
        return (
          <Card key={line.text} style={s.card}>
            <Text style={[styles.body, { color: s.text, fontWeight: line.level === 'info' ? '400' : '600' }]}>{line.text}</Text>
          </Card>
        );
      })}
    </>
  );
}

/** Nhãn gọn trong danh sách lô (chỉ mức nguy hiểm / lưu ý) */
export function WorkBadges({ work }: { work: IotWorkStatus | undefined }) {
  const lines = workStatusLines(work).filter((l) => l.level !== 'info');
  if (lines.length === 0) return null;
  return (
    <View style={{ gap: 4, marginTop: 4 }}>
      {lines.map((line) => {
        const s = levelStyle(line.level);
        return (
          <Text key={line.text} style={{ fontSize: font.small, color: s.text, backgroundColor: s.card.backgroundColor, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, alignSelf: 'flex-start', overflow: 'hidden' }}>
            {line.text}
          </Text>
        );
      })}
    </View>
  );
}

/** Thẻ "Việc làm vườn" của trang lô: ghi việc, việc gần đây, việc đã lên kế hoạch */
export function FarmWorkSection({
  plot,
  role,
  events,
  actuators,
  onChanged,
}: {
  plot: IotPlot;
  role: IotRole;
  events: IotPlotEvent[] | null;
  actuators: IotActuator[];
  onChanged: () => void;
}) {
  const auth = useIotAuth();
  const [showAll, setShowAll] = useState(false);
  const canRecord = canControl(role);
  const owner = role === 'owner';
  const open = (kind: IotWorkKind) => router.push({ pathname: '/iot/work-form', params: { plot: String(plot.id), kind } });
  // Kế hoạch lên trước (gần nhất trước), rồi việc đã làm (mới nhất trước)
  const list = [...(events ?? [])].sort((a, b) => (a.planned !== b.planned ? (a.planned ? -1 : 1) : a.planned ? a.done_at.localeCompare(b.done_at) : b.done_at.localeCompare(a.done_at)));
  const shown = showAll ? list : list.slice(0, 6);
  const undeclared = actuators.filter((a) => (a.kind === 'pump' || a.kind === 'valve') && a.irrigation_mode === null);

  return (
    <View>
      <SectionTitle text="🧑‍🌾 Việc làm vườn" />
      <Card>
        {canRecord && (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
            {(
              [
                ['spray', '🧴 Phun thuốc'],
                ['fertilize', '🌱 Bón phân'],
                ['water', '💧 Tưới'],
                ['other', '📝 Việc khác'],
              ] as const
            ).map(([kind, label]) => (
              <View key={kind} style={{ width: '48%', flexGrow: 1 }}>
                <Button label={label} variant="outline" onPress={() => open(kind)} />
              </View>
            ))}
          </View>
        )}
        {events === null && <Text style={styles.muted}>Đang tải…</Text>}
        {events !== null && list.length === 0 && <Text style={styles.muted}>Chưa ghi việc nào trong 60 ngày qua.</Text>}
        {shown.map((event) => (
          <EventRow
            key={event.id}
            event={event}
            canRecord={canRecord}
            canDelete={owner || (canRecord && event.user?.id === auth?.user.id)}
            onChanged={onChanged}
          />
        ))}
        {list.length > shown.length && (
          <Text onPress={() => setShowAll(true)} accessibilityRole="button" style={{ color: colors.primary, fontWeight: '700', paddingVertical: 8 }}>
            Xem thêm {list.length - shown.length} việc
          </Text>
        )}
        {plot.ledger_garden_id ? (
          <Text style={[styles.muted, { marginTop: 8 }]}>📒 Nhật ký dùng chung với vườn “{plot.ledger_garden_name ?? 'trong sổ'}” trong Sổ thu chi</Text>
        ) : owner ? (
          <Text style={[styles.muted, { marginTop: 8 }]}>📒 Muốn việc ghi ở đây tự vào Nhật ký canh tác của Sổ thu chi: bấm “✏️ Sửa lô”, chọn vườn trong sổ.</Text>
        ) : null}
      </Card>
      {owner && undeclared.length > 0 && (
        <Card style={{ borderColor: colors.star, backgroundColor: colors.accentSoft }}>
          <Text style={[styles.body, { color: colors.accentText, marginBottom: 8 }]}>
            💧 Khai báo kiểu tưới (gốc / trên tán) cho {undeclared.map((a) => a.name).join(', ')} để app tự dừng tưới trên tán sau khi phun thuốc.
          </Text>
          {undeclared.map((a) => (
            <Text
              key={a.id}
              onPress={() => router.push({ pathname: '/iot/actuator-form', params: { id: String(a.id), plot: String(plot.id), farm: '' } })}
              accessibilityRole="button"
              style={{ color: colors.primary, fontWeight: '700', paddingVertical: 6 }}
            >
              Khai báo cho “{a.name}” ›
            </Text>
          ))}
        </Card>
      )}
    </View>
  );
}

function EventRow({ event, canRecord, canDelete, onChanged }: { event: IotPlotEvent; canRecord: boolean; canDelete: boolean; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const amount = event.quantity ? ` ${formatQty(event.quantity)}${event.unit ? ` ${event.unit}` : ''}` : '';
  const who = event.source === 'actuator' ? 'Máy bơm tự ghi' : (event.worker ?? event.user?.name ?? null);
  const detail = [
    event.planned ? null : workTime(event.done_at),
    event.target ? `trị ${event.target}` : null,
    event.withholding_days ? `cách ly ${event.withholding_days} ngày` : null,
    event.source === 'actuator' && event.minutes ? `${event.minutes} phút` : null,
    who,
  ]
    .filter(Boolean)
    .join(' · ');

  const done = async () => {
    setBusy(true);
    try {
      await iotApi.updatePlotEvent(event.id, {
        kind: event.kind,
        title: event.title,
        quantity: event.quantity,
        unit: event.unit,
        target: event.target,
        withholding_days: event.withholding_days,
        reentry_hours: event.reentry_hours,
        rain_free_hours: event.rain_free_hours,
        worker: event.worker,
        note: event.note,
        planned: false,
      });
      showToast({ message: `Đã ghi: ${event.title}` });
      onChanged();
      void syncFarmWork(true);
    } catch (error) {
      showToast({ message: (error as Error).message });
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!(await confirmAsync('Xóa việc này?', `${event.kind_label}: ${event.title}`))) return;
    setBusy(true);
    try {
      await iotApi.deletePlotEvent(event.id);
      onChanged();
      void syncFarmWork(true);
    } catch (error) {
      showToast({ message: (error as Error).message });
    } finally {
      setBusy(false);
    }
  };

  const faint = event.kind === 'water' && event.source === 'actuator';
  return (
    <View style={{ borderTopWidth: 1, borderTopColor: colors.border, paddingVertical: 10, opacity: busy ? 0.5 : 1 }}>
      <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start' }}>
        <Text style={{ fontSize: faint ? 18 : 24 }}>{WORK_ICONS[event.kind]}</Text>
        <Pressable
          style={{ flex: 1 }}
          disabled={!canRecord}
          onPress={() => router.push({ pathname: '/iot/work-form', params: { plot: String(event.plot_id), id: String(event.id) } })}
          accessibilityRole="button"
          accessibilityHint="Sửa việc"
        >
          <Text style={[styles.body, { fontWeight: faint ? '400' : '700' }]}>
            {event.title}
            {amount}
          </Text>
          {event.planned && <Text style={{ fontSize: font.small, color: colors.accentText, fontWeight: '700' }}>📅 Kế hoạch {workTime(event.done_at)}</Text>}
          {detail !== '' && <Text style={styles.muted}>{detail}</Text>}
          {event.note && <Text style={styles.muted}>{event.note}</Text>}
        </Pressable>
        {canDelete && (
          <Text onPress={busy ? undefined : remove} accessibilityRole="button" accessibilityLabel={`Xóa ${event.title}`} style={{ color: colors.error, padding: 6, fontSize: font.small }}>
            Xóa
          </Text>
        )}
      </View>
      {event.planned && canRecord && (
        <View style={{ marginTop: 8 }}>
          <Button label="✓ Đã làm" onPress={done} disabled={busy} />
        </View>
      )}
    </View>
  );
}
