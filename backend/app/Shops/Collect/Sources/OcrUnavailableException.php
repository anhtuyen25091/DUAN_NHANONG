<?php

namespace App\Shops\Collect\Sources;

use RuntimeException;

/**
 * Máy chưa cài công cụ nhận dạng chữ (tesseract + dữ liệu tiếng Việt, pdftoppm): bỏ qua nguồn PDF bản scan, các nguồn khác vẫn chạy.
 */
class OcrUnavailableException extends RuntimeException {}
