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
        Schema::create('unmatched_names', function (Blueprint $table) {
            $table->id();
            $table->foreignId('price_source_id')->constrained()->cascadeOnDelete();
            $table->string('kind', 20);
            $table->string('name');
            $table->string('normalized');
            $table->string('sample_url', 500)->nullable();
            $table->unsignedInteger('seen_count')->default(1);
            $table->timestamp('last_seen_at')->nullable();
            $table->boolean('resolved')->default(false);
            $table->timestamps();
            $table->unique(['price_source_id', 'kind', 'normalized']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('unmatched_names');
    }
};
