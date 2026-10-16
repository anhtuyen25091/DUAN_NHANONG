<?php

namespace App\Filament\Resources\LedgerAccounts\Pages;

use App\Filament\Concerns\AuditsView;
use App\Filament\Resources\LedgerAccounts\LedgerAccountResource;
use Filament\Resources\Pages\ViewRecord;

class ViewLedgerAccount extends ViewRecord
{
    use AuditsView;

    protected static string $resource = LedgerAccountResource::class;

    public function getTitle(): string
    {
        return 'Sổ thu chi: '.$this->getRecord()->name;
    }

    protected function auditSubject(): array
    {
        return [$this->getRecord(), 'ledger', 'Sổ thu chi của '.$this->getRecord()->name];
    }
}
