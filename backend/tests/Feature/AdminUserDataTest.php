<?php

namespace Tests\Feature;

use App\Enums\DealEntryKind;
use App\Enums\DealEntryStatus;
use App\Filament\Resources\Deals\Pages\ViewDeal;
use App\Filament\Resources\Purchases\Pages\ViewPurchase;
use App\Models\AdminViewLog;
use App\Models\Business;
use App\Models\Deal;
use App\Models\DealEntry;
use App\Models\LedgerRecord;
use App\Models\Purchase;
use App\Models\User;
use App\Support\LedgerReader;
use Database\Seeders\CatalogSeeder;
use Filament\Actions\Testing\TestAction;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Livewire\Livewire;
use Tests\TestCase;

/**
 * Admin xem dữ liệu riêng của người dùng (sổ thu chi đồng bộ, đơn, phiếu, doanh nghiệp): chỉ xem, có nhật ký.
 */
class AdminUserDataTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;

    private User $farmer;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(CatalogSeeder::class);
        $this->admin = User::factory()->create(['name' => 'Admin']);
        $this->admin->forceFill(['is_admin' => true])->save();
        $this->farmer = User::factory()->create(['name' => 'Chú Ba', 'phone' => '0900000001']);

        $garden = '11111111-1111-4111-8111-111111111111';
        $category = '22222222-2222-4222-8222-222222222222';
        $this->record('gardens', $garden, ['name' => 'Vườn sầu riêng']);
        $this->record('categories', $category, ['name' => 'Phân bón', 'type' => 'expense']);
        $this->record('transactions', '33333333-3333-4333-8333-333333333331', ['type' => 'income', 'amount' => 50_000_000, 'date' => '2026-10-10', 'garden_id' => $garden, 'category_id' => $category]);
        $this->record('transactions', '33333333-3333-4333-8333-333333333332', ['type' => 'expense', 'amount' => 2_000_000, 'date' => '2026-10-12', 'garden_id' => null, 'category_id' => $category, 'note' => '4 bao NPK']);
        // Đã xóa trên máy / trên server: không tính
        $this->record('transactions', '33333333-3333-4333-8333-333333333333', ['type' => 'income', 'amount' => 999, 'date' => '2026-10-12', 'category_id' => $category, 'deleted_at' => '2026-10-13T00:00:00Z']);
        $this->record('transactions', '33333333-3333-4333-8333-333333333334', ['type' => 'income', 'amount' => 888, 'date' => '2026-10-12', 'category_id' => $category], deleted: true);
        $this->record('debts', '44444444-4444-4444-8444-444444444444', ['kind' => 'payable', 'party' => 'Cô Ba', 'amount' => 2_000_000, 'date' => '2026-10-12']);
        $this->record('debt_payments', '55555555-5555-4555-8555-555555555555', ['debt_id' => '44444444-4444-4444-8444-444444444444', 'amount' => 500_000]);
    }

    public function test_ledger_reader_joins_names_skips_deleted_and_sums(): void
    {
        $reader = new LedgerReader($this->farmer);

        $this->assertSame(['income' => 50_000_000, 'expense' => 2_000_000, 'profit' => 48_000_000], array_slice($reader->totals(), 0, 3));
        $this->assertCount(2, $reader->transactions());
        $this->assertSame(['Chi chung', 'Phân bón'], [$reader->transactions()[0]['garden'], $reader->transactions()[0]['category']]);
        $this->assertSame('Vườn sầu riêng', $reader->transactions()[1]['garden']);
        $this->assertSame(1_500_000, $reader->debts()[0]['left']);
    }

    public function test_admin_opens_user_data_pages_and_each_view_is_logged_once(): void
    {
        $deal = Deal::factory()->joined()->create(['title' => 'Sầu riêng vườn Ba']);
        DealEntry::factory()->create(['deal_id' => $deal->id, 'kind' => DealEntryKind::Cut, 'date' => '2026-10-15', 'lines' => [['grade' => 'A', 'kg' => 100, 'price' => 80000]], 'kg' => 100, 'amount' => 8_000_000, 'status' => DealEntryStatus::Disputed, 'dispute_reason' => 'Sai kg']);
        $purchase = Purchase::factory()->create(['user_id' => $this->farmer->id]);
        $purchase->delete();
        $business = new Business(['name' => 'Công ty Hai Lúa']);
        $business->owner_id = $this->farmer->id;
        $business->save();
        $business->members()->create(['user_id' => $this->farmer->id, 'role' => 'owner']);

        $this->actingAs($this->admin);
        foreach (['/admin/ledger-accounts', '/admin/deals', '/admin/purchases', '/admin/businesses', '/admin/admin-view-logs', '/admin'] as $url) {
            $this->get($url)->assertOk();
        }
        // Danh sách không ghi nhật ký
        $this->assertSame(0, AdminViewLog::query()->count());

        // Ngày, số tiền trong từng dòng bảng (định dạng qua formatStateUsing) phải hiện đúng, không phải "0 đ" / trống
        $this->get("/admin/ledger-accounts/{$this->farmer->id}")->assertOk()
            ->assertSee('Vườn sầu riêng')->assertSee('4 bao NPK')->assertSee('48.000.000 đ')
            ->assertSee('12/10/2026')->assertSee('1.500.000 đ');
        // Đợt cân bị báo sai: không tính vào tổng, nhưng dòng vẫn hiện đúng tiền
        $this->get("/admin/deals/{$deal->uuid}")->assertOk()->assertSee('Báo sai: Sai kg')->assertSee('8.000.000 đ')->assertSee('15/10/2026');
        $this->get("/admin/purchases/{$purchase->uuid}")->assertOk()->assertSee($purchase->code())->assertSee('93.000.000 đ')->assertSee('1.000');
        $this->get("/admin/businesses/{$business->id}")->assertOk()->assertSee('Công ty Hai Lúa');
        // Mở lại trong 10 phút: không ghi thêm
        $this->get("/admin/ledger-accounts/{$this->farmer->id}")->assertOk();

        $this->assertSame(4, AdminViewLog::query()->count());
        $this->assertSame(['ledger', 'deal', 'purchase', 'business'], AdminViewLog::query()->orderBy('id')->pluck('area')->all());
        $this->assertSame($this->farmer->id, AdminViewLog::query()->where('area', 'ledger')->value('subject_user_id'));

        $this->travel(11)->minutes();
        $this->get("/admin/ledger-accounts/{$this->farmer->id}")->assertOk();
        $this->assertSame(5, AdminViewLog::query()->count());
    }

    public function test_read_only_and_downloads_are_logged(): void
    {
        $purchase = Purchase::factory()->create(['user_id' => $this->farmer->id]);
        $deal = Deal::factory()->joined()->create();

        $this->actingAs($this->admin);
        // Không có trang tạo / sửa
        $this->get('/admin/purchases/create')->assertNotFound();
        $this->get("/admin/purchases/{$purchase->uuid}/edit")->assertNotFound();
        $this->get("/admin/ledger-accounts/{$this->farmer->id}/edit")->assertNotFound();

        Livewire::test(ViewPurchase::class, ['record' => $purchase->uuid])
            ->assertActionDoesNotExist('edit')
            ->assertActionDoesNotExist('delete')
            ->callAction(TestAction::make('downloadPdf'))
            ->assertFileDownloaded();
        Livewire::test(ViewDeal::class, ['record' => $deal->uuid])->callAction(TestAction::make('downloadPdf'))->assertFileDownloaded();

        $this->assertSame(2, AdminViewLog::query()->where('action', 'download')->count());
    }

    public function test_regular_user_cannot_open_user_data(): void
    {
        $this->actingAs($this->farmer)->get('/admin/ledger-accounts')->assertForbidden();
        $this->actingAs($this->farmer)->get("/admin/ledger-accounts/{$this->farmer->id}")->assertForbidden();
    }

    /**
     * @param  array<string, mixed>  $data
     */
    private function record(string $table, string $uuid, array $data, bool $deleted = false): void
    {
        LedgerRecord::query()->create([
            'user_id' => $this->farmer->id, 'tbl' => $table, 'uuid' => $uuid,
            'data' => ['id' => $uuid, 'updated_at' => '2026-10-15T00:00:00Z', 'deleted_at' => null, ...$data],
            'client_updated_at' => '2026-10-15T00:00:00Z', 'is_deleted' => $deleted, 'version' => 1,
        ]);
    }
}
