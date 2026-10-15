<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Đơn mua bán chung giữa 2 bên (nông dân ↔ thương lái, thương lái ↔ chi nhánh).
 * Người tạo đứng 1 bên; bên kia tham gia bằng mã (code). Các mục ghi trong deal_entries, bên kia xác nhận.
 * deal_sources: thương lái nối đơn bán (cho chi nhánh) với các đơn mua (của nông dân) để tính lời từng lô.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('deals', function (Blueprint $table) {
            $table->id();
            $table->uuid('uuid')->unique();
            $table->string('code', 8)->unique();
            $table->foreignId('created_by')->constrained('users')->cascadeOnDelete();
            $table->foreignId('seller_id')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('buyer_id')->nullable()->constrained('users')->nullOnDelete();
            // Tên người tạo gõ cho từng bên (vd "Vườn chú Ba", "Chi nhánh Tân Phú"), hiện trước khi bên kia tham gia
            $table->string('seller_name')->nullable();
            $table->string('buyer_name')->nullable();
            $table->foreignId('product_id')->nullable()->constrained()->nullOnDelete();
            $table->string('title');
            $table->string('unit', 20)->default('kg');
            $table->string('status', 20)->default('open');
            $table->timestamp('closed_at')->nullable();
            $table->text('note')->nullable();
            $table->timestamps();
        });

        Schema::create('deal_sources', function (Blueprint $table) {
            $table->id();
            $table->foreignId('sell_deal_id')->constrained('deals')->cascadeOnDelete();
            $table->foreignId('buy_deal_id')->constrained('deals')->cascadeOnDelete();
            $table->timestamps();

            $table->unique(['sell_deal_id', 'buy_deal_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('deal_sources');
        Schema::dropIfExists('deals');
    }
};
