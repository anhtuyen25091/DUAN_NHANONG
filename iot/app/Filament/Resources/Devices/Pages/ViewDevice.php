<?php

namespace App\Filament\Resources\Devices\Pages;

use App\Filament\Resources\Devices\DeviceResource;
use App\Filament\Widgets\DeviceReadingsChart;
use Filament\Resources\Pages\ViewRecord;

class ViewDevice extends ViewRecord
{
    protected static string $resource = DeviceResource::class;

    protected function getHeaderActions(): array
    {
        return [DeviceResource::rotateKeyAction()];
    }

    protected function getFooterWidgets(): array
    {
        return [DeviceReadingsChart::class];
    }
}
