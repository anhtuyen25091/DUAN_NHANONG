<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Resources\PlotEventResource;
use App\Models\Plot;
use App\Models\PlotEvent;
use App\Notifications\FarmWorkNotifier;
use App\Services\FarmWork\WorkAdvisor;
use App\Support\Ownership;
use Carbon\CarbonImmutable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Http\Response;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

/**
 * Việc làm vườn của lô (phun thuốc, bón phân, tưới, tỉa cành...): ghi trên trang lô, hoặc web / app tự gửi từ
 * Nhật ký canh tác của Sổ thu chi (cùng uuid với nhật ký). Chủ và người được bật / tắt máy ghi được; người chỉ xem thì không.
 */
class PlotEventController extends Controller
{
    public function __construct(private readonly FarmWorkNotifier $notifier) {}

    /**
     * ?from=&to= (ngày): việc trong khoảng (mặc định 60 ngày qua + việc đã lên kế hoạch).
     * ?since= (thời điểm): mọi việc sửa từ lúc đó, kể cả đã xóa (để đồng bộ với Sổ thu chi).
     */
    public function index(Request $request, Plot $plot): AnonymousResourceCollection
    {
        Ownership::plot($request, $plot, Ownership::VIEW);
        $data = $request->validate([
            'from' => ['nullable', 'date'],
            'to' => ['nullable', 'date'],
            'since' => ['nullable', 'date'],
        ]);

        $query = $plot->events()->with('user');
        if (isset($data['since'])) {
            $query->withTrashed()->where('updated_at', '>=', CarbonImmutable::parse($data['since'])->setTimezone(config('app.timezone')))->orderBy('updated_at');
        } else {
            $from = CarbonImmutable::parse($data['from'] ?? now()->subDays(60)->toDateString(), 'Asia/Ho_Chi_Minh')->startOfDay();
            $to = isset($data['to']) ? CarbonImmutable::parse($data['to'], 'Asia/Ho_Chi_Minh')->endOfDay() : null;
            $query->where(fn ($q) => $q->where('planned', true)->orWhere('done_at', '>=', $from))
                ->when($to, fn ($q) => $q->where('done_at', '<=', $to))
                ->orderByDesc('done_at');
        }

        return PlotEventResource::collection($query->limit(500)->get());
    }

    /**
     * Ghi việc. Gửi lại cùng uuid (VD máy gửi lại khi có mạng) thì cập nhật dòng cũ, không tạo trùng.
     */
    public function store(Request $request, Plot $plot): JsonResponse
    {
        $this->canRecord($request, $plot);
        // Sổ thu chi xóa nhật ký: xóa việc cùng uuid (máy chỉ biết uuid)
        if ($request->boolean('deleted')) {
            $request->validate(['uuid' => ['required', 'uuid']]);
            $event = $plot->events()->where('uuid', $request->input('uuid'))->first();
            if ($event) {
                $this->destroy($request, $event);
            }

            return response()->json(null, 204);
        }
        $data = $this->validated($request);
        $uuid = $data['uuid'] ?? (string) Str::uuid();
        unset($data['uuid']);

        $existing = $plot->events()->withTrashed()->where('uuid', $uuid)->first();
        if ($existing?->trashed()) {
            // Đã xóa trên trang lô: không hồi sinh (máy sẽ xóa nhật ký theo khi đồng bộ)
            return (new PlotEventResource($existing->load('user')))->response()->setStatusCode(200);
        }
        if ($existing) {
            if ($data['source'] === PlotEvent::SOURCE_LEDGER) {
                // Sổ thu chi chỉ có ngày làm, không có giờ cấm vào lô / chờ thuốc khô: giữ những gì đã ghi trên lô
                foreach (['reentry_hours', 'rain_free_hours'] as $key) {
                    if ($data[$key] === null) {
                        unset($data[$key]);
                    }
                }
                if ($data['done_at']->toDateString() === $existing->done_at->toDateString()) {
                    unset($data['done_at']);
                }
            }
            $wasPlanned = $existing->planned;
            $existing->update($data);
            if ($wasPlanned && ! $existing->planned) {
                $this->notifyIfRecent($existing);
            }

            return (new PlotEventResource($existing->load('user')))->response();
        }

        $event = $plot->events()->create($data + ['uuid' => $uuid, 'user_id' => $request->user()->id]);
        $this->notifyIfRecent($event);

        return (new PlotEventResource($event->load('user')))->response()->setStatusCode(201);
    }

    public function update(Request $request, PlotEvent $event): PlotEventResource
    {
        $this->canRecord($request, $event->plot);
        $wasPlanned = $event->planned;
        $data = $this->validated($request);
        unset($data['uuid'], $data['source']);
        // Sửa vài ô: không gửi thì giữ nguyên giờ làm / trạng thái kế hoạch
        if (! $request->filled('done_at')) {
            unset($data['done_at']);
        }
        if (! $request->has('planned')) {
            unset($data['planned']);
        }
        // Bấm "Đã làm" cho việc đã lên kế hoạch mà không gửi giờ: tính là bây giờ
        if ($wasPlanned && ($data['planned'] ?? true) === false && ! isset($data['done_at'])) {
            $data['done_at'] = now();
        }
        $event->update($data);
        if ($wasPlanned && ! $event->planned) {
            $this->notifyIfRecent($event);
        }

        return new PlotEventResource($event->load('user'));
    }

    /** Chủ trang trại hoặc người đã ghi được xóa */
    public function destroy(Request $request, PlotEvent $event): Response
    {
        $role = $event->plot->farm->roleOf($request->user());
        abort_if($role === null, 404);
        abort_unless($role === 'owner' || ($role === 'operator' && $event->user_id === $request->user()->id), 403, 'Chỉ chủ trang trại hoặc người đã ghi được xóa.');
        $event->delete();

        return response()->noContent();
    }

    /**
     * Kiểm tra trước khi phun thuốc / bón phân: mưa, gió, nắng, độ ẩm đất.
     */
    public function advice(Request $request, Plot $plot, WorkAdvisor $advisor): JsonResponse
    {
        Ownership::plot($request, $plot, Ownership::VIEW);
        $data = $request->validate([
            'kind' => ['required', Rule::in([PlotEvent::SPRAY, PlotEvent::FERTILIZE])],
            'rain_free_hours' => ['nullable', 'integer', 'min:1', 'max:72'],
        ]);

        return response()->json(['data' => $advisor->advise($plot, $data['kind'], $data['rain_free_hours'] ?? null)]);
    }

    private function canRecord(Request $request, Plot $plot): void
    {
        $role = $plot->farm->roleOf($request->user());
        abort_if($role === null, 404);
        abort_if($role === 'viewer', 403, 'Bạn chỉ được xem trang trại này, không ghi việc được.');
    }

    /** Chỉ báo việc vừa làm (trong 1 ngày qua), không báo khi đồng bộ nhật ký cũ từ Sổ thu chi */
    private function notifyIfRecent(PlotEvent $event): void
    {
        if (! $event->planned && $event->done_at->gt(now()->subDay()) && $event->done_at->lte(now()->addMinutes(5))) {
            $this->notifier->recorded($event);
        }
    }

    /**
     * @return array<string, mixed>
     */
    private function validated(Request $request): array
    {
        $data = $request->validate([
            'uuid' => ['nullable', 'uuid'],
            'kind' => ['required', Rule::in(PlotEvent::KINDS)],
            'title' => ['required', 'string', 'max:191'],
            'quantity' => ['nullable', 'numeric', 'min:0'],
            'unit' => ['nullable', 'string', 'max:32'],
            'target' => ['nullable', 'string', 'max:191'],
            'withholding_days' => ['nullable', 'integer', 'min:0', 'max:365'],
            'reentry_hours' => ['nullable', 'integer', 'min:0', 'max:720'],
            'rain_free_hours' => ['nullable', 'integer', 'min:0', 'max:72'],
            'worker' => ['nullable', 'string', 'max:100'],
            'note' => ['nullable', 'string', 'max:2000'],
            'planned' => ['nullable', 'boolean'],
            'done_at' => ['nullable', 'date'],
            'source' => ['nullable', Rule::in([PlotEvent::SOURCE_MANUAL, PlotEvent::SOURCE_LEDGER])],
        ], [
            'title.required' => 'Ghi tên thuốc / phân / việc làm.',
        ]);

        $data['planned'] = (bool) ($data['planned'] ?? false);
        // Máy gửi giờ UTC ("…Z") hay +07:00 đều đổi về giờ máy chủ (DB lưu giờ không kèm múi)
        $data['done_at'] = isset($data['done_at']) ? CarbonImmutable::parse($data['done_at'])->setTimezone(config('app.timezone')) : now();
        $data['source'] ??= PlotEvent::SOURCE_MANUAL;
        foreach (['withholding_days', 'reentry_hours', 'rain_free_hours'] as $key) {
            if (($data[$key] ?? null) === 0) {
                $data[$key] = null;
            }
        }
        // Chỉ thuốc BVTV mới có cách ly / cấm vào / chờ khô
        if ($data['kind'] !== PlotEvent::SPRAY) {
            $data['withholding_days'] = $data['reentry_hours'] = $data['rain_free_hours'] = null;
        }

        return $data;
    }
}
