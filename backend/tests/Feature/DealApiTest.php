<?php

namespace Tests\Feature;

use App\Models\Deal;
use App\Models\User;
use Database\Seeders\CatalogSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Testing\TestResponse;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Đơn mua bán chung 2 bên: tạo, chia sẻ mã, tham gia, ghi mục, xác nhận / báo sai, lời từng lô của thương lái.
 */
class DealApiTest extends TestCase
{
    use RefreshDatabase;

    private User $trader;

    private User $farmer;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(CatalogSeeder::class);
        $this->trader = User::factory()->create(['name' => 'Lái Tư', 'phone' => '0911111111']);
        $this->farmer = User::factory()->create(['name' => 'Chú Ba', 'phone' => '0922222222']);
    }

    private function as(User $user): static
    {
        Sanctum::actingAs($user);

        return $this;
    }

    /** Thương lái tạo đơn mua, cọc 100tr; nông dân tham gia bằng mã */
    private function dealJoined(): string
    {
        $created = $this->as($this->trader)->postJson(route('api.v1.deals.store'), [
            'role' => 'buyer',
            'title' => 'Sầu riêng Ri6 vườn chú Ba',
            'counterpart_name' => 'Vườn chú Ba',
            'product_code' => 'ca-phe-robusta',
            'deposit' => 100_000_000,
            'deposit_date' => '2026-08-01',
        ])->assertCreated();

        $code = $created->json('data.code');
        $this->assertMatchesRegularExpression('/^[A-HJ-NP-Z2-9]{6}$/', $code);

        $this->as($this->farmer)->postJson(route('api.v1.deals.join'), ['code' => strtolower(substr($code, 0, 3).'-'.substr($code, 3))])
            ->assertOk()
            ->assertJsonPath('data.my_role', 'seller')
            ->assertJsonPath('data.counterpart', ['name' => 'Lái Tư', 'phone' => '0911111111'])
            ->assertJsonPath('data.summary.awaiting_me', 1);

        return $created->json('data.uuid');
    }

    private function entries(TestResponse $response): array
    {
        return collect($response->json('data.entries'))->keyBy('kind')->all();
    }

    public function test_create_share_code_join_and_confirm_deposit(): void
    {
        $uuid = $this->dealJoined();

        $deposit = $this->entries($this->as($this->farmer)->getJson(route('api.v1.deals.show', $uuid)))['deposit'];
        $this->assertSame(['pending', false, 100_000_000], [$deposit['status'], $deposit['mine'], $deposit['amount']]);

        $this->postJson(route('api.v1.deal-entries.confirm', $deposit['uuid']))
            ->assertOk()
            ->assertJsonPath('data.summary.confirmed.deposit', 100_000_000)
            ->assertJsonPath('data.summary.awaiting_me', 0);

        // Bên ghi không tự xác nhận được
        $this->as($this->trader)->postJson(route('api.v1.deal-entries.confirm', $deposit['uuid']))->assertForbidden();
    }

    public function test_cut_with_grades_dispute_fix_and_balance(): void
    {
        $uuid = $this->dealJoined();

        // Lái ghi đợt cân: 1200 kg A × 85k + 300 kg B × 60k = 120tr, trừ cọc 30tr, trả ngay 50tr
        $response = $this->as($this->trader)->postJson(route('api.v1.deals.entries.store', $uuid), [
            'kind' => 'cut',
            'date' => '2026-08-20',
            'lines' => [['grade' => 'Loại A', 'kg' => 1200, 'price' => 85000], ['grade' => 'Loại B', 'kg' => 300, 'price' => 60000]],
            'deposit_deduct' => 30_000_000,
            'paid' => 50_000_000,
        ])->assertCreated();
        $cut = $this->entries($response)['cut'];
        $this->assertSame([120_000_000, 1500], [$cut['amount'], (int) $cut['kg']]);
        $this->assertSame(2, $response->json('data.summary.awaiting_other'), 'Cọc + đợt cân chờ nông dân xác nhận');

        // Nông dân báo sai số kg
        $this->as($this->farmer)->postJson(route('api.v1.deal-entries.dispute', $cut['uuid']), [])->assertUnprocessable();
        $this->postJson(route('api.v1.deal-entries.dispute', $cut['uuid']), ['reason' => 'Loại A là 1250 kg'])
            ->assertJsonPath('data.summary.disputed', 1);

        // Lái sửa lại → quay về chờ xác nhận; nông dân không sửa được mục của lái
        $this->patchJson(route('api.v1.deal-entries.update', $cut['uuid']), ['date' => '2026-08-20', 'lines' => [['grade' => 'Loại A', 'kg' => 1, 'price' => 1]]])->assertForbidden();
        $fixed = $this->as($this->trader)->patchJson(route('api.v1.deal-entries.update', $cut['uuid']), [
            'date' => '2026-08-20',
            'lines' => [['grade' => 'Loại A', 'kg' => 1250, 'price' => 85000], ['grade' => 'Loại B', 'kg' => 300, 'price' => 60000]],
            'deposit_deduct' => 30_000_000,
            'paid' => 50_000_000,
        ])->assertOk();
        $this->assertSame(['pending', null, 124_250_000], [$this->entries($fixed)['cut']['status'], $this->entries($fixed)['cut']['dispute_reason'], $this->entries($fixed)['cut']['amount']]);

        // Nông dân xác nhận cọc + đợt cân; lái trả thêm 20tr, nông dân xác nhận
        $show = $this->as($this->farmer)->getJson(route('api.v1.deals.show', $uuid));
        foreach ($show->json('data.entries') as $entry) {
            $this->postJson(route('api.v1.deal-entries.confirm', $entry['uuid']))->assertOk();
        }
        $payment = $this->entries($this->as($this->trader)->postJson(route('api.v1.deals.entries.store', $uuid), ['kind' => 'payment', 'date' => '2026-08-25', 'amount' => 20_000_000]))['payment'];
        $summary = $this->as($this->farmer)->postJson(route('api.v1.deal-entries.confirm', $payment['uuid']))->json('data.summary.confirmed');

        $this->assertSame([
            'delivered' => 124_250_000,
            'kg' => 1550,
            'deposit' => 100_000_000,
            'deducted' => 30_000_000,
            'deposit_left' => 70_000_000,
            'paid' => 70_000_000,
            'balance' => 24_250_000,
        ], array_map(fn ($v) => is_float($v) ? (int) $v : $v, $summary));

        // Mục đã xác nhận không xóa được
        $this->as($this->trader)->deleteJson(route('api.v1.deal-entries.destroy', $payment['uuid']))->assertUnprocessable();
    }

    public function test_private_cost_hidden_from_other_side_and_strangers_get_404(): void
    {
        $uuid = $this->dealJoined();
        $cost = $this->entries($this->as($this->trader)->postJson(route('api.v1.deals.entries.store', $uuid), ['kind' => 'cost', 'date' => '2026-08-20', 'amount' => 3_000_000, 'note' => 'Tiền xe']))['cost'];
        $this->assertSame('private', $cost['status']);

        $this->assertArrayNotHasKey('cost', $this->entries($this->as($this->farmer)->getJson(route('api.v1.deals.show', $uuid))));
        $this->postJson(route('api.v1.deal-entries.confirm', $cost['uuid']))->assertNotFound();

        $stranger = User::factory()->create();
        $this->as($stranger)->getJson(route('api.v1.deals.show', $uuid))->assertNotFound();
        $code = Deal::query()->where('uuid', $uuid)->value('code');
        $this->postJson(route('api.v1.deals.join'), ['code' => $code])->assertUnprocessable()->assertJsonValidationErrors(['code' => 'đủ 2 bên']);
        $this->postJson(route('api.v1.deals.join'), ['code' => 'ZZZZZZ'])->assertJsonValidationErrors(['code' => 'Không tìm thấy']);
    }

    public function test_trader_lot_profit_from_buy_deals_linked_to_sell_deal(): void
    {
        $buyUuid = $this->dealJoined();
        $branch = User::factory()->create(['name' => 'Chi nhánh Tân Phú']);

        // Mua của chú Ba: 1000 kg × 80k = 80tr (đã xác nhận)
        $cut = $this->entries($this->as($this->trader)->postJson(route('api.v1.deals.entries.store', $buyUuid), ['kind' => 'cut', 'date' => '2026-08-20', 'lines' => [['grade' => 'Loại A', 'kg' => 1000, 'price' => 80000]]]))['cut'];
        $this->as($this->farmer)->postJson(route('api.v1.deal-entries.confirm', $cut['uuid']))->assertOk();

        // Lái bán lại cho chi nhánh: 980 kg × 90k = 88,2tr; chi phí xe 2tr
        $sell = $this->as($this->trader)->postJson(route('api.v1.deals.store'), ['role' => 'seller', 'title' => 'Bán chi nhánh Tân Phú', 'counterpart_name' => 'Chi nhánh Tân Phú'])->json('data');
        $this->as($branch)->postJson(route('api.v1.deals.join'), ['code' => $sell['code']])->assertJsonPath('data.my_role', 'buyer');
        $sellCut = $this->entries($this->as($this->trader)->postJson(route('api.v1.deals.entries.store', $sell['uuid']), ['kind' => 'cut', 'date' => '2026-08-21', 'lines' => [['grade' => 'Loại A', 'kg' => 980, 'price' => 90000]]]))['cut'];
        $this->postJson(route('api.v1.deals.entries.store', $sell['uuid']), ['kind' => 'cost', 'date' => '2026-08-21', 'amount' => 2_000_000, 'note' => 'Xe tải']);
        $this->as($branch)->postJson(route('api.v1.deal-entries.confirm', $sellCut['uuid']))->assertJsonPath('data.lot', null);

        // Chỉ gộp được đơn mà mình là bên mua
        $this->as($this->trader)->putJson(route('api.v1.deals.sources', $sell['uuid']), ['buy_deals' => [$sell['uuid']]])->assertUnprocessable();
        $lot = $this->putJson(route('api.v1.deals.sources', $sell['uuid']), ['buy_deals' => [$buyUuid]])->assertOk()->json('data.lot');

        $this->assertSame([
            'revenue' => 88_200_000,
            'sell_kg' => 980,
            'buy_cost' => 80_000_000,
            'buy_kg' => 1000,
            'costs' => 2_000_000,
            'profit' => 6_200_000,
            'kg_loss' => 20,
            'sources' => 1,
        ], array_map(fn ($v) => is_float($v) ? (int) $v : $v, $lot));

        $this->getJson(route('api.v1.deals.index'))->assertOk()->assertJsonCount(2, 'data')->assertJsonMissingPath('data.0.entries');
    }

    public function test_finished_deal_is_read_only_until_reopened_and_unjoined_deal_can_be_deleted(): void
    {
        $uuid = $this->dealJoined();
        $this->as($this->farmer)->patchJson(route('api.v1.deals.update', $uuid), ['status' => 'done'])->assertJsonPath('data.status', 'done');
        $this->postJson(route('api.v1.deals.entries.store', $uuid), ['kind' => 'payment', 'date' => '2026-09-01', 'amount' => 1000])->assertUnprocessable();
        $this->patchJson(route('api.v1.deals.update', $uuid), ['status' => 'open'])->assertJsonPath('data.closed_at', null);

        $this->as($this->trader)->deleteJson(route('api.v1.deals.destroy', $uuid))->assertUnprocessable();
        $draft = $this->postJson(route('api.v1.deals.store'), ['role' => 'buyer', 'title' => 'Nháp'])->json('data.uuid');
        $this->deleteJson(route('api.v1.deals.destroy', $draft))->assertNoContent();
    }
}
