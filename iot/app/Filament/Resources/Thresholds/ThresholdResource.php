<?php

namespace App\Filament\Resources\Thresholds;

use App\Filament\Resources\Thresholds\Pages\ManageThresholds;
use App\Models\Threshold;
use BackedEnum;
use Filament\Actions\DeleteAction;
use Filament\Actions\EditAction;
use Filament\Forms\Components\Select;
use Filament\Forms\Components\TextInput;
use Filament\Resources\Resource;
use Filament\Schemas\Schema;
use Filament\Support\Icons\Heroicon;
use Filament\Tables\Columns\TextColumn;
use Filament\Tables\Table;
use UnitEnum;

class ThresholdResource extends Resource
{
    protected static ?string $model = Threshold::class;

    protected static string|BackedEnum|null $navigationIcon = Heroicon::OutlinedAdjustmentsHorizontal;

    protected static string|UnitEnum|null $navigationGroup = 'Cảnh báo';

    protected static ?int $navigationSort = 2;

    protected static ?string $modelLabel = 'ngưỡng';

    protected static ?string $pluralModelLabel = 'Ngưỡng cảnh báo';

    public static function form(Schema $schema): Schema
    {
        return $schema
            ->components([
                Select::make('plot_id')
                    ->label('Lô / ruộng / ao')
                    ->relationship('plot', 'name')
                    ->searchable()
                    ->preload()
                    ->required(),
                Select::make('metric_id')
                    ->label('Chỉ số')
                    ->relationship('metric', 'name')
                    ->searchable()
                    ->preload()
                    ->required(),
                TextInput::make('min')
                    ->label('Thấp nhất')
                    ->numeric()
                    ->requiredWithout('max'),
                TextInput::make('max')
                    ->label('Cao nhất')
                    ->numeric()
                    ->requiredWithout('min'),
                TextInput::make('note')
                    ->label('Ghi chú')
                    ->columnSpanFull(),
            ]);
    }

    public static function table(Table $table): Table
    {
        return $table
            ->columns([
                TextColumn::make('plot.name')
                    ->label('Lô')
                    ->description(fn (Threshold $record): string => $record->plot->farm->name)
                    ->searchable(),
                TextColumn::make('metric.name')
                    ->label('Chỉ số'),
                TextColumn::make('min')
                    ->label('Thấp nhất')
                    ->placeholder('—'),
                TextColumn::make('max')
                    ->label('Cao nhất')
                    ->placeholder('—'),
                TextColumn::make('note')
                    ->label('Ghi chú')
                    ->placeholder('—')
                    ->limit(40),
            ])
            ->recordActions([
                EditAction::make(),
                DeleteAction::make(),
            ]);
    }

    public static function getPages(): array
    {
        return [
            'index' => ManageThresholds::route('/'),
        ];
    }
}
