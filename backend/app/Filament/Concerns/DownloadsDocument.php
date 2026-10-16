<?php

namespace App\Filament\Concerns;

use App\Documents\Document;
use App\Documents\PdfRenderer;
use App\Models\User;
use App\Support\AdminAudit;
use Filament\Actions\Action;
use Filament\Support\Icons\Heroicon;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * Nút "Tải PDF" trên trang xem chi tiết của admin (cũng ghi nhật ký: tải giấy tờ của ai).
 */
final class DownloadsDocument
{
    /**
     * @param  callable(): Document  $document
     */
    public static function action(callable $document, ?User $subject, string $area, string $label): Action
    {
        return Action::make('downloadPdf')
            ->label('Tải PDF')
            ->icon(Heroicon::OutlinedArrowDownTray)
            ->action(function () use ($document, $subject, $area, $label): StreamedResponse {
                AdminAudit::viewed($subject, $area, $label, 'download');
                $doc = $document();
                $pdf = app(PdfRenderer::class)->render($doc);

                return response()->streamDownload(fn () => print ($pdf), $doc->filename.'.pdf', ['Content-Type' => 'application/pdf']);
            });
    }
}
