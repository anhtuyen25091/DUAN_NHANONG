<?php

namespace App\Documents;

/**
 * 1 bảng trong giấy tờ. Cột "right" để canh số tiền / kg sang phải.
 */
final class DocumentTable
{
    /**
     * @param  list<array{0: string, 1?: 'left'|'right'|'center'}>  $columns  [tiêu đề, canh lề]
     * @param  list<list<string>>  $rows
     * @param  list<string>|null  $footer  dòng cộng cuối bảng (cùng số cột)
     */
    public function __construct(
        public array $columns,
        public array $rows,
        public ?string $heading = null,
        public ?array $footer = null,
    ) {}

    public function align(int $column): string
    {
        return $this->columns[$column][1] ?? 'left';
    }
}
