<?php

namespace App\Filament\Resources\Thresholds\Pages;

use App\Filament\Resources\Thresholds\ThresholdResource;
use Filament\Actions\CreateAction;
use Filament\Resources\Pages\ManageRecords;

class ManageThresholds extends ManageRecords
{
    protected static string $resource = ThresholdResource::class;

    protected function getHeaderActions(): array
    {
        return [
            CreateAction::make(),
        ];
    }
}
