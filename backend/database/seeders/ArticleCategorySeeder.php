<?php

namespace Database\Seeders;

use App\Models\ArticleCategory;
use Illuminate\Database\Seeder;

/**
 * Danh mục bài viết mặc định. Admin thêm / sửa / tắt trong /admin → Nội dung → Danh mục bài viết.
 */
class ArticleCategorySeeder extends Seeder
{
    public function run(): void
    {
        $categories = [
            ['slug' => 'ky-thuat-canh-tac', 'name' => 'Kỹ thuật canh tác', 'icon' => '🌱', 'description' => 'Làm đất, giống, tưới, tỉa cành, chăm sóc theo từng giai đoạn'],
            ['slug' => 'sau-benh', 'name' => 'Sâu bệnh & cách phòng trị', 'icon' => '🐛', 'description' => 'Nhận biết sâu bệnh và cách phòng trừ an toàn'],
            ['slug' => 'phan-bon-thuoc-bvtv', 'name' => 'Phân bón & thuốc BVTV', 'icon' => '🧪', 'description' => 'Bón phân đúng cách, dùng thuốc đúng liều, đúng lúc, đảm bảo thời gian cách ly'],
            ['slug' => 'mua-vu-thoi-tiet', 'name' => 'Mùa vụ & thời tiết', 'icon' => '📅', 'description' => 'Lịch thời vụ, chuẩn bị cho mùa mưa, nắng hạn, xâm nhập mặn'],
            ['slug' => 'thi-truong-gia-ca', 'name' => 'Thị trường & giá cả', 'icon' => '📈', 'description' => 'Diễn biến giá, xu hướng thị trường, kinh nghiệm bán hàng'],
            ['slug' => 'chinh-sach-ho-tro', 'name' => 'Chính sách & hỗ trợ', 'icon' => '🏛️', 'description' => 'Chính sách, vay vốn, bảo hiểm nông nghiệp, mã số vùng trồng'],
            ['slug' => 'mo-hinh-kinh-nghiem', 'name' => 'Mô hình hay & kinh nghiệm', 'icon' => '💡', 'description' => 'Mô hình làm giàu, kinh nghiệm của bà con các vùng'],
            ['slug' => 'may-moc-cong-nghe', 'name' => 'Máy móc & công nghệ', 'icon' => '🚜', 'description' => 'Máy nông nghiệp, tưới tự động, cảm biến, ứng dụng số'],
        ];

        foreach ($categories as $sort => $category) {
            ArticleCategory::query()->firstOrCreate(['slug' => $category['slug']], [...$category, 'sort' => $sort + 1]);
        }
    }
}
