<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Plan;
use Illuminate\Http\JsonResponse;

/**
 * Gói xem toàn bộ lịch sử giá và mức xem của từng loại tài khoản (để app hiển thị).
 */
class PlanController extends Controller
{
    public function index(): JsonResponse
    {
        return response()->json([
            'data' => Plan::query()->active()->get(['code', 'name', 'months', 'price', 'description']),
            'limits' => [
                'guest_days' => config('nhanong.price_history.guest_days'),
                'member_days' => config('nhanong.price_history.member_days'),
            ],
        ]);
    }
}
