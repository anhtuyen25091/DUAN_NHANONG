<?php

namespace App\Enums;

/**
 * Mục chung 2 bên: chờ bên kia xác nhận → đã xác nhận / báo sai. Sửa mục đã xác nhận thì quay về chờ.
 */
enum DealEntryStatus: string
{
    case Pending = 'pending';
    case Confirmed = 'confirmed';
    case Disputed = 'disputed';
    case Private = 'private';
}
