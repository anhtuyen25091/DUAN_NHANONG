<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Sổ thu chi của người dùng bật "lưu cả trên mạng". Mỗi dòng là 1 bản ghi của máy
     * (vườn, hạng mục, khoản thu chi…) lưu nguyên dạng JSON, giống cách máy lưu.
     */
    public function up(): void
    {
        Schema::create('ledger_records', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('tbl', 32);
            $table->uuid('uuid');
            $table->json('data');
            // updated_at do máy ghi (ISO 8601 UTC), dùng để chọn bản mới hơn khi 2 máy cùng sửa
            $table->string('client_updated_at', 32);
            $table->boolean('is_deleted')->default(false);
            // = users.ledger_version lúc ghi; máy kéo các dòng có version > lần kéo trước
            $table->unsignedBigInteger('version');
            $table->timestamps();

            $table->unique(['user_id', 'tbl', 'uuid']);
            $table->index(['user_id', 'version']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('ledger_records');
    }
};
