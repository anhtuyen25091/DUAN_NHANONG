import { FARM_LOG_KIND_LABELS, FARM_LOG_KINDS, formatQty, supplyStock, today, WITHHOLDING_PRESETS, type FarmLogKind, type Ledger, type LedgerSnapshot } from '@nhanong/shared';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import { DateField, ErrorNote, Field, GardenPicker, QtyField, TextField } from '../../components/fields';
import { Button, Chip, styles } from '../../components/ui';
import { useLedger } from '../../lib/ledger';
import { parseQty, qtyText } from '../../lib/qty';
import { colors } from '../../lib/theme';
import { showToast } from '../../lib/toast';

/** Ghi 1 việc vào nhật ký canh tác (param gardenId), hoặc sửa (param id) */
export default function FarmLogFormScreen() {
  const state = useLedger();
  if (!state.ledger) return <ActivityIndicator style={{ margin: 32 }} color={colors.primary} />;
  return <FarmLogForm ledger={state.ledger} data={state.data} />;
}

function FarmLogForm({ ledger, data }: { ledger: Ledger; data: LedgerSnapshot }) {
  const { id, gardenId } = useLocalSearchParams<{ id?: string; gardenId?: string }>();
  const log = data.farm_logs.find((l) => l.id === id);
  const [garden, setGarden] = useState<string | null>(log?.garden_id ?? gardenId ?? data.meta.last_garden_id ?? data.gardens[0]?.id ?? null);
  const [kind, setKind] = useState<FarmLogKind>(log?.kind ?? 'spray');
  const [date, setDate] = useState(log?.date ?? today());
  const [supplyId, setSupplyId] = useState(log?.supply_id ?? '');
  const [title, setTitle] = useState(log?.title ?? '');
  const [qty, setQty] = useState(qtyText(log?.quantity ?? 0));
  const [unit, setUnit] = useState(log?.unit ?? '');
  const [target, setTarget] = useState(log?.target ?? '');
  const [days, setDays] = useState(log?.withholding_days ? String(log.withholding_days) : '');
  const [worker, setWorker] = useState(log?.worker ?? '');
  const [note, setNote] = useState(log?.note ?? '');
  const [error, setError] = useState<string | null>(null);
  // Vật tư còn trong kho (Nâng cao): chọn thì tự ghi "dùng cho vườn"
  const stock = data.meta.advanced ? supplyStock(data).filter((s) => s.left > 1e-9) : [];
  const chosen = stock.find((s) => s.supply.id === supplyId);

  if (id && !log) return <Text style={[styles.body, { padding: 16 }]}>Không tìm thấy việc này (có thể đã xóa).</Text>;

  const save = async () => {
    if (!garden) return setError('Hãy chọn vườn.');
    setError(null);
    const input = {
      garden_id: garden,
      date,
      kind,
      title,
      quantity: parseQty(qty) || null,
      unit,
      target,
      withholding_days: Number(days) || null,
      supply_id: log ? undefined : supplyId || null,
      worker,
      note,
    };
    try {
      if (log) await ledger.updateFarmLog(log.id, input);
      else await ledger.addFarmLog(input);
      showToast({ message: log ? 'Đã lưu' : `Đã ghi vào nhật ký${chosen && parseQty(qty) ? ` · trừ kho ${qty} ${chosen.supply.unit}` : ''}` });
      router.back();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const remove = async () => {
    if (!log) return;
    const undo = await ledger.removeFarmLog(log.id);
    showToast({ message: log.supply_usage_id ? 'Đã xóa, vật tư đã trả về kho' : 'Đã xóa', undo });
    router.back();
  };

  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: log ? 'Sửa việc' : '📓 Ghi việc' }} />
      <GardenPicker data={data} value={garden} onChange={setGarden} />
      <Field label="Việc">
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {FARM_LOG_KINDS.map((k) => (
            <Chip key={k} label={FARM_LOG_KIND_LABELS[k]} active={k === kind} onPress={() => setKind(k)} />
          ))}
        </View>
      </Field>
      <DateField label="Ngày làm" value={date} onChange={setDate} notFuture />
      {!log && stock.length > 0 && (kind === 'spray' || kind === 'fertilize') && (
        <Field label="Lấy từ kho vật tư" hint={chosen ? 'Số lượng dùng sẽ trừ vào kho, tiền chuyển sang vườn.' : null}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            <Chip label="Không" active={!supplyId} onPress={() => setSupplyId('')} />
            {stock.map((s) => (
              <Chip
                key={s.supply.id}
                label={`${s.supply.name} · còn ${formatQty(s.left)} ${s.supply.unit}`}
                active={s.supply.id === supplyId}
                onPress={() => {
                  setSupplyId(s.supply.id);
                  setTitle(s.supply.name);
                  setUnit(s.supply.unit);
                }}
              />
            ))}
          </View>
        </Field>
      )}
      <TextField
        label={kind === 'spray' ? 'Tên thuốc *' : kind === 'fertilize' ? 'Tên phân *' : 'Việc làm *'}
        value={title}
        onChange={setTitle}
        maxLength={120}
        placeholder={kind === 'spray' ? 'Ví dụ: Regent 800WG' : kind === 'fertilize' ? 'Ví dụ: NPK 20-20-15' : 'Ví dụ: Tưới gốc 2 giờ'}
      />
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <View style={{ flex: 1 }}>
          <QtyField label="Liều lượng" text={qty} onText={setQty} />
        </View>
        <View style={{ flex: 1 }}>
          <TextField label="Đơn vị" value={unit} onChange={setUnit} maxLength={20} placeholder="chai, gói, kg" editable={!chosen} />
        </View>
      </View>
      {kind === 'spray' && (
        <>
          <TextField label="Trị sâu bệnh gì" value={target} onChange={setTarget} maxLength={120} placeholder="Ví dụ: sâu đục thân, nấm hồng" />
          <TextField label="Thời gian cách ly (ngày, ghi trên nhãn thuốc)" value={days} onChange={(t) => setDays(t.replace(/\D/g, '').slice(0, 3))} keyboardType="number-pad" placeholder="Ví dụ: 14" />
          <View style={{ flexDirection: 'row', gap: 6, marginTop: -4, marginBottom: 10 }}>
            {WITHHOLDING_PRESETS.map((d) => (
              <Chip key={d} label={`${d} ngày`} active={days === String(d)} onPress={() => setDays(String(d))} />
            ))}
          </View>
        </>
      )}
      <TextField label="Người làm" value={worker} onChange={setWorker} maxLength={60} placeholder="Ví dụ: Anh Tư" />
      {data.workers.length > 0 && !worker && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: -4, marginBottom: 10 }}>
          {data.workers.slice(0, 6).map((w) => (
            <Chip key={w.id} label={w.name} active={false} onPress={() => setWorker(w.name)} />
          ))}
        </View>
      )}
      <TextField label="Ghi chú" value={note} onChange={setNote} maxLength={200} placeholder="Ví dụ: pha 2 chai / phuy 200 lít" />
      <ErrorNote message={error} />
      <View style={{ gap: 8 }}>
        <Button label="Lưu" onPress={save} disabled={!title.trim()} />
        {log && <Button label={`Xóa việc này${log.supply_usage_id ? ' (vật tư trả về kho)' : ''}`} variant="danger" onPress={remove} />}
      </View>
    </ScrollView>
  );
}
