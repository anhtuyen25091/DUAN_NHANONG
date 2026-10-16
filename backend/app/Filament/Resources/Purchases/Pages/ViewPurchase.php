<?php

namespace App\Filament\Resources\Purchases\Pages;

use App\Documents\TransactionDocuments;
use App\Filament\Concerns\AuditsView;
use App\Filament\Concerns\DownloadsDocument;
use App\Filament\Resources\Purchases\PurchaseResource;
use App\Models\Purchase;
use Filament\Resources\Pages\ViewRecord;

class ViewPurchase extends ViewRecord
{
    use AuditsView;

    protected static string $resource = PurchaseResource::class;

    public function getTitle(): string
    {
        return 'Phiếu '.$this->purchase()->code();
    }

    protected function getHeaderActions(): array
    {
        $p = $this->purchase();

        return [DownloadsDocument::action(fn () => app(TransactionDocuments::class)->purchaseReceipt($p->load('customer', 'user.buyer')), $p->user, 'purchase', 'Phiếu '.$p->code())];
    }

    protected function auditSubject(): array
    {
        $p = $this->purchase();

        return [$p->user, 'purchase', 'Phiếu '.$p->code().' ('.$p->customer_name.')'];
    }

    private function purchase(): Purchase
    {
        /** @var Purchase $purchase */
        $purchase = $this->getRecord();

        return $purchase;
    }
}
