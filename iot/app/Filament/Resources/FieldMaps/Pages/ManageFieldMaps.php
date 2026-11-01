<?php

namespace App\Filament\Resources\FieldMaps\Pages;

use App\Filament\Resources\FieldMaps\FieldMapResource;
use Filament\Actions\CreateAction;
use Filament\Resources\Pages\ManageRecords;

class ManageFieldMaps extends ManageRecords
{
    protected static string $resource = FieldMapResource::class;

    protected function getHeaderActions(): array
    {
        return [
            CreateAction::make(),
        ];
    }
}
