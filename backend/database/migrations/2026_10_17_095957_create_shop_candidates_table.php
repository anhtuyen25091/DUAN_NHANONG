<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Bảng chờ của việc thu thập điểm bán: mỗi dòng là 1 điểm lấy từ 1 nguồn (danh sách của Sở, đại lý của hãng, OSM…).
     * Chuẩn hóa, lấy tọa độ, bỏ trùng xong mới gộp vào bảng shops (tự động khi đủ tin cậy, còn lại chờ admin duyệt).
     */
    public function up(): void
    {
        Schema::create('shop_candidates', function (Blueprint $table) {
            $table->id();
            $table->string('source', 40);
            $table->string('source_ref', 191);
            // Độ tin cậy của nguồn lúc thu thập (0–100)
            $table->unsignedTinyInteger('source_trust')->default(50);
            $table->text('source_url')->nullable();
            $table->string('name');
            $table->json('types');
            $table->string('address', 500)->nullable();
            $table->string('province_code', 30)->nullable()->index();
            $table->string('phone', 50)->nullable()->index();
            $table->string('goods')->nullable();
            $table->decimal('lat', 10, 7)->nullable();
            $table->decimal('lng', 10, 7)->nullable();
            $table->string('geo_precision', 10)->nullable();
            $table->json('raw')->nullable();
            $table->string('status', 12)->default('pending')->index();
            $table->unsignedTinyInteger('confidence')->default(0);
            $table->string('review_note')->nullable();
            $table->foreignId('shop_id')->nullable()->constrained()->nullOnDelete();
            $table->timestamp('last_seen_at')->nullable();
            $table->timestamps();
            $table->unique(['source', 'source_ref']);
        });

        Schema::table('shops', function (Blueprint $table) {
            // exact: đúng nhà / đường · place: tâm xã, thôn · province: tâm tỉnh (vị trí gần đúng)
            $table->string('geo_precision', 10)->nullable()->after('lng');
        });
    }

    public function down(): void
    {
        Schema::table('shops', function (Blueprint $table) {
            $table->dropColumn('geo_precision');
        });
        Schema::dropIfExists('shop_candidates');
    }
};
