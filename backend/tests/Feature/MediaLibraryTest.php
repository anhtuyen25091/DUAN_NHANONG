<?php

namespace Tests\Feature;

use App\Enums\ArticleStatus;
use App\Filament\Resources\Articles\Pages\CreateArticle;
use App\Filament\Resources\Articles\Pages\EditArticle;
use App\Filament\Resources\MediaFiles\Pages\ManageMediaFiles;
use App\Media\MediaLibrary;
use App\Models\Article;
use App\Models\ArticleCategory;
use App\Models\MediaFile;
use App\Models\User;
use Filament\Actions\Testing\TestAction;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Livewire\Livewire;
use Tests\TestCase;

class MediaLibraryTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        Storage::fake(MediaFile::DISK);
        $admin = User::factory()->create();
        $admin->forceFill(['is_admin' => true])->save();
        $this->actingAs($admin);
    }

    public function test_admin_uploads_files_to_library_with_original_name_and_image_size(): void
    {
        $this->get('/admin/media')->assertOk();

        Livewire::test(ManageMediaFiles::class)
            ->callAction('upload', [
                'files' => [
                    UploadedFile::fake()->image('vuon-sau-rieng.jpg', 640, 480),
                    UploadedFile::fake()->create('bang-gia.pdf', 120, 'application/pdf'),
                ],
            ])
            ->assertHasNoFormErrors();

        $image = MediaFile::query()->where('name', 'vuon-sau-rieng')->sole();
        $this->assertSame(MediaFile::LIBRARY_FOLDER, $image->folder);
        $this->assertTrue($image->isImage());
        $this->assertSame([640, 480], [$image->width, $image->height]);
        $this->assertSame(auth()->id(), $image->uploaded_by);
        Storage::disk(MediaFile::DISK)->assertExists($image->path);
        $this->assertStringEndsWith('/storage/'.$image->path, $image->url());

        $pdf = MediaFile::query()->where('name', 'bang-gia')->sole();
        $this->assertFalse($pdf->isImage());
    }

    public function test_article_cover_and_content_images_are_tracked_as_usages(): void
    {
        $cover = $this->storedFile('articles/covers/bia.jpg');
        $inline = $this->storedFile('thu-vien/2026/11/ruong-lua.jpg');
        $article = Article::factory()->create([
            'cover_image' => $cover,
            'content' => '<p>Ruộng lúa</p><img src="x" data-id="'.$inline.'">',
        ]);

        $this->assertEqualsCanonicalizing(
            [[$cover, 'cover_image'], [$inline, 'content']],
            $article->mediaUsages()->with('mediaFile')->get()->map(fn ($usage) => [$usage->mediaFile->path, $usage->field])->all(),
        );
        $this->assertSame('articles/covers', MediaFile::query()->where('path', $cover)->value('folder'));

        $article->update(['content' => '<p>Bỏ ảnh</p>']);
        $this->assertSame(['cover_image'], $article->mediaUsages()->pluck('field')->all());

        $article->delete();
        $this->assertSame(2, MediaFile::query()->unused()->count());
    }

    public function test_bulk_delete_removes_only_unused_files_from_disk(): void
    {
        $used = $this->storedFile('articles/covers/dang-dung.jpg');
        Article::factory()->create(['cover_image' => $used]);
        $unused = app(MediaLibrary::class)->register($this->storedFile('thu-vien/khong-dung.jpg'));

        Livewire::test(ManageMediaFiles::class)
            ->assertActionHidden(TestAction::make('delete')->table(MediaFile::query()->where('path', $used)->sole()))
            ->assertActionVisible(TestAction::make('delete')->table($unused))
            ->selectTableRecords(MediaFile::query()->pluck('id')->all())
            ->callAction(TestAction::make('deleteUnused')->table()->bulk());

        $this->assertSame([$used], MediaFile::query()->pluck('path')->all());
        Storage::disk(MediaFile::DISK)->assertExists($used);
        Storage::disk(MediaFile::DISK)->assertMissing('thu-vien/khong-dung.jpg');
    }

    public function test_sync_command_adds_files_on_disk_and_drops_records_of_missing_files(): void
    {
        $this->storedFile('articles/content/cu.png');
        Storage::disk(MediaFile::DISK)->put('livewire-tmp/tam.jpg', 'x');
        Storage::disk(MediaFile::DISK)->put('.gitignore', '*');
        MediaFile::factory()->create(['path' => 'thu-vien/da-mat.jpg']);

        $this->artisan('media:sync')->assertSuccessful();

        $this->assertSame(['articles/content/cu.png'], MediaFile::query()->pluck('path')->all());
    }

    public function test_editor_accepts_library_images_and_rejects_other_paths(): void
    {
        $category = ArticleCategory::factory()->create();
        $path = $this->storedFile('thu-vien/tieu.jpg');
        app(MediaLibrary::class)->register($path);
        Storage::disk(MediaFile::DISK)->put('private/khac.jpg', 'x');

        $form = fn (string $id, string $slug) => [
            'title' => 'Bài có ảnh '.$slug,
            'slug' => $slug,
            'article_category_id' => $category->id,
            'status' => ArticleStatus::Draft->value,
            'content' => '<p>Ảnh:</p><img src="x" alt="Vườn tiêu" data-id="'.$id.'">',
        ];

        Livewire::test(CreateArticle::class)->fillForm($form('private/khac.jpg', 'bai-sai'))->call('create')->assertHasFormErrors(['content']);

        Livewire::test(CreateArticle::class)->fillForm($form($path, 'bai-dung'))->call('create')->assertHasNoFormErrors();
        $article = Article::query()->where('slug', 'bai-dung')->sole();
        $this->assertStringContainsString('/storage/'.$path, $article->contentHtml());
        $this->assertSame(1, MediaFile::query()->where('path', $path)->sole()->usages()->count());
    }

    public function test_cover_can_be_picked_from_library(): void
    {
        $article = Article::factory()->create(['cover_image' => null]);
        $file = app(MediaLibrary::class)->register($this->storedFile('thu-vien/bia-moi.jpg'));

        Livewire::test(EditArticle::class, ['record' => $article->getRouteKey()])
            ->callAction(TestAction::make('pickCover')->schemaComponent('cover_image'), ['media_file_id' => $file->id])
            ->call('save')
            ->assertHasNoFormErrors();

        $this->assertSame('thu-vien/bia-moi.jpg', $article->refresh()->cover_image);
        $this->assertSame('cover_image', $file->usages()->value('field'));
    }

    private function storedFile(string $path): string
    {
        $file = UploadedFile::fake()->image(basename($path), 320, 200);
        Storage::disk(MediaFile::DISK)->putFileAs(dirname($path), $file, basename($path));

        return $path;
    }
}
