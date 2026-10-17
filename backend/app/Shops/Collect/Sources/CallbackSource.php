<?php

namespace App\Shops\Collect\Sources;

use App\Shops\Collect\CandidateData;
use App\Shops\Collect\ShopSource;
use Closure;

/**
 * Nguồn tạm từ 1 hàm đọc (vd file Excel / PDF trên máy do Sở gửi qua email, nhập bằng lệnh shops:collect-file).
 */
final class CallbackSource implements ShopSource
{
    /**
     * @param  Closure(): iterable<CandidateData>  $read
     */
    public function __construct(private string $key, private string $label, private int $trust, private Closure $read) {}

    public function key(): string
    {
        return $this->key;
    }

    public function label(): string
    {
        return $this->label;
    }

    public function trust(): int
    {
        return $this->trust;
    }

    public function collect(): iterable
    {
        return ($this->read)();
    }
}
