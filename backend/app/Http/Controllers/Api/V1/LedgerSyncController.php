<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\LedgerRecord;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\Rule;

/**
 * Đồng bộ sổ thu chi giữa các máy của cùng một người.
 * - push: máy gửi bản ghi đã đổi; bản nào updated_at mới hơn thì thắng (last-write-wins).
 * - pull: máy lấy các bản ghi có version > lần lấy trước.
 */
class LedgerSyncController extends Controller
{
    public const MAX_PUSH = 500;

    public const PULL_LIMIT = 500;

    public function push(Request $request): JsonResponse
    {
        $data = $request->validate([
            'records' => ['required', 'array', 'max:'.self::MAX_PUSH],
            'records.*.tbl' => ['required', Rule::in(LedgerRecord::TABLES)],
            'records.*.data' => ['required', 'array'],
            'records.*.data.id' => ['required', 'uuid'],
            'records.*.data.updated_at' => ['required', 'string', 'regex:/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?Z$/'],
            'records.*.data.deleted_at' => ['present', 'nullable', 'string', 'max:32'],
        ], [
            'records.max' => 'Mỗi lần gửi tối đa '.self::MAX_PUSH.' mục.',
        ]);

        foreach ($data['records'] as $i => $record) {
            if (strlen(json_encode($request->input("records.$i.data"))) > 20_000) {
                return response()->json(['message' => 'Một mục quá lớn.'], 422);
            }
        }

        /** @var User $user */
        $user = $request->user();
        $accepted = 0;

        DB::transaction(function () use ($user, $request, $data, &$accepted): void {
            // Khóa dòng user để 2 máy gửi cùng lúc không trùng version
            $version = User::query()->whereKey($user->id)->lockForUpdate()->value('ledger_version');

            foreach ($data['records'] as $i => $record) {
                // Lấy nguyên data máy gửi (kể cả trường validate không liệt kê)
                $payload = $request->input("records.$i.data");
                $existing = LedgerRecord::query()
                    ->where('user_id', $user->id)
                    ->where('tbl', $record['tbl'])
                    ->where('uuid', strtolower($payload['id']))
                    ->first();

                $updatedAt = self::normalizeTime($payload['updated_at']);
                if ($existing !== null && strcmp($existing->client_updated_at, $updatedAt) >= 0) {
                    continue; // Server đã có bản mới hơn hoặc bằng
                }

                $version++;
                LedgerRecord::query()->updateOrCreate(
                    ['user_id' => $user->id, 'tbl' => $record['tbl'], 'uuid' => strtolower($payload['id'])],
                    ['data' => $payload, 'client_updated_at' => $updatedAt, 'is_deleted' => $payload['deleted_at'] !== null, 'version' => $version],
                );
                $accepted++;
            }

            User::query()->whereKey($user->id)->update(['ledger_version' => $version]);
        });

        return response()->json(['accepted' => $accepted, 'version' => $user->fresh()->ledger_version]);
    }

    public function pull(Request $request): JsonResponse
    {
        $since = (int) ($request->validate(['since' => ['nullable', 'integer', 'min:0']])['since'] ?? 0);

        $rows = $request->user()->ledgerRecords()
            ->where('version', '>', $since)
            ->orderBy('version')
            ->limit(self::PULL_LIMIT + 1)
            ->get(['tbl', 'data', 'version']);

        $hasMore = $rows->count() > self::PULL_LIMIT;
        $rows = $rows->take(self::PULL_LIMIT);

        return response()->json([
            'records' => $rows->groupBy('tbl')->map(fn ($group) => $group->pluck('data')->values()),
            'version' => $rows->last()?->version ?? $since,
            'has_more' => $hasMore,
        ]);
    }

    /**
     * Đưa về cùng 1 dạng (6 chữ số lẻ, UTC) để so sánh chuỗi đúng thứ tự thời gian.
     */
    private static function normalizeTime(string $iso): string
    {
        return CarbonImmutable::parse($iso)->utc()->format('Y-m-d\TH:i:s.u\Z');
    }

    /**
     * Người dùng chuyển về "chỉ lưu trên máy" và chọn xóa dữ liệu trên mạng.
     */
    public function destroy(Request $request): Response
    {
        $request->user()->ledgerRecords()->delete();
        Storage::disk('local')->deleteDirectory(ReceiptPhotoController::directory($request->user()->id));

        return response()->noContent();
    }
}
