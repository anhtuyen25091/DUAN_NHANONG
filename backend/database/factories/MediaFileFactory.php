<?php

namespace Database\Factories;

use App\Models\MediaFile;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<MediaFile>
 */
class MediaFileFactory extends Factory
{
    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        $name = fake()->unique()->slug(2);

        return [
            'path' => MediaFile::LIBRARY_FOLDER.'/'.$name.'.jpg',
            'folder' => MediaFile::LIBRARY_FOLDER,
            'name' => $name,
            'mime_type' => 'image/jpeg',
            'size' => fake()->numberBetween(10_000, 900_000),
            'width' => 1200,
            'height' => 800,
        ];
    }
}
