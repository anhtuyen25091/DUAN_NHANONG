<?php

namespace Tests\Unit;

use App\Enums\ShopType;
use App\Shops\ShopClassifier;
use App\Support\Provinces;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

class ShopClassifierTest extends TestCase
{
    /**
     * @return array<string, array{string, list<ShopType>}>
     */
    public static function names(): array
    {
        return [
            'phân bón' => ['Đại Lý Phân Bón Chín Thu', [ShopType::PhanBon]],
            'thuốc' => ['Cửa hàng thuốc bảo vệ thực vật Dũng Dinh', [ShopType::ThuocBvtv]],
            'vật tư nông nghiệp' => ['Cửa Hàng Vật Tư Nông Nghiệp Hữu Tâm', [ShopType::PhanBon, ShopType::ThuocBvtv]],
            'thu mua cà phê' => ['Đại lý cà phê Ba Hùng', [ShopType::ThuMua]],
            'thu mua nông sản' => ['Thu mua nông sản Tư Lợi', [ShopType::ThuMua]],
            'nhà máy' => ['Nhà máy phân bón Baconco', []],
            'sắt vụn' => ['Thu Mua Sắt Vụn', []],
            'cơ quan' => ['Chi Cục Trồng Trọt và Bảo Vệ Thực Vật Cần Thơ', []],
            'tiệm hoa' => ['Cây Kiểng Nhã Hương', []],
        ];
    }

    /**
     * @param  list<ShopType>  $expected
     */
    #[DataProvider('names')]
    public function test_classify_by_name(string $name, array $expected): void
    {
        $this->assertEqualsCanonicalizing($expected, ShopClassifier::classify($name));
    }

    public function test_osm_agrarian_tag_without_keywords(): void
    {
        $this->assertEqualsCanonicalizing([ShopType::PhanBon, ShopType::ThuocBvtv], ShopClassifier::classify('Cửa hàng Thanh Bình', ['shop' => 'agrarian']));
        $this->assertSame([ShopType::ThuocBvtv], ShopClassifier::classify('Cửa hàng Thanh Bình', ['shop' => 'agrarian', 'agrarian' => 'pesticide']));
    }

    public function test_detect_new_province_from_old_names(): void
    {
        $this->assertSame('lam-dong', Provinces::detect('Đắk Nông'));
        $this->assertSame('dak-lak', Provinces::detect('Tân Hà, Đăk Lăk'));
        $this->assertSame('ho-chi-minh', Provinces::detect('Phường Linh Tây, TPHCM'));
        $this->assertSame('ho-chi-minh', Provinces::detect('Tỉnh Bà Rịa - Vũng Tàu'));
        $this->assertSame('ho-chi-minh', Provinces::detect('Thành Phố Hồ Chí Minh'));
        $this->assertSame('can-tho', Provinces::detect('Ninh Kiều, Cần Thơ'));
        $this->assertSame('quang-ngai', Provinces::detect('Kon Tum'));
        $this->assertNull(Provinces::detect('Đường Trần Văn Hai'));
        $this->assertNull(Provinces::detect(null));
        $this->assertCount(34, Provinces::options());
    }
}
