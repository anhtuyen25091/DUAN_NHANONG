<?php

namespace App\Crawling;

use RuntimeException;

/**
 * Trang bị robots.txt chặn hoặc cấu trúc trang đã đổi (không tìm thấy phần nội dung).
 */
class CrawlBlockedException extends RuntimeException {}
