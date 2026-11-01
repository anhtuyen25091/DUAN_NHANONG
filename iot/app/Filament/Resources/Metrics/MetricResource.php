<?php

namespace App\Filament\Resources\Metrics;

use App\Filament\Resources\Metrics\Pages\ManageMetrics;
use App\Models\Metric;
use BackedEnum;
use Filament\Actions\EditAction;
use Filament\Forms\Components\Select;
use Filament\Forms\Components\TextInput;
use Filament\Resources\Resource;
use Filament\Schemas\Schema;
use Filament\Support\Icons\Heroicon;
use Filament\Tables\Columns\TextColumn;
use Filament\Tables\Table;
use UnitEnum;

class MetricResource extends Resource
{
    public const GROUPS = ['soil' => 'Đất', 'water' => 'Nước', 'weather' => 'Thời tiết', 'device' => 'Thiết bị'];

    protected static ?string $model = Metric::class;

    protected static string|BackedEnum|null $navigationIcon = Heroicon::OutlinedBeaker;

    protected static string|UnitEnum|null $navigationGroup = 'Danh mục';

    protected static ?int $navigationSort = 1;

    protected static ?string $modelLabel = 'chỉ số';

    protected static ?string $pluralModelLabel = 'Chỉ số đo';

    protected static ?string $recordTitleAttribute = 'name';

    public static function form(Schema $schema): Schema
    {
        return $schema
            ->components([
                TextInput::make('code')
                    ->label('Mã (thiết bị gửi lên)')
                    ->alphaDash()
                    ->unique(ignoreRecord: true)
                    ->required(),
                TextInput::make('name')
                    ->label('Tên')
                    ->required(),
                TextInput::make('unit')
                    ->label('Đơn vị'),
                Select::make('group')
                    ->label('Nhóm')
                    ->options(self::GROUPS)
                    ->required(),
                TextInput::make('min_valid')
                    ->label('Nhỏ nhất hợp lệ')
                    ->helperText('Số đo ngoài khoảng hợp lệ coi như cảm biến lỗi và bị bỏ qua')
                    ->numeric()
                    ->required(),
                TextInput::make('max_valid')
                    ->label('Lớn nhất hợp lệ')
                    ->numeric()
                    ->required(),
                TextInput::make('decimals')
                    ->label('Số chữ số thập phân')
                    ->integer()
                    ->default(1),
                TextInput::make('sort')
                    ->label('Thứ tự')
                    ->integer()
                    ->default(0),
            ]);
    }

    public static function table(Table $table): Table
    {
        return $table
            ->defaultSort('sort')
            ->columns([
                TextColumn::make('name')
                    ->label('Tên')
                    ->description(fn (Metric $record): string => $record->code)
                    ->searchable(['name', 'code']),
                TextColumn::make('group')
                    ->label('Nhóm')
                    ->formatStateUsing(fn (string $state): string => self::GROUPS[$state] ?? $state)
                    ->badge(),
                TextColumn::make('unit')
                    ->label('Đơn vị')
                    ->placeholder('—'),
                TextColumn::make('valid_range')
                    ->label('Khoảng hợp lệ')
                    ->state(fn (Metric $record): string => $record->min_valid.' – '.$record->max_valid),
            ])
            ->recordActions([
                EditAction::make(),
            ]);
    }

    public static function getPages(): array
    {
        return [
            'index' => ManageMetrics::route('/'),
        ];
    }
}
