<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Gói xem lịch sử giá: tài khoản trả phí xem toàn bộ lịch sử tới premium_until.
 * Bảng plans lưu các gói (tháng / năm) và giá, sửa trong /admin.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->timestamp('premium_until')->nullable()->after('ledger_version');
        });

        Schema::create('plans', function (Blueprint $table) {
            $table->id();
            $table->string('code')->unique();
            $table->string('name');
            $table->unsignedSmallInteger('months');
            $table->unsignedInteger('price');
            $table->string('description')->nullable();
            $table->boolean('is_active')->default(true);
            $table->unsignedSmallInteger('sort')->default(0);
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('plans');
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn('premium_until');
        });
    }
};
