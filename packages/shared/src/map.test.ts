import { describe, expect, it } from 'vitest';
import { parseCoordinates } from './map';

describe('parseCoordinates', () => {
  it('đọc số tọa độ', () => {
    expect(parseCoordinates('12.83953, 108.25725')).toEqual({ lat: 12.83953, lng: 108.25725 });
    expect(parseCoordinates(' 12.83953 108.25725 ')).toEqual({ lat: 12.83953, lng: 108.25725 });
    expect(parseCoordinates('12,83953; 108,25725')).toEqual({ lat: 12.83953, lng: 108.25725 });
    expect(parseCoordinates('12,83953 108,25725')).toEqual({ lat: 12.83953, lng: 108.25725 });
  });

  it('đọc link Google Maps / Zalo', () => {
    expect(parseCoordinates('https://www.google.com/maps/place/V%C6%B0%E1%BB%9Dn/@12.8395316,108.2572488,17z/data=!3m1!4b1!4m6!3m5!1s0x0:0x0!8m2!3d12.8401!4d108.2581')).toEqual({ lat: 12.8401, lng: 108.2581 });
    expect(parseCoordinates('https://www.google.com/maps/@10.0452,105.7469,15z')).toEqual({ lat: 10.0452, lng: 105.7469 });
    expect(parseCoordinates('https://maps.google.com/maps?q=10.0452,105.7469&z=17')).toEqual({ lat: 10.0452, lng: 105.7469 });
    expect(parseCoordinates('http://maps.apple.com/?ll=10.0452,105.7469')).toEqual({ lat: 10.0452, lng: 105.7469 });
    expect(parseCoordinates('https://www.google.com/maps/search/?api=1&query=10.0452%2C105.7469')).toEqual({ lat: 10.0452, lng: 105.7469 });
  });

  it('bỏ qua chữ không có tọa độ / ngoài Việt Nam', () => {
    expect(parseCoordinates('')).toBeNull();
    expect(parseCoordinates('Buôn Hồ, Đắk Lắk')).toBeNull();
    expect(parseCoordinates('https://maps.app.goo.gl/AbCd1234')).toBeNull();
    expect(parseCoordinates('48.8566, 2.3522')).toBeNull();
    expect(parseCoordinates('0912345678')).toBeNull();
  });
});
