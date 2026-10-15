<?php

namespace Tests\Feature;

use App\Enums\PriceStatus;
use App\Models\Price;
use App\Models\PriceSource;
use App\Models\Product;
use App\Models\Region;
use Database\Seeders\CatalogSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class PriceApiTest extends TestCase
{
    use RefreshDatabase;

    private Product $pepper;

    private Region $dakLak;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(CatalogSeeder::class);
        $this->pepper = Product::query()->where('code', 'ho-tieu')->firstOrFail();
        $this->dakLak = Region::query()->where('code', 'dak-lak')->firstOrFail();
    }

    public function test_latest_price_with_change_from_previous_day(): void
    {
        $this->price('2026-10-12', 137000);
        $this->price('2026-10-13', 138000);
        $this->price('2026-10-14', 139000);

        $this->getJson(route('api.v1.prices.index', ['date' => '2026-10-14', 'product' => 'ho-tieu']))
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.product.code', 'ho-tieu')
            ->assertJsonPath('data.0.region.code', 'dak-lak')
            ->assertJsonPath('data.0.date', '2026-10-14')
            ->assertJsonPath('data.0.price_avg', 139000)
            ->assertJsonPath('data.0.change', 1000)
            ->assertJsonPath('data.0.previous_date', '2026-10-13');
    }

    public function test_same_day_prices_from_several_sources_are_combined(): void
    {
        $this->price('2026-10-14', 138000, ['price_min' => 137000, 'price_source_id' => PriceSource::factory()->create(['name' => 'A'])->id]);
        $this->price('2026-10-14', 140000, ['price_max' => 141000, 'price_source_id' => PriceSource::factory()->create(['name' => 'B'])->id]);

        $this->getJson(route('api.v1.prices.index', ['date' => '2026-10-14']))
            ->assertJsonPath('data.0.price_min', 137000)
            ->assertJsonPath('data.0.price_max', 141000)
            ->assertJsonPath('data.0.price_avg', 139000)
            ->assertJsonPath('data.0.sources', ['A', 'B']);
    }

    public function test_prices_waiting_for_review_are_hidden(): void
    {
        $this->price('2026-10-13', 138000);
        $this->price('2026-10-14', 990000, ['status' => PriceStatus::NeedsReview]);

        $this->getJson(route('api.v1.prices.index', ['date' => '2026-10-14']))
            ->assertJsonPath('data.0.date', '2026-10-13')
            ->assertJsonPath('data.0.price_avg', 138000);
    }

    public function test_filter_by_category_type(): void
    {
        $this->price('2026-10-14', 138000);
        Price::factory()->create([
            'product_id' => Product::query()->where('code', 'ure-ca-mau')->value('id'),
            'region_id' => Region::query()->where('code', 'toan-quoc')->value('id'),
            'date' => '2026-10-14',
            'unit' => 'bao',
        ]);

        $this->getJson(route('api.v1.prices.index', ['date' => '2026-10-14', 'type' => 'phan_bon']))
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.product.code', 'ure-ca-mau');
    }

    public function test_history_returns_daily_points_for_chart(): void
    {
        // Khách chỉ xem được 10 ngày gần nhất tính từ hôm nay
        $this->travelTo(now()->setDate(2026, 10, 14));
        $this->price('2026-10-01', 130000);
        $this->price('2026-10-13', 138000);
        $this->price('2026-10-14', 139000);

        $this->getJson(route('api.v1.prices.history', ['product' => 'ho-tieu', 'region' => 'dak-lak', 'days' => 7, 'to' => '2026-10-14']))
            ->assertOk()
            ->assertJsonPath('from', '2026-10-08')
            ->assertJsonPath('points', [
                ['date' => '2026-10-13', 'min' => 138000, 'max' => 138000, 'avg' => 138000],
                ['date' => '2026-10-14', 'min' => 139000, 'max' => 139000, 'avg' => 139000],
            ]);
    }

    public function test_invalid_filters_are_rejected(): void
    {
        $this->getJson(route('api.v1.prices.index', ['type' => 'xyz', 'date' => '14/10/2026']))
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['type', 'date']);
    }

    public function test_categories_list_products(): void
    {
        $this->getJson(route('api.v1.categories'))
            ->assertOk()
            ->assertJsonPath('data.0.slug', 'ca-phe')
            ->assertJsonPath('data.0.type_label', 'Nông sản')
            ->assertJsonPath('data.0.products.0.code', 'ca-phe-robusta');
    }

    /**
     * @param  array<string, mixed>  $attributes
     */
    private function price(string $date, int $avg, array $attributes = []): Price
    {
        return Price::factory()->create([
            'product_id' => $this->pepper->id,
            'region_id' => $this->dakLak->id,
            'date' => $date,
            'price_avg' => $avg,
            ...$attributes,
        ]);
    }
}
