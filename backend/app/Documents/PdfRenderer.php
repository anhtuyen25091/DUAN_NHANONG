<?php

namespace App\Documents;

use Barryvdh\DomPDF\Facade\Pdf;

/**
 * Vẽ giấy tờ ra PDF bằng dompdf (font DejaVu Sans, có đủ dấu tiếng Việt).
 */
final class PdfRenderer
{
    public function render(Document $doc): string
    {
        return Pdf::loadView('documents.pdf', ['doc' => $doc])
            ->setPaper('a4', $doc->landscape ? 'landscape' : 'portrait')
            ->setOption(['defaultFont' => 'DejaVu Sans', 'isRemoteEnabled' => false, 'isFontSubsettingEnabled' => true])
            ->output();
    }
}
