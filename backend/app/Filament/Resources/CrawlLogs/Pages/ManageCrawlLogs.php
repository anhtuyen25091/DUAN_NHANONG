<?php

namespace App\Filament\Resources\CrawlLogs\Pages;

use App\Filament\Resources\CrawlLogs\CrawlLogResource;
use Filament\Actions\CreateAction;
use Filament\Resources\Pages\ManageRecords;

class ManageCrawlLogs extends ManageRecords
{
    protected static string $resource = CrawlLogResource::class;

    protected function getHeaderActions(): array
    {
        return [
            CreateAction::make(),
        ];
    }
}
