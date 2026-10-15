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
        Schema::create('crawl_logs', function (Blueprint $table) {
            $table->id();
            $table->foreignId('price_source_id')->constrained()->cascadeOnDelete();
            $table->date('target_date');
            $table->string('url', 500)->nullable();
            $table->string('status', 20);
            $table->unsignedInteger('items_count')->default(0);
            $table->text('message')->nullable();
            $table->longText('raw_html')->nullable();
            $table->timestamps();
            $table->index(['price_source_id', 'target_date']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('crawl_logs');
    }
};
