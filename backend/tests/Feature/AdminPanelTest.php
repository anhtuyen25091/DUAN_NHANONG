<?php

namespace Tests\Feature;

use App\Models\User;
use Database\Seeders\DatabaseSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
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
