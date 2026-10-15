<?php

namespace App\Filament\Resources\Users;

use App\Filament\Resources\Users\Pages\ManageUsers;
use App\Models\Plan;
use App\Models\User;
use App\Support\PriceAccess;
use BackedEnum;
use Filament\Actions\Action;
use Filament\Actions\EditAction;
use Filament\Forms\Components\Select;
use Filament\Forms\Components\TextInput;
use Filament\Notifications\Notification;
use Filament\Resources\Resource;
use Filament\Schemas\Schema;
use Filament\Support\Icons\Heroicon;
use Filament\Tables\Columns\TextColumn;
use Filament\Tables\Filters\TernaryFilter;
use Filament\Tables\Table;
use Illuminate\Database\Eloquent\Builder;
use UnitEnum;

/**
 * Tài khoản người dùng app (đăng ký bằng số điện thoại).
 * Chưa có thanh toán tự động: người dùng chuyển khoản / liên hệ, admin bấm "Kích hoạt gói".
 */
class UserResource extends Resource
{
    protected static ?string $model = User::class;

    protected static string|BackedEnum|null $navigationIcon = Heroicon::OutlinedUsers;

    protected static string|UnitEnum|null $navigationGroup = 'Tài khoản';

    protected static ?int $navigationSort = 1;

    protected static ?string $modelLabel = 'tài khoản';

    protected static ?string $pluralModelLabel = 'Tài khoản';

    protected static ?string $recordTitleAttribute = 'name';

    public static function form(Schema $schema): Schema
    {
        return $schema
            ->components([
                TextInput::make('name')
                    ->label('Tên')
                    ->required(),
                TextInput::make('phone')
                    ->label('Số điện thoại')
                    ->tel()
                    ->unique(ignoreRecord: true),
            ]);
    }

    public static function table(Table $table): Table
    {
        return $table
            ->defaultSort('created_at', 'desc')
            ->columns([
                TextColumn::make('name')
                    ->label('Tên')
                    ->description(fn (User $record): string => $record->phone ?? $record->email ?? '')
                    ->searchable(['name', 'phone', 'email']),
                TextColumn::make('tier')
                    ->label('Mức xem giá')
                    ->state(fn (User $record): string => PriceAccess::tier($record))
                    ->formatStateUsing(fn (string $state): string => $state === PriceAccess::PREMIUM ? 'Có gói' : 'Đăng ký')
                    ->badge()
                    ->color(fn (string $state): string => $state === PriceAccess::PREMIUM ? 'success' : 'gray'),
                TextColumn::make('premium_until')
                    ->label('Hạn gói')
                    ->date('d/m/Y')
                    ->placeholder('—')
                    ->sortable(),
                TextColumn::make('created_at')
                    ->label('Đăng ký lúc')
                    ->dateTime('d/m/Y H:i')
                    ->sortable(),
            ])
            ->filters([
                TernaryFilter::make('premium')
                    ->label('Gói xem giá')
                    ->trueLabel('Đang có gói')
                    ->falseLabel('Chưa có gói')
                    ->queries(
                        true: fn (Builder $query) => $query->where('premium_until', '>', now()),
                        false: fn (Builder $query) => $query->where(fn (Builder $q) => $q->whereNull('premium_until')->orWhere('premium_until', '<=', now())),
                    ),
            ])
            ->recordActions([
                Action::make('activatePlan')
                    ->label(fn (User $record): string => $record->hasPremium() ? 'Gia hạn gói' : 'Kích hoạt gói')
                    ->icon(Heroicon::OutlinedStar)
                    ->color('success')
                    ->schema([
                        Select::make('plan_id')
                            ->label('Gói')
                            ->options(fn (): array => Plan::query()->active()->get()->mapWithKeys(fn (Plan $plan): array => [
                                $plan->id => "{$plan->name} ({$plan->months} tháng, ".number_format($plan->price, 0, ',', '.').' đ)',
                            ])->all())
                            ->required(),
                    ])
                    ->action(function (User $record, array $data): void {
                        $plan = Plan::query()->findOrFail($data['plan_id']);
                        $record->extendPremium($plan->months);
                        Notification::make()
                            ->title("Đã kích hoạt {$plan->name} cho {$record->name}, hạn tới ".$record->premium_until->format('d/m/Y'))
                            ->success()
                            ->send();
                    }),
                Action::make('cancelPlan')
                    ->label('Hủy gói')
                    ->icon(Heroicon::OutlinedXMark)
                    ->color('danger')
                    ->requiresConfirmation()
                    ->visible(fn (User $record): bool => $record->hasPremium())
                    ->action(fn (User $record) => $record->forceFill(['premium_until' => null])->save()),
                EditAction::make(),
            ]);
    }

    public static function getPages(): array
    {
        return [
            'index' => ManageUsers::route('/'),
        ];
    }
}
