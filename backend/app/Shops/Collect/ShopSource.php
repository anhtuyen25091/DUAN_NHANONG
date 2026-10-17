<?php

namespace App\Shops\Collect;

/**
 * 1 nguồn danh sách điểm bán (danh sách của Sở, đại lý của hãng, OSM, file CSV…).
 */
interface ShopSource
{
    /** Khóa ngắn, không đổi (lưu ở shop_candidates.source) */
    public function key(): string;

    /** Tên hiển thị cho admin, vd "Sở NN&MT Đồng Tháp: cơ sở buôn bán phân bón" */
    public function label(): string;

    /**
     * Độ tin cậy của nguồn, 0–100: danh sách cấp phép của Sở 85, đại lý của hãng 80, OSM 60, danh bạ 50.
     * Đủ ngưỡng config('shops.publish_threshold') thì điểm tự hiện, thiếu thì chờ admin duyệt.
     */
    public function trust(): int;

    /**
     * @return iterable<CandidateData>
     */
    public function collect(): iterable;
}
