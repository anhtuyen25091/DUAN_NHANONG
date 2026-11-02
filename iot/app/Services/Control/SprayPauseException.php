<?php

namespace App\Services\Control;

/**
 * Máy tưới trên tán đang tạm dừng vì lô vừa phun thuốc. Là BlockedCommandException nên luật / lịch tưới
 * xử lý như khóa an toàn (bỏ lượt, báo chủ trang trại); bật tay thì app hỏi lại rồi gửi force.
 */
class SprayPauseException extends BlockedCommandException
{
    public function __construct(string $message, public readonly string $until)
    {
        parent::__construct($message);
    }
}
