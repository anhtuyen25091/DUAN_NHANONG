<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Giá mua chủ doanh nghiệp chốt cho các lái con, theo ngày và mặt hàng.
 * - business_buy_prices: mỗi ngày chủ chốt thì lưu 1 dòng / mặt hàng; ngày chưa chốt thì dùng lần chốt gần nhất trước đó.
 *   max_price null = bỏ giới hạn từ ngày đó.
 * - businesses.price_mode: warn (vẫn lập phiếu, đánh dấu vượt giá, báo chủ) | block (không cho lập phiếu vượt giá)
 * - purchases.price_warnings: các dòng hàng lái mua vượt giá chốt lúc lập / sửa phiếu
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('business_buy_prices', function (Blueprint $table) {
            $table->id();
            $table->foreignId('business_id')->constrained()->cascadeOnDelete();
            $table->foreignId('product_id')->constrained()->cascadeOnDelete();
            $table->date('date');
            $table->unsignedInteger('max_price')->nullable();
            $table->foreignId('set_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->unique(['business_id', 'product_id', 'date']);
        });

        Schema::table('businesses', function (Blueprint $table) {
            $table->string('price_mode', 10)->default('warn')->after('invite_code');
        });

        Schema::table('purchases', function (Blueprint $table) {
            $table->json('price_warnings')->nullable()->after('note');
        });
    }

    public function down(): void
    {
        Schema::table('purchases', fn (Blueprint $table) => $table->dropColumn('price_warnings'));
        Schema::table('businesses', fn (Blueprint $table) => $table->dropColumn('price_mode'));
        Schema::dropIfExists('business_buy_prices');
    }
};
