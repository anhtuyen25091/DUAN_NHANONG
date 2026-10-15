<?php

namespace App\Http\Controllers\Api\V1;

use App\Enums\DealEntryKind;
use App\Enums\DealEntryStatus;
use App\Enums\DealStatus;
use App\Http\Controllers\Controller;
use App\Http\Requests\DealEntryRequest;
use App\Http\Resources\DealResource;
use App\Models\Deal;
use App\Models\DealEntry;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Các mục của đơn mua bán. Cả 2 bên ghi được; mục của bên này chờ bên kia xác nhận hoặc báo sai.
 * Người ghi sửa mục của mình (kể cả đã xác nhận) thì mục quay về "chờ xác nhận".
 * Chi phí (cost) là mục riêng của người ghi, bên kia không thấy, không cần xác nhận.
 */
class DealEntryController extends Controller
{
    public function store(DealEntryRequest $request, Deal $deal): JsonResponse
    {
        $this->authorizeOpenDeal($request, $deal);
        $entry = $deal->entries()->make($request->entryData());
        $entry->created_by = $request->user()->id;
        $entry->status = $entry->kind->isShared() ? DealEntryStatus::Pending : DealEntryStatus::Private;
        $entry->save();
        $entry->kind->isShared() ? $deal->recordActivity($request->user(), 'ghi '.$entry->describe().', chờ xác nhận') : $deal->touch();

        return $this->dealResponse($deal, $request, 201);
    }

    public function update(DealEntryRequest $request, DealEntry $entry): JsonResponse
    {
        $deal = $entry->deal;
        $this->authorizeOpenDeal($request, $deal);
        $this->authorizeCreator($request, $entry, 'Chỉ người ghi mục này mới sửa được. Thấy sai thì bấm "Báo sai".');
        $entry->fill($request->entryData());
        $changed = $entry->isDirty();
        if ($entry->kind->isShared() && $changed) {
            $entry->status = DealEntryStatus::Pending;
            $entry->forceFill(['responded_by' => null, 'responded_at' => null, 'dispute_reason' => null]);
        }
        $entry->save();
        $entry->kind->isShared() && $changed ? $deal->recordActivity($request->user(), 'sửa '.$entry->describe().', chờ xác nhận lại') : $deal->touch();

        return $this->dealResponse($deal, $request);
    }

    public function destroy(Request $request, DealEntry $entry): JsonResponse
    {
        $deal = $entry->deal;
        $this->authorizeOpenDeal($request, $deal);
        $this->authorizeCreator($request, $entry, 'Chỉ người ghi mục này mới xóa được.');
        abort_if($entry->status === DealEntryStatus::Confirmed, 422, 'Mục đã được bên kia xác nhận, không xóa được. Hãy sửa lại (bên kia sẽ xác nhận lại).');
        $entry->delete();
        $entry->kind->isShared() ? $deal->recordActivity($request->user(), 'xóa '.$entry->describe()) : $deal->touch();

        return $this->dealResponse($deal, $request);
    }

    public function confirm(Request $request, DealEntry $entry): JsonResponse
    {
        return $this->respond($request, $entry, DealEntryStatus::Confirmed, null);
    }

    public function dispute(Request $request, DealEntry $entry): JsonResponse
    {
        $reason = $request->validate(['reason' => ['required', 'string', 'max:255']], ['reason.required' => 'Ghi rõ sai chỗ nào để bên kia sửa.'])['reason'];

        return $this->respond($request, $entry, DealEntryStatus::Disputed, $reason);
    }

    private function respond(Request $request, DealEntry $entry, DealEntryStatus $status, ?string $reason): JsonResponse
    {
        $deal = $entry->deal;
        $this->authorizeOpenDeal($request, $deal);
        abort_if($entry->created_by === $request->user()->id, 403, 'Mục do bạn ghi, bên kia mới xác nhận được.');
        abort_unless($entry->kind->isShared(), 404);
        $entry->status = $status;
        $entry->forceFill(['responded_by' => $request->user()->id, 'responded_at' => now(), 'dispute_reason' => $reason])->save();
        $deal->recordActivity($request->user(), $status === DealEntryStatus::Confirmed ? 'đồng ý '.$entry->describe() : 'báo sai '.$entry->describe().': '.$reason);

        return $this->dealResponse($deal, $request);
    }

    private function authorizeOpenDeal(Request $request, Deal $deal): void
    {
        abort_unless($deal->isParticipant($request->user()), 404);
        abort_if($deal->status !== DealStatus::Open, 422, 'Đơn đã kết thúc. Mở lại đơn để ghi tiếp.');
    }

    private function authorizeCreator(Request $request, DealEntry $entry, string $message): void
    {
        if ($entry->kind === DealEntryKind::Cost && $entry->created_by !== $request->user()->id) {
            abort(404);
        }
        abort_if($entry->created_by !== $request->user()->id, 403, $message);
    }

    private function dealResponse(Deal $deal, Request $request, int $status = 200): JsonResponse
    {
        $deal = $deal->fresh(['seller', 'buyer', 'product', 'entries.creator', 'sources.entries', 'sources.seller']);

        return response()->json(['data' => (new DealResource($deal))->resolve($request)], $status);
    }
}
