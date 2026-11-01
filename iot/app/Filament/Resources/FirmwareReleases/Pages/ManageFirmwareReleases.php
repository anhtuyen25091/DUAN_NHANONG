<?php

namespace App\Filament\Resources\FirmwareReleases\Pages;

use App\Filament\Resources\FirmwareReleases\FirmwareReleaseResource;
use Filament\Actions\CreateAction;
use Filament\Resources\Pages\ManageRecords;

class ManageFirmwareReleases extends ManageRecords
{
    protected static string $resource = FirmwareReleaseResource::class;

    protected function getHeaderActions(): array
    {
        return [
            CreateAction::make(),
        ];
    }
}
