<?php

namespace App\Filament\Resources\AdminViewLogs\Pages;

use App\Filament\Resources\AdminViewLogs\AdminViewLogResource;
use Filament\Resources\Pages\ListRecords;

class ListAdminViewLogs extends ListRecords
{
    protected static string $resource = AdminViewLogResource::class;
}
