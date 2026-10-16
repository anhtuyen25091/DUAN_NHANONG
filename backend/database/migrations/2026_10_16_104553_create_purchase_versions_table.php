<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Lịch sử phiên bản phiếu mua / bán: mỗi lần lưu có thay đổi (kể cả ghi thêm tiền trả) là 1 bản mới, không sửa bản cũ.
 * Khách được chia sẻ thấy bản lúc nhận và mọi lần sửa sau đó, nên người lập không sửa lén được.
 * - purchases.version: số bản hiện tại
 * - purchases.shared_version: bản lúc phiếu được chia sẻ lần đầu (lịch sử cho khách tính từ đây)
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('purchases', function (Blueprint $table) {
            $table->unsignedInteger('version')->default(1)->after('note');
            $table->unsignedInteger('shared_version')->nullable()->after('version');
        });

        Schema::create('purchase_versions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('purchase_id')->constrained()->cascadeOnDelete();
            $table->unsignedInteger('version');
            // Ảnh chụp phiếu: customer_name, customer_phone, date, lines, kg, amount, paid, note
            $table->json('data');
            $table->timestamp('created_at')->nullable();

            $table->unique(['purchase_id', 'version']);
        });

        // Phiếu đã có: bản 1 = nội dung hiện tại
        foreach (DB::table('purchases')->get() as $p) {
            DB::table('purchase_versions')->insert([
                'purchase_id' => $p->id,
                'version' => 1,
                'data' => json_encode([
                    'customer_name' => $p->customer_name, 'customer_phone' => $p->customer_phone, 'date' => substr((string) $p->date, 0, 10),
                    'lines' => json_decode($p->lines, true), 'kg' => (float) $p->kg, 'amount' => (int) $p->amount, 'paid' => (int) $p->paid, 'note' => $p->note,
                ], JSON_UNESCAPED_UNICODE),
                'created_at' => $p->updated_at,
            ]);
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('purchase_versions');
        Schema::table('purchases', function (Blueprint $table) {
            $table->dropColumn(['version', 'shared_version']);
        });
    }
};
