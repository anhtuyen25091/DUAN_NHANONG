<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Resources\FarmResource;
use App\Models\Farm;
use App\Models\Metric;
use App\Services\FarmWork\PlotWork;
use App\Services\NhanongPlan;
use App\Services\Weather\WeatherService;
use App\Support\Ownership;
use App\Support\TimeBucket;
use Carbon\CarbonImmutable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Http\Response;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Throwable;

class FarmController extends Controller
{
    public function index(Request $request, PlotWork $work): AnonymousResourceCollection
    {
        // Trang trại của mình trước, rồi tới trang trại được chia sẻ
        $farms = Farm::query()->accessibleBy($request->user())->with(['plots', 'user'])->get()
            ->sortBy(fn (Farm $farm) => [$farm->user_id !== $request->user()->id, $farm->name])->values();
        // Lô đang cấm vào / cách ly thu hoạch: hiện ngay trên danh sách
        $plots = $farms->flatMap->plots;
        $statuses = $work->statuses($plots);
        $plots->each(fn ($plot) => $plot->work_status = $statuses[$plot->id]);

        return FarmResource::collection($farms);
    }

    public function store(Request $request): JsonResponse
    {
        $farm = $request->user()->farms()->create($this->validated($request));

        return (new FarmResource($farm->load('plots')))->response()->setStatusCode(201);
    }

    public function update(Request $request, Farm $farm): FarmResource
    {
        Ownership::farm($request, $farm)->update($this->validated($request));

        return new FarmResource($farm->load('plots'));
    }

    /**
     * Dự báo 7 ngày + lưu ý cho ruộng / ao theo vị trí trang trại.
     */
    public function weather(Request $request, Farm $farm, WeatherService $weather): JsonResponse
    {
        Ownership::farm($request, $farm, Ownership::VIEW);
        if ($farm->lat === null || $farm->lng === null) {
            return response()->json(['message' => 'Trang trại chưa có vị trí. Sửa trang trại để chọn tỉnh hoặc lấy vị trí GPS.'], 422);
        }

        try {
            return response()->json(['data' => $weather->forecast($farm->load('plots'))]);
        } catch (Throwable $e) {
            report($e);

            return response()->json(['message' => 'Chưa lấy được dự báo thời tiết, thử lại sau.'], 503);
        }
    }

    /**
     * Lượng mưa từng ngày tại vị trí trang trại. Miễn phí xem 30 ngày, có gói Nhà Nông xem 365 ngày.
     * Có máy đo mưa thì kèm số đo thật (gauge_mm).
     */
    public function rainfall(Request $request, Farm $farm, NhanongPlan $plan): JsonResponse
    {
        Ownership::farm($request, $farm, Ownership::VIEW);
        $data = $request->validate(['days' => ['nullable', 'integer', 'min:1', 'max:366']]);

        $user = $request->user();
        $plan->refresh($user);
        $allowed = $user->rainHistoryDays();
        $wanted = (int) ($data['days'] ?? 30);
        $days = min($wanted, $allowed);
        $from = today()->subDays($days - 1)->toDateString();

        $model = DB::table('farm_rain_daily')->where('farm_id', $farm->id)->where('date', '>=', $from)->pluck('rain_mm', 'date');
        $gauge = $this->gaugeDaily($farm, $from);

        $rows = [];
        for ($date = CarbonImmutable::parse($from); $date->lte(today()); $date = $date->addDay()) {
            $key = $date->toDateString();
            $rows[] = [
                'date' => $key,
                'rain_mm' => isset($model[$key]) ? (float) $model[$key] : null,
                'gauge_mm' => isset($gauge[$key]) ? round((float) $gauge[$key], 1) : null,
            ];
        }

        return response()->json([
            'days' => $days,
            'max_days' => $allowed,
            'locked' => $wanted > $allowed,
            'plan' => $plan->summary($user),
            'total_mm' => round(collect($rows)->sum(fn ($row) => $row['gauge_mm'] ?? $row['rain_mm'] ?? 0), 1),
            'rainy_days' => collect($rows)->filter(fn ($row) => ($row['gauge_mm'] ?? $row['rain_mm'] ?? 0) >= 1)->count(),
            'has_gauge' => $gauge->isNotEmpty(),
            'data' => $rows,
        ]);
    }

    /**
     * Tổng mưa từng ngày do máy đo mưa của trang trại ghi (bảng gộp theo giờ: tổng = trung bình × số lần đo).
     *
     * @return Collection<string, float>
     */
    private function gaugeDaily(Farm $farm, string $from): Collection
    {
        $rainfall = Metric::byCode()['rainfall'] ?? null;
        if ($rainfall === null) {
            return collect();
        }
        $day = TimeBucket::sql('hour', 'day');

        return DB::table('reading_hourly')
            ->join('devices', 'devices.id', '=', 'reading_hourly.device_id')
            ->where('devices.farm_id', $farm->id)
            ->where('reading_hourly.metric_id', $rainfall->id)
            ->where('reading_hourly.hour', '>=', $from)
            ->groupByRaw($day)
            ->selectRaw("{$day} AS day, SUM(avg * count) AS mm")
            ->pluck('mm', 'day')
            ->mapWithKeys(fn ($mm, $day) => [substr((string) $day, 0, 10) => (float) $mm]);
    }

    public function destroy(Request $request, Farm $farm): Response
    {
        Ownership::farm($request, $farm)->delete();

        return response()->noContent();
    }

    /**
     * @return array<string, mixed>
     */
    private function validated(Request $request): array
    {
        return $request->validate([
            'name' => ['required', 'string', 'max:100'],
            'province' => ['nullable', 'string', 'max:100'],
            'lat' => ['nullable', 'numeric', 'between:-90,90'],
            'lng' => ['nullable', 'numeric', 'between:-180,180'],
            'rain_alerts' => ['sometimes', 'boolean'],
            // Nhắc khi đã N ngày liên tiếp không mưa (0 = tắt)
            'dry_alert_days' => ['sometimes', 'nullable', 'integer', 'min:0', 'max:60'],
        ]);
    }
}
