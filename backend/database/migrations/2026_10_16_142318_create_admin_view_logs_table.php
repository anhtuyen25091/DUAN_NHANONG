<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Nhật ký admin xem dữ liệu riêng của người dùng (sổ thu chi đồng bộ, đơn mua bán, phiếu, doanh nghiệp):
 * ai xem, xem của ai, mục nào, lúc nào. Để kiểm tra lại khi cần (người dùng đã được báo trước).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('admin_view_logs', function (Blueprint $table) {
            $table->id();
            $table->foreignId('admin_id')->constrained('users')->cascadeOnDelete();
            $table->foreignId('subject_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('area', 20); // ledger | deal | purchase | business
            $table->string('record', 200);
            $table->string('action', 20)->default('view'); // view | download
            $table->timestamp('created_at')->nullable();

            $table->index(['subject_user_id', 'created_at']);
            $table->index(['admin_id', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('admin_view_logs');
    }
};
