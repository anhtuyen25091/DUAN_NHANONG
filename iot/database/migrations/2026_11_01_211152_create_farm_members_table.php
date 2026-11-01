<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Người được chủ trang trại chia sẻ (vợ / chồng, con, người làm công). Chủ trang trại vẫn là farms.user_id.
        Schema::create('farm_members', function (Blueprint $table) {
            $table->id();
            $table->foreignId('farm_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            // operator: xem + bật / tắt máy, xử lý cảnh báo; viewer: chỉ xem
            $table->string('role', 20)->default('viewer');
            $table->timestamps();

            $table->unique(['farm_id', 'user_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('farm_members');
    }
};
