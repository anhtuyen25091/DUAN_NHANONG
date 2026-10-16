<?php

namespace Tests\Feature;

use App\Documents\TransactionDocuments;
use App\Enums\DealEntryKind;
use App\Enums\DealEntryStatus;
use App\Models\Customer;
use App\Models\Deal;
use App\Models\DealEntry;
use App\Models\Purchase;
use App\Models\User;
use Database\Seeders\CatalogSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Doanh nghiệp thu mua: chủ tạo tài khoản con cho lái, lái lập phiếu / đơn thay chủ, chủ ứng tiền và thống kê.
 */
class BusinessApiTest extends TestCase
{
    use RefreshDatabase;

    private User $owner;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(CatalogSeeder::class);
        $this->travelTo(now()->setDate(2026, 10, 16)->setTime(9, 0));
        $this->owner = User::factory()->create(['name' => 'Anh Hai', 'phone' => '0900000010']);
        Sanctum::actingAs($this->owner);
        $this->postJson(route('api.v1.business.store'), ['name' => 'Công ty Nông sản Hai Lúa', 'phone' => '0262 3 888 999', 'address' => 'Buôn Ma Thuột'])
            ->assertCreated()
            ->assertJsonPath('data.my_role', 'owner');
    }

    public function test_owner_creates_buyer_accounts_and_invites_existing_users(): void
    {
        $this->postJson(route('api.v1.business.members.store'), ['name' => 'Lái Tèo', 'phone' => '0911 000 001', 'password' => 'teo123', 'group_name' => 'Nhóm Krông Pắc'])
            ->assertCreated()
            ->assertJsonPath('data.phone', '0911000001')
            ->assertJsonPath('data.group_name', 'Nhóm Krông Pắc')
            ->assertJsonPath('data.created_by_owner', true);

        // Lái đăng nhập bằng tài khoản chủ tạo
        $this->postJson(route('api.v1.auth.login'), ['phone' => '0911000001', 'password' => 'teo123'])->assertOk();

        // Số đã có tài khoản: phải dùng mã mời
        $existing = User::factory()->create(['name' => 'Lái Tí', 'phone' => '0911000002']);
        $this->postJson(route('api.v1.business.members.store'), ['name' => 'Lái Tí', 'phone' => '0911000002', 'password' => 'abcdef'])
            ->assertUnprocessable()
            ->assertJsonPath('errors.phone.0', 'Số này đã có tài khoản Nhà Nông. Hãy gửi mã mời để người đó tự tham gia.');

        $code = $this->postJson(route('api.v1.business.invite'))->json('data.invite_code');
        Sanctum::actingAs($existing);
        $this->postJson(route('api.v1.business.join'), ['code' => $code])
            ->assertOk()
            ->assertJsonPath('data.name', 'Công ty Nông sản Hai Lúa')
            ->assertJsonPath('data.my_role', 'buyer')
            // Lái không thấy mã mời và danh sách lái
            ->assertJsonPath('data.invite_code', null)
            ->assertJsonPath('data.members', null);
        $this->postJson(route('api.v1.business.join'), ['code' => $code])->assertUnprocessable();
        $this->getJson(route('api.v1.business.summary'))->assertForbidden();

        // Lái tự đăng ký: chủ không đặt lại mật khẩu được
        Sanctum::actingAs($this->owner);
        $this->patchJson(route('api.v1.business.members.update', $existing->id), ['password' => 'newpass'])->assertUnprocessable();
        $this->getJson(route('api.v1.business.show'))->assertJsonCount(3, 'data.members');
    }

    public function test_buyer_purchases_belong_to_business_owner_sees_all_buyers_see_own(): void
    {
        $teo = $this->member('Lái Tèo', '0911000001');
        $ti = $this->member('Lái Tí', '0911000002');

        Sanctum::actingAs($teo);
        $p = $this->postJson(route('api.v1.purchases.store'), $this->purchase(['paid' => 50_000_000]))->assertCreated()->json('data');
        $this->assertSame('Công ty Nông sản Hai Lúa', $p['business']);

        // Lái khác mua của cùng nông dân (cùng SĐT): chung 1 khách của doanh nghiệp, nhưng không thấy phiếu của Tèo
        Sanctum::actingAs($ti);
        $this->postJson(route('api.v1.purchases.store'), $this->purchase(['lines' => [['name' => 'Hồ tiêu', 'kg' => 100, 'price' => 140000]]]))->assertCreated();
        $this->assertSame(1, Customer::query()->count());
        $this->getJson(route('api.v1.purchases.show', $p['id']))->assertNotFound();
        $this->getJson(route('api.v1.transactions.index'))->assertJsonCount(1, 'data');
        $this->getJson(route('api.v1.customers.index'))->assertJsonPath('data.0.bought', 14_000_000);

        // Chủ: xem phiếu (không sửa được), sổ cả doanh nghiệp, lọc theo lái
        Sanctum::actingAs($this->owner);
        $this->getJson(route('api.v1.purchases.show', $p['id']))->assertOk()->assertJsonPath('data.can_edit', false)->assertJsonPath('data.created_by.name', 'Lái Tèo');
        $this->patchJson(route('api.v1.purchases.update', $p['id']), ['paid' => 0])->assertNotFound();
        $this->getJson(route('api.v1.business.transactions'))->assertJsonCount(2, 'data')->assertJsonPath('meta.totals.buy.amount', 107_000_000);
        $this->getJson(route('api.v1.business.transactions', ['member' => $teo->id]))->assertJsonCount(1, 'data')->assertJsonPath('data.0.member.name', 'Lái Tèo');
        $this->getJson(route('api.v1.customers.index'))->assertJsonPath('data.0.bought', 107_000_000);

        // Phiếu in tên doanh nghiệp + người lập
        $doc = app(TransactionDocuments::class)->purchaseReceipt(Purchase::query()->where('uuid', $p['id'])->firstOrFail());
        $this->assertSame('Công ty Nông sản Hai Lúa', $doc->issuer['name']);
        $this->assertContains('Người lập: Lái Tèo · 0911000001', $doc->issuer['lines']);
        $this->get(route('api.v1.documents.purchase', $p['id']))->assertOk();
    }

    public function test_advances_and_cash_each_buyer_is_holding(): void
    {
        $teo = $this->member('Lái Tèo', '0911000001');
        $this->postJson(route('api.v1.business.advances.store'), ['member' => $teo->id, 'kind' => 'advance', 'amount' => 200_000_000, 'date' => '2026-10-16'])->assertCreated();

        Sanctum::actingAs($teo);
        // Mua 93 tr, trả nông dân 90 tr
        $this->postJson(route('api.v1.purchases.store'), $this->purchase(['paid' => 90_000_000]))->assertCreated();
        // Bán cho công ty, thu 5 tr
        $this->postJson(route('api.v1.purchases.store'), $this->purchase(['kind' => 'sell', 'customer_name' => 'Vựa lớn', 'customer_phone' => null, 'lines' => [['name' => 'Tiêu', 'kg' => 50, 'price' => 100000]], 'paid' => 5_000_000]))->assertCreated();
        // Đơn chung: cọc 20 tr, đợt cân trả ngay 10 tr; đợt bị báo sai không tính
        $deal = $this->postJson(route('api.v1.deals.store'), ['role' => 'buyer', 'title' => 'Sầu riêng vườn Bảy', 'counterpart_name' => 'Vườn Bảy', 'deposit' => 20_000_000])->assertCreated()->json('data');
        foreach ([[DealEntryStatus::Pending, 10_000_000], [DealEntryStatus::Disputed, 99_000_000]] as [$status, $paid]) {
            DealEntry::factory()->create(['deal_id' => Deal::query()->where('uuid', $deal['uuid'])->value('id'), 'kind' => DealEntryKind::Cut, 'date' => '2026-10-16',
                'lines' => [['grade' => 'A', 'kg' => 1000, 'price' => 40000]], 'kg' => 1000, 'amount' => 40_000_000, 'paid' => $paid, 'status' => $status, 'created_by' => $teo->id]);
        }
        // Lái thấy tiền mình đang giữ: 200 − 90 − 20 − 10 + 5 = 85 tr
        $this->getJson(route('api.v1.business.show'))->assertJsonPath('data.my_cash.holding', 85_000_000);

        Sanctum::actingAs($this->owner);
        $this->postJson(route('api.v1.business.advances.store'), ['member' => $teo->id, 'kind' => 'return', 'amount' => 80_000_000, 'date' => '2026-10-16'])
            ->assertJsonPath('cash.holding', 5_000_000);

        $summary = $this->getJson(route('api.v1.business.summary', ['from' => '2026-10-01']))->assertOk()->json('data');
        $teoRow = collect($summary['members'])->firstWhere('name', 'Lái Tèo');
        $this->assertSame(['advanced' => 200_000_000, 'returned' => 80_000_000, 'paid_out' => 120_000_000, 'received' => 5_000_000, 'holding' => 5_000_000], $teoRow['cash']);
        // Mua: phiếu 93 tr + đợt cân 40 tr (đợt bị báo sai bỏ)
        $this->assertSame(133_000_000, $teoRow['totals']['buy']['amount']);
        $this->assertSame(5_000_000, $summary['totals']['holding']);
        $this->assertSame('Cà phê nhân xô', $summary['products'][0]['name']);

        // Chủ xem / tải quyết toán đơn của lái
        $this->getJson(route('api.v1.business.deals'))->assertJsonPath('data.0.member.name', 'Lái Tèo')->assertJsonPath('data.0.kind', 'buy');
        $this->get(route('api.v1.documents.deal', $deal['uuid']))->assertOk();
        $this->get(route('api.v1.documents.business-report', ['from' => '2026-10-01', 'format' => 'docx']))->assertOk();
    }

    public function test_locked_buyer_cannot_record_and_removed_buyer_data_stays(): void
    {
        $teo = $this->member('Lái Tèo', '0911000001');
        Sanctum::actingAs($teo);
        $id = $this->postJson(route('api.v1.purchases.store'), $this->purchase())->json('data.id');

        Sanctum::actingAs($this->owner);
        $this->patchJson(route('api.v1.business.members.update', $teo->id), ['status' => 'locked'])->assertJsonPath('data.status', 'locked');
        $this->patchJson(route('api.v1.business.members.update', $this->owner->id), ['status' => 'locked'])->assertUnprocessable();

        Sanctum::actingAs($teo->fresh());
        $this->postJson(route('api.v1.purchases.store'), $this->purchase())->assertForbidden();
        $this->postJson(route('api.v1.deals.store'), ['role' => 'buyer', 'title' => 'X'])->assertForbidden();

        // Gỡ lái: phiếu cũ vẫn trong sổ doanh nghiệp
        Sanctum::actingAs($this->owner);
        $this->deleteJson(route('api.v1.business.members.destroy', $teo->id))->assertNoContent();
        $this->getJson(route('api.v1.business.transactions'))->assertJsonCount(1, 'data');
        $this->getJson(route('api.v1.purchases.show', $id))->assertOk();
    }

    private function member(string $name, string $phone): User
    {
        $this->postJson(route('api.v1.business.members.store'), ['name' => $name, 'phone' => $phone, 'password' => 'secret1'])->assertCreated();

        return User::query()->where('phone', $phone)->firstOrFail();
    }

    /**
     * @param  array<string, mixed>  $override
     * @return array<string, mixed>
     */
    private function purchase(array $override = []): array
    {
        return [
            'customer_name' => 'Chú Năm',
            'customer_phone' => '0912345678',
            'date' => '2026-10-16',
            'lines' => [['product_code' => 'ca-phe-robusta', 'name' => 'Cà phê nhân xô', 'kg' => 1000, 'price' => 93000]],
            ...$override,
        ];
    }
}
