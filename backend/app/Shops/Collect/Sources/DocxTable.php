<?php

namespace App\Shops\Collect\Sources;

use PhpOffice\PhpWord\Element\AbstractElement;
use PhpOffice\PhpWord\Element\Table;
use PhpOffice\PhpWord\IOFactory;

/**
 * Các dòng của mọi bảng trong file Word (.docx), mỗi dòng là mảng chữ của từng ô.
 */
final class DocxTable
{
    /**
     * @return list<list<string>>
     */
    public static function rows(string $docxContent): array
    {
        $file = tempnam(sys_get_temp_dir(), 'docx').'.docx';
        file_put_contents($file, $docxContent);

        try {
            $document = IOFactory::load($file);
        } finally {
            @unlink($file);
        }

        $rows = [];
        foreach ($document->getSections() as $section) {
            foreach ($section->getElements() as $element) {
                if (! $element instanceof Table) {
                    continue;
                }
                foreach ($element->getRows() as $row) {
                    $rows[] = array_map(
                        fn ($cell): string => trim((string) preg_replace('/\s+/u', ' ', html_entity_decode(self::text($cell)))),
                        $row->getCells(),
                    );
                }
            }
        }

        return $rows;
    }

    private static function text(AbstractElement $element): string
    {
        if (method_exists($element, 'getText') && is_string($element->getText())) {
            return $element->getText();
        }
        $parts = [];
        if (method_exists($element, 'getElements')) {
            foreach ($element->getElements() as $child) {
                $parts[] = self::text($child);
            }
        }

        return implode(' ', $parts);
    }
}
