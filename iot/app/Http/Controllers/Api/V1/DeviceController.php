<?php

namespace App\Http\Controllers\Api\V1;

use App\Enums\DeviceKind;
use App\Http\Controllers\Controller;
use App\Http\Resources\DeviceResource;
use App\Models\Device;
use App\Models\Farm;
use App\Models\FieldMap;
use App\Models\Plot;
use App\Services\LoRaWan\RelayCodec;
use App\Support\LatestReadings;
use App\Support\Ownership;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Http\Response;
use Illuminate\Validation\Rule;

class DeviceController extends Controller
{
    public function index(Request $request): AnonymousResourceCollection
    {
        $farmIds = Farm::query()->accessibleBy($request->user())->select('id');

        return DeviceResource::collection(Device::query()->whereIn('farm_id', $farmIds)->orderBy('name')->get());
    }

    /**
     * Thêm thiết bị. ESP32 nhận khóa (api_key) — chỉ trả về đúng lần này, hãy nạp vào firmware.
     */
    public function store(Request $request): JsonResponse
    {
        $data = $this->validated($request);
        $device = Device::query()->create($data);
        $key = $device->rotateKey();

        return response()->json(['data' => new DeviceResource($device), 'api_key' => $key], 201);
    }

    /**
     * Dòng thiết bị LoRaWAN đã khai báo ánh xạ trường (để chọn khi thêm thiết bị).
     */
    public function profiles(): JsonResponse
    {
        $profiles = FieldMap::query()->with('metric')->orderBy('profile')->get()->groupBy('profile')
            ->map(fn ($maps, string $profile) => ['code' => $profile, 'metrics' => $maps->sortBy('metric.sort')->pluck('metric.name')->unique()->values()])
            ->values()
            ->prepend(['code' => 'generic', 'metrics' => []])
            // Mạch relay LoRaWAN (bật / tắt máy bơm, quạt): không có chỉ số đo
            ->merge(collect(RelayCodec::PROFILES)->map(fn (array $relay, string $code) => ['code' => $code, 'metrics' => ["Điều khiển {$relay['channels']} relay"]])->values());

        return response()->json(['data' => $profiles]);
    }

    public function show(Request $request, Device $device): DeviceResource
    {
        return new DeviceResource(Ownership::device($request, $device, Ownership::VIEW));
    }

    public function update(Request $request, Device $device): DeviceResource
    {
        Ownership::device($request, $device)->update($this->validated($request, $device));

        return new DeviceResource($device);
    }

    public function destroy(Request $request, Device $device): Response
    {
        Ownership::device($request, $device)->delete();

        return response()->noContent();
    }

    /**
     * Tạo khóa mới khi lộ khóa / thay mạch. Khóa cũ hết hiệu lực ngay.
     */
    public function rotateKey(Request $request, Device $device): JsonResponse
    {
        $key = Ownership::device($request, $device)->rotateKey();

        return response()->json(['data' => new DeviceResource($device), 'api_key' => $key]);
    }

    public function latest(Request $request, Device $device): JsonResponse
    {
        Ownership::device($request, $device, Ownership::VIEW);

        return response()->json(['data' => LatestReadings::forDevices([$device->id])->map(LatestReadings::present(...))]);
    }

    /**
     * @return array<string, mixed>
     */
    private function validated(Request $request, ?Device $device = null): array
    {
        $farmIds = $request->user()->farms()->pluck('id');
        $profiles = FieldMap::query()->distinct()->pluck('profile')->push('generic')->merge(array_keys(RelayCodec::PROFILES));

        $data = $request->validate([
            'farm_id' => ['required', Rule::in($farmIds)],
            'plot_id' => ['nullable', 'integer'],
            'name' => ['required', 'string', 'max:100'],
            'kind' => ['required', Rule::enum(DeviceKind::class)],
            'profile' => ['nullable', Rule::in($profiles)],
            'dev_eui' => [
                Rule::requiredIf($request->input('kind') === DeviceKind::LoRaWan->value),
                'nullable', 'regex:/^[0-9a-fA-F]{16}$/',
                Rule::unique('devices', 'dev_eui')->ignore($device),
            ],
        ], [
            'dev_eui.regex' => 'DevEUI gồm 16 ký tự 0-9, A-F (in trên nhãn thiết bị).',
            'dev_eui.required' => 'Thiết bị LoRaWAN cần DevEUI.',
        ]);

        if (($data['plot_id'] ?? null) !== null) {
            $plotFarm = Plot::query()->whereKey($data['plot_id'])->value('farm_id');
            abort_unless($plotFarm === (int) $data['farm_id'], 422, 'Lô không thuộc trang trại đã chọn.');
        }

        $data['profile'] ??= 'generic';
        $data['dev_eui'] = isset($data['dev_eui']) ? strtolower($data['dev_eui']) : null;

        return $data;
    }
}
