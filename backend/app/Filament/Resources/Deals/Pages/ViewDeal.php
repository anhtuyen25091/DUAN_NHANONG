<?php

namespace App\Filament\Resources\Deals\Pages;

use App\Documents\TransactionDocuments;
use App\Filament\Concerns\AuditsView;
use App\Filament\Concerns\DownloadsDocument;
use App\Filament\Resources\Deals\DealResource;
use App\Models\Deal;
use Filament\Resources\Pages\ViewRecord;

class ViewDeal extends ViewRecord
{
    use AuditsView;

    protected static string $resource = DealResource::class;

    public function getTitle(): string
    {
        return 'Đơn '.$this->deal()->code.' – '.$this->deal()->title;
    }

    protected function getHeaderActions(): array
    {
        $deal = $this->deal();
        // Quyết toán in theo phía người tạo đơn
        $viewer = $deal->creator ?? $deal->buyer ?? $deal->seller;

        return [DownloadsDocument::action(
            fn () => app(TransactionDocuments::class)->dealStatement($deal->load('entries', 'seller', 'buyer', 'product'), $viewer),
            $viewer, 'deal', 'Quyết toán đơn '.$deal->code,
        )];
    }

    protected function auditSubject(): array
    {
        $deal = $this->deal();

        return [$deal->creator, 'deal', 'Đơn '.$deal->code.' – '.$deal->title];
    }

    private function deal(): Deal
    {
        /** @var Deal $deal */
        $deal = $this->getRecord();

        return $deal;
    }
}
