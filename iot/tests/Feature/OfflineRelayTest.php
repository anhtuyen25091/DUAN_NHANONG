<?php

namespace Tests\Feature;

use App\Enums\ReadingSource;
use App\Models\Device;
use App\Models\Reading;
use Database\Seeders\MetricSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Tests\TestCase;

/**
 * Ruộng không có mạng: điện thoại tải file từ thiết bị rồi gửi lên sau; hoặc mạch SIM 2G gửi SMS.
 */
class OfflineRelayTest extends TestCase
{
    use RefreshDatabase;

    private Device $device;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(MetricSeeder::class);
        $this->device = Device::factory()->create();
        $this->device->rotateKey();
    }

    public function test_phone_uploads_signed_file_from_device(): void
    {
        $file = $this->signedFile($this->body());

        $this->post(route('api.v1.ingest.upload'), ['file' => UploadedFile::fake()->createWithContent('ndata.csv', $file)], ['Accept' => 'application/json'])
            ->assertOk()
            ->assertJsonPath('device', $this->device->uid)
            ->assertJsonPath('accepted', 4);

        $this->assertSame(4, Reading::query()->where('source', ReadingSource::PhoneRelay)->count());

        // Gửi lại cùng file (điện thoại bấm 2 lần) không bị nhân đôi
        $this->postJson(route('api.v1.ingest.upload'), ['content' => $file])
            ->assertOk()
            ->assertJsonPath('duplicates', 4);
    }

    public function test_tampered_file_is_rejected(): void
    {
        $file = $this->signedFile($this->body());

        $this->postJson(route('api.v1.ingest.upload'), ['content' => str_replace('41.5', '99.0', $file)])->assertForbidden();
        $this->postJson(route('api.v1.ingest.upload'), ['content' => "không phải file\n1,soil_ph,6"])->assertUnprocessable();
        $this->assertSame(0, Reading::query()->count());
    }

    public function test_sms_inbound(): void
    {
        config(['iot.sms_secret' => 'sms-secret']);
        $t = now()->subHours(2)->getTimestamp();
        $payload = "{$t},water_level,4.5;{$t},salinity,2.1";
        $text = $this->device->uid.' '.substr($this->device->sign($payload), 0, 16).' '.$payload;

        $this->postJson(route('api.v1.sms.inbound'), ['from' => '0912345678', 'text' => $text])->assertUnauthorized();
        $this->postJson(route('api.v1.sms.inbound'), ['text' => $text], ['X-Webhook-Secret' => 'sms-secret'])
            ->assertOk()
            ->assertJsonPath('accepted', 2);
        $this->postJson(route('api.v1.sms.inbound'), ['text' => str_replace('4.5', '9.5', $text)], ['X-Webhook-Secret' => 'sms-secret'])
            ->assertForbidden();
    }

    public function test_sms_snapshot_format_fits_one_message(): void
    {
        config(['iot.sms_secret' => 'sms-secret']);
        $payload = '@'.now()->subMinutes(5)->getTimestamp().';water_level=4.5;salinity=4.6;soil_ph=6.2;battery=81';
        $text = $this->device->uid.' '.substr($this->device->sign($payload), 0, 16).' '.$payload;
        $this->assertLessThanOrEqual(160, strlen($text));

        $this->postJson(route('api.v1.sms.inbound'), ['text' => $text], ['X-Webhook-Secret' => 'sms-secret'])
            ->assertOk()
            ->assertJsonPath('accepted', 4);
        $this->assertSame(81, $this->device->fresh()->battery);
    }

    private function body(): string
    {
        $t = now()->subDay()->getTimestamp();

        return "t,metric,value\n{$t},soil_moisture,41.5\n{$t},soil_ph,6.4\n".($t + 900).",soil_moisture,40.9\n".($t + 900).",soil_ph,6.4\n";
    }

    private function signedFile(string $body): string
    {
        return "#nhanong uid={$this->device->uid} sig={$this->device->sign($body)}\n".$body;
    }
}
