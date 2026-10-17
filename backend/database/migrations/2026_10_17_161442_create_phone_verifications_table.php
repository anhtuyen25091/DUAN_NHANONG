<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Xác minh số điện thoại bằng SMS ngược (người dùng tự nhắn "NN 482913" tới số của hệ thống, tự trả phí tin nhắn):
     * dùng cho quên mật khẩu. Thiết bị / dịch vụ nhận SMS gọi webhook, máy chủ khớp số gửi + mã.
     */
    public function up(): void
    {
        Schema::create('phone_verifications', function (Blueprint $table) {
            $table->id();
            $table->uuid('uuid')->unique();
            $table->string('phone', 20)->index();
            $table->string('code', 6);
            $table->string('purpose', 20)->default('reset');
            // pending → verified (đã nhận SMS) → used (đã đặt mật khẩu)
            $table->string('status', 12)->default('pending');
            $table->timestamp('verified_at')->nullable();
            $table->timestamp('expires_at');
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('phone_verifications');
    }
};
