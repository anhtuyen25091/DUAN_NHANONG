<?php

namespace App\Console\Commands;

use App\Models\User;
use Illuminate\Console\Attributes\Description;
use Illuminate\Console\Attributes\Signature;
use Illuminate\Console\Command;

#[Signature('admin:grant {email : Email tài khoản} {--revoke : Thu hồi quyền}')]
#[Description('Cấp (hoặc thu hồi) quyền vào trang quản trị /admin')]
class GrantAdmin extends Command
{
    public function handle(): int
    {
        $user = User::query()->where('email', $this->argument('email'))->first();
        if ($user === null) {
            $this->error('Không tìm thấy tài khoản. Tạo trước bằng: php artisan make:filament-user');

            return self::FAILURE;
        }

        $user->forceFill(['is_admin' => ! $this->option('revoke')])->save();
        $this->info($user->is_admin ? "Đã cấp quyền admin cho {$user->email}" : "Đã thu hồi quyền admin của {$user->email}");

        return self::SUCCESS;
    }
}
