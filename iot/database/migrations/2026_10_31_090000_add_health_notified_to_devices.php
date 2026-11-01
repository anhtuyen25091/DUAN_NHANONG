<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Đã báo chủ trang trại lúc nào (mỗi lần mất kết nối / yếu pin chỉ báo 1 lần; thiết bị gửi lại thì xóa)
        Schema::table('devices', function (Blueprint $table) {
            $table->timestamp('offline_notified_at')->nullable()->after('last_seen_at');
            $table->timestamp('low_battery_notified_at')->nullable()->after('battery');
        });
    }

    public function down(): void
    {
        Schema::table('devices', function (Blueprint $table) {
            $table->dropColumn(['offline_notified_at', 'low_battery_notified_at']);
        });
    }
};
