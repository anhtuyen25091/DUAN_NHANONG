<?php

namespace App\Filament\Resources\ActuatorCommands;

use App\Enums\CommandStatus;
use App\Filament\Resources\ActuatorCommands\Pages\ManageActuatorCommands;
use App\Models\ActuatorCommand;
use BackedEnum;
use Filament\Resources\Resource;
use Filament\Support\Icons\Heroicon;
use Filament\Tables\Columns\TextColumn;
use Filament\Tables\Filters\SelectFilter;
use Filament\Tables\Table;
use UnitEnum;

/**
 * Nhật ký lệnh bật / tắt (chỉ xem)
 */
class ActuatorCommandResource extends Resource
{
    protected static ?string $model = ActuatorCommand::class;

    protected static string|BackedEnum|null $navigationIcon = Heroicon::OutlinedQueueList;

    protected static string|UnitEnum|null $navigationGroup = 'Điều khiển';

    protected static ?int $navigationSort = 3;

    protected static ?string $modelLabel = 'lệnh';

    protected static ?string $pluralModelLabel = 'Nhật ký lệnh';

    public static function canCreate(): bool
    {
        return false;
    }

    public static function table(Table $table): Table
    {
        return $table
            ->defaultSort('id', 'desc')
            ->columns([
                TextColumn::make('created_at')->label('Lúc')->dateTime('H:i:s d/m'),
                TextColumn::make('actuator.name')->label('Thiết bị'),
                TextColumn::make('action')
                    ->label('Lệnh')
                    ->state(fn (ActuatorCommand $record): string => $record->action === ActuatorCommand::ON ? "Bật {$record->minutes} phút" : 'Tắt'),
                TextColumn::make('source')
                    ->label('Ai')
                    ->state(fn (ActuatorCommand $record): string => $record->source === ActuatorCommand::SOURCE_RULE ? 'Luật tự động' : ($record->user?->name ?? 'Bấm tay'))
                    ->description(fn (ActuatorCommand $record): ?string => $record->reason),
                TextColumn::make('status')->label('Trạng thái')->badge(),
                TextColumn::make('message')->label('Ghi chú')->placeholder('—')->limit(40),
            ])
            ->filters([
                SelectFilter::make('status')->label('Trạng thái')->options(CommandStatus::class),
            ]);
    }

    public static function getPages(): array
    {
        return [
            'index' => ManageActuatorCommands::route('/'),
        ];
    }
}
