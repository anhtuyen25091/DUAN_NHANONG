<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Lịch tưới: bật thiết bị lúc start_time, chạy `minutes` phút, lặp mỗi `every_days` ngày, chỉ trong các tháng `months`
        Schema::create('actuator_schedules', function (Blueprint $table) {
            $table->id();
            $table->foreignId('actuator_id')->constrained()->cascadeOnDelete();
            $table->time('start_time');
            $table->unsignedSmallInteger('minutes');
            $table->unsignedTinyInteger('every_days')->default(1);
            // [12, 1, 2, 3, 4] = mùa khô Tây Nguyên; null = cả năm
            $table->json('months')->nullable();
            // 24 giờ qua mưa từ mức này thì bỏ lượt; null = luôn tưới
            $table->decimal('skip_rain_mm', 6, 1)->nullable();
            $table->string('note')->nullable();
            $table->boolean('enabled')->default(true);
            $table->date('next_run_on');
            $table->timestamp('last_run_at')->nullable();
            $table->timestamps();
        });

        // Khóa an toàn: số đo của cảm biến nguồn nước vượt mức (VD độ mặn > 0,3‰) thì không cho bật, đang chạy thì tắt
        Schema::table('actuators', function (Blueprint $table) {
            $table->foreignId('block_device_id')->nullable()->after('max_minutes')->constrained('devices')->nullOnDelete();
            $table->foreignId('block_metric_id')->nullable()->after('block_device_id')->constrained('metrics')->nullOnDelete();
            $table->string('block_operator', 8)->nullable()->after('block_metric_id');
            $table->decimal('block_value', 12, 3)->nullable()->after('block_operator');
        });

        // Nhắc "đã N ngày không mưa" (0 / null = tắt)
        Schema::table('farms', function (Blueprint $table) {
            $table->unsignedTinyInteger('dry_alert_days')->nullable()->default(7)->after('rain_alerted_at');
            $table->timestamp('dry_alerted_at')->nullable()->after('dry_alert_days');
        });
    }

    public function down(): void
    {
        Schema::table('farms', function (Blueprint $table) {
            $table->dropColumn(['dry_alert_days', 'dry_alerted_at']);
        });
        Schema::table('actuators', function (Blueprint $table) {
            $table->dropConstrainedForeignId('block_device_id');
            $table->dropConstrainedForeignId('block_metric_id');
            $table->dropColumn(['block_operator', 'block_value']);
        });
        Schema::dropIfExists('actuator_schedules');
    }
};
