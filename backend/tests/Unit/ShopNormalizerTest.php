<?php

namespace Tests\Unit;

use App\Shops\Collect\ShopGeocoder;
use App\Shops\Collect\ShopNormalizer;
use App\Support\Provinces;
use PHPUnit\Framework\TestCase;

class ShopNormalizerTest extends TestCase
{
    public function test_phone_numbers(): void
    {
        $this->assertSame('0912345678', ShopNormalizer::phone('0912.345.678'));
        $this->assertSame('0912345678', ShopNormalizer::phone('+84 912 345 678'));
        $this->assertSame('02773851234', ShopNormalizer::phone('(0277) 3851 234'));
        $this->assertSame('0912345678', ShopNormalizer::phone('ĐT: 0912 345 678 - 0277 3851 234'));
        $this->assertSame('0989306892', ShopNormalizer::phone('989306892'));
        $this->assertSame('0386611369', ShopNormalizer::phone('0168.66.11.369'));
        $this->assertSame('0763679708', ShopNormalizer::phone('1263679708'));
        $this->assertNull(ShopNormalizer::phone('12345'));
        $this->assertNull(ShopNormalizer::phone(null));
    }

    public function test_name_key_drops_generic_words(): void
    {
        $this->assertSame('hai lua', ShopNormalizer::nameKey('Cửa hàng VTNN Hai Lúa'));
        $this->assertSame('hai lua', ShopNormalizer::nameKey('Đại lý phân bón - thuốc BVTV Hai Lúa'));
        $this->assertSame('hai lua', ShopNormalizer::nameKey('HKD Hai Lúa'));
        // Tên chỉ toàn từ chung: giữ nguyên
        $this->assertSame('dai ly phan bon', ShopNormalizer::nameKey('Đại lý phân bón'));
    }

    public function test_name_core_keeps_accents(): void
    {
        $this->assertSame('hai lúa', ShopNormalizer::nameCore('Cửa hàng VTNN Hai Lúa'));
        $this->assertSame('hai lúa', ShopNormalizer::nameCore('Đại lý phân bón - thuốc BVTV Hai Lúa'));
        $this->assertSame('nguyễn thị hường', ShopNormalizer::nameCore('Nguyễn Thị Hường'));
        $this->assertSame('đại lý phân bón', ShopNormalizer::nameCore('Đại lý phân bón'));
    }

    public function test_generic_names(): void
    {
        $this->assertTrue(ShopNormalizer::isGeneric('Cửa hàng buôn bán thuốc bảo vệ thực vật'));
        $this->assertTrue(ShopNormalizer::isGeneric('Đại lý phân bón'));
        $this->assertFalse(ShopNormalizer::isGeneric('Nguyễn Trường Sanh'));
        $this->assertFalse(ShopNormalizer::isGeneric('CH VTNN Tân Trang 2'));
    }

    public function test_display_name(): void
    {
        $this->assertSame('Đại Lý Hai Lúa', ShopNormalizer::displayName('  ĐẠI LÝ   HAI LÚA. '));
        $this->assertSame('Đại lý Hai Lúa', ShopNormalizer::displayName('Đại lý Hai Lúa'));
    }

    public function test_province_detect_keeps_ha_tinh(): void
    {
        // Chữ "tỉnh" không được xóa khỏi "Hà Tĩnh"
        $this->assertSame('ha-tinh', Provinces::detect('Hà Tĩnh'));
        $this->assertSame('ha-tinh', Provinces::detect('xã Thạch Hà, tỉnh Hà Tĩnh'));
        $this->assertSame('ho-chi-minh', Provinces::detect('Q.1, TP.HCM'));
    }

    public function test_geocoder_reads_commune_and_district_from_address(): void
    {
        $geocoder = new ShopGeocoder;
        $this->assertSame(['Đức Bồng', 'Vũ Quang'], $geocoder->parse('Thôn 2, xã Đức Bồng, huyện Vũ Quang'));
        $this->assertSame(['Phù Việt', 'Thạch Hà'], $geocoder->parse('Thôn Thống Nhất, Phù Việt, huyện Thạch Hà'));
        $this->assertSame(['Hà Huy Tập', 'Hà Tĩnh'], $geocoder->parse('Số 359, phường Hà Huy Tập, thành phố Hà Tĩnh'));
        $this->assertSame(['Mỹ Hiệp', 'Cao Lãnh'], $geocoder->parse('Ấp 3, Mỹ Hiệp, Cao Lãnh, Đồng Tháp'));
        $this->assertSame(['Phố Châu', 'Hương Sơn'], $geocoder->parse('Khối 9, thị trấn Phố Châu, huyện Hương Sơn'));
        $this->assertSame([null, null], $geocoder->parse('Thôn 5'));
        $this->assertSame(['Máy Tơ', 'Ngô Quyền'], $geocoder->parse('Phường Máy Tơ, Q.Ngô Quyền'));
        $this->assertSame(['Thạnh An', 'Vĩnh Thạnh'], $geocoder->parse('2729, Phụng Lợi, TT. Thạnh An, huyện Vĩnh Thạnh'));
        $this->assertSame(['Tân An', 'Thanh Hà'], $geocoder->parse('Xóm 1, thôn Đông Phan,Tân An, H. Thanh Hà'));
    }
}
