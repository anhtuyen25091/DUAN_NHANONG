import { describeLocation, foldVietnamese, nearestProvince, placeLabel, provinceLocation, RADIUS_OPTIONS, type MyLocation, type Place } from '@nhanong/shared';
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

/**
 * Chọn tỉnh (gõ để tìm), rồi chọn chỗ ở để tìm cho đúng: tìm xã / phường / thôn (lấy tọa độ địa danh) hoặc dùng GPS.
 * Không chọn chỗ ở thì tìm quanh trung tâm tỉnh (ghi rõ để người dùng không tưởng là quanh nhà mình).
 */
export function LocationEditor({ onDone, canCancel }: { onDone?: () => void; canCancel?: boolean }) {
  const saved = useMyLocation();
  const provinces = useAsync(() => api.provinces(), []);
  const [province, setProvince] = useState(saved?.province ?? '');
  const [search, setSearch] = useState('');
  // Tọa độ thật: từ GPS hoặc địa danh đã chọn; null = trung tâm tỉnh
  const [point, setPoint] = useState<{ lat: number; lng: number; from: 'gps' | 'place' } | null>(saved?.gps ? { lat: saved.lat, lng: saved.lng, from: 'gps' } : null);
  const [label, setLabel] = useState(saved?.gps ? (saved.label ?? '') : '');
  const [query, setQuery] = useState('');
  const [places, setPlaces] = useState<Place[] | null>(null);
  const [searching, setSearching] = useState(false);
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
      if (!granted) return setMessage('Chưa cho phép dùng vị trí. Bạn có thể tìm xã / phường của mình.');
      const p = (await Location.getLastKnownPositionAsync({ maxAge: 300000 })) ?? (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }));
      const lat = Math.round(p.coords.latitude * 1e4) / 1e4;
      const lng = Math.round(p.coords.longitude * 1e4) / 1e4;
      setPoint({ lat, lng, from: 'gps' });
      setLabel('');
      setPlaces(null);
      if (!province) setProvince(nearestProvince(lat, lng));
      setMessage(null);
    } catch {
      setMessage('Không lấy được vị trí. Hãy bật GPS rồi thử lại, hoặc tìm xã / phường của mình.');
    }
  };

  const searchPlaces = async () => {
    if (query.trim().length < 2) return setMessage('Gõ ít nhất 2 chữ, ví dụ "Buôn Hồ".');
    setSearching(true);
    setMessage(null);
    try {
      const found = await api.places(query.trim(), province);
      setPlaces(found);
      if (found.length === 0) setMessage(`Không tìm thấy "${query.trim()}". Thử gõ tên xã / phường, hoặc tên huyện cũ.`);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Chưa tìm được địa danh. Hãy thử lại.');
    } finally {
      setSearching(false);
    }
  };

  const choose = (place: Place) => {
    setPoint({ lat: place.lat, lng: place.lng, from: 'place' });
    setLabel(place.name);
    if (place.province) setProvince(place.province);
    setPlaces(null);
    setQuery('');
    setMessage(null);
  };

  const save = async () => {
    const location: MyLocation | null = point
      ? { province, province_name: nameOf(province), lat: point.lat, lng: point.lng, label: label.trim() || null, radius, gps: true }
      : provinceLocation(province, radius, nameOf(province));
    if (!location) return setMessage('Hãy chọn tỉnh.');
    setSaving(true);
    await setMyLocation(location);
    setSaving(false);
    onDone?.();
  };

  return (
    <Card>
      <Text style={{ fontSize: font.title - 2, fontWeight: '700', color: colors.text }}>📍 Bạn ở khu vực nào?</Text>
      <Text style={[styles.muted, { marginBottom: 10 }]}>Để gợi ý giá các điểm mua quanh bạn và dịch vụ gần đó.</Text>
      <Field label={`Tỉnh / thành${province ? `: ${nameOf(province) ?? ''}` : ''}`}>
        <TextInput value={search} onChangeText={setSearch} placeholder="Gõ để tìm tỉnh" placeholderTextColor={colors.muted} style={[inputStyle, { marginBottom: 8 }]} />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {shown.map((p) => (
            <Chip key={p.code} label={p.name} active={p.code === province} onPress={() => setProvince(p.code)} />
          ))}
        </View>
      </Field>

      <Field label="Chỗ ở (để tìm đúng quanh nhà bạn)">
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
          <TextInput
            value={query}
            onChangeText={setQuery}
            onSubmitEditing={searchPlaces}
            returnKeyType="search"
            maxLength={100}
            placeholder="Gõ xã / phường / thôn, vd: Buôn Hồ"
            placeholderTextColor={colors.muted}
            style={[inputStyle, { flex: 1 }]}
          />
          <Chip label={searching ? 'Đang tìm…' : 'Tìm'} active={false} onPress={searchPlaces} />
        </View>
        {places && places.length > 0 && (
          <View style={{ gap: 6, marginTop: 8 }}>
            {places.map((p) => (
              <Pressable
                key={`${p.name}|${p.lat}|${p.lng}`}
                onPress={() => choose(p)}
                accessibilityRole="button"
                style={({ pressed }) => ({ padding: 12, borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: pressed ? colors.bg : colors.surface })}
              >
                <Text style={{ fontSize: font.body, fontWeight: '700', color: colors.text }}>{placeLabel(p)}</Text>
                {p.province_name && <Text style={styles.muted}>{p.province_name}</Text>}
              </Pressable>
            ))}
          </View>
        )}
        <View style={{ marginTop: 8 }}>
          <Button label={point?.from === 'gps' ? '📍 Đã lấy vị trí của tôi' : '📍 Hoặc dùng vị trí của máy'} variant={point?.from === 'gps' ? 'primary' : 'outline'} onPress={locate} />
        </View>
        {message && <Text style={[styles.muted, { marginTop: 6 }]}>{message}</Text>}
        {point ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
            <Text style={[styles.body, { flex: 1 }]}>
              ✓ Tìm quanh: <Text style={{ fontWeight: '700' }}>{label.trim() || 'vị trí của tôi'}</Text>
            </Text>
            <Pressable onPress={() => (setPoint(null), setLabel(''))} style={{ minHeight: 40, justifyContent: 'center' }}>
              <Text style={{ color: colors.error }}>Bỏ chỗ ở</Text>
            </Pressable>
          </View>
        ) : (
          !!province && (
            <Text style={[styles.muted, { marginTop: 8 }]}>
              Chưa chọn chỗ ở: đang tìm quanh trung tâm tỉnh {nameOf(province) ?? ''}. Nhà bạn ở xa trung tâm thì hãy tìm xã / phường.
            </Text>
          )
        )}
      </Field>
      {point?.from === 'gps' && <TextField label="Đặt tên cho vị trí này (không bắt buộc)" value={label} onChange={setLabel} maxLength={120} placeholder="Ví dụ: Rẫy nhà" />}
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
