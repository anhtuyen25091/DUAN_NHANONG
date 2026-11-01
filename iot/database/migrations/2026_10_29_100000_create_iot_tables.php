<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('farms', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('name');
            $table->string('province')->nullable();
            $table->decimal('lat', 9, 6)->nullable();
            $table->decimal('lng', 9, 6)->nullable();
            $table->timestamps();
        });

        // Lô / ruộng / ao trong trang trại
        Schema::create('plots', function (Blueprint $table) {
            $table->id();
            $table->foreignId('farm_id')->constrained()->cascadeOnDelete();
            $table->string('name');
            $table->string('type', 16);
            $table->string('crop')->nullable();
            $table->unsignedInteger('area_m2')->nullable();
            $table->timestamps();
        });

        // Danh mục chỉ số đo (seed sẵn)
        Schema::create('metrics', function (Blueprint $table) {
            $table->id();
            $table->string('code', 32)->unique();
            $table->string('name');
            $table->string('unit', 16)->nullable();
            $table->string('group', 16);
            $table->decimal('min_valid', 12, 3);
            $table->decimal('max_valid', 12, 3);
            $table->unsignedTinyInteger('decimals')->default(1);
            $table->unsignedSmallInteger('sort')->default(0);
        });

        Schema::create('devices', function (Blueprint $table) {
            $table->id();
            $table->foreignId('farm_id')->constrained()->cascadeOnDelete();
            $table->foreignId('plot_id')->nullable()->constrained()->nullOnDelete();
            $table->string('uid', 16)->unique();
            $table->string('name');
            $table->string('kind', 16);
            $table->string('profile', 48)->default('generic');
            $table->string('dev_eui', 16)->nullable()->unique();
            // Khóa thiết bị: lưu mã hóa (cần để kiểm chữ ký HMAC) + sha256 để tra nhanh
            $table->text('api_key')->nullable();
            $table->char('api_key_hash', 64)->nullable()->unique();
            $table->timestamp('last_seen_at')->nullable();
            $table->unsignedTinyInteger('battery')->nullable();
            $table->string('firmware', 32)->nullable();
            $table->timestamps();
        });

        // Ánh xạ tên trường do decoder LoRaWAN trả về -> chỉ số, theo từng loại thiết bị
        Schema::create('field_maps', function (Blueprint $table) {
            $table->id();
            $table->string('profile', 48);
            $table->string('field', 64);
            $table->foreignId('metric_id')->constrained()->cascadeOnDelete();
            $table->decimal('scale', 12, 6)->default(1);
            $table->unique(['profile', 'field']);
        });

        Schema::create('readings', function (Blueprint $table) {
            $table->id();
            $table->foreignId('device_id')->constrained()->cascadeOnDelete();
            $table->foreignId('metric_id')->constrained()->cascadeOnDelete();
            $table->decimal('value', 12, 3);
            // Giờ đo trên thiết bị (không phải giờ máy chủ nhận) để dữ liệu gửi bù vẫn đúng thứ tự
            $table->dateTime('measured_at');
            $table->dateTime('received_at');
            $table->string('source', 16);
            // Gửi lại cùng số đo không bị nhân đôi
            $table->unique(['device_id', 'metric_id', 'measured_at']);
            $table->index('received_at');
            $table->index('measured_at');
        });

        Schema::create('reading_hourly', function (Blueprint $table) {
            $table->id();
            $table->foreignId('device_id')->constrained()->cascadeOnDelete();
            $table->foreignId('metric_id')->constrained()->cascadeOnDelete();
            $table->dateTime('hour');
            $table->decimal('min', 12, 3);
            $table->decimal('max', 12, 3);
            $table->decimal('avg', 12, 3);
            $table->unsignedInteger('count');
            $table->unique(['device_id', 'metric_id', 'hour']);
        });

        Schema::create('thresholds', function (Blueprint $table) {
            $table->id();
            $table->foreignId('plot_id')->constrained()->cascadeOnDelete();
            $table->foreignId('metric_id')->constrained()->cascadeOnDelete();
            $table->decimal('min', 12, 3)->nullable();
            $table->decimal('max', 12, 3)->nullable();
            $table->string('note')->nullable();
            $table->timestamps();
            $table->unique(['plot_id', 'metric_id']);
        });

        Schema::create('alerts', function (Blueprint $table) {
            $table->id();
            $table->foreignId('threshold_id')->constrained()->cascadeOnDelete();
            $table->foreignId('device_id')->constrained()->cascadeOnDelete();
            $table->string('direction', 8);
            $table->decimal('value', 12, 3);
            $table->dateTime('measured_at');
            $table->dateTime('resolved_at')->nullable();
            $table->timestamps();
            $table->index(['threshold_id', 'resolved_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('alerts');
        Schema::dropIfExists('thresholds');
        Schema::dropIfExists('reading_hourly');
        Schema::dropIfExists('readings');
        Schema::dropIfExists('field_maps');
        Schema::dropIfExists('devices');
        Schema::dropIfExists('metrics');
        Schema::dropIfExists('plots');
        Schema::dropIfExists('farms');
    }
};
