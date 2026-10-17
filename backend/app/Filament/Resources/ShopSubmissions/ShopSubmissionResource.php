<?php

namespace App\Filament\Resources\ShopSubmissions;

use App\Enums\ShopType;
use App\Enums\SubmissionStatus;
use App\Filament\Resources\ShopSubmissions\Pages\ManageShopSubmissions;
use App\Models\ShopSubmission;
use App\Support\Provinces;
use BackedEnum;
use Filament\Actions\Action;
use Filament\Actions\DeleteAction;
use Filament\Resources\Resource;
use Filament\Support\Icons\Heroicon;
use Filament\Tables\Columns\TextColumn;
use Filament\Tables\Filters\SelectFilter;
use Filament\Tables\Table;
use UnitEnum;

class ShopSubmissionResource extends Resource
{
    protected static ?string $model = ShopSubmission::class;

    protected static string|BackedEnum|null $navigationIcon = Heroicon::OutlinedInboxArrowDown;

    protected static string|UnitEnum|null $navigationGroup = 'Điểm bán';

    protected static ?int $navigationSort = 2;

    protected static ?string $modelLabel = 'đề xuất';

    protected static ?string $pluralModelLabel = 'Người dùng đề xuất';

    public static function getNavigationBadge(): ?string
    {
        $count = ShopSubmission::query()->where('status', SubmissionStatus::Pending)->count();

        return $count > 0 ? (string) $count : null;
    }

    public static function getNavigationBadgeColor(): string
    {
        return 'warning';
    }

    public static function table(Table $table): Table
    {
        return $table
            ->defaultSort('created_at', 'desc')
            ->columns([
                TextColumn::make('created_at')
                    ->label('Ngày gửi')
                    ->dateTime('d/m/Y H:i')
                    ->sortable(),
                TextColumn::make('kind')
                    ->label('Loại đề xuất')
                    ->state(fn (ShopSubmission $record): string => match (true) {
                        $record->isRemoval() => 'Xin gỡ: '.$record->shop?->name,
                        $record->shop_id !== null => 'Sửa: '.$record->shop?->name,
                        default => 'Điểm mới',
                    })
                    ->color(fn (ShopSubmission $record): ?string => $record->isRemoval() ? 'danger' : null)
                    ->wrap(),
                TextColumn::make('data')
                    ->label('Thông tin')
                    ->state(fn (ShopSubmission $record): string => self::summary($record))
                    ->wrap(),
                TextColumn::make('note')
                    ->label('Ghi chú')
                    ->wrap()
                    ->toggleable(),
                TextColumn::make('status')
                    ->label('Trạng thái')
                    ->badge(),
            ])
            ->filters([
                SelectFilter::make('status')
                    ->label('Trạng thái')
                    ->options(SubmissionStatus::class)
                    ->default(SubmissionStatus::Pending->value),
            ])
            ->recordActions([
                Action::make('approve')
                    ->label('Duyệt')
                    ->icon(Heroicon::OutlinedCheck)
                    ->color('success')
                    ->visible(fn (ShopSubmission $record): bool => $record->status === SubmissionStatus::Pending)
                    ->requiresConfirmation()
                    ->modalDescription(fn (ShopSubmission $record): string => $record->isRemoval()
                        ? 'Điểm sẽ bị ẩn khỏi danh sách và bản đồ. Nên gọi lại số người gửi để chắc là chủ điểm.'
                        : 'Thông tin đề xuất sẽ được lưu vào điểm bán.')
                    ->action(fn (ShopSubmission $record) => $record->approve()),
                Action::make('reject')
                    ->label('Loại')
                    ->icon(Heroicon::OutlinedXMark)
                    ->color('danger')
                    ->visible(fn (ShopSubmission $record): bool => $record->status === SubmissionStatus::Pending)
                    ->action(fn (ShopSubmission $record) => $record->reject()),
                DeleteAction::make(),
            ]);
    }

    private static function summary(ShopSubmission $record): string
    {
        $data = $record->data;
        if ($record->isRemoval()) {
            return collect([
                ShopSubmission::REMOVE_REASONS[$data['remove_reason'] ?? 'other'] ?? null,
                isset($data['contact']) ? 'Gọi lại: '.$data['contact'] : null,
                $record->shop !== null ? 'Nguồn điểm: '.($record->shop->source ?? '–') : null,
            ])->filter()->join(' · ');
        }
        $types = collect($data['types'] ?? [])->map(fn (string $type): string => ShopType::tryFrom($type)?->getLabel() ?? $type)->join(', ');

        return collect([
            $data['name'] ?? null,
            $types ?: null,
            $data['address'] ?? null,
            Provinces::name($data['province_code'] ?? null),
            isset($data['phone']) ? 'ĐT: '.$data['phone'] : null,
            $data['goods'] ?? null,
            isset($data['lat']) ? "Vị trí: {$data['lat']}, {$data['lng']}" : null,
        ])->filter()->join(' · ');
    }

    public static function getPages(): array
    {
        return [
            'index' => ManageShopSubmissions::route('/'),
        ];
    }
}
