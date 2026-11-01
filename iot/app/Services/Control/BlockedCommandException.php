<?php

namespace App\Services\Control;

use RuntimeException;

/**
 * Khóa an toàn không cho bật thiết bị (VD nước nguồn đang mặn). Message là câu giải thích cho người dùng.
 */
class BlockedCommandException extends RuntimeException {}
