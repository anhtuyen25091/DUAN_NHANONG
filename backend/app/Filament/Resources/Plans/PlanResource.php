<?php

namespace App\Filament\Resources\Plans;

use App\Filament\Resources\Plans\Pages\ManagePlans;
use App\Models\Plan;
use BackedEnum;
use Filament\Actions\EditAction;
use Filament\Forms\Components\TextInput;
use Filament\Forms\Components\Toggle;
use Filament\Resources\Resource;
use Filament\Schemas\Schema;
use Filament\Support\Icons\Heroicon;
use Filament\Tables\Columns\IconColumn;
use Filament\Tables\Columns\TextColumn;
use Filament\Tables\Table;
use UnitEnum;

/**
 * Gói xem toàn bộ lịch sử giá (tháng / năm) và giá bán.
 */
class PlanResource extends Resource
{
    protected static ?string $model = Plan::class;

    protected static string|BackedEnum|null $navigationIcon = Heroicon::OutlinedTicket;

    protected static string|UnitEnum|null $navigationGroup = 'Tài khoản';

    protected static ?int $navigationSort = 2;

    protected static ?string $modelLabel = 'gói xem giá';

    protected static ?string $pluralModelLabel = 'Gói xem giá';

    protected static ?string $recordTitleAttribute = 'name';

    public static function form(Schema $schema): Schema
    {
        return $schema
            ->components([
                TextInput::make('name')
                    ->label('Tên gói')
                    ->required(),
                TextInput::make('code')
                    ->label('Mã')
                    ->alphaDash()
                    ->unique(ignoreRecord: true)
                    ->required(),
                TextInput::make('months')
                    ->label('Số tháng')
                    ->numeric()
                    ->minValue(1)
                    ->required(),
                TextInput::make('price')
                    ->label('Giá (đồng)')
                    ->numeric()
                    ->minValue(0)
                    ->required(),
                TextInput::make('description')
                    ->label('Mô tả ngắn')
                    ->columnSpanFull(),
                TextInput::make('sort')
                    ->label('Thứ tự')
                    ->numeric()
                    ->default(0),
                Toggle::make('is_active')
                    ->label('Đang bán')
                    ->default(true),
            ]);
    }

    public static function table(Table $table): Table
    {
        return $table
            ->defaultSort('sort')
            ->columns([
                TextColumn::make('name')
                    ->label('Gói')
                    ->description(fn (Plan $record): ?string => $record->description),
                TextColumn::make('months')
                    ->label('Số tháng'),
                TextColumn::make('price')
                    ->label('Giá')
                    ->formatStateUsing(fn (int $state): string => number_format($state, 0, ',', '.').' đ'),
                IconColumn::make('is_active')
                    ->label('Đang bán')
                    ->boolean(),
            ])
            ->recordActions([
                EditAction::make(),
            ]);
    }

    public static function getPages(): array
    {
        return [
            'index' => ManagePlans::route('/'),
        ];
    }
}
