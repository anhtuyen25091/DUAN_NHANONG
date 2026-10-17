<?php

namespace App\Filament\Resources\ShopCandidates\Pages;

use App\Filament\Resources\ShopCandidates\ShopCandidateResource;
use Filament\Resources\Pages\ManageRecords;

class ManageShopCandidates extends ManageRecords
{
    protected static string $resource = ShopCandidateResource::class;

    protected function getHeaderActions(): array
    {
        return [];
    }
}
