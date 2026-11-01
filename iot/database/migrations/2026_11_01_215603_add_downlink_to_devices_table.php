<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Thiết bị LoRaWAN qua The Things Stack: địa chỉ + khóa đẩy lệnh xuống (lấy từ header X-Downlink-Push / X-Downlink-Apikey của bản tin gửi lên), mã hóa
        Schema::table('devices', function (Blueprint $table) {
            $table->text('downlink')->nullable()->after('dev_eui');
        });
    }

    public function down(): void
    {
        Schema::table('devices', function (Blueprint $table) {
            $table->dropColumn('downlink');
        });
    }
};
