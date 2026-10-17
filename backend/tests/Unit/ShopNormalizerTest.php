<?php

namespace Tests\Unit;

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
}
