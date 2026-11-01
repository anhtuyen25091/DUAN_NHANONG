<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Nối với tài khoản Nhà Nông để dùng chung gói trả phí (xem lượng mưa 1 năm)
        Schema::table('users', function (Blueprint $table) {
            $table->unsignedBigInteger('nhanong_user_id')->nullable()->unique()->after('is_admin');
            $table->string('nhanong_phone', 20)->nullable()->after('nhanong_user_id');
            $table->text('nhanong_token')->nullable()->after('nhanong_phone');
            $table->string('nhanong_tier', 16)->nullable()->after('nhanong_token');
            $table->date('premium_until')->nullable()->after('nhanong_tier');
            $table->timestamp('plan_checked_at')->nullable()->after('premium_until');
        });

        // Trạng thái mưa tại vị trí trang trại (báo "đang mưa" mỗi cơn 1 lần)
        Schema::table('farms', function (Blueprint $table) {
            $table->boolean('rain_alerts')->default(true)->after('lng');
            $table->timestamp('raining_since')->nullable()->after('rain_alerts');
            $table->timestamp('last_rain_at')->nullable()->after('raining_since');
            $table->decimal('rain_episode_mm', 8, 1)->default(0)->after('last_rain_at');
            $table->timestamp('rain_alerted_at')->nullable()->after('rain_episode_mm');
        });

        // Lượng mưa từng ngày theo dữ liệu thời tiết (Open-Meteo) tại vị trí trang trại
        Schema::create('farm_rain_daily', function (Blueprint $table) {
            $table->id();
            $table->foreignId('farm_id')->constrained()->cascadeOnDelete();
            $table->date('date');
            $table->decimal('rain_mm', 8, 1);
            $table->timestamp('updated_at')->nullable();
            $table->unique(['farm_id', 'date']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('farm_rain_daily');
        Schema::table('farms', function (Blueprint $table) {
            $table->dropColumn(['rain_alerts', 'raining_since', 'last_rain_at', 'rain_episode_mm', 'rain_alerted_at']);
        });
        Schema::table('users', function (Blueprint $table) {
            $table->dropUnique(['nhanong_user_id']);
            $table->dropColumn(['nhanong_user_id', 'nhanong_phone', 'nhanong_token', 'nhanong_tier', 'premium_until', 'plan_checked_at']);
        });
    }
};
