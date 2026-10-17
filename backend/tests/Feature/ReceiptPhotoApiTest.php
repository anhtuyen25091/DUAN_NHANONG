<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class ReceiptPhotoApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_upload_then_download_only_by_owner(): void
    {
        Storage::fake('local');
        $owner = User::factory()->create();
        $id = (string) Str::uuid();

        Sanctum::actingAs($owner);
        $this->put(route('api.v1.sync.photos.store', $id), ['photo' => UploadedFile::fake()->image('hoa-don.jpg', 800, 600)], ['Accept' => 'application/json'])
            ->assertNoContent();
        Storage::disk('local')->assertExists("receipts/{$owner->id}/{$id}");

        $this->get(route('api.v1.sync.photos.show', $id))->assertOk()->assertHeader('Content-Type', 'image/jpeg');

        // Người khác không thấy (ảnh nằm trong thư mục riêng của từng người)
        Sanctum::actingAs(User::factory()->create());
        $this->get(route('api.v1.sync.photos.show', $id))->assertNotFound();

        // Xóa sổ trên mạng thì xóa luôn ảnh
        Sanctum::actingAs($owner);
        $this->deleteJson(route('api.v1.ledger.destroy'))->assertNoContent();
        Storage::disk('local')->assertMissing("receipts/{$owner->id}/{$id}");
    }

    public function test_rejects_non_images_and_large_files(): void
    {
        Storage::fake('local');
        Sanctum::actingAs(User::factory()->create());
        $id = (string) Str::uuid();

        $this->put(route('api.v1.sync.photos.store', $id), ['photo' => UploadedFile::fake()->create('a.pdf', 10, 'application/pdf')], ['Accept' => 'application/json'])
            ->assertJsonValidationErrors('photo');
        $this->put(route('api.v1.sync.photos.store', $id), ['photo' => UploadedFile::fake()->image('to.jpg')->size(3000)], ['Accept' => 'application/json'])
            ->assertJsonValidationErrors('photo');
        $this->get('/api/v1/sync/photos/khong-phai-uuid')->assertNotFound();
    }

    public function test_form_post_with_method_put_works(): void
    {
        Storage::fake('local');
        $user = User::factory()->create();
        Sanctum::actingAs($user);
        $id = (string) Str::uuid();

        // Web / app gửi form bằng POST kèm _method=PUT (PHP chỉ đọc file với POST)
        $this->post('/api/v1/sync/photos/'.$id, ['_method' => 'PUT', 'photo' => UploadedFile::fake()->image('a.png')], ['Accept' => 'application/json'])
            ->assertNoContent();
        Storage::disk('local')->assertExists("receipts/{$user->id}/{$id}");
    }

    public function test_requires_login(): void
    {
        $this->getJson(route('api.v1.sync.photos.show', (string) Str::uuid()))->assertUnauthorized();
    }
}
