<?php

namespace App\Models;

use App\Jobs\SendMqttDownlink;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Facades\Storage;

/**
 * Bản firmware cho 1 thiết bị ESP32 (file .bin trong storage/app/private/firmware). Thiết bị hỏi qua phản hồi /ingest,
 * tải bằng GET /device/firmware (khóa thiết bị), kiểm MD5 rồi khởi động lại; gửi số đo kèm version mới = đã cài.
 */
#[Fillable(['device_id', 'version', 'path', 'size', 'md5', 'notes', 'installed_at'])]
class FirmwareRelease extends Model
{
    public const DISK = 'local';

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'size' => 'integer',
            'installed_at' => 'datetime',
        ];
    }

    protected static function booted(): void
    {
        // Tải file lên (trang quản trị): tính kích thước + MD5 để thiết bị kiểm tra file nhận được
        static::saving(function (FirmwareRelease $release) {
            if ($release->isDirty('path') && Storage::disk(self::DISK)->exists($release->path)) {
                $release->size = Storage::disk(self::DISK)->size($release->path);
                $release->md5 = md5_file(Storage::disk(self::DISK)->path($release->path));
            }
        });
        static::deleted(fn (FirmwareRelease $release) => Storage::disk(self::DISK)->delete($release->path));
        // Có bản mới: báo ngay cho mạch điều khiển đang nối MQTT (mạch vẫn chỉ cài khi không máy nào chạy)
        static::created(function (FirmwareRelease $release) {
            if ($release->device?->usesMqttDownlink()) {
                SendMqttDownlink::dispatch($release->device_id)->afterCommit();
            }
        });
    }

    /**
     * @return BelongsTo<Device, $this>
     */
    public function device(): BelongsTo
    {
        return $this->belongsTo(Device::class);
    }
}
