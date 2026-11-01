<?php

namespace App\Filament\Resources\Actuators\Pages;

use App\Filament\Resources\Actuators\ActuatorResource;
use Filament\Actions\CreateAction;
use Filament\Resources\Pages\ManageRecords;

class ManageActuators extends ManageRecords
{
    protected static string $resource = ActuatorResource::class;

    protected function getHeaderActions(): array
    {
        return [
            CreateAction::make(),
        ];
    }
}
