<?php

namespace App\Filament\Resources\PriceSources\Pages;

use App\Filament\Resources\PriceSources\PriceSourceResource;
use Filament\Actions\CreateAction;
use Filament\Resources\Pages\ManageRecords;

class ManagePriceSources extends ManageRecords
{
    protected static string $resource = PriceSourceResource::class;

    protected function getHeaderActions(): array
    {
        return [
            CreateAction::make(),
        ];
    }
}
