<?php

namespace Tests\Feature;

use App\Models\PhoneVerification;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

/**
 * Quên mật khẩu bằng SMS ngược: người dùng nhắn "NN mã" từ chính số của mình tới số hệ thống.
 */
class PasswordResetTest extends TestCase
{
    use RefreshDatabase;

    private const SECRET = 'bi-mat-thu';

    protected function setUp(): void
    {
        parent::setUp();
        config(['nhanong.sms.inbound_number' => '0900000999', 'nhanong.sms.inbound_secret' => self::SECRET]);
    }

    private function inbound(string $from, string $text, ?string $secret = self::SECRET)
    {
        return $this->postJson(route('api.v1.sms.inbound'), ['from' => $from, 'text' => $text], $secret ? ['X-Sms-Secret' => $secret] : []);
    }

    public function test_full_flow_reset_password_and_log_out_other_devices(): void
    {
        $user = User::factory()->create(['phone' => '0912345678', 'password' => 'mat-khau-cu']);
        $user->createToken('may-cu');

        $start = $this->postJson(route('api.v1.auth.password.forgot'), ['phone' => '+84 912 345 678'])->assertCreated();
        $start->assertJsonPath('data.sms_to', '0900000999')->assertJsonPath('data.phone', '09****5678')->assertJsonPath('data.status', 'pending');
        $id = $start->json('data.id');
        $code = PhoneVerification::query()->where('uuid', $id)->value('code');
        $this->assertSame("NN {$code}", $start->json('data.sms_text'));

        // Chưa nhắn tin: chưa đặt được mật khẩu
        $this->postJson(route('api.v1.auth.password.reset'), ['id' => $id, 'password' => 'moi123456'])->assertJsonValidationErrors('id');

        // Tin từ số khác / sai mã: không xác minh
        $this->inbound('0987654321', "NN {$code}")->assertJsonPath('matched', false);
        $this->inbound('0912345678', 'NN 000000')->assertJsonPath('matched', $code === '000000');
        // Đúng số (dạng +84), có chữ thừa, chữ thường: xác minh
        $this->inbound('+84912345678', "nn {$code} cam on")->assertJsonPath('matched', true);
        $this->getJson(route('api.v1.auth.password.status', $id))->assertJsonPath('data.status', 'verified');

        $reset = $this->postJson(route('api.v1.auth.password.reset'), ['id' => $id, 'password' => 'moi123456'])->assertOk();
        $this->assertNotEmpty($reset->json('token'));
        $this->assertTrue(Hash::check('moi123456', $user->fresh()->password));
        // Máy cũ bị đăng xuất, chỉ còn token vừa cấp
        $this->assertSame(1, $user->tokens()->count());

        // Mỗi lần xác minh chỉ dùng 1 lần
        $this->postJson(route('api.v1.auth.password.reset'), ['id' => $id, 'password' => 'lan-nua-123'])->assertJsonValidationErrors('id');
    }

    public function test_webhook_requires_secret(): void
    {
        $this->inbound('0912345678', 'NN 123456', null)->assertForbidden();
        $this->inbound('0912345678', 'NN 123456', 'sai')->assertForbidden();
    }

    public function test_expired_or_unknown_phone(): void
    {
        $this->postJson(route('api.v1.auth.password.forgot'), ['phone' => '0911111111'])->assertJsonValidationErrors('phone');
        $this->postJson(route('api.v1.auth.password.forgot'), ['phone' => '123'])->assertJsonValidationErrors('phone');

        User::factory()->create(['phone' => '0912345678']);
        $id = $this->postJson(route('api.v1.auth.password.forgot'), ['phone' => '0912345678'])->json('data.id');
        $code = PhoneVerification::query()->where('uuid', $id)->value('code');

        $this->travel(16)->minutes();
        $this->getJson(route('api.v1.auth.password.status', $id))->assertJsonPath('data.status', 'expired');
        $this->inbound('0912345678', "NN {$code}")->assertJsonPath('matched', false);
    }

    public function test_disabled_when_no_inbound_number(): void
    {
        config(['nhanong.sms.inbound_number' => '']);
        User::factory()->create(['phone' => '0912345678']);
        $this->postJson(route('api.v1.auth.password.forgot'), ['phone' => '0912345678'])->assertStatus(503);
    }

    public function test_simulate_command_for_local_testing(): void
    {
        User::factory()->create(['phone' => '0912345678']);
        $id = $this->postJson(route('api.v1.auth.password.forgot'), ['phone' => '0912345678'])->json('data.id');
        $code = PhoneVerification::query()->where('uuid', $id)->value('code');

        $this->artisan('sms:inbound', ['from' => '0912345678', 'text' => "NN {$code}"])->expectsOutputToContain('Đã xác minh')->assertSuccessful();
    }
}
