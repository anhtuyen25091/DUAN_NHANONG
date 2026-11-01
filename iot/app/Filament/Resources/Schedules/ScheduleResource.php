<?php

namespace App\Filament\Resources\Schedules;

use App\Filament\Resources\Schedules\Pages\ManageSchedules;
use App\Models\ActuatorSchedule;
use BackedEnum;
use Filament\Actions\DeleteAction;
use Filament\Actions\EditAction;
use Filament\Forms\Components\CheckboxList;
use Filament\Forms\Components\DatePicker;
use Filament\Forms\Components\Select;
use Filament\Forms\Components\TextInput;
use Filament\Forms\Components\TimePicker;
use Filament\Forms\Components\Toggle;
use Filament\Resources\Resource;
use Filament\Schemas\Schema;
use Filament\Support\Icons\Heroicon;
use Filament\Tables\Columns\TextColumn;
use Filament\Tables\Columns\ToggleColumn;
use Filament\Tables\Table;
use UnitEnum;

class ScheduleResource extends Resource
{
    protected static ?string $model = ActuatorSchedule::class;

    protected static string|BackedEnum|null $navigationIcon = Heroicon::OutlinedCalendarDays;

    protected static string|UnitEnum|null $navigationGroup = 'Điều khiển';

    protected static ?int $navigationSort = 2;

    protected static ?string $modelLabel = 'lịch tưới';

    protected static ?string $pluralModelLabel = 'Lịch tưới';

    public static function form(Schema $schema): Schema
    {
        return $schema
            ->components([
                Select::make('actuator_id')->label('Máy bơm / van')->relationship('actuator', 'name')->searchable()->preload()->required(),
                TimePicker::make('start_time')->label('Giờ bắt đầu')->seconds(false)->required(),
                TextInput::make('minutes')->label('Chạy (phút)')->integer()->minValue(1)->required(),
                TextInput::make('every_days')->label('Lặp mỗi N ngày')->integer()->minValue(1)->maxValue(60)->default(1)->required(),
                CheckboxList::make('months')
                    ->label('Chỉ tưới trong các tháng (bỏ trống = cả năm)')
                    ->options(collect(range(1, 12))->mapWithKeys(fn (int $m) => [$m => "Tháng {$m}"])->all())
                    ->columns(6)
                    ->columnSpanFull(),
                TextInput::make('skip_rain_mm')->label('Bỏ lượt khi đã mưa (mm)')->helperText('Từ hôm qua tới giờ; bỏ trống = luôn tưới')->numeric(),
                DatePicker::make('next_run_on')->label('Lượt kế tiếp')->default(now())->required(),
                TextInput::make('note')->label('Ghi chú')->columnSpanFull(),
                Toggle::make('enabled')->label('Đang dùng')->default(true),
            ]);
    }

    public static function table(Table $table): Table
    {
        return $table
            ->columns([
                TextColumn::make('actuator.name')->label('Máy')->description(fn (ActuatorSchedule $record): ?string => $record->actuator->plot?->name),
                TextColumn::make('start_time')->label('Giờ')->formatStateUsing(fn (ActuatorSchedule $record): string => $record->startsAt()),
                TextColumn::make('minutes')->label('Phút'),
                TextColumn::make('every_days')->label('Lặp')->formatStateUsing(fn (int $state): string => $state === 1 ? 'Mỗi ngày' : "{$state} ngày/lần"),
                TextColumn::make('months')->label('Tháng')->formatStateUsing(fn ($state): string => empty($state) ? 'Cả năm' : implode(', ', (array) $state))->placeholder('Cả năm'),
                TextColumn::make('next_run_on')->label('Lượt kế tiếp')->date('d/m/Y'),
                ToggleColumn::make('enabled')->label('Đang dùng'),
            ])
            ->recordActions([
                EditAction::make(),
                DeleteAction::make(),
            ]);
    }

    public static function getPages(): array
    {
        return [
            'index' => ManageSchedules::route('/'),
        ];
    }
}
