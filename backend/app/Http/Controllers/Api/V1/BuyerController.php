<?php

namespace App\Http\Controllers\Api\V1;

use App\Enums\BuyerKind;
use App\Enums\BuyerStatus;
use App\Enums\CategoryType;
use App\Enums\ReportStatus;
use App\Enums\ShopType;
use App\Http\Controllers\Controller;
use App\Models\Buyer;
use App\Models\PriceReport;
use App\Models\Product;
use App\Support\Provinces;
use Carbon\CarbonImmutable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Validation\Rule;

/**
 * Điểm mua (doanh nghiệp / đại lý / thương lái / điểm bán lẻ):
 * đăng ký hồ sơ → admin duyệt → đăng giá từng mặt hàng theo ngày.
 */
class BuyerController extends Controller
{
    /** Được đăng giá cho mấy ngày trước (quên đăng hôm qua vẫn bổ sung được) */
    public const BACKDATE_DAYS = 7;

    public function show(Request $request): JsonResponse
    {
        $buyer = $this->myBuyer($request);

        return response()->json(['data' => $buyer ? self::buyerData($buyer) : null]);
    }

    /**
     * Tạo / sửa hồ sơ. Hồ sơ mới (hoặc đã bị từ chối, gửi lại) thì chờ duyệt;
     * hồ sơ đã duyệt sửa thông tin thì vẫn giữ duyệt, điểm bán đi kèm cập nhật theo.
     */
    public function save(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:120'],
            'kind' => ['required', Rule::enum(BuyerKind::class)],
            'deals_in' => ['required', 'array', 'min:1'],
            'deals_in.*' => [Rule::enum(ShopType::class)],
            'phone' => ['required', 'string', 'max:20', 'regex:/^[0-9+().\s\-]{8,}$/'],
            'address' => ['nullable', 'string', 'max:255'],
            'province_code' => ['required', Rule::in(array_keys(Provinces::options()))],
            'lat' => ['required', 'numeric', 'between:8,24'],
            'lng' => ['required', 'numeric', 'between:102,110'],
            'goods' => ['nullable', 'string', 'max:255'],
        ], [
            'deals_in.required' => 'Hãy chọn bạn mua / bán gì.',
            'lat.required' => 'Hãy chọn vị trí điểm mua (bấm "Dùng vị trí của tôi").',
        ]);

        $buyer = $this->myBuyer($request);
        if ($buyer === null) {
            $buyer = Buyer::query()->create([...$data, 'user_id' => $request->user()->id, 'status' => BuyerStatus::Pending]);

            return response()->json(['data' => self::buyerData($buyer), 'message' => 'Đã gửi hồ sơ. Khi được duyệt bạn sẽ đăng giá được.'], 201);
        }

        $buyer->update([...$data, 'status' => $buyer->status === BuyerStatus::Rejected ? BuyerStatus::Pending : $buyer->status]);
        if ($buyer->shop_id) {
            $buyer->syncShop();
        }

        return response()->json(['data' => self::buyerData($buyer->fresh())]);
    }

    /** Giá mình đã đăng (30 ngày gần nhất) */
    public function reports(Request $request): JsonResponse
    {
        $buyer = $this->myBuyer($request);
        if ($buyer === null) {
            return response()->json(['data' => []]);
        }

        $reports = $buyer->reports()->with('product')
            ->where('date', '>=', now()->subDays(30)->toDateString())
            ->orderByDesc('date')->orderBy('product_id')
            ->get();

        return response()->json(['data' => $reports->map(fn (PriceReport $r): array => self::reportData($r))->values()]);
    }

    /**
     * Đăng (hoặc sửa) giá 1 mặt hàng trong 1 ngày. Lệch quá 30% so với giá tham chiếu quanh đó thì chờ duyệt.
     */
    public function storeReport(Request $request): JsonResponse
    {
        $buyer = $this->myBuyer($request);
        if ($buyer === null || ! $buyer->canPost()) {
            return response()->json(['message' => $buyer === null ? 'Bạn chưa đăng ký điểm mua.' : 'Hồ sơ điểm mua chưa được duyệt nên chưa đăng giá được.'], 403);
        }

        $data = $request->validate([
            'product' => ['required', 'string', Rule::exists('products', 'code')->where('is_active', true)],
            'price' => ['required', 'integer', 'min:1', 'max:1000000000'],
            'date' => ['nullable', 'date_format:Y-m-d', 'before_or_equal:today', 'after_or_equal:'.now()->subDays(self::BACKDATE_DAYS)->toDateString()],
            'note' => ['nullable', 'string', 'max:200'],
        ], [
            'date.after_or_equal' => 'Chỉ đăng bổ sung được giá trong '.self::BACKDATE_DAYS.' ngày gần đây.',
        ]);

        $product = Product::query()->with('category')->where('code', $data['product'])->firstOrFail();
        $needs = self::shopTypeFor($product->category->type);
        if (! $buyer->deals_in->contains($needs)) {
            return response()->json(['message' => "Hồ sơ của bạn chưa chọn \"{$needs->getLabel()}\" nên chưa đăng giá {$product->name} được. Hãy sửa hồ sơ."], 422);
        }

        $date = CarbonImmutable::parse($data['date'] ?? now()->toDateString());
        $reference = PriceReport::reference($product->id, $buyer->province_code, $buyer->lat, $buyer->lng, $date, $buyer->id);
        $deviation = $reference ? abs($data['price'] - $reference['price']) / $reference['price'] : 0;
        $review = $deviation > PriceReport::MAX_DEVIATION;

        $report = PriceReport::query()->updateOrCreate(
            ['buyer_id' => $buyer->id, 'product_id' => $product->id, 'date' => $date->toDateString()],
            [
                'price' => $data['price'],
                'unit' => $product->unit,
                'province_code' => $buyer->province_code,
                'lat' => $buyer->lat,
                'lng' => $buyer->lng,
                'note' => $data['note'] ?? null,
                'status' => $review ? ReportStatus::NeedsReview : ReportStatus::Published,
                'reference_price' => $reference['price'] ?? null,
                'review_reason' => $review ? sprintf('Lệch %d%% so với %s (%s đ)', round($deviation * 100), mb_strtolower($reference['source']), number_format($reference['price'], 0, ',', '.')) : null,
                'flags_count' => 0,
            ],
        );
        $report->flags()->delete();

        return response()->json([
            'data' => self::reportData($report->load('product')),
            'message' => $review
                ? 'Đã nhận giá. Giá này khác nhiều so với giá quanh khu vực nên sẽ hiện sau khi được kiểm tra.'
                : 'Đã đăng giá.',
        ], 201);
    }

    public function destroyReport(Request $request, PriceReport $report): Response
    {
        abort_unless($report->buyer_id === $this->myBuyer($request)?->id, 404);
        $report->delete();

        return response()->noContent();
    }

    /** Hồ sơ điểm mua của tài khoản đang đăng nhập (truy vấn mới, không dùng quan hệ đã nạp sẵn) */
    private function myBuyer(Request $request): ?Buyer
    {
        return Buyer::query()->where('user_id', $request->user()->id)->first();
    }

    /** Loại điểm bán tương ứng với nhóm mặt hàng: nông sản → thu mua; phân / thuốc → bán phân / thuốc */
    public static function shopTypeFor(CategoryType $type): ShopType
    {
        return match ($type) {
            CategoryType::NongSan => ShopType::ThuMua,
            CategoryType::PhanBon => ShopType::PhanBon,
            CategoryType::ThuocBvtv => ShopType::ThuocBvtv,
        };
    }

    /**
     * @return array<string, mixed>
     */
    public static function buyerData(Buyer $buyer): array
    {
        return [
            'id' => $buyer->id,
            'name' => $buyer->name,
            'kind' => $buyer->kind->value,
            'kind_label' => $buyer->kind->getLabel(),
            'deals_in' => $buyer->deals_in->map(fn (ShopType $t): string => $t->value)->values(),
            'phone' => $buyer->phone,
            'address' => $buyer->address,
            'province' => $buyer->province_code,
            'province_name' => $buyer->provinceName(),
            'lat' => $buyer->lat,
            'lng' => $buyer->lng,
            'goods' => $buyer->goods,
            'status' => $buyer->status->value,
            'status_label' => $buyer->status->getLabel(),
            'is_verified' => $buyer->is_verified,
            'admin_note' => $buyer->admin_note,
        ];
    }

    /**
     * @return array<string, mixed>
     */
    public static function reportData(PriceReport $report): array
    {
        return [
            'id' => $report->id,
            'product' => ['code' => $report->product->code, 'name' => $report->product->name, 'unit' => $report->product->unit],
            'date' => $report->date->toDateString(),
            'price' => $report->price,
            'unit' => $report->unit,
            'note' => $report->note,
            'status' => $report->status->value,
            'status_label' => $report->status->getLabel(),
            'review_reason' => $report->review_reason,
        ];
    }
}
