<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Bài viết gắn với mặt hàng (sầu riêng, hồ tiêu…): lọc theo cây trồng, "Bài viết liên quan" ở trang mặt hàng.
     */
    public function up(): void
    {
        Schema::create('article_product', function (Blueprint $table) {
            $table->foreignId('article_id')->constrained()->cascadeOnDelete();
            $table->foreignId('product_id')->constrained()->cascadeOnDelete();
            $table->primary(['article_id', 'product_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('article_product');
    }
};
