<?php

namespace App\Filament\Resources\AdminViewLogs;

use App\Filament\Concerns\ReadOnlyResource;
use App\Filament\Resources\AdminViewLogs\Pages\ListAdminViewLogs;
use App\Models\AdminViewLog;
use BackedEnum;
use Filament\Resources\Resource;
use Filament\Support\Icons\Heroicon;
use Filament\Tables\Columns\TextColumn;
use Filament\Tables\Filters\SelectFilter;
use Filament\Tables\Table;
use UnitEnum;

/**
 * Nhật ký admin xem / tải dữ liệu riêng của người dùng. Không sửa / xóa được.
 */
class AdminViewLogResource extends Resource
{
    use ReadOnlyResource;

    protected static ?string $model = AdminViewLog::class;

    protected static string|BackedEnum|null $navigationIcon = Heroicon::OutlinedEye;

    protected static string|UnitEnum|null $navigationGroup = 'Hệ thống';

    protected static ?string $modelLabel = 'lần xem dữ liệu';

    protected static ?string $pluralModelLabel = 'Nhật ký xem dữ liệu';

    public static function table(Table $table): Table
    {
        return $table
            ->defaultSort('created_at', 'desc')
            ->columns([
                TextColumn::make('created_at')->label('Lúc')->dateTime('d/m/Y H:i:s')->sortable(),
                TextColumn::make('admin.name')->label('Admin'),
                TextColumn::make('action')->label('Việc')->formatStateUsing(fn (string $state): string => $state === 'download' ? 'Tải giấy tờ' : 'Xem')->badge(),
                TextColumn::make('area')->label('Mục')->formatStateUsing(fn (string $state): string => AdminViewLog::AREAS[$state] ?? $state),
                TextColumn::make('subject.name')->label('Của người dùng')->placeholder('—')->searchable(),
                TextColumn::make('subject.phone')->label('SĐT')->placeholder('—'),
                TextColumn::make('record')->label('Bản ghi')->wrap()->searchable(),
            ])
            ->filters([
                SelectFilter::make('admin_id')->label('Admin')->relationship('admin', 'name'),
                SelectFilter::make('area')->label('Mục')->options(AdminViewLog::AREAS),
                SelectFilter::make('subject_user_id')->label('Người dùng')->relationship('subject', 'name')->searchable(),
            ]);
    }

    public static function getPages(): array
    {
        return ['index' => ListAdminViewLogs::route('/')];
    }
}
