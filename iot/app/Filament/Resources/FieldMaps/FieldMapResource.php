<?php

namespace App\Filament\Resources\FieldMaps;

use App\Filament\Resources\FieldMaps\Pages\ManageFieldMaps;
use App\Models\FieldMap;
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

class FieldMapResource extends Resource
{
    protected static ?string $model = FieldMap::class;

    protected static string|BackedEnum|null $navigationIcon = Heroicon::OutlinedArrowsRightLeft;

    protected static string|UnitEnum|null $navigationGroup = 'Danh mục';

    protected static ?int $navigationSort = 2;

    protected static ?string $modelLabel = 'ánh xạ trường';

    protected static ?string $pluralModelLabel = 'Ánh xạ trường LoRaWAN';

    public static function form(Schema $schema): Schema
    {
        return $schema
            ->components([
                TextInput::make('profile')
                    ->label('Loại thiết bị')
                    ->helperText('VD: dragino-se01, milesight-em500-smtc. Gán cho thiết bị ở mục Thiết bị.')
                    ->alphaDash()
                    ->required(),
                TextInput::make('field')
                    ->label('Tên trường trong dữ liệu đã giải mã')
                    ->required(),
                Select::make('metric_id')
                    ->label('Chỉ số')
                    ->relationship('metric', 'name')
                    ->searchable()
                    ->preload()
                    ->required(),
                TextInput::make('scale')
                    ->label('Hệ số nhân')
                    ->helperText('Giá trị lưu = giá trị gốc × hệ số (VD đổi mét sang cm: 100)')
                    ->numeric()
                    ->default(1)
                    ->required(),
            ]);
    }

    public static function table(Table $table): Table
    {
        return $table
            ->defaultSort('profile')
            ->columns([
                TextColumn::make('profile')
                    ->label('Loại thiết bị')
                    ->searchable(),
                TextColumn::make('field')
                    ->label('Trường')
                    ->fontFamily('mono'),
                TextColumn::make('metric.name')
                    ->label('Chỉ số'),
                TextColumn::make('scale')
                    ->label('Hệ số'),
            ])
            ->filters([
                SelectFilter::make('profile')
                    ->label('Loại thiết bị')
                    ->options(fn () => FieldMap::query()->distinct()->orderBy('profile')->pluck('profile', 'profile')),
            ])
            ->recordActions([
                EditAction::make(),
                DeleteAction::make(),
            ]);
    }

    public static function getPages(): array
    {
        return [
            'index' => ManageFieldMaps::route('/'),
        ];
    }
}
