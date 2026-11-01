<?php

namespace App\Http\Controllers\Api\V1;

use App\Enums\DeviceKind;
use App\Enums\ReadingSource;
use App\Http\Controllers\Controller;
use App\Models\Device;
use App\Services\Control\CommandService;
use App\Services\LoRaWan\ChirpStackParser;
use App\Services\LoRaWan\FieldMapper;
use App\Services\LoRaWan\RelayCodec;
use App\Services\LoRaWan\TtnParser;
use App\Services\LoRaWan\Uplink;
use App\Services\ReadingIngestor;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;

/**
 * Webhook nhận dữ liệu cảm biến LoRaWAN (Dragino, Milesight, SenseCAP...) qua network server.
 * Mạch relay LoRaWAN (Dragino LT-22222-L) báo trạng thái relay qua đây; lệnh bật / tắt đẩy xuống bằng SendLoRaWanCommand.
 * Cảm biến không cần SIM: sóng LoRa đi 2–10 km tới gateway đặt ở nơi có Internet.
 * Network server phải gửi kèm header X-Webhook-Secret = IOT_LORAWAN_SECRET.
 */
class LoRaWanController extends Controller
{
    public function __construct(private readonly ReadingIngestor $ingestor, private readonly CommandService $commands) {}

    public function chirpstack(Request $request): JsonResponse|Response
    {
        // ChirpStack gửi mọi loại sự kiện vào cùng URL; chỉ cần "up"
        if ($request->query('event', 'up') !== 'up') {
            return response()->noContent();
        }

        return $this->handle($request, ChirpStackParser::parse($request->all()));
    }

    public function ttn(Request $request): JsonResponse|Response
    {
        return $this->handle($request, TtnParser::parse($request->all()));
    }

    private function handle(Request $request, ?Uplink $uplink): JsonResponse|Response
    {
        $secret = (string) config('iot.lorawan_secret');
        if ($secret === '' || ! hash_equals($secret, (string) $request->header('X-Webhook-Secret'))) {
            return response()->json(['message' => 'Sai mã bí mật.'], 401);
        }

        // Bản tin không có dữ liệu đã giải mã (join, chưa cài decoder...): bỏ qua, không để network server gửi lại
        if ($uplink === null) {
            return response()->noContent();
        }

        $device = Device::query()->where('kind', DeviceKind::LoRaWan)->where('dev_eui', $uplink->devEui)->first();
        if ($device === null) {
            return response()->json(['message' => 'Chưa khai báo thiết bị có DevEUI '.$uplink->devEui.'.'], 202);
        }

        $this->rememberDownlink($request, $device);
        $result = $this->ingestor->ingest($device, FieldMapper::rows($device->profile, $uplink), ReadingSource::LoRaWan);

        // Mạch relay báo trạng thái (sau khi làm lệnh): xác nhận lệnh, cập nhật đang bật / tắt
        if (($states = RelayCodec::states($device->profile, $uplink->fields)) !== []) {
            $this->commands->confirmStates($device, $states);
        }

        return response()->json($result->toArray());
    }

    /**
     * The Things Stack gửi kèm địa chỉ + khóa để đẩy bản tin xuống thiết bị (khi webhook có "Downlink API key"): lưu lại để gửi lệnh relay.
     */
    private function rememberDownlink(Request $request, Device $device): void
    {
        $url = $request->header('X-Downlink-Push');
        $key = $request->header('X-Downlink-Apikey');
        if (! is_string($url) || ! is_string($key) || ! str_starts_with($url, 'https://')) {
            return;
        }
        $downlink = ['push_url' => $url, 'api_key' => $key];
        if ($device->downlink !== $downlink) {
            $device->forceFill(['downlink' => $downlink])->save();
        }
    }
}
