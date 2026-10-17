<?php

namespace App\Filament\Resources\ShopCandidates;

use App\Enums\CandidateStatus;
use App\Enums\ShopType;
use App\Filament\Resources\ShopCandidates\Pages\ManageShopCandidates;
use App\Models\ShopCandidate;
use App\Shops\Collect\CandidateProcessor;
use App\Support\Provinces;
use BackedEnum;
use Filament\Actions\Action;
use Filament\Actions\BulkAction;
use Filament\Actions\BulkActionGroup;
use Filament\Resources\Resource;
use Filament\Support\Icons\Heroicon;
use Filament\Tables\Columns\TextColumn;
use Filament\Tables\Filters\SelectFilter;
use Filament\Tables\Table;
use Illuminate\Support\Collection;
use UnitEnum;

/** Điểm bán thu thập từ các nguồn: duyệt các điểm chưa đủ tin cậy để tự hiện */
class ShopCandidateResource extends Resource
{
    protected static ?string $model = ShopCandidate::class;

    protected static string|BackedEnum|null $navigationIcon = Heroicon::OutlinedInboxArrowDown;

    protected static string|UnitEnum|null $navigationGroup = 'Điểm bán';

    protected static ?int $navigationSort = 3;

    protected static ?string $modelLabel = 'điểm thu thập';

    protected static ?string $pluralModelLabel = 'Điểm bán thu thập';

    public static function getNavigationBadge(): ?string
    {
        $count = ShopCandidate::query()->where('status', CandidateStatus::Pending)->count();

        return $count > 0 ? (string) $count : null;
    }

    public static function getNavigationBadgeColor(): string
    {
        return 'warning';
    }

    public static function table(Table $table): Table
    {
        $precision = ['exact' => 'Đúng nhà', 'place' => 'Tâm xã', 'district' => 'Tâm huyện cũ', 'province' => 'Tâm tỉnh (gần đúng)'];

        return $table
            ->defaultSort('confidence', 'desc')
            ->columns([
                TextColumn::make('name')->label('Tên')->searchable()->wrap()
                    ->description(fn (ShopCandidate $record): string => (string) $record->address),
                TextColumn::make('types')->label('Loại')->badge()
                    ->formatStateUsing(fn (ShopType $state): string => $state->getLabel()),
                TextColumn::make('province_code')->label('Tỉnh')->formatStateUsing(fn (?string $state): string => Provinces::name($state) ?? '–')->sortable(),
                TextColumn::make('phone')->label('SĐT')->searchable(),
                TextColumn::make('source')->label('Nguồn')->sortable()
                    ->description(fn (ShopCandidate $record): string => "tin cậy {$record->source_trust}")
                    ->url(fn (ShopCandidate $record): ?string => $record->source_url, shouldOpenInNewTab: true),
                TextColumn::make('confidence')->label('Điểm')->sortable()
                    ->color(fn (int $state): string => $state >= (int) config('shops.publish_threshold', 70) ? 'success' : 'warning'),
                TextColumn::make('geo_precision')->label('Vị trí')->formatStateUsing(fn (?string $state): string => $precision[$state] ?? '–'),
                TextColumn::make('shop_id')->label('Trùng điểm')->formatStateUsing(fn (?int $state): string => $state ? "#{$state}" : '')
                    ->description(fn (ShopCandidate $record): string => (string) $record->shop?->name),
                TextColumn::make('review_note')->label('Lý do chờ')->wrap(),
                TextColumn::make('status')->label('Trạng thái')->badge(),
            ])
            ->filters([
                SelectFilter::make('status')->label('Trạng thái')->options(CandidateStatus::class)->default(CandidateStatus::Pending->value),
                SelectFilter::make('source')->label('Nguồn')
                    ->options(fn (): array => ShopCandidate::query()->distinct()->orderBy('source')->pluck('source', 'source')->all()),
                SelectFilter::make('province_code')->label('Tỉnh')->options(Provinces::options()),
            ])
            ->recordActions([
                Action::make('publish')
                    ->label('Đưa vào')
                    ->icon(Heroicon::OutlinedCheck)
                    ->color('success')
                    ->visible(fn (ShopCandidate $record): bool => $record->status === CandidateStatus::Pending && $record->types->isNotEmpty())
                    ->action(fn (ShopCandidate $record) => app(CandidateProcessor::class)->publish($record)),
                Action::make('reject')
                    ->label('Bỏ')
                    ->icon(Heroicon::OutlinedXMark)
                    ->color('danger')
                    ->visible(fn (ShopCandidate $record): bool => $record->status === CandidateStatus::Pending)
                    ->action(fn (ShopCandidate $record) => $record->update(['status' => CandidateStatus::Rejected])),
            ])
            ->toolbarActions([
                BulkActionGroup::make([
                    BulkAction::make('publishAll')->label('Đưa vào các điểm đã chọn')->icon(Heroicon::OutlinedCheck)
                        ->action(function (Collection $records): void {
                            $processor = app(CandidateProcessor::class);
                            $records->filter(fn (ShopCandidate $r): bool => $r->status === CandidateStatus::Pending && $r->types->isNotEmpty())
                                ->each(fn (ShopCandidate $r) => $processor->publish($r));
                        }),
                    BulkAction::make('rejectAll')->label('Bỏ các điểm đã chọn')->icon(Heroicon::OutlinedXMark)->color('danger')
                        ->action(fn (Collection $records) => $records->each->update(['status' => CandidateStatus::Rejected])),
                ]),
            ]);
    }

    public static function getPages(): array
    {
        return ['index' => ManageShopCandidates::route('/')];
    }
}
