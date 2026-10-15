<?php

namespace App\Models;

use App\Enums\CrawlStatus;
use Database\Factories\PriceSourceFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * Nguồn giá. `config` tùy theo adapter, xem App\Crawling\Adapters.
 */
#[Fillable(['code', 'name', 'homepage_url', 'adapter', 'config', 'is_enabled', 'last_run_at', 'last_status'])]
class PriceSource extends Model
{
    /** @use HasFactory<PriceSourceFactory> */
    use HasFactory;

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'config' => 'array',
            'is_enabled' => 'boolean',
            'last_run_at' => 'datetime',
            'last_status' => CrawlStatus::class,
        ];
    }

    /**
     * @return HasMany<CrawlLog, $this>
     */
    public function crawlLogs(): HasMany
    {
        return $this->hasMany(CrawlLog::class);
    }

    /**
     * @return HasMany<Price, $this>
     */
    public function prices(): HasMany
    {
        return $this->hasMany(Price::class);
    }

    public function configValue(string $key, mixed $default = null): mixed
    {
        return data_get($this->config, $key, $default);
    }
}
