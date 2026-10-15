<?php

namespace App\Filament\Resources\PriceSources;

use App\Crawling\CrawlRunner;
use App\Enums\CrawlStatus;
use App\Filament\Resources\PriceSources\Pages\ManagePriceSources;
use App\Models\PriceSource;
use BackedEnum;
use Carbon\CarbonImmutable;
use Filament\Actions\Action;
use Filament\Actions\EditAction;
use Filament\Forms\Components\CodeEditor;
use Filament\Forms\Components\CodeEditor\Enums\Language;
use Filament\Forms\Components\DatePicker;
use Filament\Forms\Components\Select;
use Filament\Forms\Components\TextInput;
use Filament\Forms\Components\Toggle;
use Filament\Notifications\Notification;
use Filament\Resources\Resource;
use Filament\Schemas\Schema;
use Filament\Support\Icons\Heroicon;
use Filament\Tables\Columns\TextColumn;
use Filament\Tables\Columns\ToggleColumn;
use Filament\Tables\Table;
use UnitEnum;

class PriceSourceResource extends Resource
{
    protected static ?string $model = PriceSource::class;

    protected static string|BackedEnum|null $navigationIcon = Heroicon::OutlinedGlobeAlt;

    protected static string|UnitEnum|null $navigationGroup = 'Thu thập giá';

    protected static ?int $navigationSort = 1;

    protected static ?string $modelLabel = 'nguồn giá';

    protected static ?string $pluralModelLabel = 'Nguồn giá';

    protected static ?string $recordTitleAttribute = 'name';

    public static function form(Schema $schema): Schema
    {
        return $schema
            ->components([
                TextInput::make('name')
                    ->label('Tên')
                    ->required(),
                TextInput::make('code')
                    ->label('Mã')
                    ->alphaDash()
                    ->unique(ignoreRecord: true)
                    ->required(),
                TextInput::make('homepage_url')
                    ->label('Trang chủ')
                    ->url()
                    ->required(),
                Select::make('adapter')
                    ->label('Cách lấy')
                    ->options(['sitemap_article' => 'Bài báo hằng ngày (qua sitemap)'])
                    ->default('sitemap_article')
                    ->required(),
                CodeEditor::make('config')
                    ->label('Cấu hình (JSON)')
                    ->language(Language::Json)
                    ->helperText('Xem chú thích trong App\Crawling\Adapters\SitemapArticleAdapter.')
                    ->formatStateUsing(fn (?array $state): string => json_encode($state ?? [], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES))
                    ->dehydrateStateUsing(fn (?string $state): array => json_decode($state ?: '{}', true) ?? [])
                    ->rule('json')
                    ->columnSpanFull(),
                Toggle::make('is_enabled')
                    ->label('Đang bật')
                    ->default(true),
            ]);
    }

    public static function table(Table $table): Table
    {
        return $table
            ->columns([
                TextColumn::make('name')
                    ->label('Nguồn')
                    ->description(fn (PriceSource $record): string => $record->code)
                    ->searchable(),
                TextColumn::make('last_status')
                    ->label('Lần chạy gần nhất')
                    ->badge()
                    ->description(fn (PriceSource $record): ?string => $record->last_run_at?->format('d/m/Y H:i')),
                TextColumn::make('prices_count')
                    ->label('Số giá đã lấy')
                    ->counts('prices'),
                ToggleColumn::make('is_enabled')
                    ->label('Bật'),
            ])
            ->recordActions([
                Action::make('run')
                    ->label('Chạy ngay')
                    ->icon(Heroicon::OutlinedPlay)
                    ->schema([
                        DatePicker::make('date')
                            ->label('Ngày cần lấy')
                            ->default(now())
                            ->maxDate(now())
                            ->required(),
                    ])
                    ->action(function (PriceSource $record, array $data, CrawlRunner $runner): void {
                        $status = $runner->run($record, CarbonImmutable::parse($data['date']));
                        $message = $record->crawlLogs()->latest('id')->value('message');

                        Notification::make()
                            ->title($record->name.': '.$status->getLabel())
                            ->body($message)
                            ->color($status->getColor())
                            ->status($status === CrawlStatus::Success ? 'success' : ($status === CrawlStatus::Failed ? 'danger' : 'warning'))
                            ->send();
                    }),
                EditAction::make(),
            ]);
    }

    public static function getPages(): array
    {
        return [
            'index' => ManagePriceSources::route('/'),
        ];
    }
}
