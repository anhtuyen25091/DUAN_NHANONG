<?php

namespace App\Filament\Resources\UnmatchedNames\Pages;

use App\Filament\Resources\UnmatchedNames\UnmatchedNameResource;
use Filament\Actions\CreateAction;
use Filament\Resources\Pages\ManageRecords;

class ManageUnmatchedNames extends ManageRecords
{
    protected static string $resource = UnmatchedNameResource::class;

    protected function getHeaderActions(): array
    {
        return [
            CreateAction::make(),
        ];
    }
}
