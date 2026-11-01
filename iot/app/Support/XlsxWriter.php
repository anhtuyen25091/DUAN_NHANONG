<?php

namespace App\Support;

use RuntimeException;
use XMLWriter;
use ZipArchive;

/**
 * Ghi file Excel (.xlsx) 1 trang tính, không cần thư viện ngoài (ZipArchive + XMLWriter có sẵn trong PHP).
 * Số ghi dạng số thật nên Excel máy tiếng Việt (dấu thập phân là ",") vẫn đọc đúng; CSV thì hay bị dồn 1 cột.
 * Dòng ghi thẳng ra file tạm nên xuất vài trăm nghìn dòng không tốn bộ nhớ.
 */
final class XlsxWriter
{
    private XMLWriter $sheet;

    private string $sheetPath;

    private int $row = 0;

    /**
     * @param  list<int>  $widths  độ rộng cột (số ký tự)
     */
    public function __construct(private readonly string $sheetName, array $widths = [])
    {
        $this->sheetPath = tempnam(sys_get_temp_dir(), 'xlsx-sheet');
        $this->sheet = new XMLWriter;
        $this->sheet->openUri($this->sheetPath);
        $this->sheet->startDocument('1.0', 'UTF-8');
        $this->sheet->startElement('worksheet');
        $this->sheet->writeAttribute('xmlns', 'http://schemas.openxmlformats.org/spreadsheetml/2006/main');
        // Cố định dòng tiêu đề khi cuộn
        $this->sheet->writeRaw('<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>');
        if ($widths !== []) {
            $this->sheet->startElement('cols');
            foreach ($widths as $i => $width) {
                $this->sheet->writeRaw(sprintf('<col min="%d" max="%d" width="%d" customWidth="1"/>', $i + 1, $i + 1, $width));
            }
            $this->sheet->endElement();
        }
        $this->sheet->startElement('sheetData');
    }

    /**
     * @param  list<string|int|float|null>  $cells
     * @param  bool  $bold  dòng tiêu đề
     */
    public function addRow(array $cells, bool $bold = false): void
    {
        $this->row++;
        $this->sheet->startElement('row');
        $this->sheet->writeAttribute('r', (string) $this->row);
        foreach (array_values($cells) as $i => $value) {
            if ($value === null || $value === '') {
                continue;
            }
            $this->sheet->startElement('c');
            $this->sheet->writeAttribute('r', self::column($i).$this->row);
            if ($bold) {
                $this->sheet->writeAttribute('s', '1');
            }
            if (is_int($value) || is_float($value)) {
                $this->sheet->writeElement('v', (string) $value);
            } else {
                $this->sheet->writeAttribute('t', 'inlineStr');
                $this->sheet->startElement('is');
                $this->sheet->writeElement('t', $value);
                $this->sheet->endElement();
            }
            $this->sheet->endElement();
        }
        $this->sheet->endElement();
        if ($this->row % 1000 === 0) {
            $this->sheet->flush();
        }
    }

    /**
     * Đóng gói thành file .xlsx, trả đường dẫn file tạm (người gọi tự xóa sau khi gửi).
     */
    public function finish(): string
    {
        $this->sheet->endElement(); // sheetData
        $this->sheet->endElement(); // worksheet
        $this->sheet->endDocument();
        $this->sheet->flush();

        $path = tempnam(sys_get_temp_dir(), 'xlsx').'.xlsx';
        $zip = new ZipArchive;
        if ($zip->open($path, ZipArchive::CREATE | ZipArchive::OVERWRITE) !== true) {
            throw new RuntimeException('Không tạo được file Excel.');
        }
        $name = htmlspecialchars(mb_substr($this->sheetName, 0, 31), ENT_XML1);
        $zip->addFromString('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>');
        $zip->addFromString('_rels/.rels', '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>');
        $zip->addFromString('xl/workbook.xml', '<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="'.$name.'" sheetId="1" r:id="rId1"/></sheets></workbook>');
        $zip->addFromString('xl/_rels/workbook.xml.rels', '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>');
        // Kiểu 0: thường, kiểu 1: chữ đậm (dòng tiêu đề)
        $zip->addFromString('xl/styles.xml', '<?xml version="1.0" encoding="UTF-8"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>');
        $zip->addFile($this->sheetPath, 'xl/worksheets/sheet1.xml');
        $zip->close();
        @unlink($this->sheetPath);

        return $path;
    }

    /** 0 → A, 25 → Z, 26 → AA */
    private static function column(int $index): string
    {
        $name = '';
        for ($index++; $index > 0; $index = intdiv($index - 1, 26)) {
            $name = chr(65 + ($index - 1) % 26).$name;
        }

        return $name;
    }
}
