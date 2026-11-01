<?php

namespace App\Filament\Resources\FirmwareReleases;

use App\Enums\DeviceKind;
use App\Filament\Resources\FirmwareReleases\Pages\ManageFirmwareReleases;
use App\Models\FirmwareRelease;
use BackedEnum;
use Filament\Actions\DeleteAction;
use Filament\Forms\Components\FileUpload;
use Filament\Forms\Components\Select;
use Filament\Forms\Components\TextInput;
use Filament\Resources\Resource;
use Filament\Schemas\Schema;
use Filament\Support\Icons\Heroicon;
use Filament\Tables\Columns\TextColumn;
use Filament\Tables\Table;
use UnitEnum;

/**
 * Cập nhật firmware qua mạng (OTA): tải file .bin đã biên dịch cho đúng thiết bị (pio run -e esp32dev-ota),
 * thiết bị thấy ở lần gửi số đo / hỏi lệnh tới, tải về, kiểm MD5 rồi khởi động lại.
 */
class FirmwareReleaseResource extends Resource
{
    protected static ?string $model = FirmwareRelease::class;

    protected static string|BackedEnum|null $navigationIcon = Heroicon::OutlinedArrowUpTray;

    protected static string|UnitEnum|null $navigationGroup = 'Danh mục';

    protected static ?string $modelLabel = 'bản firmware';

    protected static ?string $pluralModelLabel = 'Cập nhật firmware';

    public static function form(Schema $schema): Schema
    {
        return $schema
            ->components([
                Select::make('device_id')
                    ->label('Thiết bị')
                    ->relationship('device', 'name', fn ($query) => $query->where('kind', DeviceKind::Esp32))
                    ->getOptionLabelFromRecordUsing(fn ($record): string => "{$record->name} ({$record->uid}, đang chạy {$record->firmware})")
                    ->helperText('Khóa thiết bị + WiFi nằm sẵn trong firmware nên mỗi file chỉ dùng cho đúng 1 thiết bị.')
                    ->searchable()
                    ->preload()
                    ->required(),
                TextInput::make('version')
                    ->label('Phiên bản')
                    ->helperText('Phải trùng FIRMWARE_VERSION trong config.h của bản này (thiết bị báo lại version để biết đã cài xong).')
                    ->maxLength(32)
                    ->required(),
                FileUpload::make('path')
                    ->label('File firmware (.bin)')
                    ->disk(FirmwareRelease::DISK)
                    ->directory('firmware')
                    ->visibility('private')
                    ->acceptedFileTypes(['application/octet-stream', 'application/macbinary'])
                    ->maxSize(4096)
                    ->required(),
                TextInput::make('notes')->label('Ghi chú')->maxLength(191),
            ]);
    }

    public static function table(Table $table): Table
    {
        return $table
            ->defaultSort('id', 'desc')
            ->columns([
                TextColumn::make('device.name')->label('Thiết bị')->description(fn (FirmwareRelease $record): string => $record->device->uid)->searchable(),
                TextColumn::make('version')->label('Phiên bản'),
                TextColumn::make('size')->label('Kích thước')->formatStateUsing(fn (int $state): string => number_format($state / 1024, 0, ',', '.').' KB'),
                TextColumn::make('installed_at')->label('Đã cài')->dateTime('d/m/Y H:i')->placeholder('Chờ thiết bị tải'),
                TextColumn::make('notes')->label('Ghi chú')->limit(40),
            ])
            ->recordActions([
                DeleteAction::make(),
            ]);
    }

    public static function getPages(): array
    {
        return [
            'index' => ManageFirmwareReleases::route('/'),
        ];
    }
}
