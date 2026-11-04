<?php

namespace App\Filament\Resources\MediaFiles\Pages;

use App\Filament\Resources\MediaFiles\MediaFileResource;
use App\Media\MediaLibrary;
use App\Models\MediaFile;
use Filament\Actions\Action;
use Filament\Forms\Components\FileUpload;
use Filament\Notifications\Notification;
use Filament\Resources\Pages\ManageRecords;
use Filament\Support\Icons\Heroicon;

class ManageMediaFiles extends ManageRecords
{
    protected static string $resource = MediaFileResource::class;

    /** @var list<string> */
    public const ACCEPTED_TYPES = [
        'image/jpeg', 'image/png', 'image/webp', 'image/gif',
        'application/pdf',
        'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ];

    protected function getHeaderActions(): array
    {
        return [
            Action::make('upload')
                ->label('Tải file lên')
                ->icon(Heroicon::OutlinedArrowUpTray)
                ->modalSubmitActionLabel('Lưu vào thư viện')
                ->schema([
                    FileUpload::make('files')
                        ->label('Ảnh hoặc tài liệu')
                        ->helperText('Ảnh JPG / PNG / WebP / GIF, tài liệu PDF / Word / Excel; tối đa 10 MB mỗi file, 20 file mỗi lần.')
                        ->multiple()
                        ->maxFiles(20)
                        ->maxSize(10240)
                        ->acceptedFileTypes(self::ACCEPTED_TYPES)
                        ->disk(MediaFile::DISK)
                        ->directory(MediaFile::LIBRARY_FOLDER.'/'.now()->format('Y/m'))
                        ->visibility('public')
                        ->storeFileNamesIn('names')
                        ->required(),
                ])
                ->action(function (array $data, MediaLibrary $library): void {
                    $count = 0;
                    foreach ($data['files'] ?? [] as $path) {
                        if ($library->register($path, $data['names'][$path] ?? null, auth()->id()) !== null) {
                            $count++;
                        }
                    }

                    Notification::make()->success()->title("Đã thêm {$count} file vào thư viện")->send();
                }),
            Action::make('sync')
                ->label('Quét lại')
                ->tooltip('Tìm file có trên máy chủ mà chưa có trong thư viện và tính lại chỗ đang dùng')
                ->icon(Heroicon::OutlinedArrowPath)
                ->color('gray')
                ->action(function (MediaLibrary $library): void {
                    $result = $library->syncFromDisk();

                    Notification::make()->success()
                        ->title("Thư viện có {$result['total']} file")
                        ->body("Thêm {$result['added']} file mới, bỏ {$result['removed']} file đã mất trên máy chủ.")
                        ->send();
                }),
        ];
    }
}
