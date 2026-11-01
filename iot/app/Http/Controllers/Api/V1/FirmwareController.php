<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Middleware\AuthenticateDevice;
use App\Models\FirmwareRelease;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * GET /device/firmware — mạch ESP32 tải bản firmware mới (khóa thiết bị). Header x-MD5 để thư viện HTTPUpdate kiểm file trước khi ghi.
 */
class FirmwareController extends Controller
{
    public function download(Request $request): StreamedResponse
    {
        $release = AuthenticateDevice::device($request)->pendingFirmware();
        abort_if($release === null || ! Storage::disk(FirmwareRelease::DISK)->exists($release->path), 404, 'Không có bản cập nhật.');

        return Storage::disk(FirmwareRelease::DISK)->download($release->path, "firmware-{$release->version}.bin", [
            'Content-Type' => 'application/octet-stream',
            'x-MD5' => $release->md5,
        ]);
    }
}
