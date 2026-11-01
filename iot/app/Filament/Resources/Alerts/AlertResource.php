<?php

namespace App\Filament\Resources\Alerts;

use App\Filament\Resources\Alerts\Pages\ManageAlerts;
use App\Models\Alert;
use BackedEnum;
use Filament\Actions\Action;
use Filament\Resources\Resource;
use Filament\Support\Icons\Heroicon;
use Filament\Tables\Columns\TextColumn;
use Filament\Tables\Filters\TernaryFilter;
use Filament\Tables\Table;
use Illuminate\Database\Eloquent\Builder;
use UnitEnum;

class AlertResource extends Resource
{
    protected static ?string $model = Alert::class;

    protected static string|BackedEnum|null $navigationIcon = Heroicon::OutlinedBellAlert;

    protected static string|UnitEnum|null $navigationGroup = 'Cảnh báo';

    protected static ?int $navigationSort = 1;

    protected static ?string $modelLabel = 'cảnh báo';

    protected static ?string $pluralModelLabel = 'Cảnh báo';

    public static function getNavigationBadge(): ?string
    {
        $open = Alert::query()->open()->count();

        return $open > 0 ? (string) $open : null;
    }

    public static function getNavigationBadgeColor(): ?string
    {
        return 'danger';
    }

    public static function table(Table $table): Table
    {
        return $table
            ->defaultSort('measured_at', 'desc')
            ->modifyQueryUsing(fn (Builder $query) => $query->with(['threshold.plot.farm', 'threshold.metric', 'device']))
            ->columns([
                TextColumn::make('threshold.plot.name')
                    ->label('Lô')
                    ->description(fn (Alert $record): string => $record->threshold->plot->farm->name),
                TextColumn::make('threshold.metric.name')
                    ->label('Chỉ số'),
                TextColumn::make('direction')
                    ->label('Tình trạng')
                    ->badge()
                    ->color('danger'),
                TextColumn::make('value')
                    ->label('Số đo')
                    ->description(fn (Alert $record): string => 'Ngưỡng '.($record->threshold->min ?? '…').' – '.($record->threshold->max ?? '…')),
                TextColumn::make('device.name')
                    ->label('Thiết bị'),
                TextColumn::make('measured_at')
                    ->label('Lúc đo')
                    ->dateTime('d/m/Y H:i')
                    ->sortable(),
                TextColumn::make('resolved_at')
                    ->label('Đã xử lý')
                    ->dateTime('d/m/Y H:i')
                    ->placeholder('Đang mở'),
            ])
            ->filters([
                TernaryFilter::make('open')
                    ->label('Trạng thái')
                    ->trueLabel('Đang mở')
                    ->falseLabel('Đã xử lý')
                    ->queries(
                        true: fn (Builder $query) => $query->whereNull('resolved_at'),
                        false: fn (Builder $query) => $query->whereNotNull('resolved_at'),
                    ),
            ])
            ->recordActions([
                Action::make('resolve')
                    ->label('Đã xử lý')
                    ->icon(Heroicon::OutlinedCheck)
                    ->visible(fn (Alert $record): bool => $record->resolved_at === null)
                    ->action(fn (Alert $record) => $record->update(['resolved_at' => now()])),
            ]);
    }

    public static function getPages(): array
    {
        return [
            'index' => ManageAlerts::route('/'),
        ];
    }
}
