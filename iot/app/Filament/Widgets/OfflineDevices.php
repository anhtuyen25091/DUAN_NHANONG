<?php

namespace App\Filament\Widgets;

use App\Filament\Resources\Devices\DeviceResource;
use App\Models\Device;
use Filament\Tables\Columns\TextColumn;
use Filament\Tables\Table;
use Filament\Widgets\TableWidget;

/**
 * Thiết bị im lặng quá lâu: hết pin, mất sóng, hoặc ở ruộng không mạng chưa có ai mang điện thoại ra lấy dữ liệu.
 */
class OfflineDevices extends TableWidget
{
    protected static ?int $sort = 2;

    protected int|string|array $columnSpan = 'full';

    protected static ?string $heading = 'Thiết bị mất kết nối';

    public function table(Table $table): Table
    {
        return $table
            ->query(fn () => Device::query()
                ->with(['farm', 'plot'])
                ->where(fn ($query) => $query->whereNull('last_seen_at')->orWhere('last_seen_at', '<', now()->subHours(config('iot.offline_after_hours')))))
            ->defaultSort('last_seen_at')
            ->columns([
                TextColumn::make('name')->label('Thiết bị')->description(fn (Device $record): string => $record->uid),
                TextColumn::make('farm.name')->label('Trang trại')->description(fn (Device $record): ?string => $record->plot?->name),
                TextColumn::make('kind')->label('Kết nối')->badge(),
                TextColumn::make('last_seen_at')->label('Gửi lần cuối')->since()->placeholder('Chưa bao giờ'),
                TextColumn::make('battery')->label('Pin')->suffix('%')->placeholder('—'),
            ])
            ->recordUrl(fn (Device $record): string => DeviceResource::getUrl('view', ['record' => $record]))
            ->emptyStateHeading('Mọi thiết bị đều đang gửi dữ liệu');
    }
}
