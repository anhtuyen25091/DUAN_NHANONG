<?php

namespace Tests\Feature;

use App\Crawling\Fetcher;
use App\Enums\ShopType;
use App\Shops\Collect\Sources\LicenseSheetSource;
use OpenSpout\Common\Entity\Row;
use OpenSpout\Writer\XLSX\Writer;
use Tests\TestCase;

class LicenseSheetSourceTest extends TestCase
{
    public function test_reads_district_sheets_and_skips_summary(): void
    {
        $file = tempnam(sys_get_temp_dir(), 'lic').'.xlsx';
        $writer = new Writer;
        $writer->openToFile($file);
        // Trang tổng hợp: không có cột tên / địa chỉ → bỏ qua
        $writer->getCurrentSheet()->setName('TONG HOP');
        $writer->addRow(Row::fromValues(['STT', 'Huyện, thành phố, thị xã', 'Số cơ sở']));
        $writer->addRow(Row::fromValues([1, 'Thạch Hà', 122]));

        $writer->addNewSheetAndMakeItCurrent()->setName('THẠCH HÀ');
        $writer->addRow(Row::fromValues(['CHI CỤC TRỒNG TRỌT VÀ CHĂN NUÔI']));
        $writer->addRow(Row::fromValues(['DANH SÁCH CƠ SỞ ĐƯỢC CẤP GIẤY ĐỦ ĐIỀU KIỆN BUÔN BÁN PHÂN BÓN']));
        $writer->addRow(Row::fromValues(['HUYỆN THẠCH HÀ (đến tháng 05/2025)']));
        $writer->addRow(Row::fromValues(['STT', 'Họ và tên', 'Địa chỉ buôn bán', 'Số giấy CN', 'Ngày cấp']));
        $writer->addRow(Row::fromValues([1, 'Nguyễn Quang Hạnh', 'Thôn Phái Đông - xã Tân Hương Lâm', 8, '05/07/2020']));
        $writer->addRow(Row::fromValues([2, 'HTX Đông Sơn', 'Thôn Quý Linh, xã Thạch Xuân, huyện Thạch Hà', 75, '28/8/2020']));
        $writer->addRow(Row::fromValues(['', '', '', '', '']));
        $writer->addRow(Row::fromValues(['', 'Người lập biểu', '', '', '']));
        $writer->close();

        $source = new LicenseSheetSource(app(Fetcher::class), 'so-x', 'Sở X', 'https://example.test/a.xlsx', 'ha-tinh', [ShopType::PhanBon]);
        $items = iterator_to_array($source->read($file), false);
        unlink($file);

        $this->assertCount(2, $items);
        $this->assertSame('Nguyễn Quang Hạnh', $items[0]->name);
        $this->assertSame('Thôn Phái Đông, xã Tân Hương Lâm, huyện Thạch Hà', $items[0]->address);
        $this->assertSame('05/07/2020', $items[0]->raw['ngay_cap']);
        $this->assertStringStartsWith('THẠCH HÀ#8#', $items[0]->ref);
        // Địa chỉ đã có huyện thì không thêm lần nữa
        $this->assertSame('Thôn Quý Linh, xã Thạch Xuân, huyện Thạch Hà', $items[1]->address);
        $this->assertSame('ha-tinh', $items[1]->province);
        $this->assertSame([ShopType::PhanBon], $items[1]->types);
    }
}
