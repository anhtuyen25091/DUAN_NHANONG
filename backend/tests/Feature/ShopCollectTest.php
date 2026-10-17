<?php

namespace Tests\Feature;

use App\Enums\CandidateStatus;
use App\Enums\ShopType;
use App\Models\Shop;
use App\Models\ShopCandidate;
use App\Shops\Collect\CandidateData;
use App\Shops\Collect\CandidateProcessor;
use App\Shops\Collect\ShopCollector;
use App\Shops\Collect\ShopSource;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class ShopCollectTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        config(['shops.geocode_delay_ms' => 0, 'shops.publish_threshold' => 70]);
    }

    /**
     * @param  list<CandidateData>  $items
     */
    private function source(string $key, int $trust, array $items): ShopSource
    {
        return new class($key, $trust, $items) implements ShopSource
        {
            /** @param list<CandidateData> $items */
            public function __construct(private string $key, private int $trust, private array $items) {}

            public function key(): string
            {
                return $this->key;
            }

            public function label(): string
            {
                return $this->key;
            }

            public function trust(): int
            {
                return $this->trust;
            }

            public function collect(): iterable
            {
                return $this->items;
            }
        };
    }

    /** Photon trả 1 điểm (xã) ở Đồng Tháp */
    private function fakeGeocoder(float $lat = 10.45, float $lng = 105.63, string $state = 'Đồng Tháp', string $osmKey = 'place'): void
    {
        Http::fake(['photon.komoot.io/*' => Http::response(['features' => [[
            'geometry' => ['coordinates' => [$lng, $lat]],
            'properties' => ['countrycode' => 'VN', 'state' => $state, 'osm_key' => $osmKey, 'type' => 'locality', 'name' => 'Mỹ Hiệp'],
        ]]])]);
    }

    private function collectAndProcess(ShopSource $source): void
    {
        $collector = app(ShopCollector::class);
        $collector->collect($source);
        $collector->process($source->key());
    }

    public function test_trusted_list_is_published_with_geocoded_place(): void
    {
        $this->fakeGeocoder();

        $this->collectAndProcess($this->source('so-dong-thap', 85, [
            new CandidateData(ref: 'GCN-001', name: 'CỬA HÀNG VTNN HAI LÚA', address: 'Ấp 3, xã Mỹ Hiệp, huyện Cao Lãnh, tỉnh Đồng Tháp', phone: '0277.3851.234', types: [ShopType::PhanBon]),
        ]));

        $shop = Shop::query()->sole();
        $this->assertSame('Cửa Hàng Vtnn Hai Lúa', $shop->name);
        $this->assertSame('dong-thap', $shop->province_code);
        $this->assertSame('02773851234', $shop->phone);
        $this->assertSame('place', $shop->geo_precision);
        $this->assertSame('so-dong-thap:GCN-001', $shop->source_ref);
        $this->assertFalse($shop->is_verified);

        $candidate = ShopCandidate::query()->sole();
        $this->assertSame(CandidateStatus::Published, $candidate->status);
        $this->assertSame($shop->id, $candidate->shop_id);
        $this->assertSame(85 + 5 + 5, $candidate->confidence);
    }

    public function test_same_shop_from_second_source_is_merged_not_duplicated(): void
    {
        $this->fakeGeocoder();
        $this->collectAndProcess($this->source('so-dong-thap-pb', 85, [
            new CandidateData(ref: '1', name: 'Đại lý phân bón Hai Lúa', address: 'xã Mỹ Hiệp, Đồng Tháp', phone: '0912 345 678', types: [ShopType::PhanBon]),
        ]));
        // Danh sách buôn bán thuốc BVTV ghi tên khác, số điện thoại có +84
        $this->collectAndProcess($this->source('so-dong-thap-bvtv', 85, [
            new CandidateData(ref: 'BV-9', name: 'Cửa hàng thuốc BVTV Hai Lúa', address: 'Mỹ Hiệp, Cao Lãnh, Đồng Tháp', phone: '+84 912 345 678', types: [ShopType::ThuocBvtv]),
        ]));

        $shop = Shop::query()->sole();
        $this->assertEqualsCanonicalizing(['phan_bon', 'thuoc_bvtv'], $shop->types->map->value->all());
        $this->assertSame(2, $shop->candidates()->count());
        // Có ở 2 nguồn: được cộng điểm
        $this->assertSame(100, ShopCandidate::query()->where('source', 'so-dong-thap-bvtv')->value('confidence'));
    }

    public function test_name_match_without_phone_needs_same_address(): void
    {
        $this->fakeGeocoder();
        Shop::factory()->create(['name' => 'VTNN Hai Lúa', 'province_code' => 'dong-thap', 'phone' => null, 'address' => 'Ấp 3, Mỹ Hiệp, Cao Lãnh', 'lat' => 10.45, 'lng' => 105.63]);

        $this->collectAndProcess($this->source('hang-a', 80, [
            new CandidateData(ref: 'x', name: 'Đại lý Hai Lúa', address: 'ấp 3, xã Mỹ Hiệp, huyện Cao Lãnh', province: 'Đồng Tháp', types: [ShopType::PhanBon]),
            new CandidateData(ref: 'y', name: 'Đại lý Hai Lúa', address: 'Phường 1, TP Sa Đéc', province: 'Đồng Tháp', types: [ShopType::PhanBon], lat: 10.29, lng: 105.76),
        ]));

        // Cùng tên, cùng địa chỉ → gộp; cùng tên nhưng ở Sa Đéc (cách > 2 km) → điểm khác
        $this->assertSame(2, Shop::query()->count());
        $this->assertNotNull(ShopCandidate::query()->where('source_ref', 'x')->value('shop_id'));
    }

    public function test_low_trust_or_unknown_type_waits_for_admin(): void
    {
        $this->fakeGeocoder();

        $this->collectAndProcess($this->source('danh-ba', 50, [
            new CandidateData(ref: '1', name: 'Đại lý phân bón Ba Tèo', address: 'Mỹ Hiệp, Đồng Tháp'),
            new CandidateData(ref: '2', name: 'Cơ sở Năm Lửa', address: 'Mỹ Hiệp, Đồng Tháp'),
        ]));

        $this->assertSame(0, Shop::query()->count());
        $candidates = ShopCandidate::query()->orderBy('source_ref')->get();
        $this->assertSame(['phan_bon'], $candidates[0]->types->map->value->all());
        $this->assertSame('Chưa đủ tin cậy để tự hiện', $candidates[0]->review_note);
        $this->assertSame('Không rõ loại điểm (thu mua / phân bón / BVTV)', $candidates[1]->review_note);

        // Admin bấm "Đưa vào"
        app(CandidateProcessor::class)->publish($candidates[0]);
        $this->assertSame('Đại lý phân bón Ba Tèo', Shop::query()->sole()->name);
        $this->assertSame(CandidateStatus::Published, $candidates[0]->fresh()->status);
    }

    public function test_falls_back_to_province_center_when_address_not_found(): void
    {
        Http::fake(['photon.komoot.io/*' => Http::response(['features' => []])]);

        $this->collectAndProcess($this->source('so-ha-tinh', 85, [
            new CandidateData(ref: '1', name: 'Đại lý phân bón Bảy Hùng', address: 'Thôn Không Có, xã Lạ', province: 'Hà Tĩnh', types: [ShopType::PhanBon]),
        ]));

        $shop = Shop::query()->sole();
        $this->assertSame('province', $shop->geo_precision);
        $this->assertSame('ha-tinh', $shop->province_code);
    }

    public function test_geocoder_outage_defers_without_guessing(): void
    {
        Http::fake(['photon.komoot.io/*' => Http::response('', 503)]);

        $collector = app(ShopCollector::class);
        $source = $this->source('so-ha-tinh', 85, [
            new CandidateData(ref: '1', name: 'Đại lý phân bón Bảy Hùng', address: 'xã Không Có Thật', province: 'Hà Tĩnh', types: [ShopType::PhanBon]),
        ]);
        $collector->collect($source);
        $result = $collector->process('so-ha-tinh');

        $this->assertSame(1, $result['deferred']);
        $this->assertNull(ShopCandidate::query()->sole()->lat);
        $this->assertSame(0, Shop::query()->count());
    }

    public function test_verified_shop_keeps_admin_data(): void
    {
        $this->fakeGeocoder();
        $shop = Shop::factory()->create(['name' => 'Tên admin sửa', 'phone' => '0912345678', 'province_code' => 'dong-thap', 'types' => [ShopType::ThuMua]]);

        $this->collectAndProcess($this->source('hang-b', 80, [
            // Cùng số, tên viết khác kiểu (HOA): cùng điểm, nhưng không được sửa tên / địa chỉ admin đã nhập
            new CandidateData(ref: '1', name: 'TÊN ADMIN SỬA', address: 'Mỹ Hiệp, Đồng Tháp', phone: '0912345678', types: [ShopType::PhanBon]),
        ]));

        $address = $shop->address;
        $shop->refresh();
        $this->assertSame('Tên admin sửa', $shop->name);
        $this->assertSame($address, $shop->address);
        $this->assertEqualsCanonicalizing(['thu_mua', 'phan_bon'], $shop->types->map->value->all());
    }

    public function test_csv_file_command(): void
    {
        $this->fakeGeocoder();
        $file = tempnam(sys_get_temp_dir(), 'shops').'.csv';
        file_put_contents($file, "\u{FEFF}Ma,Ten,Dia_chi,Sdt\nGCN-1,Đại lý Tư Hưng,\"xã Mỹ Hiệp, Đồng Tháp\",0909 111 222\n,,,\n");

        $this->artisan('shops:collect-file', ['file' => $file, '--source' => 'so-dong-thap-pb', '--type' => ['phan_bon'], '--trust' => 85])
            ->expectsOutputToContain('mới 1')
            ->expectsOutputToContain('Đưa vào danh sách 1')
            ->assertSuccessful();

        $this->assertSame('0909111222', Shop::query()->sole()->phone);
        unlink($file);
    }

    public function test_province_found_from_coordinates_when_source_has_none(): void
    {
        Http::fake(['photon.komoot.io/reverse*' => Http::response(['features' => [['properties' => ['countrycode' => 'VN', 'state' => 'Đắk Lắk']]]])]);

        $this->collectAndProcess($this->source('osm', 60, [
            new CandidateData(ref: 'node/1', name: 'Đại lý cà phê Ba Hùng', types: [ShopType::ThuMua], lat: 12.68, lng: 108.05),
        ]));

        $this->assertSame('dak-lak', Shop::query()->sole()->province_code);
    }

    public function test_old_commune_found_offline_and_unrelated_buildings_ignored(): void
    {
        // Photon trả bừa 1 tòa nhà có chữ giống: không được lấy
        Http::fake(['photon.komoot.io/*' => Http::response(['features' => [[
            'geometry' => ['coordinates' => [105.90, 18.34]],
            'properties' => ['countrycode' => 'VN', 'state' => 'Hà Tĩnh', 'osm_key' => 'building', 'type' => 'house', 'name' => 'Bảo hiểm Xã hội Hà Tĩnh'],
        ]]])]);

        $this->collectAndProcess($this->source('so-ha-tinh', 85, [
            // Xã cũ (đã sáp nhập): lấy tâm xã từ bảng xã cũ
            new CandidateData(ref: '1', name: 'Nguyễn Văn A', address: 'Xóm 3, xã Thạch Khê, thành phố Hà Tĩnh', province: 'ha-tinh', types: [ShopType::PhanBon]),
            // Xã không có trong bảng, Photon không ra xã: lấy tâm huyện cũ
            new CandidateData(ref: '2', name: 'Trần Thị B', address: 'Thôn 1, xã Không Có, huyện Can Lộc', province: 'ha-tinh', types: [ShopType::PhanBon]),
        ]));

        $shops = Shop::query()->orderBy('name')->get();
        $this->assertSame(['place', 'district'], [$shops[0]->geo_precision, $shops[1]->geo_precision]);
        $this->assertEqualsWithDelta(18.38, $shops[0]->lat, 0.01);
        $this->assertEqualsWithDelta(105.94, $shops[0]->lng, 0.01);
    }

    public function test_same_person_name_in_different_communes_is_not_merged(): void
    {
        Http::fake(['photon.komoot.io/*' => Http::response(['features' => []])]);

        $this->collectAndProcess($this->source('so-ha-tinh-pb', 85, [
            new CandidateData(ref: '1', name: 'Nguyễn Thị Hương', address: 'Thôn 2, xã Đức Bồng, huyện Vũ Quang', province: 'ha-tinh', types: [ShopType::PhanBon]),
            new CandidateData(ref: '2', name: 'Nguyễn Thị Hương', address: 'Thôn Phúc Sơn, xã Sơn Lộc, huyện Can Lộc', province: 'ha-tinh', types: [ShopType::PhanBon]),
            new CandidateData(ref: '3', name: 'Trần Thị Loan', address: 'Thôn Nam Bình, xã Thạch Đài, thành phố Hà Tĩnh', province: 'ha-tinh', types: [ShopType::PhanBon]),
        ]));
        $this->collectAndProcess($this->source('so-ha-tinh-bvtv', 85, [
            // Cùng người ở danh sách BVTV (cùng thôn, ghi "Thôn2" liền): gộp
            new CandidateData(ref: 'a', name: 'Nguyễn Thị Hương', address: 'Thôn2, xã Đức Bồng, huyện Vũ Quang', province: 'ha-tinh', types: [ShopType::ThuocBvtv]),
            // Cùng tên, cùng xã nhưng khác thôn: không gộp
            new CandidateData(ref: 'd', name: 'Nguyễn Thị Hương', address: 'Thôn 5, xã Đức Bồng, huyện Vũ Quang', province: 'ha-tinh', types: [ShopType::ThuocBvtv]),
            // Cùng thôn nhưng khác họ: không gộp
            new CandidateData(ref: 'b', name: 'Trương Thị Loan', address: 'Thôn Nam Bình, xã Thạch Đài, thành phố Hà Tĩnh', province: 'ha-tinh', types: [ShopType::ThuocBvtv]),
            // "Hường" khác "Hương" và khác xã: không gộp
            new CandidateData(ref: 'c', name: 'Nguyễn Thị Hường', address: 'Thôn Chí Lưu, xã Thạch Kênh, huyện Thạch Hà', province: 'ha-tinh', types: [ShopType::ThuocBvtv]),
        ]));

        $this->assertSame(6, Shop::query()->count());
        $merged = Shop::query()->where('address', 'like', 'Thôn 2, xã Đức Bồng%')->sole();
        $this->assertEqualsCanonicalizing(['phan_bon', 'thuoc_bvtv'], $merged->types->map->value->all());
    }

    public function test_shared_phone_of_different_people_is_not_merged(): void
    {
        Http::fake(['photon.komoot.io/*' => Http::response(['features' => []])]);

        $this->collectAndProcess($this->source('so-son-la-pb', 85, [
            new CandidateData(ref: '1', name: 'Cà Văn Hà', address: 'Bản Bằng Thịnh, xã Chiềng Mung, huyện Mai Sơn', province: 'son-la', phone: '0912345678', types: [ShopType::PhanBon]),
            new CandidateData(ref: '2', name: 'Quàng Văn Tuấn', address: 'Bản Nà Trai, xã Mường Bằng, huyện Mai Sơn', province: 'son-la', phone: '0912345678', types: [ShopType::PhanBon]),
        ]));

        $this->assertSame(2, Shop::query()->count());
    }
}
