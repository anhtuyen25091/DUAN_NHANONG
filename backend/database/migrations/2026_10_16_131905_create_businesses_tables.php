<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Doanh nghiệp thu mua (vừa và nhỏ): chủ + các lái con đi mua giùm.
 * - businesses: thông tin in trên phiếu, mã mời
 * - business_members: ai thuộc doanh nghiệp (mỗi tài khoản tối đa 1 doanh nghiệp), vai trò, nhóm, khóa
 * - business_advances: chủ ứng tiền cho lái / lái nộp lại tiền thừa
 * - purchases / customers / deals.business_id: phiếu, khách, đơn chung lái tạo thì thuộc doanh nghiệp
 * - deals.business_user_id: thành viên doanh nghiệp đứng trong đơn (người tạo hoặc người tham gia bằng mã)
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('businesses', function (Blueprint $table) {
            $table->id();
            $table->uuid('uuid')->unique();
            $table->foreignId('owner_id')->constrained('users')->cascadeOnDelete();
            $table->string('name', 150);
            $table->string('phone', 20)->nullable();
            $table->string('address')->nullable();
            $table->string('invite_code', 8)->nullable()->unique();
            $table->timestamps();
        });

        Schema::create('business_members', function (Blueprint $table) {
            $table->id();
            $table->foreignId('business_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->unique()->constrained()->cascadeOnDelete();
            $table->string('role', 10)->default('buyer'); // owner | buyer
            $table->string('group_name', 80)->nullable();
            $table->string('status', 10)->default('active'); // active | locked
            // Chủ tạo tài khoản này (được đặt lại mật khẩu); tự đăng ký rồi nhập mã mời thì false
            $table->boolean('created_by_owner')->default(false);
            $table->timestamps();
        });

        Schema::create('business_advances', function (Blueprint $table) {
            $table->id();
            $table->uuid('uuid')->unique();
            $table->foreignId('business_id')->constrained()->cascadeOnDelete();
            $table->foreignId('member_id')->constrained('users')->cascadeOnDelete();
            $table->string('kind', 10); // advance: chủ ứng cho lái | return: lái nộp lại
            $table->unsignedBigInteger('amount');
            $table->date('date');
            $table->string('note')->nullable();
            $table->foreignId('created_by')->constrained('users')->cascadeOnDelete();
            $table->softDeletes();
            $table->timestamps();

            $table->index(['business_id', 'member_id', 'date']);
        });

        Schema::table('purchases', function (Blueprint $table) {
            $table->foreignId('business_id')->nullable()->after('user_id')->constrained()->nullOnDelete();
        });
        Schema::table('customers', function (Blueprint $table) {
            $table->foreignId('business_id')->nullable()->after('user_id')->constrained()->nullOnDelete();
        });
        Schema::table('deals', function (Blueprint $table) {
            $table->foreignId('business_id')->nullable()->after('created_by')->constrained()->nullOnDelete();
            $table->foreignId('business_user_id')->nullable()->after('business_id')->constrained('users')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('deals', function (Blueprint $table) {
            $table->dropConstrainedForeignId('business_user_id');
            $table->dropConstrainedForeignId('business_id');
        });
        Schema::table('customers', fn (Blueprint $table) => $table->dropConstrainedForeignId('business_id'));
        Schema::table('purchases', fn (Blueprint $table) => $table->dropConstrainedForeignId('business_id'));
        Schema::dropIfExists('business_advances');
        Schema::dropIfExists('business_members');
        Schema::dropIfExists('businesses');
    }
};
