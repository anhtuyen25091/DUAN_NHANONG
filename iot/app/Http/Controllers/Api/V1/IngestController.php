<?php

namespace App\Http\Controllers\Api\V1;

use App\Enums\ReadingSource;
use App\Http\Controllers\Controller;
use App\Http\Middleware\AuthenticateDevice;
use App\Models\Device;
use App\Services\CompactCsv;
use App\Services\ReadingIngestor;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Thiết bị gửi số đo. Mọi đường đều trả về {accepted, duplicates, rejected, server_time};
 * thiết bị nhận được phản hồi 200 là xóa phần đã gửi khỏi hàng đợi.
 */
class IngestController extends Controller
{
    /** Kích thước tối đa của nội dung dạng CSV gọn / file điện thoại chuyển tiếp */
    private const MAX_CSV_BYTES = 512 * 1024;

    public function __construct(private readonly ReadingIngestor $ingestor) {}

    /**
     * POST /ingest — {"firmware": "1.0.0", "readings": [{"metric": "soil_ph", "value": 6.4, "t": 1730170000}]}
     * Dùng cả khi gửi trực tiếp lẫn gửi bù dữ liệu tồn sau khi mất mạng.
     */
    public function store(Request $request): JsonResponse
    {
        $request->validate([
            'readings' => ['required', 'array', 'min:1', 'max:'.config('iot.max_batch')],
            'firmware' => ['nullable', 'string', 'max:32'],
        ]);

        $result = $this->ingestor->ingestPayload(AuthenticateDevice::device($request), $request->all(), ReadingSource::Http);

        return response()->json($result->toArray());
    }

    /**
     * POST /ingest/compact — thân là văn bản, mỗi dòng "t,metric,value".
     */
    public function compact(Request $request): JsonResponse
    {
        $content = $request->getContent();
        if (strlen($content) > self::MAX_CSV_BYTES) {
            return response()->json(['message' => 'Nội dung quá lớn, hãy chia thành nhiều lần gửi.'], 413);
        }

        $rows = CompactCsv::parse($content);
        if ($rows === [] || count($rows) > config('iot.max_batch')) {
            return response()->json(['message' => 'Cần từ 1 đến '.config('iot.max_batch').' dòng "t,metric,value".'], 422);
        }

        $result = $this->ingestor->ingest(AuthenticateDevice::device($request), $rows, ReadingSource::Http);

        return response()->json($result->toArray());
    }

    /**
     * GET /device/time — giờ máy chủ để thiết bị chỉnh đồng hồ (khi không có NTP).
     */
    public function time(): JsonResponse
    {
        return response()->json(['time' => now()->getTimestamp(), 'iso' => now()->toIso8601String()]);
    }

    /**
     * POST /ingest/upload — điện thoại gửi file dữ liệu đã tải từ thiết bị ở ruộng không có mạng.
     * Không cần đăng nhập: dòng đầu file mang chữ ký HMAC bằng khóa thiết bị, chứng minh file do đúng thiết bị đó tạo.
     *
     *   #nhanong uid=ND7K3M9QXA sig=<hmac-sha256 hex của phần còn lại>
     *   1730170000,soil_moisture,41.5
     */
    public function upload(Request $request): JsonResponse
    {
        $request->validate([
            'file' => ['required_without:content', 'file', 'max:'.(self::MAX_CSV_BYTES / 1024)],
            'content' => ['required_without:file', 'string', 'max:'.self::MAX_CSV_BYTES],
        ]);

        $content = $request->hasFile('file') ? (string) $request->file('file')->get() : (string) $request->input('content');
        $content = str_replace("\r\n", "\n", $content);
        [$header, $body] = array_pad(explode("\n", $content, 2), 2, '');

        if (! preg_match('/^#nhanong uid=(\w+) sig=([0-9a-f]{64})\s*$/', $header, $matches)) {
            return response()->json(['message' => 'File không đúng định dạng của thiết bị Nhà Nông.'], 422);
        }

        $device = Device::query()->where('uid', $matches[1])->first();
        if ($device === null || $device->api_key === null || ! hash_equals($device->sign($body), $matches[2])) {
            return response()->json(['message' => 'Chữ ký file không hợp lệ (file bị sửa hoặc không phải của thiết bị này).'], 403);
        }

        $rows = CompactCsv::parse($body);
        if (count($rows) > config('iot.max_batch') * 10) {
            return response()->json(['message' => 'File quá nhiều dòng.'], 422);
        }

        $result = $this->ingestor->ingest($device, $rows, ReadingSource::PhoneRelay);

        return response()->json(['device' => $device->uid] + $result->toArray());
    }

    /**
     * POST /sms/inbound — cổng SMS chuyển tiếp tin nhắn từ mạch SIM 2G (dự phòng khi không có 3G/4G/WiFi).
     * Nội dung: "<uid> <16 ký tự đầu chữ ký> t,metric,value;t,metric,value;..."
     */
    public function sms(Request $request): JsonResponse
    {
        $secret = (string) config('iot.sms_secret');
        if ($secret === '' || ! hash_equals($secret, (string) $request->header('X-Webhook-Secret'))) {
            return response()->json(['message' => 'Sai mã bí mật.'], 401);
        }

        $text = trim((string) $request->input('text'));
        if (! preg_match('/^(\w+)\s+([0-9a-f]{16})\s+(.+)$/s', $text, $matches)) {
            return response()->json(['message' => 'Tin nhắn không đúng cú pháp.'], 422);
        }

        $device = Device::query()->where('uid', $matches[1])->first();
        if ($device === null || $device->api_key === null || ! hash_equals(substr($device->sign($matches[3]), 0, 16), $matches[2])) {
            return response()->json(['message' => 'Chữ ký tin nhắn không hợp lệ.'], 403);
        }

        $result = $this->ingestor->ingest($device, CompactCsv::parse($matches[3]), ReadingSource::Sms);

        return response()->json($result->toArray());
    }
}
