<?php

namespace App\Filament\Resources\UnmatchedNames;

use App\Enums\NameKind;
use App\Filament\Resources\UnmatchedNames\Pages\ManageUnmatchedNames;
use App\Models\Product;
use App\Models\Region;
use App\Models\UnmatchedName;
use BackedEnum;
use Filament\Actions\Action;
use Filament\Forms\Components\Select;
use Filament\Resources\Resource;
use Filament\Support\Icons\Heroicon;
use Filament\Tables\Columns\TextColumn;
use Filament\Tables\Filters\TernaryFilter;
use Filament\Tables\Table;
use UnitEnum;

/**
 * Tên trong bảng giá chưa khớp mặt hàng/khu vực nào. Admin gán làm tên gọi khác hoặc bỏ qua.
 */
class UnmatchedNameResource extends Resource
{
    protected static ?string $model = UnmatchedName::class;

    protected static string|BackedEnum|null $navigationIcon = Heroicon::OutlinedQuestionMarkCircle;

    protected static string|UnitEnum|null $navigationGroup = 'Thu thập giá';

    protected static ?int $navigationSort = 3;

    protected static ?string $modelLabel = 'tên chưa nhận diện';

    protected static ?string $pluralModelLabel = 'Tên chưa nhận diện';

    public static function canCreate(): bool
    {
        return false;
    }

    public static function getNavigationBadge(): ?string
    {
        $count = UnmatchedName::query()->where('resolved', false)->count();

        return $count > 0 ? (string) $count : null;
    }

    public static function table(Table $table): Table
    {
        return $table
            ->defaultSort('last_seen_at', 'desc')
            ->columns([
                TextColumn::make('name')
                    ->label('Tên gặp trong bài')
                    ->searchable(),
                TextColumn::make('kind')
                    ->label('Loại')
                    ->badge(),
                TextColumn::make('priceSource.name')
                    ->label('Nguồn'),
                TextColumn::make('seen_count')
                    ->label('Số lần gặp')
                    ->sortable(),
                TextColumn::make('last_seen_at')
                    ->label('Gặp lần cuối')
                    ->dateTime('d/m/Y H:i')
                    ->sortable(),
                TextColumn::make('sample_url')
                    ->label('Bài')
                    ->formatStateUsing(fn (): string => 'Mở')
                    ->url(fn (UnmatchedName $record): ?string => $record->sample_url, shouldOpenInNewTab: true),
            ])
            ->filters([
                TernaryFilter::make('resolved')
                    ->label('Đã xử lý')
                    ->default(false),
            ])
            ->recordActions([
                Action::make('addAlias')
                    ->label('Thêm làm tên gọi khác')
                    ->icon(Heroicon::OutlinedLink)
                    ->visible(fn (UnmatchedName $record): bool => ! $record->resolved)
                    ->schema(fn (UnmatchedName $record): array => [
                        Select::make('target_id')
                            ->label($record->kind === NameKind::Product ? 'Là mặt hàng' : 'Là khu vực')
                            ->options(fn (): array => $record->kind === NameKind::Product
                                ? Product::query()->orderBy('name')->pluck('name', 'id')->all()
                                : Region::query()->orderBy('name')->pluck('name', 'id')->all())
                            ->searchable()
                            ->required(),
                    ])
                    ->action(function (UnmatchedName $record, array $data): void {
                        $target = $record->kind === NameKind::Product
                            ? Product::query()->findOrFail($data['target_id'])
                            : Region::query()->findOrFail($data['target_id']);

                        $target->update(['aliases' => array_values(array_unique([...($target->aliases ?? []), $record->name]))]);
                        $record->update(['resolved' => true]);
                    })
                    ->successNotificationTitle('Đã thêm. Vào "Nhật ký thu thập" chạy lại parser để lấy giá còn thiếu.'),
                Action::make('ignore')
                    ->label('Bỏ qua')
                    ->color('gray')
                    ->visible(fn (UnmatchedName $record): bool => ! $record->resolved)
                    ->action(fn (UnmatchedName $record) => $record->update(['resolved' => true])),
            ]);
    }

    public static function getPages(): array
    {
        return [
            'index' => ManageUnmatchedNames::route('/'),
        ];
    }
}
