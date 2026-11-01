<?php

namespace App\Filament\Resources\Actuators;

use App\Enums\ActuatorKind;
use App\Filament\Resources\Actuators\Pages\ManageActuators;
use App\Models\Actuator;
use App\Models\ActuatorCommand;
use App\Models\Device;
use App\Services\Control\BlockedCommandException;
use App\Services\Control\CommandService;
use BackedEnum;
use Filament\Actions\Action;
use Filament\Actions\DeleteAction;
use Filament\Actions\EditAction;
use Filament\Forms\Components\Select;
use Filament\Forms\Components\TextInput;
use Filament\Notifications\Notification;
use Filament\Resources\Resource;
use Filament\Schemas\Components\Utilities\Get;
use Filament\Schemas\Schema;
use Filament\Support\Icons\Heroicon;
use Filament\Tables\Columns\IconColumn;
use Filament\Tables\Columns\TextColumn;
use Filament\Tables\Table;
use Illuminate\Support\Facades\Auth;
use UnitEnum;

class ActuatorResource extends Resource
{
    protected static ?string $model = Actuator::class;

    protected static string|BackedEnum|null $navigationIcon = Heroicon::OutlinedPower;

    protected static string|UnitEnum|null $navigationGroup = 'Điều khiển';

    protected static ?int $navigationSort = 1;

    protected static ?string $modelLabel = 'thiết bị điều khiển';

    protected static ?string $pluralModelLabel = 'Máy bơm, quạt, van…';

    protected static ?string $recordTitleAttribute = 'name';

    public static function form(Schema $schema): Schema
    {
        return $schema
            ->components([
                Select::make('device_id')
                    ->label('Mạch điều khiển (relay)')
                    ->relationship('device', 'name')
                    ->searchable()
                    ->preload()
                    ->live()
                    ->required(),
                TextInput::make('channel')
                    ->label('Kênh relay')
                    ->integer()
                    ->minValue(1)
                    ->maxValue(16)
                    ->required(),
                TextInput::make('name')
                    ->label('Tên')
                    ->required(),
                Select::make('kind')
                    ->label('Loại')
                    ->options(ActuatorKind::class)
                    ->required(),
                Select::make('plot_id')
                    ->label('Lô')
                    ->relationship('plot', 'name', fn ($query, Get $get) => $query->whereIn('farm_id', Device::query()->whereKey($get('device_id'))->select('farm_id'))),
                TextInput::make('max_minutes')
                    ->label('Chạy tối đa mỗi lần (phút)')
                    ->integer()
                    ->default(60)
                    ->required(),
                Select::make('block_device_id')
                    ->label('Khóa an toàn: cảm biến nguồn nước')
                    ->helperText('VD đo độ mặn kênh cấp nước: vượt mức thì không cho bơm, đang chạy thì tự tắt')
                    ->relationship('blockDevice', 'name', fn ($query, Get $get) => $query->whereIn('farm_id', Device::query()->whereKey($get('device_id'))->select('farm_id'))),
                Select::make('block_metric_id')
                    ->label('Chỉ số chặn')
                    ->relationship('blockMetric', 'name'),
                Select::make('block_operator')
                    ->label('Chặn khi')
                    ->options(['above' => 'Cao hơn', 'below' => 'Thấp hơn']),
                TextInput::make('block_value')
                    ->label('Mức chặn')
                    ->numeric(),
            ]);
    }

    public static function table(Table $table): Table
    {
        return $table
            ->columns([
                TextColumn::make('name')
                    ->label('Tên')
                    ->description(fn (Actuator $record): string => $record->kind->getLabel())
                    ->searchable(),
                TextColumn::make('device.name')
                    ->label('Mạch')
                    ->description(fn (Actuator $record): string => "Kênh {$record->channel}"),
                TextColumn::make('plot.name')
                    ->label('Lô')
                    ->placeholder('—'),
                IconColumn::make('is_on')
                    ->label('Đang bật')
                    ->boolean(),
                TextColumn::make('auto_off_at')
                    ->label('Tự tắt lúc')
                    ->dateTime('H:i d/m')
                    ->placeholder('—'),
            ])
            ->recordActions([
                Action::make('turnOn')
                    ->label('Bật')
                    ->icon(Heroicon::OutlinedPlay)
                    ->color('success')
                    ->schema([TextInput::make('minutes')->label('Số phút')->integer()->minValue(1)->default(30)->required()])
                    ->action(function (Actuator $record, array $data) {
                        try {
                            app(CommandService::class)->issue($record, ActuatorCommand::ON, (int) $data['minutes'], ActuatorCommand::SOURCE_MANUAL, Auth::user());
                            Notification::make()->title('Đã gửi lệnh bật, mạch nhận trong vài giây')->success()->send();
                        } catch (BlockedCommandException $e) {
                            Notification::make()->title($e->getMessage())->danger()->send();
                        }
                    }),
                Action::make('turnOff')
                    ->label('Tắt')
                    ->icon(Heroicon::OutlinedStop)
                    ->color('danger')
                    ->requiresConfirmation()
                    ->action(function (Actuator $record) {
                        app(CommandService::class)->issue($record, ActuatorCommand::OFF, null, ActuatorCommand::SOURCE_MANUAL, Auth::user());
                        Notification::make()->title('Đã gửi lệnh tắt')->success()->send();
                    }),
                EditAction::make(),
                DeleteAction::make(),
            ]);
    }

    public static function getPages(): array
    {
        return [
            'index' => ManageActuators::route('/'),
        ];
    }
}
