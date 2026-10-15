<?php

namespace App\Filament\Resources\Shops\Pages;

use App\Filament\Resources\Shops\ShopResource;
use App\Shops\OsmShopImporter;
use Filament\Actions\Action;
use Filament\Actions\CreateAction;
use Filament\Notifications\Notification;
use Filament\Resources\Pages\ManageRecords;
use Filament\Support\Icons\Heroicon;
use Throwable;

class ManageShops extends ManageRecords
{
    protected static string $resource = ShopResource::class;

    protected function getHeaderActions(): array
    {
        return [
            Action::make('importOsm')
                ->label('Nhập từ OpenStreetMap')
                ->icon(Heroicon::OutlinedArrowDownTray)
                ->color('gray')
                ->requiresConfirmation()
                ->modalDescription('Tải các điểm bán phân bón, thuốc BVTV, thu mua nông sản ở Việt Nam trên OpenStreetMap. Mất khoảng 1 phút.')
                ->action(function (OsmShopImporter $importer): void {
                    try {
                        $counts = $importer->run();
                        Notification::make()->success()
                            ->title("Thêm {$counts['imported']}, cập nhật {$counts['updated']}, bỏ qua {$counts['skipped']}.")
                            ->send();
                    } catch (Throwable $e) {
                        report($e);
                        Notification::make()->danger()->title('Không nhập được')->body($e->getMessage())->send();
                    }
                }),
            CreateAction::make(),
        ];
    }
}
