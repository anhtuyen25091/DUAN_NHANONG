<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Các mục của đơn mua bán: cọc, đợt cân, lần trả tiền (2 bên cùng thấy, bên kia xác nhận),
 * chi phí riêng (chỉ người ghi thấy, vd tiền xe, công cắt của thương lái).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('deal_entries', function (Blueprint $table) {
            $table->id();
            $table->uuid('uuid')->unique();
            $table->foreignId('deal_id')->constrained()->cascadeOnDelete();
            $table->string('kind', 20); // deposit | cut | payment | cost
            $table->date('date');
            // Đợt cân: [{grade, kg, price}]
            $table->json('lines')->nullable();
            // Cọc / lần trả / chi phí: số tiền; đợt cân: tiền hàng (tính từ lines)
            $table->unsignedBigInteger('amount')->default(0);
            $table->decimal('kg', 12, 3)->default(0);
            // Đợt cân: số cọc trừ vào đợt này và tiền trả ngay lúc cân
            $table->unsignedBigInteger('deposit_deduct')->default(0);
            $table->unsignedBigInteger('paid')->default(0);
            $table->string('note')->nullable();
            $table->foreignId('created_by')->constrained('users')->cascadeOnDelete();
            $table->string('status', 20)->default('pending'); // pending | confirmed | disputed | private
            $table->foreignId('responded_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('responded_at')->nullable();
            $table->string('dispute_reason')->nullable();
            $table->softDeletes();
            $table->timestamps();

            $table->index(['deal_id', 'date']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('deal_entries');
    }
};
