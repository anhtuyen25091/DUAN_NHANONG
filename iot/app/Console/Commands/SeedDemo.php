<?php

namespace App\Console\Commands;

use App\Enums\ActuatorKind;
use App\Enums\AlertDirection;
use App\Enums\CommandStatus;
use App\Enums\DeviceKind;
use App\Enums\PlotType;
use App\Enums\ReadingSource;
use App\Models\Actuator;
use App\Models\ActuatorCommand;
use App\Models\AutomationRule;
use App\Models\Device;
use App\Models\Farm;
use App\Models\Metric;
use App\Models\Plot;
use App\Models\PlotEvent;
use App\Models\Threshold;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Console\Attributes\Description;
use Illuminate\Console\Attributes\Signature;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Throwable;

/**
 * Dữ liệu demo cho 1 tài khoản (để xem thử trên web / app): lô sầu riêng có cảm biến đất + trạm thời tiết,
 * máy bơm tưới gốc + béc phun trên tán, lịch tưới, luật tự động, ngưỡng, cảnh báo, việc làm vườn
 * (phun thuốc còn cách ly, vừa bón phân, kế hoạch ngày mai), ao cá có quạt oxy, ruộng lúa; số đo 14 ngày qua.
 *
 * Dùng trang trại sẵn có của tài khoản (thêm lô vào), tạo thêm 1 trang trại "(demo)" cho ao + ruộng.
 * Chạy lại thì xóa dữ liệu demo cũ rồi tạo mới. --remove: chỉ xóa. Thiết bị demo có mã bắt đầu bằng NDDEMO.
 * Số đo ghi thẳng vào DB (không qua ReadingIngestor) để không gửi thông báo đẩy.
 */
#[Signature('iot:demo
    {phone : SĐT tài khoản Nhà Nông (đã vào mục Cảm biến ít nhất 1 lần)}
    {--days=14 : Số ngày số đo}
    {--remove : Chỉ xóa dữ liệu demo}')]
#[Description('Tạo dữ liệu demo cảm biến (lô, thiết bị, số đo, máy bơm, lịch, luật, cảnh báo, việc làm vườn) cho 1 tài khoản')]
class SeedDemo extends Command
{
    private const UID_PREFIX = 'NDDEMO';

    private const DEMO_FARM = 'Ao cá & ruộng lúa (demo)';

    /** Mỗi 30 phút 1 số đo */
    private const STEP_MIN = 30;

    private User $owner;

    private CarbonImmutable $now;

    /** @var array<string, int> */
    private array $metricIds = [];

    /** @var array<int, Metric> */
    private array $metrics = [];

    /** @var list<array<string, mixed>> */
    private array $rows = [];

    public function handle(): int
    {
        $owner = User::query()->where('nhanong_phone', $this->argument('phone'))->first();
        if ($owner === null) {
            $this->error('Không tìm thấy tài khoản cảm biến có SĐT này. Đăng nhập Nhà Nông rồi mở mục Cảm biến 1 lần trước.');

            return self::FAILURE;
        }
        $this->owner = $owner;
        $this->rows = [];
        $this->now = CarbonImmutable::now()->startOfMinute();
        $this->metrics = Metric::query()->get()->keyBy('id')->all();
        $this->metricIds = array_map(fn (Metric $metric) => $metric->id, collect($this->metrics)->keyBy('code')->all());

        $this->remove();
        if ($this->option('remove')) {
            $this->info('Đã xóa dữ liệu demo.');

            return self::SUCCESS;
        }

        DB::transaction(function () {
            $gardens = $this->owner->farms()->orderBy('id')->get();
            $farmB = $gardens->first() ?? $this->farm('Vườn sầu riêng (demo)', 12.6667, 108.0383);
            $farmA = $gardens->skip(1)->first() ?? $farmB;
            $pond = $this->farm(self::DEMO_FARM, 12.7012, 108.0525);

            $this->durianMain($farmB);
            $this->durianOffline($farmB);
            $this->durianSprayed($farmA);
            $this->fishPond($pond);
            $this->riceField($pond);
            $this->shareWithFamily($farmB);

            foreach (array_chunk($this->rows, 1000) as $chunk) {
                DB::table('readings')->insert($chunk);
            }
        });

        Artisan::call('readings:rollup', ['--all' => true]);
        // Mưa theo ngày của các trang trại (Open-Meteo), cho thẻ "lượng mưa 30 ngày"; mất mạng thì bỏ qua
        try {
            Artisan::call('weather:sync-rain', ['--days' => 30]);
        } catch (Throwable $e) {
            $this->warn('Chưa lấy được lượng mưa từ Open-Meteo: '.$e->getMessage());
        }

        $this->info('Đã tạo dữ liệu demo: '.count($this->rows).' số đo, '.Device::query()->where('uid', 'like', self::UID_PREFIX.'%')->count().' thiết bị.');

        return self::SUCCESS;
    }

    private function remove(): void
    {
        $devices = Device::query()->where('uid', 'like', self::UID_PREFIX.'%')->get();
        DB::transaction(function () use ($devices) {
            $plotIds = $devices->pluck('plot_id')->filter()->unique()->all();
            DB::table('readings')->whereIn('device_id', $devices->pluck('id'))->delete();
            DB::table('reading_hourly')->whereIn('device_id', $devices->pluck('id'))->delete();
            // Xóa lô kéo theo ngưỡng, máy bơm (lịch, luật, lệnh), cảnh báo, việc làm vườn
            foreach (Plot::query()->whereIn('id', $plotIds)->get() as $plot) {
                $plot->events()->withTrashed()->forceDelete();
                $plot->delete();
            }
            Device::query()->whereIn('id', $devices->pluck('id'))->delete();
            Farm::query()->where('user_id', $this->owner->id)->where('name', self::DEMO_FARM)->delete();
            DB::table('farm_members')->whereIn('farm_id', $this->owner->farms()->pluck('id'))->where('role', 'viewer')
                ->whereIn('user_id', User::query()->where('nhanong_phone', '0900000002')->pluck('id'))->delete();
        });
    }

    /* ---------- Từng lô ---------- */

    /** Lô chính: đủ mọi thứ (tưới theo lịch, bỏ lượt vì mưa, vừa bón phân → EC cao, phun thuốc còn cách ly, kế hoạch ngày mai) */
    private function durianMain(Farm $farm): void
    {
        $plot = $this->plot($farm, 'Lô 1 · Sầu riêng Ri6', PlotType::Garden, 'Sầu riêng', 5000);
        $soil = $this->device($farm, $plot, 'Cảm biến đất 7 trong 1', 'A2B3', 92);
        $station = $this->device($farm, $plot, 'Trạm thời tiết ở vườn', 'C4D5', 88);
        $pump = $this->actuator($soil, $plot, 'Bơm tưới gốc', ActuatorKind::Pump, Actuator::ROOT, 1, 60);
        $mister = $this->actuator($soil, $plot, 'Béc phun trên tán', ActuatorKind::Mister, Actuator::CANOPY, 2, 30);

        $this->threshold($plot, 'soil_moisture', 35, 70, 'Sầu riêng cần đất ẩm đều, không úng');
        $this->threshold($plot, 'soil_ph', 5.5, 6.5, null);
        $this->threshold($plot, 'soil_ec', null, 1500, 'EC cao: phân đậm đặc, dễ cháy rễ');
        $this->threshold($plot, 'air_temp', null, 37, null);

        $pump->schedules()->create(['start_time' => '06:00', 'minutes' => 30, 'every_days' => 2, 'months' => [1, 2, 3, 4, 11, 12], 'skip_rain_mm' => 5, 'note' => 'Mùa khô', 'enabled' => true, 'next_run_on' => $this->nextScheduleDay()]);
        $mister->schedules()->create(['start_time' => '11:30', 'minutes' => 10, 'every_days' => 1, 'months' => [3, 4], 'skip_rain_mm' => 2, 'note' => 'Hạ nhiệt tán lúc nắng gắt (tháng 3–4)', 'enabled' => false, 'next_run_on' => $this->now->addDay()->toDateString()]);
        $this->rule($plot, 'soil_moisture', $pump, AutomationRule::BELOW, 33, 50, 20);

        $start = $this->start();
        $fertilizedAt = $this->now->subDay()->setTime(7, 30);
        $rainAt = $this->now->subDays(5)->setTime(15, 0);

        // Tưới: 06:00 mỗi 2 ngày; bỏ lượt sáng sau trận mưa
        $waterings = [];
        for ($day = $start->startOfDay(); $day->lte($this->now); $day = $day->addDays(2)) {
            $at = $day->setTime(6, 0);
            if ($at->gt($start) && $at->lte($this->now) && ! $at->isSameDay($rainAt->addDay())) {
                $waterings[] = $at;
            }
        }
        foreach ($waterings as $at) {
            $this->waterLog($pump, $plot, $at, 30, ActuatorCommand::SOURCE_SCHEDULE);
        }

        $this->series($soil, $start, $this->now, [
            'soil_moisture' => fn (CarbonImmutable $t) => $this->moisture($t, [...$waterings, $rainAt], 36, 22, 30),
            'soil_temp' => fn (CarbonImmutable $t) => 27 + 2.5 * $this->daily($t, 15),
            'soil_ec' => fn (CarbonImmutable $t) => 880 + 40 * $this->daily($t, 14) + $this->pulse($t, $fertilizedAt, 1050, 70),
            'soil_ph' => fn (CarbonImmutable $t) => 6.1 + 0.05 * $this->daily($t, 14) - $this->pulse($t, $fertilizedAt, 0.25, 70),
            'soil_n' => fn (CarbonImmutable $t) => 115 + $this->pulse($t, $fertilizedAt, 95, 90),
            'soil_p' => fn (CarbonImmutable $t) => 42 + $this->pulse($t, $fertilizedAt, 38, 90),
            'soil_k' => fn (CarbonImmutable $t) => 150 + $this->pulse($t, $fertilizedAt, 70, 90),
            'battery' => fn (CarbonImmutable $t) => 97 - 5 * $this->progress($t),
        ]);
        $this->series($station, $start, $this->now, [
            'air_temp' => fn (CarbonImmutable $t) => 27.5 + 5.5 * $this->daily($t, 14),
            'air_humidity' => fn (CarbonImmutable $t) => 74 - 16 * $this->daily($t, 14) + ($this->hoursAfter($t, $rainAt, 0, 6) ? 18 : 0),
            'light' => fn (CarbonImmutable $t) => max(0, 52000 * sin(M_PI * ($this->hourOf($t) - 6) / 12.5)),
            'wind_speed' => fn (CarbonImmutable $t) => 1.6 + 1.4 * $this->daily($t, 15),
            'rainfall' => fn (CarbonImmutable $t) => $this->hoursAfter($t, $rainAt, 0, 2) ? 4.5 : 0,
            'battery' => fn (CarbonImmutable $t) => 96 - 8 * $this->progress($t),
        ]);

        // Bón phân hôm qua: EC vượt ngưỡng, có ghi chú "có thể do vừa bón" (không báo đẩy)
        $fertilize = $this->event($plot, PlotEvent::FERTILIZE, 'NPK 20-20-15 + TE', $fertilizedAt, ['quantity' => 50, 'unit' => 'kg', 'worker' => 'Anh Tư', 'note' => 'Rải quanh tán, tưới nhẹ sau khi bón']);
        $this->addAlert($plot, $soil, 'soil_ec', AlertDirection::Above, 1530, $fertilizedAt->addHours(9), null, "Có thể do vừa bón {$fertilize->title} ngày {$fertilizedAt->format('d/m')}");
        $this->event($plot, PlotEvent::SPRAY, 'Ridomil Gold 68WG', $this->now->subDays(5)->setTime(6, 30), [
            'quantity' => 500, 'unit' => 'g', 'target' => 'Nứt thân xì mủ (Phytophthora)', 'withholding_days' => 14, 'reentry_hours' => 24, 'rain_free_hours' => 4, 'worker' => 'Anh Tư',
        ]);
        $this->event($plot, PlotEvent::PRUNE, 'Tỉa cành tược, làm cỏ gốc', $this->now->subDays(9)->setTime(7, 0), ['worker' => 'Anh Tư, chị Năm']);
        $this->event($plot, PlotEvent::SPRAY, 'Phân bón lá Bo + Canxi', $this->now->addDay()->setTime(6, 30), [
            'planned' => true, 'quantity' => 1, 'unit' => 'lít', 'target' => 'Nuôi bông, chống rụng trái non', 'withholding_days' => 0, 'reentry_hours' => 4, 'rain_free_hours' => 3,
        ]);
        // Bật tay béc phun hôm kia
        $this->addCommand($mister, $this->now->subDays(2)->setTime(12, 0), 10, ActuatorCommand::SOURCE_MANUAL);
        $this->waterLog($mister, $plot, $this->now->subDays(2)->setTime(12, 0), 10, ActuatorCommand::SOURCE_MANUAL, false);
    }

    /** Lô 2: cảm biến mất kết nối 9 giờ, pin yếu; tưới bằng luật tự động khi đất khô */
    private function durianOffline(Farm $farm): void
    {
        $plot = $this->plot($farm, 'Lô 2 · Sầu riêng Monthong', PlotType::Garden, 'Sầu riêng', 3500);
        $soil = $this->device($farm, $plot, 'Cảm biến độ ẩm đất', 'E6F7', 18);
        $valve = $this->actuator($soil, $plot, 'Van tưới nhỏ giọt', ActuatorKind::Valve, Actuator::ROOT, 1, 45);
        $moistureThreshold = $this->threshold($plot, 'soil_moisture', 35, 70, null);
        $rule = $this->rule($plot, 'soil_moisture', $valve, AutomationRule::BELOW, 35, 52, 25);

        $start = $this->start();
        $lastSeen = $this->now->subHours(9);
        // Luật tự động: đất khô dưới 35% thì mở van 25 phút (mô phỏng theo thời gian)
        $waterings = [$start];
        for ($t = $start; $t->lte($lastSeen); $t = $t->addMinutes(self::STEP_MIN)) {
            if ($this->moisture($t, $waterings, 33, 20, 34) < 35 && end($waterings)->diffInHours($t) > 6) {
                $waterings[] = $t;
                $this->waterLog($valve, $plot, $t, 25, ActuatorCommand::SOURCE_RULE, true, $rule->id);
                $this->addAlert($plot, $soil, 'soil_moisture', AlertDirection::Below, 34.6, $t, $t->addHour(), null, $moistureThreshold);
            }
        }
        $rule->forceFill(['last_triggered_at' => end($waterings)])->save();

        $this->series($soil, $start, $lastSeen, [
            'soil_moisture' => fn (CarbonImmutable $t) => $this->moisture($t, $waterings, 33, 20, 34),
            'soil_temp' => fn (CarbonImmutable $t) => 26.5 + 2.2 * $this->daily($t, 15),
            'battery' => fn (CarbonImmutable $t) => 34 - 16 * $this->progress($t),
        ]);
    }

    /** Vườn A: vừa phun thuốc 3 giờ trước → cấm vào lô, cách ly, béc phun trên tán tạm dừng tới khi thuốc khô */
    private function durianSprayed(Farm $farm): void
    {
        $plot = $this->plot($farm, 'Lô đồi · Sầu riêng Ri6', PlotType::Garden, 'Sầu riêng', 8000);
        $soil = $this->device($farm, $plot, 'Cảm biến đất LoRaWAN', 'G8H9', 76, DeviceKind::LoRaWan);
        $pump = $this->actuator($soil, $plot, 'Bơm giếng', ActuatorKind::Pump, Actuator::ROOT, 1, 60);
        $mister = $this->actuator($soil, $plot, 'Phun mưa trên tán', ActuatorKind::Mister, Actuator::CANOPY, 2, 20);
        $this->threshold($plot, 'soil_moisture', 35, 70, null);
        $this->threshold($plot, 'soil_ph', 5.5, 6.5, null);
        $mister->schedules()->create(['start_time' => '14:00', 'minutes' => 15, 'every_days' => 1, 'months' => null, 'skip_rain_mm' => 3, 'note' => 'Hạ nhiệt buổi trưa', 'enabled' => true, 'next_run_on' => $this->now->toDateString()]);
        $pump->schedules()->create(['start_time' => '05:30', 'minutes' => 40, 'every_days' => 3, 'months' => null, 'skip_rain_mm' => 5, 'note' => null, 'enabled' => true, 'next_run_on' => $this->now->addDay()->toDateString()]);

        $start = $this->start();
        $waterings = [];
        for ($day = $start->startOfDay(); $day->lte($this->now); $day = $day->addDays(3)) {
            $at = $day->setTime(5, 30);
            if ($at->gt($start) && $at->lte($this->now)) {
                $waterings[] = $at;
                $this->waterLog($pump, $plot, $at, 40, ActuatorCommand::SOURCE_SCHEDULE);
            }
        }
        $this->series($soil, $start, $this->now, [
            'soil_moisture' => fn (CarbonImmutable $t) => $this->moisture($t, $waterings, 37, 20, 40),
            'soil_temp' => fn (CarbonImmutable $t) => 25.5 + 2 * $this->daily($t, 15),
            'soil_ec' => fn (CarbonImmutable $t) => 760 + 30 * $this->daily($t, 14),
            'soil_ph' => fn (CarbonImmutable $t) => 5.9 + 0.05 * $this->daily($t, 14),
            'battery' => fn (CarbonImmutable $t) => 82 - 6 * $this->progress($t),
        ]);

        $this->event($plot, PlotEvent::SPRAY, 'Abamectin 3.6EC', $this->now->subHours(3), [
            'quantity' => 200, 'unit' => 'ml', 'target' => 'Nhện đỏ, rầy xanh', 'withholding_days' => 7, 'reentry_hours' => 12, 'rain_free_hours' => 6, 'worker' => 'Chú Ba',
            'note' => 'Pha 200 ml / phuy 200 lít',
        ]);
        $this->event($plot, PlotEvent::FERTILIZE, 'Phân hữu cơ vi sinh', $this->now->subDays(12)->setTime(8, 0), ['quantity' => 300, 'unit' => 'kg', 'worker' => 'Chú Ba']);
    }

    /** Ao cá: oxy hòa tan thấp lúc rạng sáng → luật bật quạt oxy; pH, nhiệt độ nước, mực nước */
    private function fishPond(Farm $farm): void
    {
        $plot = $this->plot($farm, 'Ao cá rô phi', PlotType::Pond, 'Cá rô phi', 2000);
        $probe = $this->device($farm, $plot, 'Đầu đo nước ao', 'J2K3', 71);
        $aerator = $this->actuator($probe, $plot, 'Quạt oxy', ActuatorKind::Aerator, null, 1, 180);
        $doThreshold = $this->threshold($plot, 'water_do', 4, null, 'Dưới 4 mg/L cá nổi đầu');
        $this->threshold($plot, 'water_ph', 6.5, 8.5, null);
        $this->threshold($plot, 'water_temp', 24, 33, null);
        $this->threshold($plot, 'water_level', 120, 180, null);
        $rule = $this->rule($plot, 'water_do', $aerator, AutomationRule::BELOW, 4, 5.5, 90);
        $aerator->schedules()->create(['start_time' => '02:00', 'minutes' => 180, 'every_days' => 1, 'months' => null, 'skip_rain_mm' => null, 'note' => 'Chạy đêm', 'enabled' => true, 'next_run_on' => $this->now->addDay()->toDateString()]);

        $start = $this->start();
        // 2 đêm oxy xuống thấp (trời âm u): luật bật quạt, có cảnh báo đã hết
        foreach ([6, 2] as $daysAgo) {
            $at = $this->now->subDays($daysAgo)->setTime(4, 30);
            $this->addAlert($plot, $probe, 'water_do', AlertDirection::Below, 3.4, $at, $at->addHours(2), null, $doThreshold);
            $this->addCommand($aerator, $at, 90, ActuatorCommand::SOURCE_RULE, $rule->id);
        }
        $rule->forceFill(['last_triggered_at' => $this->now->subDays(2)->setTime(4, 30)])->save();
        for ($day = $start->startOfDay()->addDay(); $day->lte($this->now); $day = $day->addDay()) {
            if ($day->setTime(2, 0)->lte($this->now)) {
                $this->addCommand($aerator, $day->setTime(2, 0), 180, ActuatorCommand::SOURCE_SCHEDULE);
            }
        }

        $lowNights = [$this->now->subDays(6)->setTime(4, 30), $this->now->subDays(2)->setTime(4, 30)];
        $this->series($probe, $start, $this->now, [
            'water_do' => function (CarbonImmutable $t) use ($lowNights) {
                $value = 5.8 + 1.9 * $this->daily($t, 15);
                foreach ($lowNights as $at) {
                    $value -= $this->hoursAfter($t, $at->subHours(2), 0, 4) ? 1.2 : 0;
                }

                return $value;
            },
            'water_ph' => fn (CarbonImmutable $t) => 7.6 + 0.35 * $this->daily($t, 16),
            'water_temp' => fn (CarbonImmutable $t) => 28.5 + 2 * $this->daily($t, 16),
            'water_level' => fn (CarbonImmutable $t) => 150 - 6 * $this->progress($t),
            'turbidity' => fn (CarbonImmutable $t) => 28 + 4 * $this->daily($t, 12),
            'battery' => fn (CarbonImmutable $t) => 78 - 7 * $this->progress($t),
        ]);
        $this->event($plot, PlotEvent::OTHER, 'Bón vôi CaCO3 cho ao', $this->now->subDays(3)->setTime(16, 0), ['quantity' => 20, 'unit' => 'kg', 'note' => 'Ổn định pH sau mưa']);
    }

    /** Ruộng lúa: mực nước ruộng, van cấp nước; lịch tháo nước theo mùa */
    private function riceField(Farm $farm): void
    {
        $plot = $this->plot($farm, 'Ruộng lúa ST25', PlotType::Field, 'Lúa', 6000);
        $gauge = $this->device($farm, $plot, 'Đo mực nước ruộng', 'L4M5', 64);
        $valve = $this->actuator($gauge, $plot, 'Cống cấp nước', ActuatorKind::Valve, Actuator::ROOT, 1, 120);
        $this->threshold($plot, 'water_level', 3, 10, 'Lúa đẻ nhánh: giữ nước 3–5 cm');
        $this->rule($plot, 'water_level', $valve, AutomationRule::BELOW, 3, 6, 60);

        $start = $this->start();
        $this->series($gauge, $start, $this->now, [
            'water_level' => fn (CarbonImmutable $t) => 4.2 + 1.2 * sin($t->getTimestamp() / 86400 * 2 * M_PI / 4) - 0.3 * $this->daily($t, 15),
            'water_temp' => fn (CarbonImmutable $t) => 27 + 3 * $this->daily($t, 15),
            'battery' => fn (CarbonImmutable $t) => 70 - 6 * $this->progress($t),
        ]);
        $this->event($plot, PlotEvent::FERTILIZE, 'Urê + Kali (bón thúc đẻ nhánh)', $this->now->subDays(4)->setTime(7, 0), ['quantity' => 25, 'unit' => 'kg', 'worker' => 'Chú Ba']);
    }

    /** Người nhà (tài khoản 0900000002) được xem vườn B */
    private function shareWithFamily(Farm $farm): void
    {
        $family = User::query()->where('nhanong_phone', '0900000002')->first();
        if ($family && $family->id !== $this->owner->id && ! $farm->members()->where('user_id', $family->id)->exists()) {
            $farm->members()->create(['user_id' => $family->id, 'role' => 'viewer']);
        }
    }

    /* ---------- Tạo bản ghi ---------- */

    private function farm(string $name, float $lat, float $lng): Farm
    {
        return Farm::query()->create(['user_id' => $this->owner->id, 'name' => $name, 'province' => 'Đắk Lắk', 'lat' => $lat, 'lng' => $lng, 'rain_alerts' => true, 'dry_alert_days' => 10]);
    }

    private function plot(Farm $farm, string $name, PlotType $type, string $crop, int $area): Plot
    {
        return $farm->plots()->create(['name' => $name, 'type' => $type, 'crop' => $crop, 'area_m2' => $area]);
    }

    private function device(Farm $farm, Plot $plot, string $name, string $suffix, int $battery, DeviceKind $kind = DeviceKind::Esp32): Device
    {
        $device = new Device(['farm_id' => $farm->id, 'plot_id' => $plot->id, 'name' => $name, 'kind' => $kind, 'firmware' => $kind === DeviceKind::Esp32 ? '1.3.0' : null, 'measure_interval_min' => self::STEP_MIN]);
        $device->uid = self::UID_PREFIX.$suffix;
        if ($kind === DeviceKind::LoRaWan) {
            $device->profile = 'dragino-se01';
            $device->dev_eui = 'a84041000181'.strtolower($suffix);
        }
        $device->battery = $battery;
        $device->save();
        $device->rotateKey();

        return $device;
    }

    private function actuator(Device $device, Plot $plot, string $name, ActuatorKind $kind, ?string $mode, int $channel, int $maxMinutes): Actuator
    {
        return Actuator::query()->create([
            'device_id' => $device->id, 'plot_id' => $plot->id, 'name' => $name, 'kind' => $kind, 'irrigation_mode' => $mode, 'channel' => $channel, 'max_minutes' => $maxMinutes,
        ]);
    }

    private function threshold(Plot $plot, string $metric, ?float $min, ?float $max, ?string $note): Threshold
    {
        return $plot->thresholds()->create(['metric_id' => $this->metricIds[$metric], 'min' => $min, 'max' => $max, 'note' => $note]);
    }

    private function rule(Plot $plot, string $metric, Actuator $actuator, string $operator, float $value, float $offValue, int $minutes): AutomationRule
    {
        return AutomationRule::query()->create([
            'plot_id' => $plot->id, 'metric_id' => $this->metricIds[$metric], 'actuator_id' => $actuator->id, 'operator' => $operator,
            'value' => $value, 'off_value' => $offValue, 'minutes' => $minutes, 'cooldown_minutes' => 120, 'enabled' => true,
        ]);
    }

    private function addAlert(Plot $plot, Device $device, string $metric, AlertDirection $direction, float $value, CarbonImmutable $at, ?CarbonImmutable $resolvedAt, ?string $note, ?Threshold $threshold = null): void
    {
        $threshold ??= $plot->thresholds()->where('metric_id', $this->metricIds[$metric])->firstOrFail();
        $threshold->alerts()->create(['device_id' => $device->id, 'direction' => $direction, 'value' => $value, 'measured_at' => $at, 'resolved_at' => $resolvedAt, 'note' => $note]);
    }

    /**
     * @param  array<string, mixed>  $extra
     */
    private function event(Plot $plot, string $kind, string $title, CarbonImmutable $at, array $extra = []): PlotEvent
    {
        $event = $plot->events()->create([
            'uuid' => (string) Str::uuid(), 'user_id' => $this->owner->id, 'kind' => $kind, 'title' => $title, 'done_at' => $at, 'planned' => false, 'source' => PlotEvent::SOURCE_MANUAL, ...$extra,
        ]);
        $event->forceFill(['created_at' => min($at, $this->now), 'updated_at' => min($at, $this->now)])->saveQuietly();

        return $event;
    }

    private function addCommand(Actuator $actuator, CarbonImmutable $at, int $minutes, string $source, ?int $ruleId = null): void
    {
        $command = $actuator->commands()->create([
            'action' => ActuatorCommand::ON, 'minutes' => $minutes, 'source' => $source, 'user_id' => $source === ActuatorCommand::SOURCE_MANUAL ? $this->owner->id : null,
            'rule_id' => $ruleId, 'status' => CommandStatus::Done, 'message' => 'Đã bật', 'expires_at' => $at->addMinutes(5), 'sent_at' => $at, 'done_at' => $at->addSeconds(4),
        ]);
        $command->forceFill(['created_at' => $at, 'updated_at' => $at])->saveQuietly();
        $actuator->forceFill(['state_changed_at' => $at->addMinutes($minutes)])->saveQuietly();
    }

    /** Máy bơm / van chạy: lệnh + nhật ký tưới tự ghi (như PlotWork::logWater) */
    private function waterLog(Actuator $actuator, Plot $plot, CarbonImmutable $at, int $minutes, string $source, bool $withCommand = true, ?int $ruleId = null): void
    {
        if ($withCommand) {
            $this->addCommand($actuator, $at, $minutes, $source, $ruleId);
        }
        $label = [ActuatorCommand::SOURCE_MANUAL => 'bật tay', ActuatorCommand::SOURCE_RULE => 'luật tự động', ActuatorCommand::SOURCE_SCHEDULE => 'lịch tưới'][$source];
        $this->event($plot, PlotEvent::WATER, "{$actuator->name} chạy {$minutes} phút", $at, [
            'note' => "Tự ghi ({$label})", 'source' => PlotEvent::SOURCE_ACTUATOR, 'actuator_id' => $actuator->id, 'minutes' => $minutes,
            'user_id' => $source === ActuatorCommand::SOURCE_MANUAL ? $this->owner->id : null,
        ]);
    }

    /**
     * Số đo mỗi 30 phút từ $from đến $to; giờ thấy cuối cùng + pin của thiết bị theo số đo cuối.
     *
     * @param  array<string, callable(CarbonImmutable): float>  $series
     */
    private function series(Device $device, CarbonImmutable $from, CarbonImmutable $to, array $series): void
    {
        $last = null;
        for ($t = $from; $t->lte($to); $t = $t->addMinutes(self::STEP_MIN)) {
            foreach ($series as $code => $value) {
                $metric = $this->metrics[$this->metricIds[$code]];
                $v = $value($t) + $this->noise($code);
                $v = max((float) ($metric->min_valid ?? $v), min((float) ($metric->max_valid ?? $v), $v));
                $this->rows[] = [
                    'device_id' => $device->id, 'metric_id' => $metric->id, 'value' => round($v, max(1, (int) $metric->decimals)),
                    'measured_at' => $t->toDateTimeString(), 'received_at' => $t->addSeconds(20)->toDateTimeString(), 'source' => ReadingSource::Simulator->value,
                ];
            }
            $last = $t;
        }
        $device->forceFill(['last_seen_at' => $last])->saveQuietly();
    }

    /* ---------- Hàm mô phỏng ---------- */

    private function start(): CarbonImmutable
    {
        return $this->now->subDays((int) $this->option('days'))->startOfHour();
    }

    /** Ngày tưới tiếp theo của lịch 2 ngày / lần */
    private function nextScheduleDay(): string
    {
        $day = $this->start()->startOfDay();
        while ($day->setTime(6, 0)->lte($this->now)) {
            $day = $day->addDays(2);
        }

        return $day->toDateString();
    }

    /** Dao động ngày - đêm từ -1 tới 1, cao nhất lúc $peakHour */
    private function daily(CarbonImmutable $t, float $peakHour): float
    {
        return cos(2 * M_PI * ($this->hourOf($t) - $peakHour) / 24);
    }

    private function hourOf(CarbonImmutable $t): float
    {
        return $t->hour + $t->minute / 60;
    }

    /** Tăng vọt tại $at rồi giảm dần (hằng số thời gian $tauHours) */
    private function pulse(CarbonImmutable $t, CarbonImmutable $at, float $height, float $tauHours): float
    {
        if ($t->lt($at)) {
            return 0;
        }

        return $height * exp(-$at->diffInMinutes($t) / 60 / $tauHours);
    }

    /** Độ ẩm đất: tăng sau lần tưới / mưa gần nhất rồi khô dần, ban trưa khô nhanh hơn */
    /**
     * @param  list<CarbonImmutable>  $waterings
     */
    private function moisture(CarbonImmutable $t, array $waterings, float $base, float $rise, float $tauHours): float
    {
        $lastWater = null;
        foreach ($waterings as $at) {
            if ($at->lte($t) && ($lastWater === null || $at->gt($lastWater))) {
                $lastWater = $at;
            }
        }
        $wet = $lastWater ? $rise * exp(-$lastWater->diffInMinutes($t) / 60 / $tauHours) : 0;

        return $base + $wet - 1.5 * $this->daily($t, 15);
    }

    private function hoursAfter(CarbonImmutable $t, CarbonImmutable $at, float $fromHours, float $toHours): bool
    {
        $hours = $at->diffInMinutes($t, false) / 60;

        return $hours >= $fromHours && $hours < $toHours;
    }

    /** 0 → 1 theo thời gian từ đầu khoảng tới bây giờ (VD pin giảm dần) */
    private function progress(CarbonImmutable $t): float
    {
        $total = $this->start()->diffInMinutes($this->now);

        return $total > 0 ? $this->start()->diffInMinutes($t) / $total : 1;
    }

    private function noise(string $code): float
    {
        $scale = ['soil_ec' => 12, 'water_orp' => 4, 'light' => 1500, 'soil_n' => 2, 'soil_p' => 1, 'soil_k' => 2, 'battery' => 0, 'rainfall' => 0, 'water_level' => 0.15][$code] ?? 0.15;

        return $scale * (mt_rand(-1000, 1000) / 1000);
    }
}
