<?php

namespace App\Filament\Resources\Plots\Pages;

use App\Filament\Resources\Plots\PlotResource;
use Filament\Actions\CreateAction;
use Filament\Resources\Pages\ManageRecords;

class ManagePlots extends ManageRecords
{
    protected static string $resource = PlotResource::class;

    protected function getHeaderActions(): array
    {
        return [
            CreateAction::make(),
        ];
    }
}
