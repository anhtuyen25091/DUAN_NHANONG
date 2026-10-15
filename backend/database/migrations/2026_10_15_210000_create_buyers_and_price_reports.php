<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Giá theo khu vực do điểm mua đóng góp:
     * - buyers: hồ sơ điểm mua (doanh nghiệp / đại lý / thương lái / điểm bán lẻ), admin duyệt mới được đăng giá
     * - price_reports: giá 1 điểm mua đăng cho 1 mặt hàng trong 1 ngày, kèm vị trí
     * - price_report_flags: người dùng báo giá sai (mỗi máy 1 lần)
     * - users.home_*: khu vực của tôi (để gợi ý giá + dịch vụ quanh đó)
     */
    public function up(): void
    {
        Schema::create('buyers', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->unique()->constrained()->cascadeOnDelete();
            $table->string('name');
            $table->string('kind', 20);
            // Mua / bán gì: thu_mua, phan_bon, thuoc_bvtv (giống loại điểm bán)
            $table->json('deals_in');
            $table->string('phone', 20);
            $table->string('address')->nullable();
            $table->string('province_code', 30)->index();
            $table->decimal('lat', 10, 7);
            $table->decimal('lng', 10, 7);
            $table->string('goods')->nullable();
            $table->string('status', 20)->default('pending')->index();
            $table->boolean('is_verified')->default(false);
            $table->string('admin_note')->nullable();
            $table->timestamp('approved_at')->nullable();
            // Duyệt xong tự tạo 1 điểm bán để hiện trong "Điểm bán" / "Dịch vụ quanh đây"
            $table->foreignId('shop_id')->nullable()->constrained()->nullOnDelete();
            $table->timestamps();
            $table->index(['lat', 'lng']);
        });

        Schema::create('price_reports', function (Blueprint $table) {
            $table->id();
            $table->foreignId('buyer_id')->constrained()->cascadeOnDelete();
            $table->foreignId('product_id')->constrained()->cascadeOnDelete();
            $table->date('date');
            $table->unsignedBigInteger('price');
            $table->string('unit', 30);
            // Vị trí lúc đăng (copy từ điểm mua), để tìm theo bán kính không cần join
            $table->string('province_code', 30);
            $table->decimal('lat', 10, 7);
            $table->decimal('lng', 10, 7);
            $table->string('note')->nullable();
            $table->string('status', 20)->default('published')->index();
            // Giá tham chiếu lúc đăng và lý do chờ duyệt (để admin xem nhanh)
            $table->unsignedBigInteger('reference_price')->nullable();
            $table->string('review_reason')->nullable();
            $table->unsignedInteger('flags_count')->default(0);
            $table->timestamps();

            $table->unique(['buyer_id', 'product_id', 'date']);
            $table->index(['product_id', 'date']);
            $table->index(['lat', 'lng']);
        });

        Schema::create('price_report_flags', function (Blueprint $table) {
            $table->id();
            $table->foreignId('price_report_id')->constrained()->cascadeOnDelete();
            $table->foreignId('device_id')->constrained()->cascadeOnDelete();
            $table->string('reason')->nullable();
            $table->timestamps();
            $table->unique(['price_report_id', 'device_id']);
        });

        Schema::table('users', function (Blueprint $table) {
            $table->string('home_province', 30)->nullable()->after('premium_until');
            $table->decimal('home_lat', 10, 7)->nullable()->after('home_province');
            $table->decimal('home_lng', 10, 7)->nullable()->after('home_lat');
            $table->string('home_label')->nullable()->after('home_lng');
            $table->unsignedSmallInteger('home_radius')->nullable()->after('home_label');
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn(['home_province', 'home_lat', 'home_lng', 'home_label', 'home_radius']);
        });
        Schema::dropIfExists('price_report_flags');
        Schema::dropIfExists('price_reports');
        Schema::dropIfExists('buyers');
    }
};
