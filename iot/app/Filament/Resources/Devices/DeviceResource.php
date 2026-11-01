<?php

namespace App\Filament\Resources\Devices;

use App\Enums\DeviceKind;
use App\Filament\Resources\Devices\Pages\ManageDevices;
use App\Filament\Resources\Devices\Pages\ViewDevice;
use App\Models\Device;
use App\Models\FieldMap;
use App\Models\Reading;
use App\Services\LoRaWan\RelayCodec;
use App\Support\LatestReadings;
use BackedEnum;
use Filament\Actions\Action;
use Filament\Actions\DeleteAction;
use Filament\Actions\EditAction;
use Filament\Actions\ViewAction;
use Filament\Forms\Components\Select;
use Filament\Forms\Components\TextInput;
use Filament\Infolists\Components\RepeatableEntry;
use Filament\Infolists\Components\RepeatableEntry\TableColumn;
use Filament\Infolists\Components\TextEntry;
use Filament\Notifications\Notification;
use Filament\Resources\Resource;
use Filament\Schemas\Components\Section;
use Filament\Schemas\Components\Utilities\Get;
use Filament\Schemas\Schema;
use Filament\Support\Icons\Heroicon;
use Filament\Tables\Columns\IconColumn;
use Filament\Tables\Columns\TextColumn;
use Filament\Tables\Filters\SelectFilter;
use Filament\Tables\Table;
use UnitEnum;

class DeviceResource extends Resource
{
    protected static ?string $model = Device::class;

    protected static string|BackedEnum|null $navigationIcon = Heroicon::OutlinedCpuChip;

    protected static string|UnitEnum|null $navigationGroup = 'Trang trại';

    protected static ?int $navigationSort = 3;

    protected static ?string $modelLabel = 'thiết bị';

    protected static ?string $pluralModelLabel = 'Thiết bị';

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
                    ->live()
                    ->required(),
                Select::make('plot_id')
                    ->label('Lô / ruộng / ao')
                    ->relationship('plot', 'name', fn ($query, Get $get) => $query->where('farm_id', $get('farm_id'))),
                TextInput::make('name')
                    ->label('Tên')
                    ->required(),
                Select::make('kind')
                    ->label('Loại kết nối')
                    ->options(DeviceKind::class)
                    ->default(DeviceKind::Esp32)
                    ->live()
                    ->required(),
                TextInput::make('dev_eui')
                    ->label('DevEUI')
                    ->helperText('16 ký tự in trên nhãn thiết bị LoRaWAN')
                    ->regex('/^[0-9a-fA-F]{16}$/')
                    ->unique(ignoreRecord: true)
                    ->visible(fn (Get $get): bool => $get('kind') === DeviceKind::LoRaWan || $get('kind') === DeviceKind::LoRaWan->value)
                    ->required(fn (Get $get): bool => $get('kind') === DeviceKind::LoRaWan || $get('kind') === DeviceKind::LoRaWan->value),
                Select::make('profile')
                    ->label('Dòng thiết bị (ánh xạ trường)')
                    ->options(fn () => ['generic' => 'generic (tên trường = mã chỉ số)'] + FieldMap::query()->distinct()->orderBy('profile')->pluck('profile', 'profile')->all()
                        + array_map(fn (array $relay): string => $relay['name'], RelayCodec::PROFILES))
                    ->default('generic')
                    ->required(),
                TextInput::make('measure_interval_min')
                    ->label('Chu kỳ đo (phút)')
                    ->helperText('Đổi từ xa, thiết bị nhận ở lần gửi số đo tới. Bỏ trống: theo firmware.')
                    ->numeric()
                    ->minValue(5)
                    ->maxValue(240)
                    ->visible(fn (Get $get): bool => $get('kind') === DeviceKind::Esp32 || $get('kind') === DeviceKind::Esp32->value),
            ]);
    }

    public static function infolist(Schema $schema): Schema
    {
        return $schema
            ->components([
                Section::make('Thiết bị')->columns(4)->columnSpanFull()->schema([
                    TextEntry::make('uid')->label('Mã thiết bị')->copyable()->fontFamily('mono'),
                    TextEntry::make('kind')->label('Kết nối')->badge(),
                    TextEntry::make('profile')->label('Dòng thiết bị'),
                    TextEntry::make('dev_eui')->label('DevEUI')->placeholder('—')->fontFamily('mono'),
                    TextEntry::make('farm.name')->label('Trang trại'),
                    TextEntry::make('plot.name')->label('Lô')->placeholder('Chưa gán'),
                    TextEntry::make('last_seen_at')->label('Gửi lần cuối')->since()->placeholder('Chưa bao giờ'),
                    TextEntry::make('battery')->label('Pin')->suffix('%')->placeholder('—'),
                ]),
                Section::make('Số đo mới nhất')->columnSpanFull()->schema([
                    RepeatableEntry::make('latest')->hiddenLabel()
                        ->placeholder('Chưa có số đo')
                        ->state(fn (Device $record): array => LatestReadings::forDevices([$record->id])->map(fn (Reading $reading): array => [
                            'name' => $reading->metric->name,
                            'value' => round($reading->value, $reading->metric->decimals).' '.$reading->metric->unit,
                            'measured_at' => $reading->measured_at->format('d/m/Y H:i'),
                            'source' => $reading->source->getLabel(),
                        ])->all())
                        ->table([
                            TableColumn::make('Chỉ số'),
                            TableColumn::make('Giá trị'),
                            TableColumn::make('Lúc đo'),
                            TableColumn::make('Nguồn'),
                        ])
                        ->schema([
                            TextEntry::make('name'),
                            TextEntry::make('value'),
                            TextEntry::make('measured_at'),
                            TextEntry::make('source'),
                        ]),
                ]),
            ]);
    }

    public static function table(Table $table): Table
    {
        return $table
            ->defaultSort('last_seen_at', 'desc')
            ->columns([
                TextColumn::make('name')
                    ->label('Tên')
                    ->description(fn (Device $record): string => $record->uid)
                    ->searchable(['name', 'uid', 'dev_eui']),
                TextColumn::make('farm.name')
                    ->label('Trang trại')
                    ->description(fn (Device $record): ?string => $record->plot?->name),
                TextColumn::make('kind')
                    ->label('Kết nối')
                    ->badge(),
                IconColumn::make('online')
                    ->label('Trực tuyến')
                    ->state(fn (Device $record): bool => $record->isOnline())
                    ->boolean(),
                TextColumn::make('last_seen_at')
                    ->label('Gửi lần cuối')
                    ->since()
                    ->placeholder('Chưa bao giờ')
                    ->sortable(),
                TextColumn::make('battery')
                    ->label('Pin')
                    ->suffix('%')
                    ->placeholder('—'),
            ])
            ->filters([
                SelectFilter::make('kind')
                    ->label('Kết nối')
                    ->options(DeviceKind::class),
            ])
            ->recordActions([
                ViewAction::make(),
                EditAction::make(),
                self::rotateKeyAction(),
                DeleteAction::make(),
            ]);
    }

    /**
     * Khóa chỉ hiện 1 lần: nạp vào firmware (config.h) ngay.
     */
    public static function showKey(Device $device, string $key): void
    {
        Notification::make()
            ->title('Khóa thiết bị '.$device->uid)
            ->body("Chép khóa này vào firmware (DEVICE_KEY). Khóa chỉ hiện 1 lần:\n\n{$key}")
            ->success()
            ->persistent()
            ->send();
    }

    public static function rotateKeyAction(): Action
    {
        return Action::make('rotateKey')
            ->label('Tạo khóa mới')
            ->icon(Heroicon::OutlinedKey)
            ->requiresConfirmation()
            ->modalDescription('Khóa cũ hết hiệu lực ngay; thiết bị phải nạp khóa mới mới gửi được dữ liệu.')
            ->action(fn (Device $record) => self::showKey($record, $record->rotateKey()));
    }

    public static function getPages(): array
    {
        return [
            'index' => ManageDevices::route('/'),
            'view' => ViewDevice::route('/{record}'),
        ];
    }
}
