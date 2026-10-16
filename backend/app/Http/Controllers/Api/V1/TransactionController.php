<?php

namespace App\Http\Controllers\Api\V1;

use App\Documents\Document;
use App\Documents\DocxRenderer;
use App\Documents\PdfRenderer;
use App\Documents\TransactionDocuments;
use App\Enums\DealEntryKind;
use App\Http\Controllers\Controller;
use App\Models\Customer;
use App\Models\Deal;
use App\Models\DealEntry;
use App\Models\Purchase;
use App\Transactions\TransactionFeed;
use Carbon\CarbonImmutable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
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
        [$from, $to] = $this->range($request);
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

    public function purchaseDocument(Request $request, Purchase $purchase): Response
    {
        abort_unless($purchase->user_id === $request->user()->id, 404);

        return $this->download($request, $this->documents->purchaseReceipt($purchase->load('customer', 'user.buyer')));
    }

    public function dealEntryDocument(Request $request, DealEntry $entry): Response
    {
        $entry->load('deal.seller', 'deal.buyer', 'deal.product');
        abort_unless($entry->deal->isParticipant($request->user()) && $entry->kind === DealEntryKind::Cut, 404);

        return $this->download($request, $this->documents->dealCutReceipt($entry, $request->user()));
    }

    public function dealDocument(Request $request, Deal $deal): Response
    {
        abort_unless($deal->isParticipant($request->user()), 404);

        return $this->download($request, $this->documents->dealStatement($deal->load('entries', 'seller', 'buyer', 'product'), $request->user()));
    }

    public function customerDocument(Request $request, Customer $customer): Response
    {
        abort_unless($customer->user_id === $request->user()->id, 404);
        [$from, $to] = $this->range($request);

        return $this->download($request, $this->documents->customerStatement($request->user(), $customer, $from, $to));
    }

    public function reportDocument(Request $request): Response
    {
        [$from, $to] = $this->range($request);

        return $this->download($request, $this->documents->report($request->user(), $from, $to));
    }

    /**
     * ?from=&to= (mặc định: đầu tháng này → hôm nay)
     *
     * @return array{0: CarbonImmutable, 1: CarbonImmutable}
     */
    private function range(Request $request): array
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
