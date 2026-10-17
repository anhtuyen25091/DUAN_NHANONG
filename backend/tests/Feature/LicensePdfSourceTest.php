<?php

namespace Tests\Feature;

use App\Crawling\Fetcher;
use App\Enums\ShopType;
use App\Shops\Collect\Sources\LicensePdfSource;
use Tests\TestCase;

class LicensePdfSourceTest extends TestCase
{
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

    public function test_scanned_pdf_without_text_gives_nothing(): void
    {
        $source = new LicensePdfSource(app(Fetcher::class), 'so-x', 'x', 'https://example.test/a.pdf', 'son-la', [ShopType::PhanBon]);

        $this->assertSame([], iterator_to_array($source->read($this->pdf([])), false));
    }
}
