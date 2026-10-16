<?php

namespace App\Models;

use App\Enums\PurchaseKind;
use Database\Factories\PurchaseFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Support\Str;

/**
 * Phiếu mua / bán 1 lần của điểm thu mua: cân nhiều loại hàng, trừ bì, đã trả bao nhiêu, còn nợ.
 */
#[Fillable(['kind', 'customer_name', 'customer_phone', 'date', 'lines', 'paid', 'note'])]
class Purchase extends Model
{
    /** Các trường nội dung phiếu: đổi trường nào cũng sinh bản mới */
    public const VERSIONED = ['customer_name', 'customer_phone', 'date', 'lines', 'paid', 'note'];

    /** @use HasFactory<PurchaseFactory> */
    use HasFactory, SoftDeletes;

    protected function casts(): array
    {
        return [
            'kind' => PurchaseKind::class,
            'date' => 'date',
            'lines' => 'array',
            'kg' => 'float',
            'amount' => 'integer',
            'paid' => 'integer',
            'number' => 'integer',
            'version' => 'integer',
            'shared_version' => 'integer',
        ];
    }

    protected static function booted(): void
    {
        static::creating(function (Purchase $purchase): void {
            $purchase->uuid ??= (string) Str::uuid();
            // Số phiếu kế tiếp (kể cả phiếu đã xóa, để số in ra không bị trùng): doanh nghiệp đánh số chung cho mọi lái,
            // làm riêng thì đánh số theo tài khoản
            $purchase->number ??= (int) self::withTrashed()
                ->when($purchase->business_id, fn ($q, $id) => $q->where('business_id', $id), fn ($q) => $q->where('user_id', $purchase->user_id)->whereNull('business_id'))
                ->where('kind', $purchase->kind)
                ->max('number') + 1;
        });

        static::saving(function (Purchase $purchase): void {
            $purchase->lines = self::normalizeLines($purchase->lines ?? []);
            $purchase->kg = round(array_sum(array_column($purchase->lines, 'net_kg')), 3);
            $purchase->amount = (int) array_sum(array_column($purchase->lines, 'amount'));
            // Có đổi nội dung phiếu (kể cả ghi thêm tiền trả) thì sang bản mới
            if ($purchase->exists && $purchase->isDirty(self::VERSIONED)) {
                $purchase->version = $purchase->getOriginal('version') + 1;
            }
        });

        // Lưu ảnh chụp mỗi bản; bản cũ giữ nguyên để khách được chia sẻ thấy cả cũ và mới
        static::saved(function (Purchase $purchase): void {
            if ($purchase->wasRecentlyCreated || $purchase->wasChanged('version')) {
                $purchase->versions()->create(['version' => $purchase->version ?? 1, 'data' => $purchase->snapshot(), 'created_at' => now()]);
            }
        });
    }

    public function getRouteKeyName(): string
    {
        return 'uuid';
    }

    /**
     * Tính kg tịnh và thành tiền từng dòng: tịnh = cân − trừ bì; tiền = tịnh × đơn giá (làm tròn đồng).
     *
     * @param  list<array<string, mixed>>  $lines
     * @return list<array{product_code: string|null, name: string, kg: float, deduct_kg: float, net_kg: float, price: int, amount: int}>
     */
    public static function normalizeLines(array $lines): array
    {
        return array_values(array_map(function (array $line): array {
            $kg = round((float) ($line['kg'] ?? 0), 3);
            $deduct = round(min((float) ($line['deduct_kg'] ?? 0), $kg), 3);
            $net = round($kg - $deduct, 3);
            $price = (int) ($line['price'] ?? 0);

            return [
                'product_code' => $line['product_code'] ?? null,
                'name' => (string) ($line['name'] ?? ''),
                'kg' => $kg,
                'deduct_kg' => $deduct,
                'net_kg' => $net,
                'price' => $price,
                'amount' => (int) round($net * $price),
            ];
        }, $lines));
    }

    /**
     * Nội dung phiếu lúc này (lưu vào lịch sử phiên bản)
     *
     * @return array{customer_name: string, customer_phone: string|null, date: string, lines: list<array<string, mixed>>, kg: float, amount: int, paid: int, note: string|null}
     */
    public function snapshot(): array
    {
        return [
            'customer_name' => $this->customer_name,
            'customer_phone' => $this->customer_phone,
            'date' => $this->date->toDateString(),
            'lines' => $this->lines,
            'kg' => (float) $this->kg,
            'amount' => (int) $this->amount,
            'paid' => (int) $this->paid,
            'note' => $this->note,
        ];
    }

    /**
     * Lịch sử từ bản $from: mỗi bản kèm thời gian và các thay đổi so với bản trước (bản đầu tiên: không có thay đổi)
     *
     * @return list<array{version: int, at: string|null, amount: int, paid: int, changes: list<string>}>
     */
    public function history(int $from = 1): array
    {
        $versions = $this->versions()->orderBy('version')->get();
        $history = [];
        $previous = null;
        foreach ($versions as $v) {
            if ($v->version >= $from) {
                $history[] = [
                    'version' => $v->version,
                    'at' => $v->created_at?->toIso8601String(),
                    'amount' => (int) $v->data['amount'],
                    'paid' => (int) $v->data['paid'],
                    'changes' => $previous && $v->version > $from ? PurchaseVersion::changes($previous->data, $v->data) : [],
                ];
            }
            $previous = $v;
        }

        return $history;
    }

    /** Đánh dấu bản lúc chia sẻ lần đầu: lịch sử cho khách tính từ đây */
    public function markShared(): void
    {
        if ($this->shared_version === null) {
            $this->forceFill(['shared_version' => $this->version])->saveQuietly();
        }
    }

    /** "PM-000012" */
    public function code(): string
    {
        return $this->kind->prefix().'-'.str_pad((string) $this->number, 6, '0', STR_PAD_LEFT);
    }

    public function owing(): int
    {
        return max(0, $this->amount - $this->paid);
    }

    /**
     * @return BelongsTo<User, $this>
     */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /**
     * @return BelongsTo<Customer, $this>
     */
    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }

    /**
     * @return HasMany<PurchaseVersion, $this>
     */
    public function versions(): HasMany
    {
        return $this->hasMany(PurchaseVersion::class);
    }

    /**
     * Tài khoản được xem phiếu (chỉ xem, tải giấy tờ)
     *
     * @return BelongsToMany<User, $this>
     */
    public function viewers(): BelongsToMany
    {
        return $this->belongsToMany(User::class, 'purchase_viewers')->withPivot('via')->withTimestamps();
    }

    public function canView(User $user): bool
    {
        return $this->user_id === $user->id || $this->isBusinessOwner($user) || $this->viewers()->whereKey($user->id)->exists();
    }

    /** Chủ doanh nghiệp của phiếu (phiếu lái con lập): xem, tải giấy tờ, thống kê */
    public function isBusinessOwner(User $user): bool
    {
        return $this->business_id !== null && Business::query()->whereKey($this->business_id)->where('owner_id', $user->id)->exists();
    }

    /**
     * @return BelongsTo<Business, $this>
     */
    public function business(): BelongsTo
    {
        return $this->belongsTo(Business::class);
    }

    /**
     * Tài khoản có SĐT trùng SĐT khách trên phiếu (không tính chính người lập phiếu)
     */
    public function matchingAccount(): ?User
    {
        $phone = User::normalizePhone($this->customer_phone);

        return $phone ? User::query()->where('phone', $phone)->where('id', '!=', $this->user_id)->first() : null;
    }
}
