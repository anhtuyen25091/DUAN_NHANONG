{{-- Mẫu PDF chung cho phiếu / bảng kê / báo cáo (dompdf: CSS 2.1, font DejaVu Sans có đủ dấu tiếng Việt) --}}
<!doctype html>
<html lang="vi">
<head>
<meta charset="utf-8">
<title>{{ $doc->title }}</title>
<style>
    @page { margin: 14mm 12mm 14mm 12mm; }
    body { font-family: 'DejaVu Sans', sans-serif; font-size: 10.5pt; color: #1f2933; }
    .issuer { width: 100%; border-bottom: 2px solid #1f7a3a; padding-bottom: 6px; margin-bottom: 10px; }
    .issuer-name { font-size: 13pt; font-weight: bold; color: #1f7a3a; }
    .issuer-line { font-size: 9pt; color: #52606d; }
    h1 { text-align: center; font-size: 16pt; margin: 6px 0 2px; letter-spacing: 0.5px; }
    .subtitle { text-align: center; font-size: 9.5pt; color: #52606d; margin-bottom: 10px; }
    table.info { width: 100%; margin-bottom: 8px; }
    table.info td { padding: 2px 0; vertical-align: top; }
    table.info td.label { width: 28%; color: #52606d; }
    h2 { font-size: 11pt; margin: 12px 0 4px; }
    table.grid { width: 100%; border-collapse: collapse; margin-bottom: 6px; }
    table.grid th { background: #e8f3ec; border: 1px solid #9fb3a6; padding: 4px 5px; font-size: 9pt; text-align: center; }
    table.grid td { border: 1px solid #c4cdc6; padding: 4px 5px; font-size: 9.5pt; }
    table.grid tr.footer td { font-weight: bold; background: #f4f6f4; }
    .right { text-align: right; }
    .center { text-align: center; }
    table.summary { width: 60%; margin-left: 40%; border-collapse: collapse; margin-top: 4px; }
    table.summary td { padding: 3px 5px; }
    table.summary td.value { text-align: right; }
    table.summary tr.bold td { font-weight: bold; font-size: 11pt; border-top: 1px solid #9fb3a6; }
    .words { margin-top: 6px; font-style: italic; }
    .notes { margin-top: 8px; font-size: 9pt; color: #52606d; }
    table.sign { width: 100%; margin-top: 18px; }
    table.sign td { text-align: center; vertical-align: top; height: 80px; }
    table.sign .hint { font-size: 8.5pt; font-style: italic; color: #52606d; }
    .footer-line { position: fixed; bottom: -8mm; left: 0; right: 0; font-size: 8pt; color: #9aa5b1; text-align: center; }
</style>
</head>
<body>
    <div class="footer-line">Lập bằng ứng dụng Nhà Nông · {{ now()->format('d/m/Y H:i') }}</div>
    <div class="issuer">
        <div class="issuer-name">{{ $doc->issuer['name'] }}</div>
        @foreach ($doc->issuer['lines'] as $line)
            <div class="issuer-line">{{ $line }}</div>
        @endforeach
    </div>

    <h1>{{ $doc->title }}</h1>
    @if ($doc->subtitle)
        <div class="subtitle">{{ $doc->subtitle }}</div>
    @endif

    @if ($doc->info)
        <table class="info">
            @foreach ($doc->info as [$label, $value])
                <tr><td class="label">{{ $label }}</td><td>{{ $value }}</td></tr>
            @endforeach
        </table>
    @endif

    @foreach ($doc->tables as $table)
        @if ($table->heading)
            <h2>{{ $table->heading }}</h2>
        @endif
        <table class="grid">
            <thead>
                <tr>
                    @foreach ($table->columns as $column)
                        <th>{{ $column[0] }}</th>
                    @endforeach
                </tr>
            </thead>
            <tbody>
                @forelse ($table->rows as $row)
                    <tr>
                        @foreach ($row as $i => $cell)
                            <td class="{{ $table->align($i) }}">{{ $cell }}</td>
                        @endforeach
                    </tr>
                @empty
                    <tr><td colspan="{{ count($table->columns) }}" class="center">Không có giao dịch</td></tr>
                @endforelse
                @if ($table->footer)
                    <tr class="footer">
                        @foreach ($table->footer as $i => $cell)
                            <td class="{{ $table->align($i) }}">{{ $cell }}</td>
                        @endforeach
                    </tr>
                @endif
            </tbody>
        </table>
    @endforeach

    @if ($doc->summary)
        <table class="summary">
            @foreach ($doc->summary as $line)
                <tr class="{{ ($line[2] ?? false) ? 'bold' : '' }}"><td>{{ $line[0] }}</td><td class="value">{{ $line[1] }}</td></tr>
            @endforeach
        </table>
    @endif

    @if ($doc->inWords)
        <div class="words">Bằng chữ: {{ $doc->inWords }}</div>
    @endif

    @if ($doc->notes)
        <div class="notes">
            @foreach ($doc->notes as $note)
                <div>{{ $note }}</div>
            @endforeach
        </div>
    @endif

    @if ($doc->signatures)
        <table class="sign">
            <tr>
                @foreach ($doc->signatures as $who)
                    <td><b>{{ $who }}</b><br><span class="hint">(Ký, ghi rõ họ tên)</span></td>
                @endforeach
            </tr>
        </table>
    @endif
</body>
</html>
