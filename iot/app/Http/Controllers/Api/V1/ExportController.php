<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Plot;
use App\Services\Weather\OpenMeteo;
use App\Support\Ownership;
use App\Support\XlsxWriter;
use Carbon\CarbonImmutable;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Symfony\Component\HttpFoundation\Response;

/**
 * Tải số đo của 1 lô ra file Excel (.xlsx, mặc định) hoặc CSV: mỗi dòng 1 lần đo, giờ Việt Nam.
 * Dữ liệu thô giữ 180 ngày (readings:prune) nên tải tối đa 180 ngày.
 */
class ExportController extends Controller
{
    private const HEADERS = ['Thời gian', 'Thiết bị', 'Chỉ số', 'Giá trị', 'Đơn vị'];

    public function plot(Request $request, Plot $plot): Response
    {
        Ownership::plot($request, $plot, Ownership::VIEW);
        $data = $request->validate([
            'days' => ['nullable', 'integer', 'min:1', 'max:180'],
            'format' => ['nullable', Rule::in(['xlsx', 'csv'])],
        ]);
        $days = (int) ($data['days'] ?? 30);
        $format = $data['format'] ?? 'xlsx';
        $from = CarbonImmutable::now(OpenMeteo::TIMEZONE)->startOfDay()->subDays($days - 1);

        $rows = DB::table('readings')
            ->join('devices', 'devices.id', '=', 'readings.device_id')
            ->join('metrics', 'metrics.id', '=', 'readings.metric_id')
            ->where('devices.plot_id', $plot->id)
            ->where('readings.measured_at', '>=', $from->utc())
            ->orderBy('readings.measured_at')
            ->orderBy('devices.name')
            ->orderBy('metrics.id')
            ->select(['readings.measured_at', 'readings.value', 'devices.name AS device', 'metrics.name AS metric', 'metrics.unit'])
            ->cursor()
            ->map(fn (object $row): array => [
                CarbonImmutable::parse($row->measured_at, 'UTC')->setTimezone(OpenMeteo::TIMEZONE)->format('Y-m-d H:i'),
                $row->device,
                $row->metric,
                round((float) $row->value, 3),
                $row->unit,
            ]);

        $name = 'so-do-'.Str::slug($plot->name).'-'.$from->format('Ymd').'-'.now(OpenMeteo::TIMEZONE)->format('Ymd').'.'.$format;

        if ($format === 'csv') {
            return response()->streamDownload(function () use ($rows) {
                $out = fopen('php://output', 'w');
                fwrite($out, "\xEF\xBB\xBF"); // BOM để Excel đọc đúng tiếng Việt
                fputcsv($out, self::HEADERS, escape: '');
                foreach ($rows as $row) {
                    fputcsv($out, $row, escape: '');
                }
                fclose($out);
            }, $name, ['Content-Type' => 'text/csv; charset=UTF-8']);
        }

        $xlsx = new XlsxWriter(Str::limit($plot->name, 28, ''), [17, 24, 22, 10, 9]);
        $xlsx->addRow(self::HEADERS, bold: true);
        foreach ($rows as $row) {
            $xlsx->addRow($row);
        }

        return response()->download($xlsx->finish(), $name, [
            'Content-Type' => 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        ])->deleteFileAfterSend();
    }
}
