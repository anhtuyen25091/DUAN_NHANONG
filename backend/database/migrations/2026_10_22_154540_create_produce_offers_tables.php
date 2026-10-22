<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Chào bán: nông dân đăng "có X kg hàng, thu hoạch ngày …" ở vị trí vườn; điểm mua / lái quanh đó trả giá,
 * nông dân chọn 1 giá (2 bên thấy số điện thoại của nhau).
 * - produce_offers: status open (đang nhận giá) | sold (đã chọn giá) | closed (nông dân đóng); hết hạn sau expires_at
 * - offer_bids: mỗi người mua 1 giá / 1 lần chào (sửa được); status pending | accepted | declined | withdrawn
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('produce_offers', function (Blueprint $table) {
            $table->id();
            $table->uuid('uuid')->unique();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->foreignId('product_id')->nullable()->constrained()->nullOnDelete();
            $table->string('product_name', 120);
            $table->decimal('quantity_kg', 12, 1);
            $table->unsignedInteger('expected_price')->nullable();
            $table->date('harvest_date');
            $table->string('province_code', 30)->nullable();
            $table->decimal('lat', 10, 7);
            $table->decimal('lng', 10, 7);
            $table->string('place_label')->nullable();
            $table->string('note', 500)->nullable();
            $table->string('status', 10)->default('open');
            $table->foreignId('accepted_bid_id')->nullable();
            $table->timestamp('expires_at');
            $table->timestamps();

            $table->index(['status', 'expires_at']);
            $table->index(['lat', 'lng']);
        });

        Schema::create('offer_bids', function (Blueprint $table) {
            $table->id();
            $table->uuid('uuid')->unique();
            $table->foreignId('produce_offer_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->unsignedInteger('price');
            $table->decimal('quantity_kg', 12, 1)->nullable();
            $table->string('note', 300)->nullable();
            $table->string('status', 10)->default('pending');
            $table->timestamps();

            $table->unique(['produce_offer_id', 'user_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('offer_bids');
        Schema::dropIfExists('produce_offers');
    }
};
