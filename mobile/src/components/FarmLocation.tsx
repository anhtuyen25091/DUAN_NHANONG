import { foldVietnamese, nearestProvince, parseCoordinates, placeLabel, PROVINCE_CENTERS, PROVINCE_NAMES, VIETNAM_CENTER, type Place } from '@nhanong/shared';
import * as Location from 'expo-location';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Platform, Pressable, View } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import { api } from '../lib/api';
import { mapHtml } from '../lib/shopMapHtml';
import { colors, currentScheme } from '../lib/theme';
import { Text } from './AppText';
import { FormInput, FormSection } from './iotForm';
import { Button, Card, Chip, styles } from './ui';

type Point = { lat: number; lng: number };
export type FarmPlace = { province: string; point: Point | null };

/**
 * Vị trí trang trại khi không đứng tại vườn (VD con cái quản lý giúp cha mẹ):
 * tìm xã / phường / thôn, dán link Google Maps / tọa độ cha mẹ gửi qua Zalo, rồi bấm hoặc kéo ghim trên bản đồ cho đúng chỗ.
 * Vẫn dùng được vị trí hiện tại khi đang đứng tại vườn. province là tên tỉnh (giống IotFarm.province).
 */
export function FarmLocation({ value, onChange }: { value: FarmPlace; onChange: (next: FarmPlace) => void }) {
  const { province, point } = value;
  const [provinceSearch, setProvinceSearch] = useState('');
  const [query, setQuery] = useState('');
  const [places, setPlaces] = useState<Place[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [paste, setPaste] = useState('');
  const [label, setLabel] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const web = useRef<WebView<object>>(null);

  const provinceCode = Object.entries(PROVINCE_NAMES).find(([, n]) => n === province)?.[0] ?? '';
  const provinceMatches = provinceSearch.trim()
    ? Object.entries(PROVINCE_NAMES)
        .filter(([, n]) => foldVietnamese(n).includes(foldVietnamese(provinceSearch.trim())))
        .slice(0, 8)
    : [];

  /**
   * Đặt vị trí. Tỉnh: lấy theo địa danh đã chọn; không có thì giữ tỉnh đang chọn khi chỉ chỉnh gần đó,
   * chưa chọn tỉnh hoặc dời sang vùng khác thì lấy tỉnh gần nhất.
   */
  const place = (next: Point, from: string | null, provinceName?: string | null) => {
    const nearest = PROVINCE_NAMES[nearestProvince(next.lat, next.lng)] ?? '';
    const moved = !point || nearestProvince(point.lat, point.lng) !== nearestProvince(next.lat, next.lng);
    onChange({ point: next, province: provinceName || (province && !moved ? province : nearest) });
    setLabel(from);
  };

  const pickProvince = (code: string) => {
    const center = PROVINCE_CENTERS[code];
    setProvinceSearch('');
    // Đã có vị trí trong tỉnh này thì giữ; không thì về trung tâm tỉnh (đủ cho dự báo thời tiết)
    const keep = point && nearestProvince(point.lat, point.lng) === code;
    onChange({ province: PROVINCE_NAMES[code] ?? '', point: keep ? point : center ? { lat: center[0], lng: center[1] } : null });
    if (!keep) setLabel('trung tâm tỉnh');
  };

  const search = async () => {
    if (query.trim().length < 2) return setMessage('Gõ ít nhất 2 chữ, VD "Ea Tu" hoặc "Cư Bao".');
    setSearching(true);
    setMessage(null);
    try {
      const found = await api.places(query.trim(), provinceCode || null);
      setPlaces(found);
      if (found.length === 0) setMessage(`Không tìm thấy "${query.trim()}". Thử tên xã / phường, hoặc tên huyện cũ; rồi bấm trên bản đồ cho đúng chỗ vườn.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Chưa tìm được địa danh. Hãy thử lại.');
    } finally {
      setSearching(false);
    }
  };

  const choose = (p: Place) => {
    place({ lat: p.lat, lng: p.lng }, placeLabel(p), (p.province && PROVINCE_NAMES[p.province]) || p.province_name);
    setPlaces(null);
    setQuery('');
    setMessage('Đã tới xã / thôn đã chọn. Bấm hoặc kéo 📍 trên bản đồ cho đúng chỗ vườn.');
  };

  const applyPaste = (text: string) => {
    setPaste(text);
    if (!text.trim()) return setMessage(null);
    const found = parseCoordinates(text);
    if (found) {
      place(found, 'vị trí đã dán');
      setMessage('Đã đọc được vị trí. Xem lại 📍 trên bản đồ.');
    } else {
      setMessage(
        /goo\.gl|maps\.app/.test(text)
          ? 'Link rút gọn chưa có tọa độ: mở link đó, đợi bản đồ hiện xong rồi bấm Chia sẻ › Sao chép đường liên kết, hoặc chép tọa độ.'
          : 'Chưa đọc được vị trí. Dán link Google Maps hoặc tọa độ dạng "12.8395, 108.2572".',
      );
    }
  };

  const locate = async () => {
    setMessage('Đang lấy vị trí…');
    try {
      const { granted } = await Location.requestForegroundPermissionsAsync();
      if (!granted) return setMessage('Chưa cho phép dùng vị trí. Hãy tìm xã / phường của vườn.');
      const p = (await Location.getLastKnownPositionAsync({ maxAge: 300000 })) ?? (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }));
      place({ lat: Math.round(p.coords.latitude * 1e5) / 1e5, lng: Math.round(p.coords.longitude * 1e5) / 1e5 }, 'vị trí hiện tại của máy');
      setMessage('Đã lấy vị trí hiện tại (chỉ đúng khi đang đứng tại vườn).');
    } catch {
      setMessage('Không lấy được vị trí. Hãy tìm xã / phường của vườn, hoặc bấm trên bản đồ.');
    }
  };

  // Dựng bản đồ 1 lần (theo vị trí lúc mở form); sau đó chỉ dời ghim
  const html = useMemo(
    () =>
      mapHtml({
        center: point ? [point.lat, point.lng] : (PROVINCE_CENTERS[provinceCode] ?? VIETNAM_CENTER),
        zoom: point ? 14 : provinceCode ? 9 : null,
        dark: currentScheme() === 'dark',
        pin: point,
      }),
    [], // eslint-disable-line react-hooks/exhaustive-deps
  );
  useEffect(() => {
    if (point) web.current?.injectJavaScript(`window.setPin&&window.setPin(${point.lat},${point.lng});true;`);
  }, [point]);

  const onMessage = (event: WebViewMessageEvent) => {
    const message = JSON.parse(event.nativeEvent.data) as { action: string; lat?: number; lng?: number };
    if (message.action === 'pick' && message.lat !== undefined && message.lng !== undefined) place({ lat: message.lat, lng: message.lng }, 'chỗ đã chọn trên bản đồ');
  };

  return (
    <Card>
      <Text style={[styles.body, { fontWeight: '700', marginBottom: 4 }]}>📍 Vị trí vườn (để xem dự báo thời tiết, báo mưa)</Text>
      <Text style={[styles.muted, { marginBottom: 8 }]}>{province ? `Tỉnh: ${province}` : 'Chưa chọn tỉnh'}</Text>
      <FormInput label="Tỉnh" value={provinceSearch} onChange={setProvinceSearch} placeholder="Gõ tên tỉnh, VD: Đắk Lắk" />
      {provinceMatches.length > 0 && (
        <FormSection label="Chọn tỉnh">
          {provinceMatches.map(([code, provinceName]) => (
            <Chip key={code} label={provinceName} active={province === provinceName} onPress={() => pickProvince(code)} small />
          ))}
        </FormSection>
      )}

      <FormInput label="Tìm xã / phường / thôn của vườn" value={query} onChange={setQuery} placeholder="VD: Ea Tu, Cư Bao, Tân Phú" returnKeyType="search" onSubmitEditing={() => void search()} />
      <View style={{ marginTop: -6, marginBottom: 8 }}>
        <Button label={searching ? 'Đang tìm…' : '🔎 Tìm'} onPress={() => void search()} disabled={searching} variant="outline" />
      </View>
      {places?.map((p) => (
        <Pressable key={`${p.name}|${p.lat}|${p.lng}`} onPress={() => choose(p)} accessibilityRole="button" style={{ paddingVertical: 10, borderBottomWidth: 1, borderColor: colors.border }}>
          <Text style={styles.body}>
            <Text style={{ fontWeight: '700' }}>{placeLabel(p)}</Text>
            {p.province_name ? <Text style={styles.muted}> · {p.province_name}</Text> : null}
          </Text>
        </Pressable>
      ))}

      <FormInput
        label="Hoặc dán vị trí cha mẹ / người ở vườn gửi"
        value={paste}
        onChange={applyPaste}
        placeholder="Link Google Maps, vị trí Zalo, hoặc 12.8395, 108.2572"
        autoCapitalize="none"
        autoCorrect={false}
      />
      <Button label="📡 Dùng vị trí hiện tại (khi đang ở vườn)" onPress={locate} variant="outline" />
      {message && <Text style={[styles.muted, { marginTop: 6 }]}>{message}</Text>}

      {Platform.OS === 'web' ? (
        <Text style={[styles.muted, { marginTop: 8 }]}>Bản đồ chỉ hiện trên điện thoại.</Text>
      ) : (
        <View style={{ height: 300, marginTop: 10, borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: colors.border }}>
          <WebView<object> ref={web} originWhitelist={['*']} source={{ html }} onMessage={onMessage} style={{ flex: 1, backgroundColor: colors.bg }} setSupportMultipleWindows={false} nestedScrollEnabled />
        </View>
      )}
      <Text style={[styles.muted, { marginTop: 6 }]}>
        {point ? `📍 ${label ? `${label[0].toUpperCase()}${label.slice(1)}: ` : ''}${point.lat}, ${point.lng}` : 'Chưa có vị trí'}
        {Platform.OS === 'web' ? '' : ' · bấm vào bản đồ hoặc kéo 📍 để chỉnh'}
      </Text>
    </Card>
  );
}
