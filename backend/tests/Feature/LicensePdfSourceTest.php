<?php

namespace Tests\Feature;

use App\Crawling\Fetcher;
use App\Enums\CandidateStatus;
use App\Enums\ShopType;
use App\Filament\Resources\ShopCandidates\Pages\ManageShopCandidates;
use App\Models\Shop;
use App\Models\ShopCandidate;
use App\Models\User;
use App\Shops\Collect\Sources\LicensePdfSource;
use App\Shops\Collect\Sources\OcrUnavailableException;
use App\Shops\Collect\Sources\PdfTable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Process\PendingProcess;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Process;
use Livewire\Livewire;
use Tests\TestCase;

class LicensePdfSourceTest extends TestCase
{
    use RefreshDatabase;

    /**
     * PDF 1 trang có chữ ở các vị trí cho trước (font Helvetica, chỉ chữ không dấu)
     *
     * @param  list<array{0: float, 1: float, 2: string}>  $texts  [x, y, chữ]
     */
    private function pdf(array $texts): string
    {
        $stream = '';
        foreach ($texts as [$x, $y, $text]) {
            $stream .= sprintf("BT /F1 9 Tf 1 0 0 1 %.2f %.2f Tm (%s) Tj ET\n", $x, $y, str_replace(['(', ')'], ['\\(', '\\)'], $text));
        }
        $objects = [
            '<< /Type /Catalog /Pages 2 0 R >>',
            '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
            '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 842 595] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
            '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
            '<< /Length '.strlen($stream)." >>\nstream\n{$stream}endstream",
        ];
        $pdf = "%PDF-1.4\n";
        $offsets = [];
        foreach ($objects as $i => $object) {
            $offsets[] = strlen($pdf);
            $pdf .= ($i + 1)." 0 obj\n{$object}\nendobj\n";
        }
        $xref = strlen($pdf);
        $pdf .= 'xref
0 '.(count($objects) + 1)."\n0000000000 65535 f \n";
        foreach ($offsets as $offset) {
            $pdf .= sprintf("%010d 00000 n \n", $offset);
        }

        return $pdf.'trailer << /Size '.(count($objects) + 1)." /Root 1 0 R >>\nstartxref\n{$xref}\n%%EOF";
    }

    public function test_rebuilds_table_from_text_positions(): void
    {
        $pdf = $this->pdf([
            [200, 560, 'DANH SACH CO SO DUOC CAP GIAY'],
            // Tiêu đề 2 tầng: "Dia chi" phủ trên "Ban | Xa | Huyen"
            [30, 500, 'TT'], [110, 500, 'Ten co so'], [330, 512, 'Dia chi'], [270, 495, 'Ban'], [360, 495, 'Xa'], [450, 495, 'Huyen'], [540, 500, 'Ghi chu'],
            // Dòng 1: tên xuống 2 hàng, nằm lệch trên / dưới số thứ tự
            [32, 460, '1'], [50, 466, 'HTX rau qua va'], [50, 455, 'DVNN Moc Chau'], [250, 460, 'TK 9'], [340, 460, 'Tan Lap'], [430, 460, 'Moc Chau'],
            [32, 430, '2'], [50, 430, 'Lo Van Van'], [250, 430, 'Ban Hua Tat'], [340, 430, 'Van Ho'], [430, 430, 'Van Ho'],
            [32, 400, '10'], [50, 400, 'Ca Thi Hoa'], [250, 400, 'Chieng Ve'], [340, 400, 'Muong E'], [430, 400, 'Thuan Chau'], [520, 400, 'het han'],
            // Trùng tên, khác nơi (không có số giấy): vẫn là điểm khác
            [32, 370, '11'], [50, 370, 'Ca Thi Hoa'], [250, 370, 'Ban Ai'], [340, 370, 'Chieng Xom'], [430, 370, 'Son La'],
        ]);

        $source = new LicensePdfSource(app(Fetcher::class), 'so-x', 'x', 'https://example.test/a.pdf', 'son-la', [ShopType::ThuocBvtv]);
        $items = iterator_to_array($source->read($pdf), false);

        $this->assertCount(4, $items);
        $this->assertNotSame($items[2]->ref, $items[3]->ref);
        $this->assertSame('HTX rau qua va DVNN Moc Chau', $items[0]->name);
        $this->assertSame('TK 9, xã Tan Lap, huyện Moc Chau', $items[0]->address);
        $this->assertSame('Ban Hua Tat, xã Van Ho, huyện Van Ho', $items[1]->address);
        $this->assertSame('Ca Thi Hoa', $items[2]->name);
        $this->assertSame([ShopType::ThuocBvtv], $items[2]->types);
    }

    public function test_detects_text_layer_of_real_pdf(): void
    {
        $this->assertTrue(PdfTable::hasTextLayer(PdfTable::pages($this->pdf([[30, 500, 'STT'], [110, 500, 'Ten co so buon ban phan bon'], [330, 500, 'Dia chi']]))));
        $this->assertFalse(PdfTable::hasTextLayer(PdfTable::pages($this->pdf([]))));
    }

    /**
     * Giả lập pdftoppm + tesseract: pdftoppm "vẽ" ra file ảnh rỗng, tesseract trả kết quả TSV mẫu.
     *
     * @param  array<int, string>  $seen  các lệnh đã chạy (tên lệnh + tham số), để kiểm tra
     */
    private function fakeOcrTools(bool $installed = true, array &$seen = []): void
    {
        Process::fake(function (PendingProcess $process) use ($installed, &$seen) {
            $command = (array) $process->command;
            $seen[] = implode(' ', $command);
            if (! $installed) {
                return Process::result(errorOutput: 'command not found', exitCode: 127);
            }
            if (in_array('-v', $command, true)) {
                return Process::result(errorOutput: "pdftoppm version 24.02.0\n");
            }
            if (in_array('--list-langs', $command, true)) {
                return Process::result(output: "List of available languages in \"/tessdata/\" (2):\neng\nvie\n");
            }
            if (in_array('-singlefile', $command, true)) {
                file_put_contents(end($command).'.png', '');

                return Process::result();
            }

            return Process::result(output: (string) file_get_contents(base_path('tests/Fixtures/ocr/son-la-scan-page1.tsv')));
        });
    }

    public function test_scanned_pdf_is_read_with_ocr_and_marked(): void
    {
        config(['shops.ocr.tessdata' => 'storage/app/tessdata']);
        $seen = [];
        $this->fakeOcrTools(true, $seen);

        $source = new LicensePdfSource(app(Fetcher::class), 'so-x', 'x', 'https://example.test/a.pdf', 'son-la', [ShopType::PhanBon]);
        $items = iterator_to_array($source->read($this->pdf([])), false);

        $this->assertCount(3, $items);
        $this->assertSame('Đại lý VTNN Hải Lúa', $items[0]->name);
        $this->assertSame('Tiểu khu 9, xã Tân Lập, huyện Mộc Châu', $items[0]->address);
        $this->assertSame('0912 345 678', $items[0]->phone);
        $this->assertSame('Bản Ỏ, Chiềng Ve, xã Mường É, huyện Thuận Châu', $items[2]->address);
        $this->assertTrue($items[1]->raw['ocr']);

        Process::assertRan(fn (PendingProcess $process): bool => in_array('-singlefile', (array) $process->command, true)
            && in_array('300', (array) $process->command, true));
        Process::assertRan(fn (PendingProcess $process): bool => in_array('tsv', (array) $process->command, true)
            && in_array('vie', (array) $process->command, true)
            && in_array('6', (array) $process->command, true)
            && $process->environment['TESSDATA_PREFIX'] === base_path('storage/app/tessdata')
            && $process->timeout === 180);
        // Ảnh tạm đã xóa
        $this->assertSame([], glob(sys_get_temp_dir().'/shops-ocr-*') ?: []);
    }

    public function test_scanned_pdf_without_ocr_tools_reports_what_is_missing(): void
    {
        $this->fakeOcrTools(installed: false);
        $source = new LicensePdfSource(app(Fetcher::class), 'so-x', 'x', 'https://example.test/a.pdf', 'son-la', [ShopType::PhanBon]);

        $this->expectException(OcrUnavailableException::class);
        $this->expectExceptionMessageMatches('/pdftoppm.*tesseract/');
        iterator_to_array($source->read($this->pdf([])), false);
    }

    public function test_text_pdf_does_not_run_ocr(): void
    {
        Process::fake();
        $source = new LicensePdfSource(app(Fetcher::class), 'so-x', 'x', 'https://example.test/a.pdf', 'son-la', [ShopType::PhanBon]);
        iterator_to_array($source->read($this->pdf([[30, 500, 'TT'], [110, 500, 'Ten co so'], [340, 500, 'Xa'], [32, 460, '1'], [50, 460, 'Cua hang vat tu nong nghiep Lo Van Van'], [340, 460, 'Van Ho']])), false);

        Process::assertNothingRan();
    }

    /** Nguồn PDF bản scan trong lệnh shops:collect */
    private function configureScannedSource(): void
    {
        config(['shops.geocode_delay_ms' => 0, 'shops.sources' => ['so-x-scan' => [
            'class' => LicensePdfSource::class, 'label' => 'Sở X (bản scan)', 'url' => 'https://example.test/ds.pdf',
            'province' => 'son-la', 'types' => ['phan_bon'], 'trust' => 85,
        ]]]);
        Http::fake([
            'example.test/robots.txt' => Http::response('', 404),
            'example.test/ds.pdf' => Http::response($this->pdf([])),
            'photon.komoot.io/*' => Http::response(['features' => [[
                'geometry' => ['coordinates' => [104.6, 20.9]],
                'properties' => ['countrycode' => 'VN', 'state' => 'Sơn La', 'osm_key' => 'place', 'type' => 'locality', 'name' => 'Tân Lập'],
            ]]]),
        ]);
    }

    public function test_collect_skips_scanned_source_with_warning_when_tools_missing(): void
    {
        $this->configureScannedSource();
        $this->fakeOcrTools(installed: false);
        Log::spy();

        $this->artisan('shops:collect')
            ->expectsOutputToContain('bỏ qua')
            ->assertSuccessful();

        Log::shouldHaveReceived('warning')->withArgs(fn (string $message): bool => str_contains($message, 'so-x-scan') && str_contains($message, 'tesseract'));
        $this->assertSame(0, ShopCandidate::query()->count());
    }

    public function test_ocr_candidates_wait_for_admin_review(): void
    {
        $this->configureScannedSource();
        $this->fakeOcrTools();

        $this->artisan('shops:collect')->assertSuccessful();

        $candidates = ShopCandidate::query()->orderBy('id')->get();
        $this->assertCount(3, $candidates);
        $this->assertSame(0, Shop::query()->count());
        $this->assertTrue($candidates->every(fn (ShopCandidate $c): bool => $c->status === CandidateStatus::Pending && str_contains((string) $c->review_note, 'OCR')));
        $this->assertSame(['0912345678', '0386611369', '02123851234'], $candidates->pluck('phone')->all());

        // Trang admin lọc được các điểm đọc từ OCR
        $other = ShopCandidate::query()->create(['source' => 'khac', 'source_ref' => 'a', 'source_trust' => 50, 'name' => 'Đại lý khác', 'types' => [ShopType::PhanBon], 'status' => CandidateStatus::Pending]);
        $admin = User::factory()->create();
        $admin->forceFill(['is_admin' => true])->save();
        $this->actingAs($admin);
        Livewire::test(ManageShopCandidates::class)
            ->filterTable('ocr')
            ->assertCanSeeTableRecords($candidates)
            ->assertCanNotSeeTableRecords([$other]);
    }
}
