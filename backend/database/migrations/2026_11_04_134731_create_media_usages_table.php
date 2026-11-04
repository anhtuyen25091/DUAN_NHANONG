<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('media_usages', function (Blueprint $table) {
            $table->id();
            $table->foreignId('media_file_id')->constrained()->cascadeOnDelete();
            $table->morphs('usable');
            $table->string('field', 50);
            $table->timestamps();

            $table->unique(['media_file_id', 'usable_type', 'usable_id', 'field']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('media_usages');
    }
};
