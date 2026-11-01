<?php

namespace App\Filament\Resources\Farms;

use App\Filament\Resources\Farms\Pages\ManageFarms;
use App\Models\Farm;
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

class FarmResource extends Resource
{
    protected static ?string $model = Farm::class;

    protected static string|BackedEnum|null $navigationIcon = Heroicon::OutlinedHomeModern;

    protected static string|UnitEnum|null $navigationGroup = 'Trang trại';

    protected static ?int $navigationSort = 1;

    protected static ?string $modelLabel = 'trang trại';

    protected static ?string $pluralModelLabel = 'Trang trại';

    protected static ?string $recordTitleAttribute = 'name';

    public static function form(Schema $schema): Schema
    {
        return $schema
            ->components([
                Select::make('user_id')
                    ->label('Chủ trang trại')
                    ->relationship('user', 'email')
                    ->searchable()
                    ->required(),
                TextInput::make('name')
                    ->label('Tên')
                    ->required(),
                TextInput::make('province')
                    ->label('Tỉnh'),
                TextInput::make('lat')
                    ->label('Vĩ độ')
                    ->numeric(),
                TextInput::make('lng')
                    ->label('Kinh độ')
                    ->numeric(),
            ]);
    }

    public static function table(Table $table): Table
    {
        return $table
            ->defaultSort('name')
            ->columns([
                TextColumn::make('name')
                    ->label('Tên')
                    ->searchable(),
                TextColumn::make('user.email')
                    ->label('Chủ')
                    ->searchable(),
                TextColumn::make('province')
                    ->label('Tỉnh')
                    ->placeholder('—'),
                TextColumn::make('plots_count')
                    ->label('Số lô')
                    ->counts('plots'),
                TextColumn::make('devices_count')
                    ->label('Số thiết bị')
                    ->counts('devices'),
            ])
            ->recordActions([
                EditAction::make(),
                DeleteAction::make(),
            ]);
    }

    public static function getPages(): array
    {
        return [
            'index' => ManageFarms::route('/'),
        ];
    }
}
