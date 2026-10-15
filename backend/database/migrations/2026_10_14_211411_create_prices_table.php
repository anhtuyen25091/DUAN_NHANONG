<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::create('prices', function (Blueprint $table) {
            $table->id();
            $table->foreignId('product_id')->constrained()->cascadeOnDelete();
            $table->foreignId('region_id')->constrained()->cascadeOnDelete();
            $table->foreignId('price_source_id')->nullable()->constrained()->nullOnDelete();
            $table->date('date');
            $table->unsignedBigInteger('price_min');
            $table->unsignedBigInteger('price_max');
            $table->unsignedBigInteger('price_avg');
            $table->string('unit', 30);
            $table->string('status', 20)->default('published');
            $table->string('note')->nullable();
            $table->string('source_url', 500)->nullable();
            $table->timestamps();
            $table->unique(['product_id', 'region_id', 'price_source_id', 'date'], 'prices_unique_daily');
            $table->index(['status', 'date']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('prices');
    }
};
