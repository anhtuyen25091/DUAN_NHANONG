<?php

namespace App\Filament\Resources\Regions;

use App\Filament\Resources\Regions\Pages\ManageRegions;
use App\Models\Region;
use BackedEnum;
use Filament\Actions\DeleteAction;
use Filament\Actions\EditAction;
use Filament\Forms\Components\TagsInput;
use Filament\Forms\Components\TextInput;
use Filament\Resources\Resource;
use Filament\Schemas\Schema;
use Filament\Support\Icons\Heroicon;
use Filament\Tables\Columns\TextColumn;
use Filament\Tables\Table;
use UnitEnum;

class RegionResource extends Resource
{
    protected static ?string $model = Region::class;

    protected static string|BackedEnum|null $navigationIcon = Heroicon::OutlinedMapPin;

    protected static string|UnitEnum|null $navigationGroup = 'Danh mục';

    protected static ?int $navigationSort = 3;

    protected static ?string $modelLabel = 'khu vực';

    protected static ?string $pluralModelLabel = 'Khu vực';

    protected static ?string $recordTitleAttribute = 'name';

    public static function form(Schema $schema): Schema
    {
        return $schema
            ->components([
                TextInput::make('name')
                    ->label('Tên hiển thị')
                    ->required(),
                TextInput::make('code')
                    ->label('Mã')
                    ->alphaDash()
                    ->unique(ignoreRecord: true)
                    ->required(),
                TextInput::make('province')
                    ->label('Thuộc tỉnh/thành (sau sáp nhập)')
                    ->helperText('Vd "Đắk Nông (cũ)" nay thuộc Lâm Đồng'),
                TextInput::make('sort')
                    ->label('Thứ tự')
                    ->numeric()
                    ->default(0),
                TagsInput::make('aliases')
                    ->label('Tên gọi khác')
                    ->helperText('Cách báo hay viết, vd "Đăk Nông", "Bà Rịa Vũng Tàu". Không phân biệt dấu.')
                    ->columnSpanFull(),
            ]);
    }

    public static function table(Table $table): Table
    {
        return $table
            ->defaultSort('sort')
            ->columns([
                TextColumn::make('name')
                    ->label('Tên')
                    ->description(fn (Region $record): string => $record->code)
                    ->searchable(['name', 'code']),
                TextColumn::make('province')
                    ->label('Tỉnh/thành hiện nay')
                    ->placeholder('—'),
                TextColumn::make('aliases')
                    ->label('Tên gọi khác')
                    ->badge(),
                TextColumn::make('sort')
                    ->label('Thứ tự')
                    ->sortable()
                    ->toggleable(isToggledHiddenByDefault: true),
            ])
            ->recordActions([
                EditAction::make(),
                DeleteAction::make(),
            ]);
    }

    public static function getPages(): array
    {
        return [
            'index' => ManageRegions::route('/'),
        ];
    }
}
