<?php

namespace App\Filament\Resources\MediaFiles;

use App\Models\MediaFile;
use Filament\Actions\Action;
use Filament\Forms\Components\RichEditor;
use Filament\Forms\Components\RichEditor\EditorCommand;
use Filament\Forms\Components\RichEditor\Plugins\Contracts\RichContentPlugin;
use Filament\Forms\Components\RichEditor\RichEditorTool;
use Filament\Forms\Components\TextInput;
use Filament\Schemas\Components\Utilities\Set;
use Filament\Support\Enums\Width;
use Filament\Support\Icons\Heroicon;

/**
 * Nút "Chèn ảnh từ thư viện" trên thanh công cụ RichEditor (tên nút: mediaLibrary).
 * Ảnh chèn vào có data-id = đường dẫn file trên ổ public, nên RichContentRenderer tự sinh link.
 */
class MediaLibraryEditorPlugin implements RichContentPlugin
{
    public const TOOL = 'mediaLibrary';

    public static function make(): static
    {
        return app(static::class);
    }

    public function getTipTapPhpExtensions(): array
    {
        return [];
    }

    public function getTipTapJsExtensions(): array
    {
        return [];
    }

    public function getEditorTools(): array
    {
        return [
            RichEditorTool::make(self::TOOL)
                ->label('Chèn ảnh từ thư viện')
                ->icon(Heroicon::OutlinedPhoto)
                ->action(),
        ];
    }

    public function getEditorActions(): array
    {
        return [
            Action::make(self::TOOL)
                ->modalHeading('Chèn ảnh từ thư viện')
                ->modalSubmitActionLabel('Chèn ảnh')
                ->modalWidth(Width::Large)
                ->schema([
                    MediaPicker::make()
                        ->live()
                        ->afterStateUpdated(fn (mixed $state, Set $set) => $set('alt', MediaFile::query()->find($state)?->alt)),
                    TextInput::make('alt')
                        ->label('Mô tả ảnh (alt)')
                        ->helperText('Viết ngắn ảnh có gì, giúp người dùng đọc màn hình và tìm kiếm')
                        ->maxLength(500),
                ])
                ->action(function (array $arguments, array $data, RichEditor $component): void {
                    $file = MediaFile::query()->images()->find($data['media_file_id'] ?? null);
                    if ($file === null) {
                        return;
                    }

                    $component->runCommands(
                        [
                            EditorCommand::make('insertContent', arguments: [[
                                'type' => 'image',
                                'attrs' => [
                                    'alt' => $data['alt'] ?? $file->alt,
                                    'id' => $file->path,
                                    'src' => $file->url(),
                                ],
                            ]]),
                        ],
                        editorSelection: $arguments['editorSelection'] ?? null,
                    );
                }),
        ];
    }
}
