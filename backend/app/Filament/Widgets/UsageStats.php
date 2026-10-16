<?php

namespace App\Filament\Widgets;

use App\Documents\TransactionDocuments;
use App\Enums\DealEntryStatus;
use App\Enums\DealStatus;
use App\Models\Business;
use App\Models\BusinessMember;
use App\Models\Deal;
use App\Models\LedgerRecord;
use App\Models\Purchase;
use Filament\Widgets\StatsOverviewWidget;
use Filament\Widgets\StatsOverviewWidget\Stat;

/**
 * Trang chủ admin: số liệu dùng app (chỉ đếm / cộng tổng, không hiện dữ liệu riêng của ai).
 */
class UsageStats extends StatsOverviewWidget
{
    protected ?string $heading = 'Người dùng ghi chép giao dịch';

    protected function getStats(): array
    {
        $since = now()->subDays(30);
        $monthStart = now()->startOfMonth()->toDateString();

        return [
            Stat::make('Bật "Lưu cả trên mạng"', (string) LedgerRecord::query()->distinct()->count('user_id'))
                ->description(LedgerRecord::query()->where('tbl', 'transactions')->where('created_at', '>=', $since)->count().' khoản thu chi đồng bộ trong 30 ngày'),
            Stat::make('Đơn mua bán đang mở', (string) Deal::query()->where('status', DealStatus::Open)->count())
                ->description(Deal::query()->whereHas('entries', fn ($q) => $q->where('status', DealEntryStatus::Disputed))->count().' đơn có mục báo sai')
                ->color('warning'),
            Stat::make('Phiếu mua / bán tháng này', (string) Purchase::query()->where('date', '>=', $monthStart)->count())
                ->description('Tổng '.TransactionDocuments::vnd((int) Purchase::query()->where('date', '>=', $monthStart)->sum('amount'))),
            Stat::make('Doanh nghiệp', (string) Business::query()->count())
                ->description(BusinessMember::query()->where('role', BusinessMember::BUYER)->count().' lái con'),
        ];
    }
}
