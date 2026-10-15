<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Nông dân đăng nhập bằng số điện thoại; email chỉ cần cho tài khoản quản trị.
     */
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->string('email')->nullable()->change();
            $table->string('phone', 15)->nullable()->unique()->after('email');
            // Số thứ tự tăng dần mỗi lần sổ thu chi của người này thay đổi (dùng để kéo dữ liệu mới)
            $table->unsignedBigInteger('ledger_version')->default(0)->after('is_admin');
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropUnique(['phone']);
            $table->dropColumn(['phone', 'ledger_version']);
            $table->string('email')->nullable(false)->change();
        });
    }
};
