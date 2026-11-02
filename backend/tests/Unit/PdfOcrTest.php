<?php

namespace Tests\Unit;

use App\Shops\Collect\Sources\PdfOcr;
use App\Shops\Collect\Sources\PdfTable;
use PHPUnit\Framework\TestCase;

class PdfOcrTest extends TestCase
{
    public function test_detects_text_layer(): void
    {
        $this->assertFalse(PdfTable::hasTextLayer([]));
        // Bản scan: trang không có chữ, hoặc chỉ có số trang / dấu mộc
        $this->assertFalse(PdfTable::hasTextLayer([[], []]));
        $this->assertFalse(PdfTable::hasTextLayer([[['x' => 400.0, 'y' => 20.0, 'text' => 'Trang 1']], []]));
        $this->assertTrue(PdfTable::hasTextLayer([[
            ['x' => 30.0, 'y' => 500.0, 'text' => 'STT'],
            ['x' => 110.0, 'y' => 500.0, 'text' => 'Tên cơ sở buôn bán thuốc bảo vệ thực vật'],
            ['x' => 330.0, 'y' => 500.0, 'text' => 'Địa chỉ'],
        ]]));
    }

    public function test_cleans_common_ocr_errors(): void
    {
        $this->assertSame('12', PdfOcr::clean('12.'));
        $this->assertSame('3', PdfOcr::clean(' 3) '));
        $this->assertSame('0912 345 678', PdfOcr::clean('09l2 345 678'));
        $this->assertSame('02123851234', PdfOcr::clean('O2123851234'));
        // Chữ có dấu ở 2 đầu không bị cắt hỏng (trim theo byte)
        $this->assertSame('Vân Hồ', PdfOcr::clean('— Vân Hồ —'));
        $this->assertSame('Bản Ỏ, Chiềng Ve', PdfOcr::clean('| Bản  Ỏ ,Chiềng Ve |'));
        // Chữ thường có "l", "O" thì giữ nguyên; năm, số nhà không đổi
        $this->assertSame('Lô 12, Ql 6', PdfOcr::clean('Lô 12, Ql 6'));
        $this->assertSame('Ollo', PdfOcr::clean('Ollo'));
        // Dấu tách rời (NFD) → dựng sẵn (NFC)
        $this->assertSame('Mộc Châu', PdfOcr::clean("Mo\u{0323}\u{0302}c Châu"));
    }

    public function test_groups_tsv_words_into_cell_phrases_in_pdf_coordinates(): void
    {
        $items = PdfOcr::itemsFromTsv((string) file_get_contents(__DIR__.'/../Fixtures/ocr/son-la-scan-page1.tsv'), 300);
        $texts = array_column($items, 'text');

        // Chữ cùng ô gộp lại, đường kẻ "|" bị bỏ
        $this->assertContains('Tên cơ sở', $texts);
        $this->assertContains('Tiểu khu 9', $texts);
        $this->assertContains('0912 345 678', $texts);
        $this->assertNotContains('|', $texts);
        // Ô khác nhau trên cùng hàng không bị gộp
        $this->assertNotContains('Tân Lập Mộc Châu', $texts);

        // 300 dpi → điểm PDF (1/72 inch), trục y lật ngược (gốc ở dưới)
        $stt = $items[array_search('STT', $texts, true)];
        $this->assertEqualsWithDelta(150 * 0.24, $stt['x'], 0.01);
        $this->assertEqualsWithDelta((2480 - 460) * 0.24, $stt['y'], 0.01);
        $one = $items[array_search('1', $texts, true)];
        $this->assertLessThan($stt['y'], $one['y']);
    }

    public function test_ocr_items_go_through_same_table_parsing(): void
    {
        $rows = PdfTable::fromPages([PdfOcr::itemsFromTsv((string) file_get_contents(__DIR__.'/../Fixtures/ocr/son-la-scan-page1.tsv'), 300)]);

        $this->assertSame(['STT', 'Tên cơ sở', 'Thôn/bản', 'Xã', 'Huyện', 'Điện thoại', 'Ghi chú'], $rows[0]);
        $this->assertCount(4, $rows);
        $this->assertSame(['1', 'Đại lý VTNN Hải Lúa', 'Tiểu khu 9', 'Tân Lập', 'Mộc Châu', '0912 345 678', ''], $rows[1]);
        $this->assertSame(['2', 'Lò Văn Vân', 'Bản Hua Tát', 'Vân Hồ', 'Vân Hồ', '0168.66.11.369', ''], $rows[2]);
        $this->assertSame(['3', 'Cà Thị Hoa', 'Bản Ỏ, Chiềng Ve', 'Mường É', 'Thuận Châu', '0212 3851 234', 'Hết hạn'], $rows[3]);
    }
}
