<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Bản firmware cập nhật qua mạng (OTA). Khóa thiết bị + WiFi biên dịch sẵn trong firmware nên mỗi bản dành cho đúng 1 thiết bị.
        Schema::create('firmware_releases', function (Blueprint $table) {
            $table->id();
            $table->foreignId('device_id')->constrained()->cascadeOnDelete();
            $table->string('version', 32);
            $table->string('path');
            $table->unsignedInteger('size');
            $table->char('md5', 32);
            $table->string('notes')->nullable();
            // Thiết bị gửi số đo kèm đúng version này = đã cài xong
            $table->timestamp('installed_at')->nullable();
            $table->timestamps();
        });

        // Cấu hình từ xa: chu kỳ đo (phút); null = theo firmware (MEASURE_INTERVAL_MIN)
        Schema::table('devices', function (Blueprint $table) {
            $table->unsignedSmallInteger('measure_interval_min')->nullable()->after('firmware');
        });
    }

    public function down(): void
    {
        Schema::table('devices', function (Blueprint $table) {
            $table->dropColumn('measure_interval_min');
        });
        Schema::dropIfExists('firmware_releases');
    }
};
