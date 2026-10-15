<?php

namespace Tests\Feature;

use App\Filament\Resources\Users\Pages\ManageUsers;
use App\Models\Plan;
use App\Models\User;
use Database\Seeders\DatabaseSeeder;
use Filament\Actions\Testing\TestAction;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Livewire\Livewire;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

class AdminPanelTest extends TestCase
{
    use RefreshDatabase;

    /**
     * @return array<string, array{0: string}>
     */
    public static function adminPages(): array
    {
        return [
            'giá' => ['/admin/prices'],
            'mặt hàng' => ['/admin/products'],
            'khu vực' => ['/admin/regions'],
            'danh mục' => ['/admin/categories'],
            'nguồn giá' => ['/admin/price-sources'],
            'nhật ký' => ['/admin/crawl-logs'],
            'tên chưa nhận diện' => ['/admin/unmatched-names'],
            'điểm bán' => ['/admin/shops'],
            'đề xuất điểm bán' => ['/admin/shop-submissions'],
            'tài khoản' => ['/admin/users'],
            'gói xem giá' => ['/admin/plans'],
        ];
    }

    #[DataProvider('adminPages')]
    public function test_admin_can_open_page(string $url): void
    {
        $this->seed(DatabaseSeeder::class);
        $admin = User::factory()->create();
        $admin->forceFill(['is_admin' => true])->save();

        $this->actingAs($admin)->get($url)->assertOk();
    }

    public function test_admin_activates_plan_for_user(): void
    {
        $this->seed(DatabaseSeeder::class);
        $admin = User::factory()->create();
        $admin->forceFill(['is_admin' => true])->save();
        $farmer = User::factory()->create(['phone' => '0912345678']);
        $yearly = Plan::query()->where('code', 'nam')->firstOrFail();

        $this->actingAs($admin);
        Livewire::test(ManageUsers::class)
            ->callAction(TestAction::make('activatePlan')->table($farmer), data: ['plan_id' => $yearly->id])
            ->assertHasNoFormErrors();

        $this->assertTrue($farmer->refresh()->hasPremium());
        $this->assertSame(now()->addYear()->toDateString(), $farmer->premium_until->toDateString());
    }

    public function test_regular_user_cannot_open_admin(): void
    {
        $this->actingAs(User::factory()->create())->get('/admin/prices')->assertForbidden();
    }

    public function test_grant_admin_command(): void
    {
        $user = User::factory()->create(['email' => 'a@example.com']);

        $this->artisan('admin:grant', ['email' => 'a@example.com'])->assertSuccessful();

        $this->assertTrue($user->refresh()->is_admin);
    }
}
