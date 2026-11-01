<?php

namespace Tests\Feature;

use App\Enums\PlotType;
use App\Jobs\SyncFarmRain;
use App\Models\Farm;
use App\Models\Plot;
use App\Models\User;
use Database\Seeders\FieldMapSeeder;
use Database\Seeders\MetricSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Bus;
use Illuminate\Support\Facades\Http;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class WeatherApiTest extends TestCase
{
    use RefreshDatabase;

    private Farm $farm;

    protected function setUp(): void
    {
        parent::setUp();

        Carbon::setTestNow('2026-10-31 10:20:00');
        // Có vị trí thì tự lấy lượng mưa 1 năm (RainTest kiểm tra riêng)
        Bus::fake([SyncFarmRain::class]);
        $user = User::factory()->create();
        $this->farm = Farm::factory()->for($user)->create(['lat' => 9.1789, 'lng' => 105.1524]);
        Plot::factory()->for($this->farm)->create(['type' => PlotType::Pond]);
        Plot::factory()->for($this->farm)->create(['type' => PlotType::Field]);
        Sanctum::actingAs($user);
    }

    public function test_forecast_with_hints(): void
    {
        Http::fake(['api.open-meteo.com/*' => Http::response($this->openMeteo(rainPerHour: 1.5, tempMax: 36.2, windMax: 11.3))]);

        $this->getJson(route('api.v1.farms.weather', $this->farm))
            ->assertOk()
            ->assertJsonCount(7, 'data.daily')
            ->assertJsonPath('data.daily.0.label', 'Dông')
            ->assertJsonPath('data.daily.0.icon', '⛈️')
            ->assertJsonPath('data.daily.1.label', 'Mưa vừa')
            // Từ 10:00 tới 24 giờ sau: 24 × 1,5 mm
            ->assertJsonPath('data.next_24h.rain_mm', 36)
            ->assertJsonPath('data.next_24h.rain_chance', 80)
            ->assertJsonPath('data.hints', [
                'Sắp mưa lớn (khoảng 36 mm trong 24 giờ tới): mưa làm giảm pH và độ mặn của ao. Theo dõi số đo ao sau mưa.',
                'Sắp mưa khoảng 36 mm trong 24 giờ tới: cân nhắc hoãn tưới, bón phân và phun thuốc.',
                'Hôm nay nắng nóng (tới 36°C): theo dõi độ ẩm đất và nhiệt độ nước ao.',
                'Hôm nay gió mạnh: tránh phun thuốc.',
            ]);

        Http::assertSent(fn (Request $request) => $request['latitude'] == 9.18 && $request['longitude'] == 105.15 && $request['timezone'] === 'Asia/Ho_Chi_Minh');

        // Gọi lại trong 1 giờ: dùng bản đã lưu
        $this->getJson(route('api.v1.farms.weather', $this->farm))->assertOk();
        Http::assertSentCount(1);
    }

    public function test_no_hints_on_calm_days(): void
    {
        Http::fake(['api.open-meteo.com/*' => Http::response($this->openMeteo(rainPerHour: 0, tempMax: 31, windMax: 3))]);

        $this->getJson(route('api.v1.farms.weather', $this->farm))->assertOk()->assertJsonPath('data.hints', []);
    }

    public function test_farm_without_location_or_service_down(): void
    {
        $noLocation = Farm::factory()->for($this->farm->user)->create(['lat' => null, 'lng' => null]);
        $this->getJson(route('api.v1.farms.weather', $noLocation))->assertUnprocessable();

        Http::fake(['api.open-meteo.com/*' => Http::response('lỗi', 500)]);
        $this->getJson(route('api.v1.farms.weather', $this->farm))->assertStatus(503);

        $other = Farm::factory()->create(['lat' => 10, 'lng' => 106]);
        $this->getJson(route('api.v1.farms.weather', $other))->assertNotFound();
    }

    public function test_device_profiles(): void
    {
        $this->seed([MetricSeeder::class, FieldMapSeeder::class]);

        $response = $this->getJson(route('api.v1.devices.profiles'))->assertOk();

        $this->assertSame('generic', $response->json('data.0.code'));
        $this->assertContains('dragino-se01', $response->collect('data')->pluck('code'));
        $this->assertSame(['Độ ẩm đất', 'Nhiệt độ đất', 'Độ dẫn điện đất (EC)'], $response->collect('data')->firstWhere('code', 'dragino-se01')['metrics']);
    }

    /**
     * @return array<string, mixed>
     */
    private function openMeteo(float $rainPerHour, float $tempMax, float $windMax): array
    {
        $days = collect(range(0, 6))->map(fn (int $i) => Carbon::parse('2026-10-31')->addDays($i)->toDateString());
        $hours = collect(range(0, 7 * 24 - 1))->map(fn (int $i) => Carbon::parse('2026-10-31 00:00')->addHours($i)->format('Y-m-d\TH:i'));

        return [
            'daily' => [
                'time' => $days->all(),
                'weather_code' => [95, 63, 3, 0, 61, 80, 2],
                'temperature_2m_max' => array_fill(0, 7, $tempMax),
                'temperature_2m_min' => array_fill(0, 7, 24.5),
                'precipitation_sum' => array_fill(0, 7, $rainPerHour * 24),
                'precipitation_probability_max' => array_fill(0, 7, 80),
                'wind_speed_10m_max' => array_fill(0, 7, $windMax),
            ],
            'hourly' => [
                'time' => $hours->all(),
                // Trước 10:00 mưa rất to: không được tính vào 24 giờ tới
                'precipitation' => $hours->map(fn (string $t) => $t < '2026-10-31T10:00' ? 50.0 : $rainPerHour)->all(),
                'precipitation_probability' => $hours->map(fn (string $t) => $t < '2026-10-31T10:00' ? 100 : 80)->all(),
            ],
        ];
    }
}
