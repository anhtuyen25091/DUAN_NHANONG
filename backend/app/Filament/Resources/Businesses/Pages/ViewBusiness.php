<?php

namespace App\Filament\Resources\Businesses\Pages;

use App\Documents\TransactionDocuments;
use App\Filament\Concerns\AuditsView;
use App\Filament\Concerns\DownloadsDocument;
use App\Filament\Resources\Businesses\BusinessResource;
use App\Models\Business;
use Carbon\CarbonImmutable;
use Filament\Resources\Pages\ViewRecord;

class ViewBusiness extends ViewRecord
{
    use AuditsView;

    protected static string $resource = BusinessResource::class;

    protected function getHeaderActions(): array
    {
        $b = $this->business();

        return [DownloadsDocument::action(
            fn () => app(TransactionDocuments::class)->businessReport($b, CarbonImmutable::today()->startOfMonth(), CarbonImmutable::today()),
            $b->owner, 'business', 'Báo cáo tháng doanh nghiệp '.$b->name,
        )->label('Tải báo cáo tháng này (PDF)')];
    }

    protected function auditSubject(): array
    {
        $b = $this->business();

        return [$b->owner, 'business', 'Doanh nghiệp '.$b->name];
    }

    private function business(): Business
    {
        /** @var Business $business */
        $business = $this->getRecord();

        return $business;
    }
}
