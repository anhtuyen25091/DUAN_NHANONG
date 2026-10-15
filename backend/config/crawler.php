<?php

use App\Crawling\Adapters\PageTableAdapter;
use App\Crawling\Adapters\SitemapArticleAdapter;

return [

    /*
    | Tên bot gửi kèm mọi request; cũng dùng để đọc luật riêng trong robots.txt.
    */
    'user_agent' => env('CRAWLER_USER_AGENT', 'NhaNongBot/1.0 (+'.env('APP_URL', 'http://localhost').')'),

    'robots_agent' => 'nhanongbot',

    /*
    | Nghỉ giữa 2 request tới cùng một trang (mili giây) để không làm phiền nguồn.
    */
    'delay_ms' => (int) env('CRAWLER_DELAY_MS', 3000),

    'timeout' => 30,

    /*
    | Giá lệch quá tỉ lệ này so với lần trước thì chuyển sang "Cần duyệt", chưa hiển thị.
    */
    'anomaly_threshold' => 0.3,

    /*
    | Khóa adapter (cột price_sources.adapter) => class xử lý.
    */
    'adapters' => [
        'sitemap_article' => SitemapArticleAdapter::class,
        'page_table' => PageTableAdapter::class,
    ],

];
