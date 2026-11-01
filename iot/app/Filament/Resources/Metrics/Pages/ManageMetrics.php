<?php

namespace App\Filament\Resources\Metrics\Pages;

use App\Filament\Resources\Metrics\MetricResource;
use Filament\Actions\CreateAction;
use Filament\Resources\Pages\ManageRecords;

class ManageMetrics extends ManageRecords
{
    protected static string $resource = MetricResource::class;

    protected function getHeaderActions(): array
    {
        return [
            CreateAction::make(),
        ];
    }
}
