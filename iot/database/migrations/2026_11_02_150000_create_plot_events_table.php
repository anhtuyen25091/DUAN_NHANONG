<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Việc làm vườn của 1 lô: phun thuốc, bón phân, tưới (gõ tay, từ Sổ thu chi, hoặc máy bơm tự ghi), tỉa cành...
        // uuid trùng id nhật ký canh tác trong Sổ thu chi (1 việc ở vườn có nhiều lô thì mỗi lô 1 dòng cùng uuid)
        Schema::create('plot_events', function (Blueprint $table) {
            $table->id();
            $table->uuid('uuid');
            $table->foreignId('plot_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->string('kind', 16);
            $table->string('title', 191);
            $table->decimal('quantity', 12, 3)->nullable();
            $table->string('unit', 32)->nullable();
            $table->string('target', 191)->nullable();
            // Thuốc BVTV: cách ly thu hoạch (ngày), không vào lô (giờ), không mưa / không tưới trên tán (giờ)
            $table->unsignedSmallInteger('withholding_days')->nullable();
            $table->unsignedSmallInteger('reentry_hours')->nullable();
            $table->unsignedSmallInteger('rain_free_hours')->nullable();
            $table->string('worker', 100)->nullable();
            $table->text('note')->nullable();
            // Kế hoạch (chưa làm): chưa có hiệu lực, sáng hôm đó nhắc
            $table->boolean('planned')->default(false);
            $table->dateTime('done_at');
            $table->timestamp('reminded_at')->nullable();
            // manual: gõ trên trang lô; ledger: từ Sổ thu chi; actuator: máy bơm tự ghi
            $table->string('source', 16)->default('manual');
            $table->foreignId('actuator_id')->nullable()->constrained()->nullOnDelete();
            $table->unsignedSmallInteger('minutes')->nullable();
            $table->timestamps();
            $table->softDeletes();
            $table->unique(['plot_id', 'uuid']);
            $table->index(['plot_id', 'done_at']);
        });

        // Lô nối với 1 vườn trong Sổ thu chi của chủ trang trại (1 vườn có thể nối nhiều lô)
        Schema::table('plots', function (Blueprint $table) {
            $table->uuid('ledger_garden_id')->nullable()->after('area_m2');
            $table->string('ledger_garden_name', 191)->nullable()->after('ledger_garden_id');
        });

        // Kiểu tưới: root = tưới gốc / nhỏ giọt, canopy = phun mưa trên tán; null = chưa rõ (phun sương coi như trên tán)
        Schema::table('actuators', function (Blueprint $table) {
            $table->string('irrigation_mode', 16)->nullable()->after('kind');
        });

        // Ghi chú kèm cảnh báo, VD "có thể do vừa bón phân"
        Schema::table('alerts', function (Blueprint $table) {
            $table->string('note', 255)->nullable()->after('resolved_at');
        });
    }

    public function down(): void
    {
        Schema::table('alerts', fn (Blueprint $table) => $table->dropColumn('note'));
        Schema::table('actuators', fn (Blueprint $table) => $table->dropColumn('irrigation_mode'));
        Schema::table('plots', fn (Blueprint $table) => $table->dropColumn(['ledger_garden_id', 'ledger_garden_name']));
        Schema::dropIfExists('plot_events');
    }
};
