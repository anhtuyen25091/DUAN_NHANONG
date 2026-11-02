<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Lần cuối thiết bị gửi bản tin MQTT hợp lệ: còn mới thì máy chủ đẩy lệnh xuống qua MQTT (nhanong/<mã>/down)
        Schema::table('devices', function (Blueprint $table) {
            $table->timestamp('mqtt_seen_at')->nullable()->after('last_seen_at');
        });
    }

    public function down(): void
    {
        Schema::table('devices', function (Blueprint $table) {
            $table->dropColumn('mqtt_seen_at');
        });
    }
};
