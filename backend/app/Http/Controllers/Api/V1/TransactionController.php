<?php

namespace App\Http\Controllers\Api\V1;

use App\Deals\DealSummary;
use App\Documents\Document;
use App\Documents\DocxRenderer;
use App\Documents\PdfRenderer;
use App\Documents\TransactionDocuments;
use App\Enums\DealEntryKind;
use App\Enums\DealStatus;
use App\Http\Controllers\Controller;
use App\Models\BusinessMember;
use App\Models\Customer;
use App\Models\Deal;
use App\Models\DealEntry;
use App\Models\Purchase;
use App\Transactions\TransactionFeed;
use Carbon\CarbonImmutable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;
use Illuminate\Validation\Rule;
use Symfony\Component\HttpFoundation\Response;

/**
 * Sổ giao dịch (phiếu mua / bán + đợt cân của đơn mua bán) và tải giấy tờ PDF / Word để gửi khách.
 */
class TransactionController extends Controller
{
    /** Khoảng ngày tối đa của 1 lần xem / in */
    private const MAX_DAYS = 400;

    public function __construct(private TransactionDocuments $documents) {}

    public function index(Request $request): JsonResponse
    {
        [$from, $to] = self::dateRange($request);
        $filters = $request->validate([
            'kind' => ['nullable', Rule::in(['buy', 'sell'])],
            'q' => ['nullable', 'string', 'max:100'],
            'customer' => ['nullable', 'uuid'],
        ]);

        $rows = TransactionFeed::for($request->user(), $from, $to, $filters);

        return response()->json([
            'data' => $rows->map(fn (array $r): array => collect($r)->except('sort')->all())->values(),
            'meta' => ['from' => $from->toDateString(), 'to' => $to->toDateString(), 'totals' => TransactionFeed::totals($rows)],
        ]);
    }

    /**
     * Tổng hợp cho thương lái / điểm thu mua: lãi gộp (bán − mua) theo tháng trong khoảng ngày,
     * còn nợ 2 chiều tính đến nay, lời từng lô (đơn bán đã gộp các đơn mua).
     */
    public function summary(Request $request): JsonResponse
    {
        [$from, $to] = self::dateRange($request);
        $user = $request->user();
        $rows = TransactionFeed::for($user, $from, $to);
        $totals = TransactionFeed::totals($rows);

        $months = $rows->groupBy(fn (array $r): string => substr($r['date'], 0, 7))
            ->map(function (Collection $g, string $month): array {
                $t = TransactionFeed::totals($g);

                return ['month' => $month, 'buy' => $t['buy']['amount'], 'buy_kg' => $t['buy']['kg'], 'sell' => $t['sell']['amount'], 'sell_kg' => $t['sell']['kg'], 'margin' => $t['sell']['amount'] - $t['buy']['amount']];
            })
            ->sortKeys()
            ->values();

        // Còn nợ tính đến nay (không theo khoảng ngày): mọi giao dịch từ trước tới giờ
        $allTime = TransactionFeed::totals(TransactionFeed::for($user, CarbonImmutable::create(2000), CarbonImmutable::today()));

        $lots = Deal::query()
            ->where('seller_id', $user->id)
            ->where('status', '!=', DealStatus::Cancelled)
            ->whereHas('sources')
            ->with(['entries', 'sources.entries'])
            ->latest('updated_at')
            ->limit(50)
            ->get()
            ->map(fn (Deal $d): array => ['uuid' => $d->uuid, 'code' => $d->code, 'title' => $d->title, 'status' => $d->status->value, ...DealSummary::lot($d, $user)])
            ->values();

        return response()->json(['data' => [
            'from' => $from->toDateString(),
            'to' => $to->toDateString(),
            'totals' => $totals,
            'margin' => $totals['sell']['amount'] - $totals['buy']['amount'],
            'months' => $months,
            'owing' => ['i_owe' => $allTime['buy']['owing'], 'owed_to_me' => $allTime['sell']['owing']],
            'lots' => $lots,
        ]]);
    }

    /** Khách được chia sẻ vẫn tải được phiếu người lập đã xóa (có ghi rõ đã xóa) */
    public function purchaseDocument(Request $request, string $purchase): Response
    {
        $purchase = Purchase::withTrashed()->where('uuid', $purchase)->firstOrFail();
        // Người lập phiếu, chủ doanh nghiệp của phiếu, hoặc khách được chia sẻ (chỉ xem)
        abort_unless($purchase->canView($request->user()), 404);

        return $this->download($request, $this->documents->purchaseReceipt($purchase->load('customer', 'user.buyer')));
    }

    public function dealEntryDocument(Request $request, DealEntry $entry): Response
    {
        $entry->load('deal.seller', 'deal.buyer', 'deal.product');
        abort_unless(($entry->deal->isParticipant($request->user()) || $entry->deal->isBusinessOwner($request->user())) && $entry->kind === DealEntryKind::Cut, 404);

        return $this->download($request, $this->documents->dealCutReceipt($entry, $request->user()));
    }

    public function dealDocument(Request $request, Deal $deal): Response
    {
        abort_unless($deal->isParticipant($request->user()) || $deal->isBusinessOwner($request->user()), 404);

        return $this->download($request, $this->documents->dealStatement($deal->load('entries', 'seller', 'buyer', 'product'), $request->user()));
    }

    public function customerDocument(Request $request, Customer $customer): Response
    {
        abort_unless($customer->user_id === $request->user()->id, 404);
        [$from, $to] = self::dateRange($request);

        return $this->download($request, $this->documents->customerStatement($request->user(), $customer, $from, $to));
    }

    /** Báo cáo cả doanh nghiệp (chủ): theo từng lái, mặt hàng, tiền ứng / đang giữ, chi tiết */
    public function businessReportDocument(Request $request): Response
    {
        $membership = $request->user()->membership()->with('business')->first();
        abort_unless($membership?->role === BusinessMember::OWNER, 403, 'Chỉ chủ doanh nghiệp xem được báo cáo này.');
        [$from, $to] = self::dateRange($request);

        return $this->download($request, $this->documents->businessReport($membership->business, $from, $to));
    }

    public function reportDocument(Request $request): Response
    {
        [$from, $to] = self::dateRange($request);

        return $this->download($request, $this->documents->report($request->user(), $from, $to));
    }

    /**
     * ?from=&to= (mặc định: đầu tháng này → hôm nay)
     *
     * @return array{0: CarbonImmutable, 1: CarbonImmutable}
     */
    public static function dateRange(Request $request): array
    {
        $data = $request->validate([
            'from' => ['nullable', 'date_format:Y-m-d'],
            'to' => ['nullable', 'date_format:Y-m-d', 'after_or_equal:from'],
        ]);
        $to = CarbonImmutable::parse($data['to'] ?? 'today');
        $from = CarbonImmutable::parse($data['from'] ?? $to->startOfMonth()->toDateString());
        if ($from->diffInDays($to) > self::MAX_DAYS) {
            abort(422, 'Chỉ xem / in tối đa '.self::MAX_DAYS.' ngày một lần.');
        }

        return [$from, $to];
    }

    /** ?format=pdf (mặc định) | docx */
    private function download(Request $request, Document $doc): Response
    {
        $format = $request->validate(['format' => ['nullable', Rule::in(['pdf', 'docx'])]])['format'] ?? 'pdf';
        [$content, $mime] = $format === 'docx'
            ? [app(DocxRenderer::class)->render($doc), 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
            : [app(PdfRenderer::class)->render($doc), 'application/pdf'];

        return response($content, 200, [
            'Content-Type' => $mime,
            'Content-Disposition' => 'attachment; filename="'.$doc->filename.'.'.$format.'"',
            'Cache-Control' => 'no-store',
        ]);
    }
}
