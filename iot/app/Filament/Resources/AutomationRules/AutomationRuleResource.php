<?php

namespace App\Filament\Resources\AutomationRules;

use App\Filament\Resources\AutomationRules\Pages\ManageAutomationRules;
use App\Models\AutomationRule;
use BackedEnum;
use Filament\Actions\DeleteAction;
use Filament\Actions\EditAction;
use Filament\Forms\Components\Select;
use Filament\Forms\Components\TextInput;
use Filament\Forms\Components\Toggle;
use Filament\Resources\Resource;
use Filament\Schemas\Schema;
use Filament\Support\Icons\Heroicon;
use Filament\Tables\Columns\TextColumn;
use Filament\Tables\Columns\ToggleColumn;
use Filament\Tables\Table;
use UnitEnum;

class AutomationRuleResource extends Resource
{
    protected static ?string $model = AutomationRule::class;

    protected static string|BackedEnum|null $navigationIcon = Heroicon::OutlinedBolt;

    protected static string|UnitEnum|null $navigationGroup = 'Điều khiển';

    protected static ?int $navigationSort = 2;

    protected static ?string $modelLabel = 'luật tự động';

    protected static ?string $pluralModelLabel = 'Luật tự động';

    public static function form(Schema $schema): Schema
    {
        return $schema
            ->components([
                Select::make('plot_id')->label('Lô')->relationship('plot', 'name')->searchable()->preload()->required(),
                Select::make('metric_id')->label('Chỉ số')->relationship('metric', 'name')->searchable()->preload()->required(),
                Select::make('operator')->label('Khi')->options([AutomationRule::BELOW => 'Thấp hơn', AutomationRule::ABOVE => 'Cao hơn'])->required(),
                TextInput::make('value')->label('Mức bật')->numeric()->required(),
                Select::make('actuator_id')->label('Thì bật')->relationship('actuator', 'name')->searchable()->preload()->required(),
                TextInput::make('minutes')->label('Chạy (phút)')->integer()->minValue(1)->required(),
                TextInput::make('off_value')->label('Tắt khi trở lại mức')->helperText('Bỏ trống: chạy đủ số phút rồi tự tắt')->numeric(),
                TextInput::make('cooldown_minutes')->label('Nghỉ giữa 2 lần bật (phút)')->integer()->default(30)->required(),
                Toggle::make('enabled')->label('Đang dùng')->default(true),
            ]);
    }

    public static function table(Table $table): Table
    {
        return $table
            ->columns([
                TextColumn::make('plot.name')->label('Lô'),
                TextColumn::make('condition')
                    ->label('Khi')
                    ->state(fn (AutomationRule $record): string => $record->metric->name.' '.($record->operator === AutomationRule::BELOW ? '<' : '>').' '.$record->value),
                TextColumn::make('actuator.name')
                    ->label('Thì bật')
                    ->description(fn (AutomationRule $record): string => "{$record->minutes} phút".($record->off_value !== null ? ", tắt khi về {$record->off_value}" : '')),
                TextColumn::make('last_triggered_at')->label('Chạy lần cuối')->since()->placeholder('Chưa'),
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
            'index' => ManageAutomationRules::route('/'),
        ];
    }
}
