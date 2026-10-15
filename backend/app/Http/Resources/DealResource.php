<?php

namespace App\Http\Resources;

use App\Deals\DealSummary;
use App\Models\Deal;
use App\Models\DealEntry;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * Đơn mua bán nhìn từ phía người đang xem: vai trò của mình, bên kia, các mục (chi phí riêng của bên kia bị ẩn), số liệu.
 *
 * @mixin Deal
 */
class DealResource extends JsonResource
{
    /** Danh sách: không kèm từng mục */
    public bool $withEntries = true;

    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        $viewer = $request->user();
        $role = $this->roleOf($viewer);
        $other = $role === 'seller' ? $this->buyer : $this->seller;
        $visible = $this->entries->filter(fn (DealEntry $e): bool => $e->kind->isShared() || $e->created_by === $viewer->id)->values();

        return [
            'uuid' => $this->uuid,
            'code' => $this->code,
            'title' => $this->title,
            'unit' => $this->unit,
            'product' => $this->product ? ['code' => $this->product->code, 'name' => $this->product->name] : null,
            'status' => $this->status->value,
            'closed_at' => $this->closed_at?->toIso8601String(),
            'note' => $this->note,
            'my_role' => $role,
            'is_creator' => $this->created_by === $viewer->id,
            'joined' => ! $this->isOpenToJoin(),
            'seller_name' => $this->seller?->name ?? $this->seller_name,
            'buyer_name' => $this->buyer?->name ?? $this->buyer_name,
            'counterpart' => $other ? ['name' => $other->name, 'phone' => $other->phone] : null,
            'summary' => DealSummary::for($this->resource, $viewer),
            'lot' => DealSummary::lot($this->resource, $viewer),
            'sources' => $this->when($role === 'seller', fn () => $this->sources->map(fn (Deal $d): array => ['uuid' => $d->uuid, 'title' => $d->title, 'seller_name' => $d->seller?->name ?? $d->seller_name])->values()),
            'entries' => $this->when($this->withEntries, fn () => $visible->map(fn (DealEntry $e): array => [
                'uuid' => $e->uuid,
                'kind' => $e->kind->value,
                'date' => $e->date->toDateString(),
                'lines' => $e->lines,
                'amount' => $e->amount,
                'kg' => $e->kg,
                'deposit_deduct' => $e->deposit_deduct,
                'paid' => $e->paid,
                'note' => $e->note,
                'status' => $e->status->value,
                'mine' => $e->created_by === $viewer->id,
                'created_by_name' => $e->creator?->name,
                'dispute_reason' => $e->dispute_reason,
                'responded_at' => $e->responded_at?->toIso8601String(),
                'updated_at' => $e->updated_at->toIso8601String(),
            ])),
            'last_activity' => $this->last_activity === null ? null : [
                'text' => $this->last_activity,
                'by_me' => $this->last_activity_by === $viewer->id,
                'at' => $this->last_activity_at?->toIso8601String(),
            ],
            'updated_at' => $this->updated_at->toIso8601String(),
        ];
    }
}
