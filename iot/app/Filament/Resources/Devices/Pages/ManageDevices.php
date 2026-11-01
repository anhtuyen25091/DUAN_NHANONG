<?php

namespace App\Filament\Resources\Devices\Pages;

use App\Filament\Resources\Devices\DeviceResource;
use App\Models\Device;
use Filament\Actions\CreateAction;
use Filament\Resources\Pages\ManageRecords;

class ManageDevices extends ManageRecords
{
    protected static string $resource = DeviceResource::class;

    protected function getHeaderActions(): array
    {
        return [
            CreateAction::make()
                ->after(fn (Device $record) => DeviceResource::showKey($record, $record->rotateKey())),
        ];
    }
}
