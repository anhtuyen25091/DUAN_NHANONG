<?php

namespace App\Filament\Resources\CrawlLogs;

use App\Crawling\CrawlRunner;
use App\Enums\CrawlStatus;
use App\Filament\Resources\CrawlLogs\Pages\ManageCrawlLogs;
use App\Models\CrawlLog;
use BackedEnum;
use Filament\Actions\Action;
use Filament\Notifications\Notification;
use Filament\Resources\Resource;
use Filament\Support\Icons\Heroicon;
use Filament\Tables\Columns\TextColumn;
use Filament\Tables\Filters\SelectFilter;
use Filament\Tables\Table;
use UnitEnum;

/**
 * Nhật ký các lần thu thập (chỉ xem). Có thể chạy lại parser trên HTML đã lưu.
 */
class CrawlLogResource extends Resource
{
    protected static ?string $model = CrawlLog::class;

    protected static string|BackedEnum|null $navigationIcon = Heroicon::OutlinedClipboardDocumentList;

    protected static string|UnitEnum|null $navigationGroup = 'Thu thập giá';

    protected static ?int $navigationSort = 2;

    protected static ?string $modelLabel = 'nhật ký';

    protected static ?string $pluralModelLabel = 'Nhật ký thu thập';

    public static function canCreate(): bool
    {
        return false;
    }

    public static function table(Table $table): Table
    {
        return $table
            ->defaultSort('id', 'desc')
            ->columns([
                TextColumn::make('created_at')
                    ->label('Lúc chạy')
                    ->dateTime('d/m/Y H:i'),
                TextColumn::make('priceSource.name')
                    ->label('Nguồn'),
                TextColumn::make('target_date')
                    ->label('Ngày giá')
                    ->date('d/m/Y'),
                TextColumn::make('status')
                    ->label('Kết quả')
                    ->badge(),
                TextColumn::make('items_count')
                    ->label('Số giá'),
                TextColumn::make('message')
                    ->label('Ghi chú')
                    ->wrap()
                    ->limit(120),
                TextColumn::make('url')
                    ->label('Bài')
                    ->formatStateUsing(fn (): string => 'Mở')
                    ->url(fn (CrawlLog $record): ?string => $record->url, shouldOpenInNewTab: true)
                    ->placeholder('—'),
            ])
            ->filters([
                SelectFilter::make('status')
                    ->label('Kết quả')
                    ->options(CrawlStatus::class),
                SelectFilter::make('price_source_id')
                    ->label('Nguồn')
                    ->relationship('priceSource', 'name'),
            ])
            ->recordActions([
                Action::make('reparse')
                    ->label('Chạy lại parser')
                    ->icon(Heroicon::OutlinedArrowPath)
                    ->requiresConfirmation()
                    ->modalDescription('Trích lại giá từ HTML đã lưu (không tải lại trang). Dùng sau khi thêm tên gọi khác hoặc sửa cấu hình nguồn.')
                    ->visible(fn (CrawlLog $record): bool => filled($record->raw_html))
                    ->action(function (CrawlLog $record, CrawlRunner $runner): void {
                        $log = $runner->reparse($record);

                        Notification::make()
                            ->title($log->status->getLabel())
                            ->body($log->message)
                            ->status($log->status === CrawlStatus::Success ? 'success' : 'warning')
                            ->send();
                    }),
            ]);
    }

    public static function getPages(): array
    {
        return [
            'index' => ManageCrawlLogs::route('/'),
        ];
    }
}
