<?php

namespace App\Documents;

use PhpOffice\PhpWord\Element\Section;
use PhpOffice\PhpWord\IOFactory;
use PhpOffice\PhpWord\PhpWord;
use PhpOffice\PhpWord\Shared\Converter;
use PhpOffice\PhpWord\SimpleType\Jc;
use PhpOffice\PhpWord\SimpleType\TblWidth;
use PhpOffice\PhpWord\Style\Table;

/**
 * Vẽ giấy tờ ra Word (.docx) bằng PHPWord, cùng bố cục với bản PDF để khách sửa được khi cần.
 */
final class DocxRenderer
{
    private const GREEN = '1F7A3A';

    private const MUTED = '52606D';

    public function render(Document $doc): string
    {
        $word = new PhpWord;
        $word->setDefaultFontName('Arial');
        $word->setDefaultFontSize(10.5);
        $word->getDocInfo()->setTitle($doc->title)->setCreator('Nhà Nông');

        $section = $word->addSection([
            'orientation' => $doc->landscape ? 'landscape' : 'portrait',
            'marginTop' => self::cm(1.4), 'marginBottom' => self::cm(1.4),
            'marginLeft' => self::cm(1.2), 'marginRight' => self::cm(1.2),
        ]);
        $tight = ['spaceAfter' => 0, 'spaceBefore' => 0];
        // Bề ngang vùng chữ (A4 trừ lề): mọi bảng dùng độ rộng cố định, vì nhiều trình xem (WPS, bản xem trước trên điện thoại) bỏ qua độ rộng theo %
        $width = self::cm(($doc->landscape ? 29.7 : 21.0) - 2.4);

        // Bên lập phiếu
        $section->addText($doc->issuer['name'], ['bold' => true, 'size' => 13, 'color' => self::GREEN], $tight);
        foreach ($doc->issuer['lines'] as $line) {
            $section->addText($line, ['size' => 9, 'color' => self::MUTED], $tight);
        }
        $section->addText('', [], ['borderBottomSize' => 12, 'borderBottomColor' => self::GREEN, 'spaceAfter' => 120]);

        $section->addText($doc->title, ['bold' => true, 'size' => 16], ['alignment' => Jc::CENTER, 'spaceAfter' => 0]);
        if ($doc->subtitle) {
            $section->addText($doc->subtitle, ['size' => 9.5, 'color' => self::MUTED], ['alignment' => Jc::CENTER, 'spaceAfter' => 160]);
        }

        if ($doc->info) {
            $info = $section->addTable(['width' => $width, 'unit' => TblWidth::TWIP, 'layout' => Table::LAYOUT_FIXED]);
            $labelWidth = self::cm(4.5);
            foreach ($doc->info as [$label, $value]) {
                $info->addRow();
                $info->addCell($labelWidth)->addText($label, ['color' => self::MUTED], $tight);
                $info->addCell($width - $labelWidth)->addText($value, [], $tight);
            }
            $section->addTextBreak();
        }

        foreach ($doc->tables as $table) {
            $this->table($section, $table, $width);
        }

        if ($doc->summary) {
            // Ô trống bên trái đẩy phần cộng tiền sang phải (canh phải cả bảng không phải trình xem nào cũng hiểu)
            $summary = $section->addTable(['width' => $width, 'unit' => TblWidth::TWIP, 'layout' => Table::LAYOUT_FIXED]);
            $valueWidth = self::cm(5);
            $labelWidth = self::cm(6);
            foreach ($doc->summary as $line) {
                $style = ($line[2] ?? false) ? ['bold' => true, 'size' => 11] : [];
                $summary->addRow();
                $summary->addCell($width - $labelWidth - $valueWidth);
                $summary->addCell($labelWidth)->addText($line[0], $style, $tight);
                $summary->addCell($valueWidth)->addText($line[1], $style, ['alignment' => Jc::END] + $tight);
            }
        }

        if ($doc->inWords) {
            $section->addText('Bằng chữ: '.$doc->inWords, ['italic' => true], ['spaceBefore' => 120]);
        }
        foreach ($doc->notes as $note) {
            $section->addText($note, ['size' => 9, 'color' => self::MUTED], $tight);
        }

        if ($doc->signatures) {
            $section->addTextBreak();
            $sign = $section->addTable(['width' => $width, 'unit' => TblWidth::TWIP, 'layout' => Table::LAYOUT_FIXED]);
            $sign->addRow(self::cm(2.8));
            foreach ($doc->signatures as $who) {
                $cell = $sign->addCell(intdiv($width, count($doc->signatures)));
                $cell->addText($who, ['bold' => true], ['alignment' => Jc::CENTER] + $tight);
                $cell->addText('(Ký, ghi rõ họ tên)', ['italic' => true, 'size' => 8.5, 'color' => self::MUTED], ['alignment' => Jc::CENTER] + $tight);
            }
        }

        $file = tempnam(sys_get_temp_dir(), 'docx');
        IOFactory::createWriter($word, 'Word2007')->save($file);
        $content = (string) file_get_contents($file);
        @unlink($file);

        return $content;
    }

    private function table(Section $section, DocumentTable $table, int $width): void
    {
        if ($table->heading) {
            $section->addText($table->heading, ['bold' => true, 'size' => 11], ['spaceBefore' => 160, 'spaceAfter' => 60]);
        }

        $grid = $section->addTable(['borderSize' => 6, 'borderColor' => 'C4CDC6', 'cellMargin' => 60, 'width' => $width, 'unit' => TblWidth::TWIP, 'layout' => Table::LAYOUT_FIXED]);
        $widths = $this->columnWidths($table, $width);
        $tight = ['spaceAfter' => 0, 'spaceBefore' => 0];
        $alignOf = fn (int $i): string => match ($table->align($i)) {
            'right' => Jc::END,
            'center' => Jc::CENTER,
            default => Jc::START,
        };

        $grid->addRow(null, ['tblHeader' => true]);
        foreach ($table->columns as $i => $column) {
            $grid->addCell($widths[$i], ['bgColor' => 'E8F3EC'])->addText($column[0], ['bold' => true, 'size' => 9], ['alignment' => Jc::CENTER] + $tight);
        }

        if ($table->rows === []) {
            $grid->addRow();
            $grid->addCell($width, ['gridSpan' => count($table->columns)])->addText('Không có giao dịch', ['color' => self::MUTED], ['alignment' => Jc::CENTER] + $tight);
        }
        foreach ($table->rows as $row) {
            $grid->addRow();
            foreach ($row as $i => $cell) {
                $grid->addCell($widths[$i])->addText($cell, ['size' => 9.5], ['alignment' => $alignOf($i)] + $tight);
            }
        }
        if ($table->footer) {
            $grid->addRow();
            foreach ($table->footer as $i => $cell) {
                $grid->addCell($widths[$i], ['bgColor' => 'F4F6F4'])->addText($cell, ['bold' => true, 'size' => 9.5], ['alignment' => $alignOf($i)] + $tight);
            }
        }
        $section->addTextBreak();
    }

    /**
     * Chia bề ngang cho các cột theo độ dài chữ dài nhất mỗi cột (giới hạn 4–40 ký tự để cột tên hàng rộng hơn cột số).
     *
     * @return list<int>
     */
    private function columnWidths(DocumentTable $table, int $width): array
    {
        $weights = [];
        foreach ($table->columns as $i => $column) {
            $longest = mb_strlen($column[0]);
            foreach ([...$table->rows, $table->footer ?? []] as $row) {
                $longest = max($longest, mb_strlen($row[$i] ?? ''));
            }
            $weights[] = min(40, max(4, $longest));
        }
        $total = array_sum($weights);

        return array_map(fn (int $w): int => intdiv($width * $w, $total), $weights);
    }

    /** cm → twip, số nguyên (OOXML không nhận độ rộng lẻ, có trình xem bỏ qua cả bảng) */
    private static function cm(float $cm): int
    {
        return (int) round(Converter::cmToTwip($cm));
    }
}
