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
