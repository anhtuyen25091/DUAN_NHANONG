<?php

namespace Tests\Feature;

use App\Models\LedgerRecord;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Tests\TestCase;

class LedgerSyncApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_register_with_phone_then_login(): void
    {
        $this->postJson(route('api.v1.auth.register'), ['name' => 'Anh Ba', 'phone' => '+84 912 345 678', 'password' => 'matkhau1'])
            ->assertCreated()
            ->assertJsonPath('user.phone', '0912345678')
            ->assertJsonStructure(['token']);

        $this->postJson(route('api.v1.auth.register'), ['name' => 'Trùng', 'phone' => '0912345678', 'password' => 'matkhau1'])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('phone');

        $this->postJson(route('api.v1.auth.login'), ['phone' => '0912 345 678', 'password' => 'sai'])->assertUnprocessable();

        $token = $this->postJson(route('api.v1.auth.login'), ['phone' => '0912 345 678', 'password' => 'matkhau1'])->assertOk()->json('token');
        $this->getJson(route('api.v1.user'), ['Authorization' => "Bearer $token"])->assertOk()->assertJsonPath('data.name', 'Anh Ba');
    }

    public function test_sync_requires_login(): void
    {
        $this->getJson(route('api.v1.sync.pull'))->assertUnauthorized();
        $this->postJson(route('api.v1.sync.push'), ['records' => []])->assertUnauthorized();
    }

    public function test_push_then_pull_from_another_device(): void
    {
        $user = User::factory()->create();
        $garden = $this->record(['name' => 'Vườn sau'], '2026-10-14T08:00:00.000Z');

        $this->actingAs($user)->postJson(route('api.v1.sync.push'), ['records' => [['tbl' => 'gardens', 'data' => $garden]]])
            ->assertOk()
            ->assertJsonPath('accepted', 1)
            ->assertJsonPath('version', 1);

        $this->getJson(route('api.v1.sync.pull', ['since' => 0]))
            ->assertOk()
            ->assertJsonPath('records.gardens.0.name', 'Vườn sau')
            ->assertJsonPath('version', 1)
            ->assertJsonPath('has_more', false);

        // Đã lấy tới version 1 thì không có gì mới
        $this->getJson(route('api.v1.sync.pull', ['since' => 1]))->assertJsonPath('records', []);
    }

    public function test_newer_update_wins_older_is_ignored(): void
    {
        $user = User::factory()->create();
        $id = (string) Str::uuid();
        $push = fn (string $name, string $at) => $this->actingAs($user)->postJson(route('api.v1.sync.push'), [
            'records' => [['tbl' => 'gardens', 'data' => $this->record(['name' => $name], $at, $id)]],
        ]);

        $push('Bản 1', '2026-10-14T08:00:00.000Z')->assertJsonPath('accepted', 1);
        $push('Bản 2 mới hơn', '2026-10-14T09:00:00Z')->assertJsonPath('accepted', 1);
        // Máy khác sửa từ trước nhưng giờ mới gửi: bỏ qua
        $push('Bản cũ', '2026-10-14T08:30:00.500Z')->assertJsonPath('accepted', 0);
        // Gửi lại đúng bản đang có: bỏ qua, không tăng version
        $push('Bản 2 mới hơn', '2026-10-14T09:00:00.000Z')->assertJsonPath('accepted', 0)->assertJsonPath('version', 2);

        $this->assertSame('Bản 2 mới hơn', LedgerRecord::query()->sole()->data['name']);
    }

    public function test_deleted_record_is_synced_as_tombstone(): void
    {
        $user = User::factory()->create();
        $record = $this->record(['amount' => 350000], '2026-10-14T08:00:00.000Z');
        $record['deleted_at'] = '2026-10-14T08:00:00.000Z';

        $this->actingAs($user)->postJson(route('api.v1.sync.push'), ['records' => [['tbl' => 'transactions', 'data' => $record]]])->assertOk();

        $this->assertTrue(LedgerRecord::query()->sole()->is_deleted);
        $this->getJson(route('api.v1.sync.pull'))->assertJsonPath('records.transactions.0.deleted_at', '2026-10-14T08:00:00.000Z');
    }

    public function test_users_cannot_see_each_other(): void
    {
        $owner = User::factory()->create();
        $this->actingAs($owner)->postJson(route('api.v1.sync.push'), [
            'records' => [['tbl' => 'gardens', 'data' => $this->record(['name' => 'Bí mật'], '2026-10-14T08:00:00.000Z')]],
        ])->assertOk();

        $this->actingAs(User::factory()->create())->getJson(route('api.v1.sync.pull'))->assertJsonPath('records', []);
    }

    public function test_rejects_unknown_table_and_bad_timestamp(): void
    {
        $user = User::factory()->create();

        $this->actingAs($user)->postJson(route('api.v1.sync.push'), [
            'records' => [['tbl' => 'users', 'data' => $this->record([], '2026-10-14T08:00:00.000Z')]],
        ])->assertUnprocessable()->assertJsonValidationErrors('records.0.tbl');

        $this->postJson(route('api.v1.sync.push'), [
            'records' => [['tbl' => 'gardens', 'data' => $this->record([], 'hôm qua')]],
        ])->assertUnprocessable()->assertJsonValidationErrors('records.0.data.updated_at');
    }

    public function test_pull_pages_through_large_ledgers(): void
    {
        $user = User::factory()->create();
        $records = collect(range(1, 600))->map(fn (int $i) => ['tbl' => 'transactions', 'data' => $this->record(['amount' => $i], '2026-10-14T08:00:00.000Z')]);

        $this->actingAs($user)->postJson(route('api.v1.sync.push'), ['records' => $records->take(500)->all()])->assertOk();
        $this->postJson(route('api.v1.sync.push'), ['records' => $records->skip(500)->values()->all()])->assertOk()->assertJsonPath('version', 600);

        $first = $this->getJson(route('api.v1.sync.pull'))->assertJsonPath('has_more', true)->assertJsonPath('version', 500);
        $this->assertCount(500, $first->json('records.transactions'));

        $this->getJson(route('api.v1.sync.pull', ['since' => 500]))->assertJsonPath('has_more', false)->assertJsonPath('version', 600);
    }

    public function test_delete_server_copy(): void
    {
        $user = User::factory()->create();
        $this->actingAs($user)->postJson(route('api.v1.sync.push'), [
            'records' => [['tbl' => 'gardens', 'data' => $this->record([], '2026-10-14T08:00:00.000Z')]],
        ]);

        $this->deleteJson(route('api.v1.ledger.destroy'))->assertNoContent();

        $this->assertDatabaseCount('ledger_records', 0);
    }

    /**
     * @param  array<string, mixed>  $fields
     * @return array<string, mixed>
     */
    private function record(array $fields, string $updatedAt, ?string $id = null): array
    {
        return ['id' => $id ?? (string) Str::uuid(), 'updated_at' => $updatedAt, 'deleted_at' => null, ...$fields];
    }
}
