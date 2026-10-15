<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Hoạt động mới nhất của đơn ("Chú Ba đồng ý Đợt cân 124.250.000 đ"): để bên kia nhận thông báo khi đang mở app.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('deals', function (Blueprint $table) {
            $table->string('last_activity')->nullable()->after('note');
            $table->foreignId('last_activity_by')->nullable()->after('last_activity')->constrained('users')->nullOnDelete();
            $table->timestamp('last_activity_at')->nullable()->after('last_activity_by');
            $table->index('updated_at');
        });
    }

    public function down(): void
    {
        Schema::table('deals', function (Blueprint $table) {
            $table->dropIndex(['updated_at']);
            $table->dropConstrainedForeignId('last_activity_by');
            $table->dropColumn(['last_activity', 'last_activity_at']);
        });
    }
};
