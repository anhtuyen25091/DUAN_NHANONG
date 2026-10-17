<?php

namespace Tests\Feature;

use App\Enums\ShopType;
use App\Shops\Collect\Sources\LicenseHtmlSource;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class LicenseHtmlSourceTest extends TestCase
{
    private function page(array $rows): string
    {
        $html = '<table><tr><th>STT</th><th>Tên tổ chức, cá nhân</th><th>Bản</th><th>Xã</th><th>Huyện</th><th>Tỉnh</th><th>Điện thoại</th><th>Số Giấy chứng nhận buôn bán</th></tr>';
        foreach ($rows as $row) {
            $html .= '<tr><td>'.implode('</td><td>', $row).'</td></tr>';
        }

        return '<html><body><table><tr><td>menu</td></tr></table>'.$html.'</table></body></html>';
    }

    public function test_reads_pages_until_empty(): void
    {
        config(['crawler.delay_ms' => 0]);
        Http::fake([
            'example.test/robots.txt' => Http::response('', 404),
            'example.test/list?page=1' => Http::response($this->page([
                ['1', 'Lò Văn Văn', 'Bản Hua Tạt', 'Vân Hồ', '', 'Tỉnh Sơn La', '0336 892 094', '53/2025/GCN-BBPB'],
                ['2', 'Quàng Văn Thanh', 'Tiểu khu 3', 'TT Nông Trường', 'Mộc Châu', 'Sơn La', '', '12/2024/GCN'],
            ])),
            'example.test/list?page=2' => Http::response($this->page([
                ['3', 'Lèo Thị Kim Hoan', 'Bản Ái', 'xã Chiềng Xôm', 'Thành phố Sơn La', 'Tỉnh Sơn La', '0376 380 568', '77/GCN-BBP'],
            ])),
            'example.test/list?page=3' => Http::response($this->page([])),
        ]);

        $source = LicenseHtmlSource::fromConfig('so-x', ['label' => 'x', 'url' => 'https://example.test/list?page={page}', 'province' => 'son-la', 'types' => ['phan_bon']]);
        $items = iterator_to_array($source->collect(), false);

        $this->assertCount(3, $items);
        $this->assertSame('Bản Hua Tạt, xã Vân Hồ', $items[0]->address);
        $this->assertSame('0336 892 094', $items[0]->phone);
        $this->assertSame('Tiểu khu 3, TT Nông Trường, huyện Mộc Châu', $items[1]->address);
        $this->assertSame('Bản Ái, xã Chiềng Xôm, Thành phố Sơn La', $items[2]->address);
        $this->assertSame([ShopType::PhanBon], $items[2]->types);
        $this->assertStringStartsWith('r#77/GCN-BBP#', $items[2]->ref);
    }
}
