import { describeLocation, foldVietnamese, nearestProvince, provinceLocation, RADIUS_OPTIONS, type MyLocation } from '@nhanong/shared';
import * as Location from 'expo-location';
import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { api } from '../lib/api';
import { setMyLocation, useMyLocation } from '../lib/myLocation';
import { colors, font } from '../lib/theme';
import { useAsync } from '../lib/useAsync';
import { Field, inputStyle, TextField } from './fields';
import { Button, Card, Chip, styles } from './ui';

/** "📍 Khu vực của tôi: … · Đổi"; chưa chọn thì hiện luôn ô chọn */
export function LocationBar({ title = 'Khu vực của tôi' }: { title?: string }) {
  const location = useMyLocation();
  const [editing, setEditing] = useState(false);
  if (!location || editing) return <LocationEditor onDone={() => setEditing(false)} canCancel={!!location} />;
  return (
    <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <View style={{ flex: 1 }}>
        <Text style={styles.muted}>📍 {title}</Text>
        <Text style={{ fontSize: font.body, fontWeight: '700', color: colors.text }}>{describeLocation(location)}</Text>
      </View>
      <Chip label="Đổi" active={false} onPress={() => setEditing(true)} />
    </Card>
  );
}

/** Chọn tỉnh (gõ để tìm), lấy vị trí GPS, đặt tên chỗ ở và bán kính */
export function LocationEditor({ onDone, canCancel }: { onDone?: () => void; canCancel?: boolean }) {
  const saved = useMyLocation();
  const provinces = useAsync(() => api.provinces(), []);
  const [province, setProvince] = useState(saved?.province ?? '');
  const [search, setSearch] = useState('');
  const [gps, setGps] = useState<{ lat: number; lng: number } | null>(saved?.gps ? { lat: saved.lat, lng: saved.lng } : null);
  const [label, setLabel] = useState(saved?.label ?? '');
  const [radius, setRadius] = useState(saved?.radius ?? 30);
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const list = provinces.state.status === 'ok' ? provinces.state.data : [];
  const nameOf = (code: string) => list.find((p) => p.code === code)?.name ?? null;
  const shown = list.filter((p) => !search.trim() || foldVietnamese(p.name).includes(foldVietnamese(search.trim())));

  const locate = async () => {
    setMessage('Đang lấy vị trí…');
    try {
      const { granted } = await Location.requestForegroundPermissionsAsync();
      if (!granted) return setMessage('Chưa cho phép dùng vị trí. Bạn có thể chỉ chọn tỉnh.');
      const p = (await Location.getLastKnownPositionAsync({ maxAge: 300000 })) ?? (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }));
      const point = { lat: Math.round(p.coords.latitude * 1e4) / 1e4, lng: Math.round(p.coords.longitude * 1e4) / 1e4 };
      setGps(point);
      if (!province) setProvince(nearestProvince(point.lat, point.lng));
      setMessage(null);
    } catch {
      setMessage('Không lấy được vị trí. Hãy bật GPS rồi thử lại, hoặc chỉ chọn tỉnh.');
    }
  };

  const save = async () => {
    const base: MyLocation | null = gps
      ? { province, province_name: nameOf(province), lat: gps.lat, lng: gps.lng, label: label.trim() || null, radius, gps: true }
      : provinceLocation(province, radius, nameOf(province));
    if (!base) return setMessage('Hãy chọn tỉnh.');
    setSaving(true);
    await setMyLocation(gps ? base : { ...base, label: label.trim() || null });
    setSaving(false);
    onDone?.();
  };

  return (
    <Card>
      <Text style={{ fontSize: font.title - 2, fontWeight: '700', color: colors.text }}>📍 Bạn ở khu vực nào?</Text>
      <Text style={[styles.muted, { marginBottom: 10 }]}>Để gợi ý giá các điểm mua quanh bạn và dịch vụ gần đó.</Text>
      <Button label={gps ? '📍 Đã lấy vị trí của tôi' : '📍 Dùng vị trí của tôi'} variant={gps ? 'primary' : 'outline'} onPress={locate} />
      {gps && (
        <Pressable onPress={() => setGps(null)} style={{ minHeight: 40, justifyContent: 'center' }}>
          <Text style={{ color: colors.error }}>Bỏ vị trí (dùng trung tâm tỉnh)</Text>
        </Pressable>
      )}
      {message && <Text style={[styles.muted, { marginTop: 6 }]}>{message}</Text>}
      <Field label={`Tỉnh / thành${province ? `: ${nameOf(province) ?? ''}` : ''}`}>
        <TextInput value={search} onChangeText={setSearch} placeholder="Gõ để tìm tỉnh" placeholderTextColor={colors.muted} style={[inputStyle, { marginBottom: 8 }]} />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {shown.map((p) => (
            <Chip key={p.code} label={p.name} active={p.code === province} onPress={() => setProvince(p.code)} />
          ))}
        </View>
      </Field>
      <TextField label="Tên chỗ ở (không bắt buộc)" value={label} onChange={setLabel} maxLength={120} placeholder="Ví dụ: Xã Hòa Thuận" />
      <Field label="Tìm trong bán kính">
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {RADIUS_OPTIONS.map((r) => (
            <Chip key={r} label={`${r} km`} active={r === radius} onPress={() => setRadius(r)} />
          ))}
        </View>
      </Field>
      <View style={{ gap: 8 }}>
        <Button label={saving ? 'Đang lưu…' : 'Lưu khu vực'} onPress={save} disabled={!province || saving} />
        {canCancel && <Button label="Thôi" variant="outline" onPress={() => onDone?.()} />}
      </View>
    </Card>
  );
}
