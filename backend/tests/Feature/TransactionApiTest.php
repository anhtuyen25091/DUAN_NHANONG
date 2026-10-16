<?php

namespace Tests\Feature;

use App\Enums\DealEntryKind;
use App\Enums\DealEntryStatus;
use App\Enums\DealStatus;
use App\Models\Customer;
use App\Models\Deal;
use App\Models\DealEntry;
use App\Models\User;
use Database\Seeders\CatalogSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Sổ giao dịch của điểm thu mua: phiếu mua / bán, sổ khách, danh sách gộp với đơn mua bán, in PDF / Word.
 */
class TransactionApiTest extends TestCase
{
    use RefreshDatabase;

    private User $trader;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(CatalogSeeder::class);
        $this->travelTo(now()->setDate(2026, 10, 16)->setTime(9, 0));
        $this->trader = User::factory()->create(['name' => 'Lái Tư', 'phone' => '0900000002']);
        Sanctum::actingAs($this->trader);
    }

    public function test_purchase_computes_net_weight_amount_and_saves_new_customer(): void
    {
        $response = $this->postJson(route('api.v1.purchases.store'), $this->purchase(['paid' => 100_000_000]))
            ->assertCreated()
            ->assertJsonPath('data.code', 'PM-000001')
            ->assertJsonPath('data.lines.0.net_kg', 1238)
            ->assertJsonPath('data.lines.0.amount', 115_134_000)
            ->assertJsonPath('data.amount', 160_254_000)
            ->assertJsonPath('data.owing', 60_254_000)
            ->assertJsonPath('data.counterpart', 'Chú Năm Lộc');
        $this->assertEqualsWithDelta(1558, $response->json('data.kg'), 0.001);

        $customer = Customer::query()->sole();
        $this->assertSame($this->trader->id, $customer->user_id);
        $this->assertSame('0912345678', $customer->phone);

        // Trùng SĐT: dùng lại khách cũ; số phiếu tăng dần
        $this->postJson(route('api.v1.purchases.store'), $this->purchase(['customer_name' => 'Năm Lộc']))
            ->assertCreated()
            ->assertJsonPath('data.code', 'PM-000002')
            ->assertJsonPath('data.customer', $customer->uuid);
        $this->assertSame(1, Customer::query()->count());

        // Phiếu bán đánh số riêng
        $this->postJson(route('api.v1.purchases.store'), $this->purchase(['kind' => 'sell', 'customer_name' => 'Công ty Xanh', 'customer_phone' => null]))
            ->assertJsonPath('data.code', 'PB-000001');
    }

    public function test_purchase_validation(): void
    {
        $this->postJson(route('api.v1.purchases.store'), $this->purchase(['paid' => 999_000_000]))
            ->assertUnprocessable()->assertJsonValidationErrors('paid');
        $this->postJson(route('api.v1.purchases.store'), $this->purchase(['lines' => [['name' => 'Cà phê', 'kg' => 100, 'deduct_kg' => 150, 'price' => 1000]]]))
            ->assertUnprocessable()->assertJsonValidationErrors('lines.0.deduct_kg');
        $this->postJson(route('api.v1.purchases.store'), $this->purchase(['customer_name' => null]))
            ->assertUnprocessable()->assertJsonPath('errors.customer_name.0', 'Hãy nhập tên khách.');
        $this->postJson(route('api.v1.purchases.store'), $this->purchase(['date' => '2026-10-17']))
            ->assertUnprocessable()->assertJsonValidationErrors('date');
    }

    public function test_update_paid_later_and_other_users_cannot_see_purchase(): void
    {
        $id = $this->postJson(route('api.v1.purchases.store'), $this->purchase())->json('data.id');
        $this->patchJson(route('api.v1.purchases.update', $id), ['paid' => 160_254_000])
            ->assertOk()
            ->assertJsonPath('data.owing', 0);

        Sanctum::actingAs(User::factory()->create());
        $this->getJson(route('api.v1.purchases.show', $id))->assertNotFound();
        $this->getJson(route('api.v1.documents.purchase', $id))->assertNotFound();
        $this->getJson(route('api.v1.customers.index'))->assertJsonCount(0, 'data');
    }

    public function test_feed_merges_purchases_with_deal_cuts_and_skips_cancelled_or_disputed(): void
    {
        $this->postJson(route('api.v1.purchases.store'), $this->purchase(['paid' => 100_000_000]))->assertCreated();

        $deal = Deal::factory()->joined()->create(['created_by' => $this->trader->id, 'buyer_id' => $this->trader->id, 'title' => 'Sầu riêng vườn Ba']);
        $this->cut($deal, 2_000_000, DealEntryStatus::Pending, paid: 500_000, deduct: 1_000_000);
        $this->cut($deal, 9_000_000, DealEntryStatus::Disputed);
        $cancelled = Deal::factory()->create(['created_by' => $this->trader->id, 'buyer_id' => $this->trader->id, 'status' => DealStatus::Cancelled]);
        $this->cut($cancelled, 7_000_000, DealEntryStatus::Confirmed);

        $this->getJson(route('api.v1.transactions.index', ['from' => '2026-10-01']))
            ->assertOk()
            ->assertJsonCount(2, 'data')
            ->assertJsonPath('data.0.source', 'purchase')
            ->assertJsonPath('data.1.source', 'deal')
            ->assertJsonPath('data.1.kind', 'buy')
            ->assertJsonPath('data.1.pending', true)
            // Trừ cọc cũng tính là đã trả
            ->assertJsonPath('data.1.paid', 1_500_000)
            ->assertJsonPath('data.1.owing', 500_000)
            ->assertJsonPath('meta.totals.buy.amount', 162_254_000)
            ->assertJsonPath('meta.totals.buy.owing', 60_754_000);

        $this->getJson(route('api.v1.transactions.index', ['from' => '2026-10-01', 'q' => 'năm lộc']))->assertJsonCount(1, 'data');
        $this->getJson(route('api.v1.transactions.index', ['from' => '2026-10-01', 'kind' => 'sell']))->assertJsonCount(0, 'data');
    }

    public function test_customers_list_with_totals(): void
    {
        $this->postJson(route('api.v1.purchases.store'), $this->purchase(['paid' => 100_000_000]))->assertCreated();

        $this->getJson(route('api.v1.customers.index', ['q' => '0912']))
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.count', 1)
            ->assertJsonPath('data.0.bought', 160_254_000)
            ->assertJsonPath('data.0.i_owe', 60_254_000)
            ->assertJsonPath('data.0.last_date', '2026-10-16');
    }

    public function test_documents_download_as_pdf_and_word(): void
    {
        $purchase = $this->postJson(route('api.v1.purchases.store'), $this->purchase())->json('data');
        $customer = Customer::query()->sole();
        $deal = Deal::factory()->joined()->create(['created_by' => $this->trader->id, 'buyer_id' => $this->trader->id]);
        $cut = $this->cut($deal, 2_000_000, DealEntryStatus::Confirmed);

        $pdf = $this->get(route('api.v1.documents.purchase', $purchase['id']))
            ->assertOk()
            ->assertHeader('Content-Type', 'application/pdf')
            ->assertHeader('Content-Disposition', 'attachment; filename="phieu-mua-pm-000001.pdf"');
        $this->assertStringStartsWith('%PDF', $pdf->getContent());

        $docx = $this->get(route('api.v1.documents.purchase', ['purchase' => $purchase['id'], 'format' => 'docx']))
            ->assertOk()
            ->assertHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
        $this->assertStringStartsWith('PK', $docx->getContent());

        foreach ([
            route('api.v1.documents.deal-entry', $cut->uuid),
            route('api.v1.documents.deal', $deal->uuid),
            route('api.v1.documents.customer', ['customer' => $customer->uuid, 'from' => '2026-10-01']),
            route('api.v1.documents.report', ['from' => '2026-10-01', 'format' => 'docx']),
        ] as $url) {
            $this->get($url)->assertOk();
        }

        // Khoảng ngày quá dài
        $this->getJson(route('api.v1.documents.report', ['from' => '2024-01-01']))->assertStatus(422);
    }

    public function test_share_code_lets_customer_view_and_download_only(): void
    {
        $id = $this->postJson(route('api.v1.purchases.store'), $this->purchase(['paid' => 100_000_000]))->json('data.id');
        $code = $this->postJson(route('api.v1.purchases.share', $id))->assertOk()->json('data.share_code');
        $this->assertMatchesRegularExpression('/^[A-Z2-9]{6}$/', $code);
        // Bấm lại vẫn giữ mã cũ
        $this->assertSame($code, $this->postJson(route('api.v1.purchases.share', $id))->json('data.share_code'));

        $farmer = User::factory()->create(['name' => 'Chú Năm']);
        Sanctum::actingAs($farmer);
        $this->postJson(route('api.v1.received-purchases.receive'), ['code' => 'zzzzzz'])->assertUnprocessable()->assertJsonValidationErrors('code');
        $this->postJson(route('api.v1.received-purchases.receive'), ['code' => strtolower($code)])
            ->assertOk()
            // Lái mua vào = phía khách là bán ra
            ->assertJsonPath('data.kind', 'sell')
            ->assertJsonPath('data.issuer.name', 'Lái Tư')
            ->assertJsonPath('data.owing', 60_254_000);
        $this->getJson(route('api.v1.received-purchases.index'))->assertJsonCount(1, 'data');
        $this->get(route('api.v1.documents.purchase', $id))->assertOk()->assertHeader('Content-Type', 'application/pdf');
        // Chỉ xem: không sửa, không xem bản của người lập
        $this->patchJson(route('api.v1.purchases.update', $id), ['paid' => 0])->assertNotFound();
        $this->getJson(route('api.v1.purchases.show', $id))->assertNotFound();

        Sanctum::actingAs($this->trader);
        $this->getJson(route('api.v1.purchases.show', $id))
            ->assertJsonPath('data.shared_with.0.name', 'Chú Năm')
            ->assertJsonPath('data.shared_with.0.via', 'code');
        $this->deleteJson(route('api.v1.purchases.unshare', $id))->assertOk()->assertJsonPath('data.share_code', null);

        // Thu hồi mã: người mới không nhập được, khách đã nhận vẫn giữ phiếu
        Sanctum::actingAs(User::factory()->create());
        $this->postJson(route('api.v1.received-purchases.receive'), ['code' => $code])->assertUnprocessable();
        Sanctum::actingAs($farmer);
        $this->getJson(route('api.v1.received-purchases.index'))->assertJsonCount(1, 'data');
        $this->get(route('api.v1.documents.purchase', $id))->assertOk();
    }

    public function test_edits_after_sharing_are_kept_as_versions_the_customer_can_see(): void
    {
        // Sửa trước khi gửi: khách không cần thấy
        $id = $this->postJson(route('api.v1.purchases.store'), $this->purchase())->json('data.id');
        $this->patchJson(route('api.v1.purchases.update', $id), ['note' => 'Bản nháp'])->assertJsonPath('data.version', 2);
        $code = $this->postJson(route('api.v1.purchases.share', $id))->assertJsonPath('data.shared_version', 2)->json('data.share_code');

        $farmer = User::factory()->create();
        Sanctum::actingAs($farmer);
        $this->postJson(route('api.v1.received-purchases.receive'), ['code' => $code])
            ->assertJsonPath('data.version', 2)
            ->assertJsonPath('data.edited_after_share', false)
            ->assertJsonCount(1, 'data.history');

        // Người lập sửa số kg cân và ghi thêm tiền trả: mỗi lần là 1 bản mới
        Sanctum::actingAs($this->trader);
        $lines = $this->purchase()['lines'];
        $lines[0]['kg'] = 1300.5;
        $this->patchJson(route('api.v1.purchases.update', $id), ['lines' => $lines])->assertOk();
        $this->patchJson(route('api.v1.purchases.update', $id), ['paid' => 50_000_000])->assertOk();
        // Lưu lại y nguyên: không sinh bản mới
        $this->patchJson(route('api.v1.purchases.update', $id), ['paid' => 50_000_000])->assertJsonPath('data.version', 4);

        Sanctum::actingAs($farmer);
        $received = $this->getJson(route('api.v1.received-purchases.show', $id))
            ->assertJsonPath('data.version', 4)
            ->assertJsonPath('data.edited_after_share', true)
            ->assertJsonCount(3, 'data.history')
            ->assertJsonPath('data.history.0.amount', 160_254_000)
            ->json('data.history');
        $this->assertSame(['Cà phê nhân xô: cân 1.250,5 kg → 1.300,5 kg', 'Tổng tiền: 160.254.000 đ → 164.904.000 đ'], $received[1]['changes']);
        $this->assertSame(['Đã trả: 0 đ → 50.000.000 đ'], $received[2]['changes']);

        // Người lập xóa phiếu: khách vẫn thấy, có ghi đã xóa, vẫn tải được giấy tờ
        Sanctum::actingAs($this->trader);
        $this->deleteJson(route('api.v1.purchases.destroy', $id))->assertNoContent();
        Sanctum::actingAs($farmer);
        $this->getJson(route('api.v1.received-purchases.index'))->assertJsonCount(1, 'data')->assertJsonPath('data.0.deleted_at', fn ($v) => $v !== null);
        $this->get(route('api.v1.documents.purchase', $id))->assertOk();
    }

    public function test_send_to_account_when_customer_phone_matches_registered_user(): void
    {
        $farmer = User::factory()->create(['name' => 'Chú Năm Lộc', 'phone' => '0912345678']);
        // SĐT gõ có dấu cách vẫn nhận ra
        $id = $this->postJson(route('api.v1.purchases.store'), $this->purchase(['customer_phone' => '0912 345 678']))->json('data.id');

        $this->getJson(route('api.v1.purchases.show', $id))
            ->assertJsonPath('data.account_match.name', 'Chú Năm Lộc')
            ->assertJsonCount(0, 'data.shared_with');
        // Chưa bấm gửi thì khách chưa thấy
        Sanctum::actingAs($farmer);
        $this->getJson(route('api.v1.received-purchases.index'))->assertJsonCount(0, 'data');

        Sanctum::actingAs($this->trader);
        $this->postJson(route('api.v1.purchases.send', $id))
            ->assertOk()
            ->assertJsonPath('message', 'Đã gửi phiếu vào app của Chú Năm Lộc')
            ->assertJsonPath('data.account_match', null)
            ->assertJsonPath('data.shared_with.0.via', 'phone');

        Sanctum::actingAs($farmer);
        $this->getJson(route('api.v1.received-purchases.index'))->assertJsonCount(1, 'data');

        // SĐT chưa có tài khoản: báo gửi mã
        Sanctum::actingAs($this->trader);
        $other = $this->postJson(route('api.v1.purchases.store'), $this->purchase(['customer_name' => 'Cô Tư', 'customer_phone' => '0977000000']))->json('data.id');
        $this->getJson(route('api.v1.purchases.show', $other))->assertJsonPath('data.account_match', null);
        $this->postJson(route('api.v1.purchases.send', $other))->assertUnprocessable();
    }

    public function test_customer_gets_activity_when_purchase_is_sent_edited_or_deleted(): void
    {
        $farmer = User::factory()->create(['phone' => '0912345678']);
        $id = $this->postJson(route('api.v1.purchases.store'), $this->purchase())->json('data.id');
        $this->postJson(route('api.v1.purchases.send', $id))->assertOk();

        Sanctum::actingAs($farmer);
        $this->getJson(route('api.v1.received-purchases.index'))
            ->assertJsonPath('data.0.activity.text', 'Lái Tư gửi phiếu PM-000001 cho bạn (160.254.000 đ)')
            ->assertJsonPath('data.0.activity.by_me', false);

        // Hỏi lại với since: không có gì mới
        $this->travel(1)->minutes();
        $since = now()->toIso8601String();
        $this->travel(1)->minutes();
        $this->getJson(route('api.v1.received-purchases.index', ['since' => $since]))->assertJsonCount(0, 'data');

        Sanctum::actingAs($this->trader);
        $this->patchJson(route('api.v1.purchases.update', $id), ['paid' => 10_000_000])->assertOk();
        Sanctum::actingAs($farmer);
        $this->getJson(route('api.v1.received-purchases.index', ['since' => $since]))
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.activity.text', 'Lái Tư sửa phiếu PM-000001: Đã trả: 0 đ → 10.000.000 đ');

        Sanctum::actingAs($this->trader);
        $this->deleteJson(route('api.v1.purchases.destroy', $id))->assertNoContent();
        Sanctum::actingAs($farmer);
        $this->getJson(route('api.v1.received-purchases.index', ['since' => $since]))
            ->assertJsonPath('data.0.activity.text', 'Lái Tư đã xóa phiếu PM-000001');

        // Tự nhập mã: là việc của mình, không báo
        Sanctum::actingAs($this->trader);
        $other = $this->postJson(route('api.v1.purchases.store'), $this->purchase(['customer_phone' => null]))->json('data.id');
        $code = $this->postJson(route('api.v1.purchases.share', $other))->json('data.share_code');
        Sanctum::actingAs($farmer);
        $this->postJson(route('api.v1.received-purchases.receive'), ['code' => $code]);
        $this->getJson(route('api.v1.received-purchases.index'))->assertJsonPath('data.1.activity.by_me', true);
    }

    public function test_trader_summary_margin_by_month_owing_and_lots(): void
    {
        // Tháng 9: mua 93 tr (trả 90 tr); tháng 10: mua 160,254 tr, bán 200 tr (khách trả 150 tr)
        $this->postJson(route('api.v1.purchases.store'), $this->purchase(['date' => '2026-09-20', 'lines' => [['name' => 'Cà phê', 'kg' => 1000, 'price' => 93000]], 'paid' => 90_000_000]))->assertCreated();
        $this->postJson(route('api.v1.purchases.store'), $this->purchase())->assertCreated();
        $this->postJson(route('api.v1.purchases.store'), $this->purchase(['kind' => 'sell', 'customer_name' => 'Công ty Xanh', 'customer_phone' => null, 'lines' => [['name' => 'Cà phê', 'kg' => 2000, 'price' => 100000]], 'paid' => 150_000_000]))->assertCreated();

        // Lô: bán cho chi nhánh 50 tr, gộp đơn mua của nông dân 40 tr
        $sell = Deal::factory()->create(['created_by' => $this->trader->id, 'seller_id' => $this->trader->id, 'buyer_id' => User::factory()->create()->id, 'title' => 'Lô cà phê 1']);
        $buy = Deal::factory()->joined()->create(['created_by' => $this->trader->id, 'buyer_id' => $this->trader->id]);
        $this->cut($sell, 50_000_000, DealEntryStatus::Confirmed);
        $this->cut($buy, 40_000_000, DealEntryStatus::Confirmed);
        $sell->sources()->attach($buy->id);

        $data = $this->getJson(route('api.v1.transactions.summary', ['from' => '2026-09-01']))->assertOk()->json('data');
        $this->assertSame([
            ['month' => '2026-09', 'buy' => 93_000_000, 'sell' => 0, 'margin' => -93_000_000],
            ['month' => '2026-10', 'buy' => 200_254_000, 'sell' => 250_000_000, 'margin' => 49_746_000],
        ], array_map(fn (array $m): array => ['month' => $m['month'], 'buy' => $m['buy'], 'sell' => $m['sell'], 'margin' => $m['margin']], $data['months']));
        $this->assertSame(-43_254_000, $data['margin']);
        // Còn nợ tính đến nay: nợ người bán 3 tr + 160,254 tr + đợt mua 40 tr; người mua nợ mình 50 tr + đợt bán 50 tr
        $this->assertSame(['i_owe' => 203_254_000, 'owed_to_me' => 100_000_000], $data['owing']);
        $this->assertSame('Lô cà phê 1', $data['lots'][0]['title']);
        $this->assertSame(10_000_000, $data['lots'][0]['profit']);

        // Khoảng ngày chỉ tháng 10: tháng 9 không vào bảng, nhưng còn nợ vẫn tính đến nay
        $oct = $this->getJson(route('api.v1.transactions.summary', ['from' => '2026-10-01']))->json('data');
        $this->assertCount(1, $oct['months']);
        $this->assertSame(203_254_000, $oct['owing']['i_owe']);
    }

    /**
     * @param  array<string, mixed>  $override
     * @return array<string, mixed>
     */
    private function purchase(array $override = []): array
    {
        return [
            'customer_name' => 'Chú Năm Lộc',
            'customer_phone' => '0912345678',
            'date' => '2026-10-16',
            'lines' => [
                ['product_code' => 'ca-phe-robusta', 'name' => 'Cà phê nhân xô', 'kg' => 1250.5, 'deduct_kg' => 12.5, 'price' => 93000],
                ['product_code' => 'ho-tieu', 'name' => 'Hồ tiêu đen', 'kg' => 320, 'price' => 141000],
            ],
            ...$override,
        ];
    }

    private function cut(Deal $deal, int $amount, DealEntryStatus $status, int $paid = 0, int $deduct = 0): DealEntry
    {
        return DealEntry::factory()->create([
            'deal_id' => $deal->id,
            'kind' => DealEntryKind::Cut,
            'date' => '2026-10-15',
            'lines' => [['grade' => 'Loại A', 'kg' => $amount / 1000, 'price' => 1000]],
            'kg' => $amount / 1000,
            'amount' => $amount,
            'paid' => $paid,
            'deposit_deduct' => $deduct,
            'status' => $status,
        ]);
    }
}
