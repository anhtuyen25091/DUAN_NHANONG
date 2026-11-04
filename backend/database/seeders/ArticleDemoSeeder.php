<?php

namespace Database\Seeders;

use App\Enums\ArticleStatus;
use App\Models\Article;
use App\Models\ArticleCategory;
use App\Models\Product;
use Illuminate\Database\Seeder;

/**
 * Bài viết mẫu để xem giao diện (chỉ máy dev): php artisan db:seed --class=ArticleDemoSeeder
 * Tiêu đề có "(bài mẫu)"; chạy lại không tạo trùng. Xóa trong /admin khi có bài thật.
 */
class ArticleDemoSeeder extends Seeder
{
    public function run(): void
    {
        $this->call(ArticleCategorySeeder::class);

        $articles = [
            [
                'slug' => 'xu-ly-ra-hoa-sau-rieng-bai-mau',
                'category' => 'ky-thuat-canh-tac',
                'products' => ['sau-rieng-ri6', 'sau-rieng-thai'],
                'title' => 'Chuẩn bị cho sầu riêng ra hoa: 5 việc cần làm (bài mẫu)',
                'excerpt' => 'Cây đủ lá già, đủ dinh dưỡng và một đợt khô hạn ngắn là ba điều kiện để sầu riêng ra hoa đều. Bài viết tóm tắt các bước chính.',
                'featured' => true,
                'days_ago' => 1,
                'content' => <<<'HTML'
                    <p>Sầu riêng ra hoa đều, đậu trái tốt phụ thuộc nhiều vào giai đoạn chuẩn bị trước khi xử lý. Dưới đây là 5 việc bà con thường làm.</p>
                    <h2>1. Đủ 2–3 cơi đọt đã già</h2>
                    <p>Cây cần có lá trưởng thành, xanh đậm, không còn đọt non thì mới tích lũy đủ dinh dưỡng để phân hóa mầm hoa.</p>
                    <h2>2. Bón phân theo hướng tăng lân, kali</h2>
                    <p>Giảm đạm, tăng lân và kali giúp cây chuyển từ sinh trưởng sang sinh sản. Lượng bón tùy tuổi cây và kết quả phân tích đất.</p>
                    <h2>3. Tạo khô hạn ngắn</h2>
                    <p>Ngưng tưới 10–20 ngày (tùy thời tiết, loại đất), có thể phủ bạt gốc nếu mưa trái mùa. Theo dõi lá: héo nhẹ vào buổi trưa là dấu hiệu đủ khô.</p>
                    <h2>4. Vệ sinh vườn, phòng nấm bệnh</h2>
                    <p>Tỉa cành vô hiệu, cành sâu bệnh để vườn thông thoáng; quét vôi gốc và phòng bệnh xì mủ trước mùa hoa.</p>
                    <h2>5. Tưới lại đúng cách khi mắt cua xuất hiện</h2>
                    <p>Khi thấy mắt cua nhú, tưới lại từ từ (lượng tăng dần trong vài ngày), tránh tưới đẫm ngay làm cây ra đọt non.</p>
                    <blockquote>Bài mẫu, chỉ để tham khảo. Liều lượng cụ thể nên hỏi cán bộ khuyến nông địa phương.</blockquote>
                    HTML,
            ],
            [
                'slug' => 'phong-benh-chet-nhanh-ho-tieu-mua-mua-bai-mau',
                'category' => 'sau-benh',
                'products' => ['ho-tieu'],
                'title' => 'Phòng bệnh chết nhanh trên hồ tiêu mùa mưa (bài mẫu)',
                'excerpt' => 'Bệnh chết nhanh do nấm Phytophthora phát triển mạnh khi đất ẩm, úng nước. Thoát nước tốt và giữ gốc thông thoáng là việc quan trọng nhất.',
                'featured' => false,
                'days_ago' => 2,
                'content' => <<<'HTML'
                    <p>Bệnh chết nhanh (thối gốc, thối rễ) là bệnh nguy hiểm nhất trên hồ tiêu, có thể làm chết trụ tiêu chỉ sau vài tuần.</p>
                    <h2>Dấu hiệu nhận biết</h2>
                    <ul>
                      <li>Lá vàng, héo rũ nhanh, rụng hàng loạt dù đất vẫn ẩm.</li>
                      <li>Gốc thân sát mặt đất thâm đen, vỏ bong, có mùi hôi.</li>
                      <li>Rễ thối nhũn, dễ tuột vỏ.</li>
                    </ul>
                    <h2>Cách phòng</h2>
                    <ul>
                      <li>Đào rãnh thoát nước trước mùa mưa, không để nước đọng quanh gốc.</li>
                      <li>Không xới xáo làm đứt rễ trong mùa mưa; tỉa bớt cành sát đất.</li>
                      <li>Bón phân hữu cơ hoai mục có bổ sung nấm đối kháng (Trichoderma).</li>
                      <li>Trụ bệnh: nhổ bỏ, tiêu hủy, xử lý vôi chỗ trồng; không mang đất bệnh sang trụ khác.</li>
                    </ul>
                    <p>Khi dùng thuốc BVTV, đọc kỹ nhãn, dùng đúng liều và tuân thủ thời gian cách ly trước thu hoạch.</p>
                    <blockquote>Bài mẫu, chỉ để tham khảo.</blockquote>
                    HTML,
            ],
            [
                'slug' => 'bon-phan-lua-dong-xuan-bai-mau',
                'category' => 'phan-bon-thuoc-bvtv',
                'products' => ['lua-om-5451', 'lua-dai-thom-8', 'ure-phu-my', 'dap-dinh-vu'],
                'title' => 'Bón phân cho lúa Đông Xuân: chia đợt thế nào cho hiệu quả (bài mẫu)',
                'excerpt' => 'Bón lót, bón thúc đẻ nhánh và bón đón đòng là 3 đợt chính. Chia đúng thời điểm giúp tiết kiệm phân, cây cứng, ít sâu bệnh.',
                'featured' => false,
                'days_ago' => 3,
                'content' => <<<'HTML'
                    <p>Vụ Đông Xuân thời tiết thuận lợi, năng suất cao nhất trong năm. Bón phân đúng đợt giúp tận dụng tốt điều kiện này.</p>
                    <h2>Các đợt bón chính</h2>
                    <ol>
                      <li><strong>Bón lót</strong> (trước sạ / cấy): phân lân và một phần đạm, kali.</li>
                      <li><strong>Bón thúc 1</strong> (7–10 ngày sau sạ): chủ yếu đạm để cây đẻ nhánh.</li>
                      <li><strong>Bón thúc 2</strong> (18–22 ngày sau sạ): đạm + kali, nuôi nhánh hữu hiệu.</li>
                      <li><strong>Bón đón đòng</strong> (40–45 ngày sau sạ): kali + ít đạm, tùy màu lá.</li>
                    </ol>
                    <h2>Mẹo nhỏ</h2>
                    <ul>
                      <li>Dùng bảng so màu lá để quyết định lượng đạm, tránh bón thừa gây lốp đổ, nhiều sâu bệnh.</li>
                      <li>Bón khi ruộng có lớp nước mỏng, không bón trước cơn mưa lớn.</li>
                      <li>Theo dõi giá phân trên mục Bảng giá để mua lúc giá tốt.</li>
                    </ul>
                    <blockquote>Bài mẫu, chỉ để tham khảo. Lượng phân cụ thể tùy giống, chân đất và khuyến cáo địa phương.</blockquote>
                    HTML,
            ],
            [
                'slug' => 'xem-gia-va-dat-canh-bao-tren-nha-nong-bai-mau',
                'category' => 'thi-truong-gia-ca',
                'products' => ['ca-phe-robusta', 'ho-tieu'],
                'title' => 'Xem giá và đặt cảnh báo giá trên Nhà Nông (bài mẫu)',
                'excerpt' => 'Theo dõi giá cà phê, hồ tiêu, lúa gạo, sầu riêng mỗi ngày và nhận thông báo khi giá lên tới mức mình muốn bán.',
                'featured' => false,
                'days_ago' => 4,
                'content' => <<<'HTML'
                    <p>Mục <strong>Bảng giá</strong> cập nhật giá nông sản và vật tư 2 lần mỗi ngày (khoảng 8:30 và 14:30) từ các nguồn công khai.</p>
                    <h2>Xem biểu đồ giá</h2>
                    <p>Bấm vào một mặt hàng để xem biểu đồ 7 / 30 / 90 ngày và so sánh giá giữa các tỉnh.</p>
                    <h2>Đặt cảnh báo</h2>
                    <ul>
                      <li><strong>Khi giá thay đổi:</strong> báo mỗi ngày có giá mới.</li>
                      <li><strong>Khi giá lên tới / xuống tới:</strong> báo một lần khi giá vượt mức đã đặt.</li>
                    </ul>
                    <p>Cảnh báo được gửi qua thông báo trên điện thoại, cần cài app Nhà Nông.</p>
                    <h2>Giá quanh tôi</h2>
                    <p>Chọn khu vực của bạn để xem giá các điểm thu mua gần nhà, so với giá chung của tỉnh.</p>
                    HTML,
            ],
        ];

        foreach ($articles as $data) {
            $category = ArticleCategory::query()->where('slug', $data['category'])->firstOrFail();
            $article = Article::query()->updateOrCreate(['slug' => $data['slug']], [
                'article_category_id' => $category->id,
                'title' => $data['title'],
                'excerpt' => $data['excerpt'],
                'content' => $data['content'],
                'status' => ArticleStatus::Published,
                'published_at' => now()->subDays($data['days_ago'])->setTime(7, 0),
                'is_featured' => $data['featured'],
            ]);
            $article->products()->sync(Product::query()->whereIn('code', $data['products'])->pluck('id'));
        }
    }
}
