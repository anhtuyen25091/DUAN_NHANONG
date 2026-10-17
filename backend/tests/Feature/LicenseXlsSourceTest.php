<?php

namespace Tests\Feature;

use App\Crawling\Fetcher;
use App\Enums\ShopType;
use App\Shops\Collect\Sources\LicenseSheetSource;
use PhpOffice\PhpSpreadsheet\IOFactory;
use PhpOffice\PhpSpreadsheet\Spreadsheet;
use Tests\TestCase;

class LicenseXlsSourceTest extends TestCase
{
    public function test_reads_old_excel_first_sheet_and_guesses_province(): void
    {
        $book = new Spreadsheet;
        $sheet = $book->getActiveSheet()->setTitle('DS TN GAO (3)');
        $sheet->fromArray([
            ['', 'BỘ CÔNG THƯƠNG'],
            ['', 'DANH SÁCH THƯƠNG NHÂN KINH DOANH XUẤT KHẨU GẠO'],
            ['', 'STT', 'TÊN DOANH NGHIỆP', 'GCN ĐKDN', 'SỐ GCN', 'NGÀY HẾT HẠN', 'Địa chỉ'],
            ['', 'Tỉnh An Giang'],
            ['', '1', 'Công ty TNHH LT Tấn Vương', '1600', '309/3-2023-AG/GCN', '', 'Ấp Nhơn Hòa, xã Nhơn Mỹ, huyện Chợ Mới, tỉnh An Giang'],
            ['', 'Thành phố Hồ Chí Minh'],
            ['', '2', 'Công ty CP XNK Master Agri', '0314', '369/4-2025-TP.HCM/GCN', '', '236 Khánh Hội, Phường 9, Quận 4, Thành phố Hồ Chí Minh'],
        ]);
        // Trang sau là bản cũ: không đọc
        $book->createSheet()->setTitle('DS cu')->fromArray([['STT', 'TÊN DOANH NGHIỆP', 'Địa chỉ'], ['1', 'Công ty Cũ', 'Cần Thơ']]);
        $file = tempnam(sys_get_temp_dir(), 'xls').'.xls';
        IOFactory::createWriter($book, 'Xls')->save($file);

        $source = new LicenseSheetSource(app(Fetcher::class), 'bct', 'x', 'u', null, [ShopType::ThuMua], 85, null, null, true, 'Lúa gạo');
        $items = iterator_to_array($source->read($file), false);
        unlink($file);

        $this->assertCount(2, $items);
        $this->assertSame('Công ty TNHH LT Tấn Vương', $items[0]->name);
        $this->assertNull($items[0]->province);
        $this->assertSame('Lúa gạo', $items[1]->goods);
        $this->assertStringStartsWith('sheet1#369/4-2025-TP.HCM/GCN#', $items[1]->ref);
    }
}
