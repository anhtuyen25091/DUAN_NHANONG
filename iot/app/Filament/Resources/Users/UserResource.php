<?php

namespace App\Filament\Resources\Users;

use App\Filament\Resources\Users\Pages\ManageUsers;
use App\Models\User;
use BackedEnum;
use Filament\Actions\EditAction;
use Filament\Forms\Components\TextInput;
use Filament\Resources\Resource;
use Filament\Schemas\Schema;
use Filament\Support\Icons\Heroicon;
use Filament\Tables\Columns\IconColumn;
use Filament\Tables\Columns\TextColumn;
use Filament\Tables\Table;
use UnitEnum;

/**
 * Chủ trang trại (tài khoản cảm biến). Admin tạo tài khoản cho nông dân rồi gán trang trại; quyền admin cấp bằng lệnh admin:grant.
 */
class UserResource extends Resource
{
    protected static ?string $model = User::class;

    protected static string|BackedEnum|null $navigationIcon = Heroicon::OutlinedUsers;

    protected static string|UnitEnum|null $navigationGroup = 'Trang trại';

    protected static ?int $navigationSort = 0;

    protected static ?string $modelLabel = 'chủ trang trại';

    protected static ?string $pluralModelLabel = 'Chủ trang trại';

    protected static ?string $recordTitleAttribute = 'name';

    public static function form(Schema $schema): Schema
    {
        return $schema
            ->components([
                TextInput::make('name')->label('Tên')->required(),
                // Tài khoản đăng nhập bằng Nhà Nông (SĐT) không có email
                TextInput::make('email')->label('Email')->email()->unique(ignoreRecord: true)->required(fn (?User $record): bool => $record?->nhanong_user_id === null),
                TextInput::make('password')
                    ->label('Mật khẩu')
                    ->password()
                    ->revealable()
                    ->minLength(6)
                    ->required(fn (string $operation): bool => $operation === 'create')
                    ->dehydrated(fn (?string $state): bool => filled($state))
                    ->helperText(fn (string $operation): ?string => $operation === 'edit' ? 'Bỏ trống: giữ mật khẩu cũ' : null),
            ]);
    }

    public static function table(Table $table): Table
    {
        return $table
            ->defaultSort('id', 'desc')
            ->columns([
                TextColumn::make('name')->label('Tên')->description(fn (User $record): string => $record->contactLabel())->searchable(['name', 'email', 'nhanong_phone']),
                TextColumn::make('farms_count')->label('Trang trại')->counts('farms'),
                TextColumn::make('nhanong_phone')->label('Tài khoản Nhà Nông')->placeholder('Chưa nối'),
                IconColumn::make('premium')->label('Có gói')->state(fn (User $record): bool => $record->hasPremium())->boolean(),
                IconColumn::make('is_admin')->label('Admin')->boolean(),
                TextColumn::make('created_at')->label('Tạo lúc')->date('d/m/Y'),
            ])
            ->recordActions([
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
