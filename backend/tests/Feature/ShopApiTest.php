<?php

namespace Tests\Feature;

use App\Enums\ShopType;
use App\Enums\SubmissionStatus;
use App\Models\Shop;
use App\Models\ShopSubmission;
use App\Shops\OsmShopImporter;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class ShopApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_filter_by_type_and_province(): void
    {
        Shop::factory()->create(['name' => 'VTNN A', 'types' => [ShopType::PhanBon, ShopType::ThuocBvtv], 'province_code' => 'dak-lak']);
        Shop::factory()->create(['name' => 'Đại lý cà phê B', 'types' => [ShopType::ThuMua], 'province_code' => 'dak-lak']);
        Shop::factory()->create(['name' => 'VTNN C', 'types' => [ShopType::PhanBon], 'province_code' => 'gia-lai']);
        Shop::factory()->create(['name' => 'Đã ẩn', 'types' => [ShopType::PhanBon], 'is_active' => false]);

        $this->getJson(route('api.v1.shops.index', ['type' => 'phan_bon']))
            ->assertOk()
            ->assertJsonCount(2, 'data');

        $this->getJson(route('api.v1.shops.index', ['type' => 'thu_mua', 'province' => 'dak-lak']))
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.name', 'Đại lý cà phê B')
            ->assertJsonPath('data.0.types', ['thu_mua'])
            ->assertJsonPath('data.0.province_name', 'Đắk Lắk');

        $this->getJson(route('api.v1.shops.index', ['q' => 'VTNN']))->assertJsonCount(2, 'data');
    }

    public function test_near_location_sorted_by_distance_within_radius(): void
    {
        // Buôn Ma Thuột ~ (12.67, 108.04)
        Shop::factory()->create(['name' => 'Xa 20km', 'lat' => 12.85, 'lng' => 108.04]);
        Shop::factory()->create(['name' => 'Gần 1km', 'lat' => 12.679, 'lng' => 108.04]);
        Shop::factory()->create(['name' => 'Pleiku', 'lat' => 13.98, 'lng' => 108.0]);
        Shop::factory()->create(['name' => 'Không tọa độ', 'lat' => null, 'lng' => null]);

        $response = $this->getJson(route('api.v1.shops.index', ['lat' => 12.67, 'lng' => 108.04, 'radius' => 30]))
            ->assertOk()
            ->assertJsonCount(2, 'data')
            ->assertJsonPath('data.0.name', 'Gần 1km')
            ->assertJsonPath('data.1.name', 'Xa 20km');

        $this->assertEqualsWithDelta(20, $response->json('data.1.distance_km'), 1);
    }

    public function test_map_mode_returns_only_shops_with_coordinates_in_one_page(): void
    {
        Shop::factory()->count(35)->create(['lat' => 12.68, 'lng' => 108.05]);
        Shop::factory()->create(['name' => 'Không tọa độ', 'lat' => null, 'lng' => null]);

        // Danh sách thường: 30 điểm / trang, có cả điểm không tọa độ
        $this->getJson(route('api.v1.shops.index'))->assertJsonCount(30, 'data')->assertJsonPath('meta.total', 36);
        // Bản đồ: lấy hết 1 lần, bỏ điểm không có tọa độ
        $this->getJson(route('api.v1.shops.index', ['map' => 1]))
            ->assertJsonCount(35, 'data')
            ->assertJsonPath('meta.has_more', false)
            ->assertJsonPath('meta.total', 35);
    }

    public function test_provinces_with_counts(): void
    {
        Shop::factory()->count(2)->create(['province_code' => 'an-giang']);

        $provinces = collect($this->getJson(route('api.v1.provinces'))->assertOk()->json('data'))->keyBy('code');

        $this->assertCount(34, $provinces);
        $this->assertSame(2, $provinces['an-giang']['shops']);
    }

    public function test_submit_and_approve_new_shop(): void
    {
        $this->postJson(route('api.v1.shops.submit'), [
            'name' => 'Đại lý Ba Tâm',
            'types' => ['thu_mua'],
            'address' => 'Cư Mgar',
            'province_code' => 'dak-lak',
            'phone' => '0905 123 456',
            'goods' => 'cà phê, tiêu',
            'lat' => 12.8,
            'lng' => 108.1,
        ], ['X-Device-Id' => '0b7c1f0e-8a2e-4c55-9d1e-3f4a5b6c7d8e'])->assertCreated();

        // Chưa duyệt thì chưa hiện
        $this->getJson(route('api.v1.shops.index'))->assertJsonCount(0, 'data');

        $shop = ShopSubmission::query()->firstOrFail()->approve();

        $this->assertSame('user', $shop->source);
        $this->assertTrue($shop->types->contains(ShopType::ThuMua));
        $this->getJson(route('api.v1.shops.index'))->assertJsonPath('data.0.name', 'Đại lý Ba Tâm');
    }

    public function test_approve_edit_updates_only_given_fields(): void
    {
        $shop = Shop::factory()->create(['name' => 'Cũ', 'phone' => '0900000000', 'address' => 'Địa chỉ cũ']);
        $submission = ShopSubmission::factory()->create(['shop_id' => $shop->id, 'data' => ['phone' => '0911222333']]);

        $submission->approve();

        $shop->refresh();
        $this->assertSame('0911222333', $shop->phone);
        $this->assertSame('Cũ', $shop->name);
        $this->assertSame(SubmissionStatus::Approved, $submission->fresh()->status);
    }

    public function test_submission_validation(): void
    {
        $this->postJson(route('api.v1.shops.submit'), ['types' => ['khac'], 'phone' => 'abc'], ['X-Device-Id' => '0b7c1f0e-8a2e-4c55-9d1e-3f4a5b6c7d8e'])
            ->assertJsonValidationErrors(['name', 'types.0', 'phone']);
    }

    public function test_osm_import_classifies_and_keeps_verified(): void
    {
        Http::fake(['*' => Http::response(['elements' => [
            ['type' => 'node', 'id' => 1, 'lat' => 12.7, 'lon' => 108.0, 'tags' => ['name' => 'Cửa hàng Vật Tư Nông Nghiệp Thành Đồng', 'shop' => 'fertilizer_supplier', 'addr:province' => 'Đăk Lăk', 'phone' => '+84936444145']],
            ['type' => 'way', 'id' => 2, 'center' => ['lat' => 10.0, 'lon' => 105.7], 'tags' => ['name' => 'Nhà máy phân bón DAP']],
            ['type' => 'node', 'id' => 3, 'lat' => 11.9, 'lon' => 107.6, 'tags' => ['name' => 'Đại lý phân bón Hoà', 'addr:province' => 'Đắk Nông']],
        ]])]);
        Shop::factory()->create(['source_ref' => 'osm:node/3', 'name' => 'Admin đã sửa', 'is_verified' => true]);

        $counts = app(OsmShopImporter::class)->run();

        $this->assertSame(['imported' => 1, 'updated' => 0, 'skipped' => 2], $counts);
        $shop = Shop::query()->where('source_ref', 'osm:node/1')->firstOrFail();
        $this->assertSame('dak-lak', $shop->province_code);
        $this->assertCount(2, $shop->types);
        $this->assertSame('Admin đã sửa', Shop::query()->where('source_ref', 'osm:node/3')->value('name'));
    }

    public function test_osm_shop_without_province_gets_it_from_coordinates(): void
    {
        Http::fake([
            'photon.komoot.io/reverse*' => Http::response(['features' => [
                // Điểm lẻ không kèm tỉnh: bỏ qua, lấy kết quả gần đó có ghi tỉnh / thành phố trực thuộc trung ương
                ['properties' => ['countrycode' => 'VN', 'name' => 'Cửa hàng']],
                ['properties' => ['countrycode' => 'VN', 'name' => 'Đường số 4', 'city' => 'Cần Thơ']],
            ]]),
            '*' => Http::response(['elements' => [
                ['type' => 'way', 'id' => 7, 'center' => ['lat' => 10.11, 'lon' => 105.70], 'tags' => ['name' => 'Đại lý phân bón Trà Nóc', 'shop' => 'fertilizer_supplier']],
            ]]),
        ]);

        app(OsmShopImporter::class)->run();

        $this->assertSame('can-tho', Shop::query()->where('source_ref', 'osm:way/7')->value('province_code'));
    }

    public function test_fill_provinces_command_leaves_unknown_empty(): void
    {
        Http::fake(['photon.komoot.io/reverse*' => Http::sequence()
            ->push(['features' => [['properties' => ['countrycode' => 'VN', 'state' => 'Đắk Lắk']]]])
            ->push(['features' => [['properties' => ['countrycode' => 'VN', 'name' => 'Không rõ']]]]),
        ]);
        $known = Shop::factory()->create(['province_code' => null, 'lat' => 12.91, 'lng' => 108.26]);
        $unknown = Shop::factory()->create(['province_code' => null, 'lat' => 20.43, 'lng' => 106.36]);

        $this->artisan('shops:fill-provinces', ['--delay' => 0])->expectsOutput('Đã điền tỉnh 1/2 điểm bán.')->assertSuccessful();

        $this->assertSame('dak-lak', $known->refresh()->province_code);
        $this->assertNull($unknown->refresh()->province_code);
    }

    public function test_csv_import(): void
    {
        $file = tempnam(sys_get_temp_dir(), 'shops');
        file_put_contents($file, "\u{FEFF}ten,loai,dia_chi,tinh,sdt,mat_hang,lat,lng\n"
            ."Cửa hàng VTNN Hai Lúa,,Ấp 3,Kiên Giang,0297111222,,,\n"
            ."Vựa lúa Sáu Tâm,thu_mua,Ấp 5,An Giang,,lúa gạo,10.38,105.43\n"
            .",phan_bon,,,,,,\n");

        $this->artisan('shops:import-csv', ['file' => $file, '--verified' => true])->assertSuccessful();
        $this->artisan('shops:import-csv', ['file' => $file])->assertSuccessful();

        $this->assertSame(2, Shop::query()->count());
        $first = Shop::query()->where('name', 'Cửa hàng VTNN Hai Lúa')->firstOrFail();
        $this->assertSame('an-giang', $first->province_code);
        $this->assertCount(2, $first->types);
        unlink($file);
    }
}
