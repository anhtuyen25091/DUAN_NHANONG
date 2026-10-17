<?php

namespace App\Shops\Collect;

use App\Enums\CandidateStatus;
use App\Models\ShopCandidate;
use App\Support\Provinces;

/**
 * Chạy 1 nguồn: lưu từng điểm vào bảng chờ (cập nhật nếu đã có), rồi xử lý các điểm đang chờ của nguồn đó.
 */
class ShopCollector
{
    public function __construct(private CandidateProcessor $processor) {}

    /**
     * @return array{new: int, updated: int, skipped: int}
     */
    public function collect(ShopSource $source): array
    {
        $counts = ['new' => 0, 'updated' => 0, 'skipped' => 0];
        $now = now();

        foreach ($source->collect() as $data) {
            $name = ShopNormalizer::displayName($data->name);
            if ($name === '' || $data->ref === '') {
                $counts['skipped']++;

                continue;
            }

            $candidate = ShopCandidate::query()->firstOrNew(['source' => $source->key(), 'source_ref' => mb_substr($data->ref, 0, 191)]);
            $isNew = ! $candidate->exists;
            $province = $data->province !== null && Provinces::name($data->province) !== null
                ? $data->province
                : Provinces::detect($data->province) ?? Provinces::detect($data->address);

            $candidate->fill([
                'source_trust' => $source->trust(),
                'source_url' => $data->url,
                'name' => mb_substr($name, 0, 255),
                'types' => CandidateProcessor::typesFor($data),
                'address' => $data->address !== null ? mb_substr(trim($data->address), 0, 500) : null,
                'province_code' => $province,
                'phone' => ShopNormalizer::phone($data->phone),
                'goods' => $data->goods !== null ? mb_substr($data->goods, 0, 255) : null,
                'raw' => $data->raw ?: null,
                'last_seen_at' => $now,
            ]);
            // Nguồn có sẵn tọa độ (OSM, trang đại lý của hãng) thì dùng luôn
            if ($data->lat !== null && $data->lng !== null) {
                $candidate->fill(['lat' => $data->lat, 'lng' => $data->lng, 'geo_precision' => 'exact']);
            }
            if ($isNew) {
                $candidate->status = CandidateStatus::Pending;
            } elseif ($candidate->status === CandidateStatus::Pending && $candidate->isDirty(['name', 'types', 'address', 'province_code', 'phone', 'lat'])) {
                // Nguồn sửa thông tin: xử lý lại
                $candidate->review_note = null;
            }
            $candidate->save();
            $counts[$isNew ? 'new' : 'updated']++;
        }

        return $counts;
    }

    /**
     * Xử lý các điểm đang chờ (của 1 nguồn, hoặc tất cả khi $sourceKey = null).
     *
     * @return array{published: int, pending: int, deferred: int}
     */
    public function process(?string $sourceKey = null, int $limit = 0): array
    {
        $counts = ['published' => 0, 'pending' => 0, 'deferred' => 0];
        $query = ShopCandidate::query()
            ->when($sourceKey !== null, fn ($q) => $q->where('source', $sourceKey))
            ->where('status', CandidateStatus::Pending)
            // Điểm đã xử lý mà còn chờ (đợi admin) thì không xử lý lại, trừ khi nguồn sửa thông tin
            ->whereNull('review_note')
            ->orderBy('id');

        foreach ($limit > 0 ? $query->limit($limit)->get() : $query->lazyById() as $candidate) {
            $result = $this->processor->process($candidate);
            if ($result !== 'skipped') {
                $counts[$result]++;
            }
        }

        return $counts;
    }
}
