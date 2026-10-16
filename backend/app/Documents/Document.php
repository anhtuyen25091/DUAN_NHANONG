<?php

namespace App\Documents;

/**
 * Nội dung 1 giấy tờ in ra (phiếu, bảng kê, báo cáo), không phụ thuộc định dạng:
 * PdfRenderer và DocxRenderer cùng vẽ từ đây nên PDF và Word giống nhau.
 */
final class Document
{
    /**
     * @param  array{name: string, lines: list<string>}  $issuer  bên lập phiếu (điểm mua): tên + SĐT / địa chỉ
     * @param  list<array{0: string, 1: string}>  $info  thông tin khách / đơn: [nhãn, giá trị]
     * @param  list<DocumentTable>  $tables
     * @param  list<array{0: string, 1: string, 2?: bool}>  $summary  [nhãn, giá trị, in đậm]
     * @param  list<string>  $notes
     * @param  list<string>  $signatures  vd ["Người bán", "Người mua"]; rỗng = không có chỗ ký
     */
    public function __construct(
        public string $title,
        public ?string $subtitle,
        public array $issuer,
        public array $info,
        public array $tables,
        public array $summary = [],
        public ?string $inWords = null,
        public array $notes = [],
        public array $signatures = [],
        public string $filename = 'giay-to',
        public bool $landscape = false,
    ) {}
}
