<?php

namespace Tests\Unit;

use App\Support\VietnameseNumber;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

class VietnameseNumberTest extends TestCase
{
    /**
     * @return array<string, array{0: int, 1: string}>
     */
    public static function amounts(): array
    {
        return [
            'không' => [0, 'Không đồng'],
            'mười lăm' => [15, 'Mười lăm đồng'],
            'mốt' => [21, 'Hai mươi mốt đồng'],
            'tư' => [24, 'Hai mươi tư đồng'],
            'mười bốn' => [14, 'Mười bốn đồng'],
            'linh' => [105, 'Một trăm linh năm đồng'],
            'không trăm' => [1_005_000, 'Một triệu không trăm linh năm nghìn đồng'],
            'tiền phiếu' => [160_254_000, 'Một trăm sáu mươi triệu hai trăm năm mươi tư nghìn đồng'],
            'tỷ' => [2_500_000_000, 'Hai tỷ năm trăm triệu đồng'],
        ];
    }

    #[DataProvider('amounts')]
    public function test_money_in_words(int $amount, string $words): void
    {
        $this->assertSame($words, VietnameseNumber::money($amount));
    }
}
