<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Storage;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * Ảnh hóa đơn của sổ thu chi (khi "lưu cả trên mạng"). Ảnh không nằm trong bản ghi sổ (mỗi bản ghi tối đa 20 KB):
 * khoản thu chi chỉ giữ photo_id, ảnh gửi / tải riêng ở đây. Chỉ chủ sổ xem được ảnh của mình.
 */
class ReceiptPhotoController extends Controller
{
    /** Ảnh đã nén trên máy (cạnh dài ~1280 px) thường dưới 300 KB; giới hạn 2 MB */
    public const MAX_KB = 2048;

    public static function directory(int $userId): string
    {
        return "receipts/{$userId}";
    }

    public function store(Request $request, string $photo): Response
    {
        $request->validate(
            ['photo' => ['required', 'file', 'mimes:jpeg,jpg,png,webp', 'max:'.self::MAX_KB]],
            ['photo.max' => 'Ảnh quá lớn (tối đa 2 MB).', 'photo.mimes' => 'Chỉ nhận ảnh JPG, PNG, WebP.'],
        );

        Storage::disk('local')->putFileAs(self::directory($request->user()->id), $request->file('photo'), $photo);

        return response()->noContent();
    }

    public function show(Request $request, string $photo): StreamedResponse|Response
    {
        $path = self::directory($request->user()->id).'/'.$photo;
        if (! Storage::disk('local')->exists($path)) {
            return response()->noContent(404);
        }

        return Storage::disk('local')->response($path, null, ['Cache-Control' => 'private, max-age=31536000']);
    }
}
