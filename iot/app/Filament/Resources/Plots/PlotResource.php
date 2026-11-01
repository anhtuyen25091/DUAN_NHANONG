<?php

namespace App\Filament\Resources\Plots;

use App\Enums\PlotType;
use App\Filament\Resources\Plots\Pages\ManagePlots;
use App\Models\Plot;
use BackedEnum;
use Filament\Actions\DeleteAction;
use Filament\Actions\EditAction;
use Filament\Forms\Components\Select;
use Filament\Forms\Components\TextInput;
use Filament\Resources\Resource;
use Filament\Schemas\Schema;
use Filament\Support\Icons\Heroicon;
use Filament\Tables\Columns\TextColumn;
use Filament\Tables\Filters\SelectFilter;
use Filament\Tables\Table;
use UnitEnum;

class PlotResource extends Resource
{
    protected static ?string $model = Plot::class;

    protected static string|BackedEnum|null $navigationIcon = Heroicon::OutlinedMap;

    protected static string|UnitEnum|null $navigationGroup = 'Trang trại';

    protected static ?int $navigationSort = 2;

    protected static ?string $modelLabel = 'lô / ruộng / ao';

    protected static ?string $pluralModelLabel = 'Lô / ruộng / ao';

    protected static ?string $recordTitleAttribute = 'name';

    public static function form(Schema $schema): Schema
    {
        return $schema
            ->components([
                Select::make('farm_id')
                    ->label('Trang trại')
                    ->relationship('farm', 'name')
                    ->searchable()
                    ->preload()
                    ->required(),
                TextInput::make('name')
                    ->label('Tên')
                    ->required(),
                Select::make('type')
                    ->label('Loại')
                    ->options(PlotType::class)
                    ->required(),
                TextInput::make('crop')
                    ->label('Cây trồng / vật nuôi'),
                TextInput::make('area_m2')
                    ->label('Diện tích (m²)')
                    ->integer(),
            ]);
    }

    public static function table(Table $table): Table
    {
        return $table
            ->columns([
                TextColumn::make('name')
                    ->label('Tên')
                    ->description(fn (Plot $record): string => $record->farm->name)
                    ->searchable(),
                TextColumn::make('type')
                    ->label('Loại')
                    ->badge(),
                TextColumn::make('crop')
                    ->label('Cây trồng / vật nuôi')
                    ->placeholder('—'),
                TextColumn::make('devices_count')
                    ->label('Số thiết bị')
                    ->counts('devices'),
            ])
            ->filters([
                SelectFilter::make('type')
                    ->label('Loại')
                    ->options(PlotType::class),
            ])
            ->recordActions([
                EditAction::make(),
                DeleteAction::make(),
            ]);
    }

    public static function getPages(): array
    {
        return [
            'index' => ManagePlots::route('/'),
        ];
    }
}
