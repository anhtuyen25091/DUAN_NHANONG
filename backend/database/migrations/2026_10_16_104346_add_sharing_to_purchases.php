<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Chia sẻ phiếu mua / bán cho khách xem (chỉ xem, tải PDF / Word):
 * - purchases.share_code: mã 6 ký tự gửi khách, nhập chung ô với mã đơn mua bán
 * - purchase_viewers: tài khoản được xem phiếu (nhập mã, hoặc người lập phiếu gửi thẳng khi SĐT khách trùng tài khoản)
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('purchases', function (Blueprint $table) {
            $table->string('share_code', 8)->nullable()->unique()->after('note');
        });

        Schema::create('purchase_viewers', function (Blueprint $table) {
            $table->id();
            $table->foreignId('purchase_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('via', 10); // code | phone
            $table->timestamps();

            $table->unique(['purchase_id', 'user_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('purchase_viewers');
        Schema::table('purchases', function (Blueprint $table) {
            $table->dropUnique(['share_code']);
            $table->dropColumn('share_code');
        });
    }
};
