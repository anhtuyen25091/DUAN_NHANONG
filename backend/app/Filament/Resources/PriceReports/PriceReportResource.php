<?php

namespace App\Filament\Resources\PriceReports;

use App\Enums\ReportStatus;
use App\Filament\Resources\PriceReports\Pages\ManagePriceReports;
use App\Models\PriceReport;
use BackedEnum;
use Filament\Actions\Action;
use Filament\Actions\BulkAction;
use Filament\Actions\BulkActionGroup;
use Filament\Actions\DeleteAction;
use Filament\Resources\Resource;
use Filament\Support\Icons\Heroicon;
use Filament\Tables\Columns\TextColumn;
use Filament\Tables\Filters\SelectFilter;
use Filament\Tables\Table;
use Illuminate\Support\Collection;
use UnitEnum;

/** Giá do điểm mua đăng: duyệt các giá lệch nhiều / bị báo sai */
class PriceReportResource extends Resource
{
    protected static ?string $model = PriceReport::class;

    protected static string|BackedEnum|null $navigationIcon = Heroicon::OutlinedMapPin;

    protected static string|UnitEnum|null $navigationGroup = 'Giá theo khu vực';

    protected static ?int $navigationSort = 2;

    protected static ?string $modelLabel = 'giá điểm mua';

    protected static ?string $pluralModelLabel = 'Giá điểm mua đăng';

    public static function getNavigationBadge(): ?string
    {
        $count = PriceReport::query()->where('status', ReportStatus::NeedsReview)->count();

        return $count > 0 ? (string) $count : null;
    }

    public static function getNavigationBadgeColor(): string
    {
        return 'warning';
    }

    public static function table(Table $table): Table
    {
        $money = fn (?int $v): string => $v === null ? '–' : number_format($v, 0, ',', '.').' đ';

        return $table
            ->defaultSort('date', 'desc')
            ->modifyQueryUsing(fn ($query) => $query->with(['buyer', 'product']))
            ->columns([
                TextColumn::make('date')->label('Ngày')->date('d/m/Y')->sortable(),
                TextColumn::make('product.name')->label('Mặt hàng')->searchable()->wrap(),
                TextColumn::make('buyer.name')->label('Điểm mua')->searchable()->wrap()
                    ->description(fn (PriceReport $record): string => $record->buyer->provinceName() ?? ''),
                TextColumn::make('price')->label('Giá')->formatStateUsing(fn (int $state, PriceReport $record): string => $money($state).'/'.$record->unit)->sortable(),
                TextColumn::make('reference_price')->label('Tham chiếu')->formatStateUsing(fn (?int $state): string => $money($state)),
                TextColumn::make('review_reason')->label('Lý do chờ duyệt')->wrap(),
                TextColumn::make('flags_count')->label('Báo sai')->sortable(),
                TextColumn::make('status')->label('Trạng thái')->badge(),
            ])
            ->filters([
                SelectFilter::make('status')->label('Trạng thái')->options(ReportStatus::class)->default(ReportStatus::NeedsReview->value),
            ])
            ->recordActions([
                Action::make('publish')
                    ->label('Cho hiện')
                    ->icon(Heroicon::OutlinedCheck)
                    ->color('success')
                    ->visible(fn (PriceReport $record): bool => $record->status !== ReportStatus::Published)
                    ->action(fn (PriceReport $record) => $record->update(['status' => ReportStatus::Published])),
                Action::make('reject')
                    ->label('Gỡ')
                    ->icon(Heroicon::OutlinedXMark)
                    ->color('danger')
                    ->visible(fn (PriceReport $record): bool => $record->status !== ReportStatus::Rejected)
                    ->action(fn (PriceReport $record) => $record->update(['status' => ReportStatus::Rejected])),
                DeleteAction::make(),
            ])
            ->toolbarActions([
                BulkActionGroup::make([
                    BulkAction::make('publishAll')->label('Cho hiện các giá đã chọn')->icon(Heroicon::OutlinedCheck)
                        ->action(fn (Collection $records) => $records->each->update(['status' => ReportStatus::Published])),
                    BulkAction::make('rejectAll')->label('Gỡ các giá đã chọn')->icon(Heroicon::OutlinedXMark)->color('danger')
                        ->action(fn (Collection $records) => $records->each->update(['status' => ReportStatus::Rejected])),
                ]),
            ]);
    }

    public static function getPages(): array
    {
        return ['index' => ManagePriceReports::route('/')];
    }
}
