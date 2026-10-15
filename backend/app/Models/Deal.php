<?php

namespace App\Models;

use App\Enums\DealStatus;
use Database\Factories\DealFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Str;

/**
 * Đơn mua bán chung giữa bên bán và bên mua. Bên còn trống tham gia bằng mã `code`.
 */
#[Fillable(['seller_name', 'buyer_name', 'product_id', 'title', 'unit', 'note'])]
class Deal extends Model
{
    /** @use HasFactory<DealFactory> */
    use HasFactory;

    /** Bỏ các ký tự dễ nhầm (0/O, 1/I) để đọc mã qua điện thoại không sai */
    private const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

    protected function casts(): array
    {
        return [
            'status' => DealStatus::class,
            'closed_at' => 'datetime',
            'last_activity_at' => 'datetime',
        ];
    }

    protected static function booted(): void
    {
        static::creating(function (Deal $deal): void {
            $deal->uuid ??= (string) Str::uuid();
            $deal->code ??= self::newCode();
        });
    }

    public static function newCode(): string
    {
        do {
            $code = '';
            for ($i = 0; $i < 6; $i++) {
                $code .= self::CODE_ALPHABET[random_int(0, strlen(self::CODE_ALPHABET) - 1)];
            }
        } while (self::query()->where('code', $code)->exists());

        return $code;
    }

    public function getRouteKeyName(): string
    {
        return 'uuid';
    }

    /**
     * @param  Builder<Deal>  $query
     */
    public function scopeForUser(Builder $query, User $user): void
    {
        $query->where(fn (Builder $q) => $q->where('seller_id', $user->id)->orWhere('buyer_id', $user->id));
    }

    public function isParticipant(User $user): bool
    {
        return $this->seller_id === $user->id || $this->buyer_id === $user->id;
    }

    /** 'seller' | 'buyer' của người dùng trong đơn này */
    public function roleOf(User $user): ?string
    {
        return match ($user->id) {
            $this->seller_id => 'seller',
            $this->buyer_id => 'buyer',
            default => null,
        };
    }

    /**
     * Ghi hoạt động mới nhất (bên kia thấy thông báo khi đang mở app). Mục riêng (chi phí) không ghi.
     */
    public function recordActivity(User $by, string $text): void
    {
        $this->forceFill([
            'last_activity' => mb_substr($by->name.' '.$text, 0, 250),
            'last_activity_by' => $by->id,
            'last_activity_at' => now(),
        ])->save();
    }

    public function isOpenToJoin(): bool
    {
        return $this->seller_id === null || $this->buyer_id === null;
    }

    /**
     * @return BelongsTo<User, $this>
     */
    public function seller(): BelongsTo
    {
        return $this->belongsTo(User::class, 'seller_id');
    }

    /**
     * @return BelongsTo<User, $this>
     */
    public function buyer(): BelongsTo
    {
        return $this->belongsTo(User::class, 'buyer_id');
    }

    /**
     * @return BelongsTo<Product, $this>
     */
    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class);
    }

    /**
     * @return HasMany<DealEntry, $this>
     */
    public function entries(): HasMany
    {
        return $this->hasMany(DealEntry::class);
    }

    /**
     * Đơn mua (của nông dân) đã gộp vào đơn bán này (thương lái bán lại cho chi nhánh).
     *
     * @return BelongsToMany<Deal, $this>
     */
    public function sources(): BelongsToMany
    {
        return $this->belongsToMany(Deal::class, 'deal_sources', 'sell_deal_id', 'buy_deal_id')->withTimestamps();
    }
}
