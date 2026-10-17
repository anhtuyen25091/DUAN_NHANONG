<?php

namespace App\Shops\Collect;

use App\Enums\ShopType;

/**
 * 1 điểm bán đọc được từ nguồn, chưa chuẩn hóa.
 */
final readonly class CandidateData
{
    /**
     * @param  string  $ref  mã ổn định trong nguồn (số giấy chứng nhận, id của nguồn…) để lần sau nhận ra đúng điểm
     * @param  string|null  $province  mã tỉnh mới hoặc tên tỉnh (cũ / mới); để trống thì đoán từ địa chỉ
     * @param  list<ShopType>  $types  để trống thì đoán theo tên
     * @param  array<string, mixed>  $raw  dữ liệu gốc của nguồn (để kiểm tra lại khi cần)
     */
    public function __construct(
        public string $ref,
        public string $name,
        public ?string $address = null,
        public ?string $province = null,
        public ?string $phone = null,
        public array $types = [],
        public ?string $goods = null,
        public ?float $lat = null,
        public ?float $lng = null,
        public ?string $url = null,
        public array $raw = [],
    ) {}
}
