<?php

namespace App\Filament\Resources\Farms\Pages;

use App\Filament\Resources\Farms\FarmResource;
use Filament\Actions\CreateAction;
use Filament\Resources\Pages\ManageRecords;

class ManageFarms extends ManageRecords
{
    protected static string $resource = FarmResource::class;

    protected function getHeaderActions(): array
    {
        return [
            CreateAction::make(),
        ];
    }
}
