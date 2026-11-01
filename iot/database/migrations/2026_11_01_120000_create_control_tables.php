<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Thiết bị được điều khiển (máy bơm, quạt oxy, van...) nối vào 1 kênh relay của mạch điều khiển (devices)
        Schema::create('actuators', function (Blueprint $table) {
            $table->id();
            $table->foreignId('device_id')->constrained()->cascadeOnDelete();
            $table->foreignId('plot_id')->nullable()->constrained()->nullOnDelete();
            $table->string('name');
            $table->string('kind', 16);
            $table->unsignedTinyInteger('channel');
            // Mỗi lần bật chạy tối đa bấy nhiêu phút (mạch tự tắt khi hết giờ, kể cả lúc mất mạng)
            $table->unsignedSmallInteger('max_minutes')->default(60);
            $table->boolean('is_on')->default(false);
            $table->timestamp('state_changed_at')->nullable();
            $table->timestamp('auto_off_at')->nullable();
            $table->timestamps();
            $table->unique(['device_id', 'channel']);
        });

        // Lệnh bật / tắt: mạch lấy qua GET /device/commands (hoặc kèm phản hồi /ingest), làm xong thì báo lại
        Schema::create('actuator_commands', function (Blueprint $table) {
            $table->id();
            $table->foreignId('actuator_id')->constrained()->cascadeOnDelete();
            $table->string('action', 8);
            $table->unsignedSmallInteger('minutes')->nullable();
            $table->string('source', 16);
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->unsignedBigInteger('rule_id')->nullable();
            $table->string('reason')->nullable();
            $table->string('status', 16);
            $table->string('message')->nullable();
            $table->timestamp('expires_at');
            $table->timestamp('sent_at')->nullable();
            $table->timestamp('done_at')->nullable();
            $table->timestamps();
            $table->index(['actuator_id', 'status']);
        });

        // Luật tự động: chỉ số của lô vượt mức thì bật / tắt thiết bị
        Schema::create('automation_rules', function (Blueprint $table) {
            $table->id();
            $table->foreignId('plot_id')->constrained()->cascadeOnDelete();
            $table->foreignId('metric_id')->constrained()->cascadeOnDelete();
            $table->foreignId('actuator_id')->constrained()->cascadeOnDelete();
            $table->string('operator', 8);
            $table->decimal('value', 12, 3);
            // Trở lại mức này thì tắt (VD DO < 4 bật quạt, DO ≥ 5 tắt); null = chạy hết số phút rồi tự tắt
            $table->decimal('off_value', 12, 3)->nullable();
            $table->unsignedSmallInteger('minutes');
            $table->unsignedSmallInteger('cooldown_minutes')->default(30);
            $table->boolean('enabled')->default(true);
            $table->timestamp('last_triggered_at')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('automation_rules');
        Schema::dropIfExists('actuator_commands');
        Schema::dropIfExists('actuators');
    }
};
