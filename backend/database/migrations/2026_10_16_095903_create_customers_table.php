<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Sổ giao dịch của điểm thu mua / thương lái:
 * - customers: khách quen (nông dân bán hàng, công ty mua lại), không cần có tài khoản
 * - purchases: phiếu mua / bán 1 lần (cân nhiều loại hàng), in ra PDF / Word gửi khách
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('customers', function (Blueprint $table) {
            $table->id();
            $table->uuid('uuid')->unique();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('name', 120);
            $table->string('phone', 20)->nullable();
            $table->string('address')->nullable();
            $table->string('note')->nullable();
            $table->softDeletes();
            $table->timestamps();

            $table->index(['user_id', 'name']);
        });

        Schema::create('purchases', function (Blueprint $table) {
            $table->id();
            $table->uuid('uuid')->unique();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            // Số phiếu tăng dần theo từng người dùng (in "PM-000012" / "PB-000003")
            $table->unsignedInteger('number');
            $table->string('kind', 10)->default('buy'); // buy: mua vào | sell: bán ra
            $table->foreignId('customer_id')->nullable()->constrained()->nullOnDelete();
            // Chép tên / SĐT lúc lập phiếu: sửa khách sau này không đổi phiếu đã in
            $table->string('customer_name', 120);
            $table->string('customer_phone', 20)->nullable();
            $table->date('date');
            // [{product_code, name, kg, deduct_kg, price}]: kg cân, trừ bì / tạp chất, đơn giá theo kg tịnh
            $table->json('lines');
            $table->decimal('kg', 12, 3)->default(0);
            $table->unsignedBigInteger('amount')->default(0);
            $table->unsignedBigInteger('paid')->default(0);
            $table->string('note', 500)->nullable();
            $table->softDeletes();
            $table->timestamps();

            $table->unique(['user_id', 'kind', 'number']);
            $table->index(['user_id', 'date']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('purchases');
        Schema::dropIfExists('customers');
    }
};
