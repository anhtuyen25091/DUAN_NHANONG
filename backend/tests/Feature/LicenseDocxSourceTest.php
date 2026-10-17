<?php

namespace Tests\Feature;

use App\Crawling\Fetcher;
use App\Enums\ShopType;
use App\Shops\Collect\Sources\LicenseDocxSource;
use PhpOffice\PhpWord\IOFactory;
use PhpOffice\PhpWord\PhpWord;
use Tests\TestCase;

class LicenseDocxSourceTest extends TestCase
{
    public function test_reads_table_with_two_level_header(): void
    {
        $word = new PhpWord;
        $table = $word->addSection()->addTable();
        // Tầng trên: "Địa chỉ" gộp 3 ô
        $table->addRow();
        foreach (['TT', 'Tên cơ sở', 'Tên chủ cơ sở'] as $text) {
            $table->addCell(1000)->addText($text);
        }
        $table->addCell(3000, ['gridSpan' => 3])->addText('Địa chỉ');
        $table->addCell(1000)->addText('Ghi chú');
        $table->addRow();
        foreach (['', '', '', 'Xã (phường, Thị trấn)', 'Huyện (Quận)', 'Tỉnh (TP)', ''] as $text) {
            $table->addCell(1000)->addText($text);
        }
        foreach ([['1', 'Đại lý Tuấn Hưng', 'Nguyễn Đình Tuấn', '182 Bà Triệu', 'Nông Cống', 'Thanh Hóa', ''], ['2', 'Nguyễn Huy Phong', 'Nguyễn Huy Phong', 'Quảng Ninh', 'Quảng Xương', 'Thanh Hóa', '']] as $values) {
            $table->addRow();
            foreach ($values as $text) {
                $table->addCell(1000)->addText($text);
            }
        }
        $file = tempnam(sys_get_temp_dir(), 'docx').'.docx';
        IOFactory::createWriter($word, 'Word2007')->save($file);

        $source = new LicenseDocxSource(app(Fetcher::class), 'so-x', 'x', 'https://example.test/a.docx', 'thanh-hoa', [ShopType::ThuocBvtv]);
        $items = iterator_to_array($source->read((string) file_get_contents($file)), false);
        unlink($file);

        $this->assertCount(2, $items);
        $this->assertSame('Đại lý Tuấn Hưng', $items[0]->name);
        $this->assertSame('Nguyễn Đình Tuấn', $items[0]->raw['chu_co_so']);
        // Ô "xã" ghi số nhà, đường: không thêm chữ "xã"
        $this->assertSame('182 Bà Triệu, huyện Nông Cống', $items[0]->address);
        $this->assertSame('xã Quảng Ninh, huyện Quảng Xương', $items[1]->address);
    }
}
