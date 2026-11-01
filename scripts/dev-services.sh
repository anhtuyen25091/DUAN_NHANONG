#!/bin/bash
# Bật / tắt các tiến trình nền trên máy dev (macOS, launchd): lịch chạy + hàng đợi của backend/ và iot/.
# Tự chạy lại khi mở máy và khi bị tắt ngang.
#
#   scripts/dev-services.sh install     # bật (cài vào ~/Library/LaunchAgents)
#   scripts/dev-services.sh uninstall   # tắt hẳn
#   scripts/dev-services.sh status      # xem đang chạy không
#
# Lịch backend: lấy giá 8:30 / 14:30, báo dự phòng 9:00 / 15:00, cảnh báo giá 9:30 / 15:30...
# Lịch iot: gộp số đo, báo thiết bị mất kết nối, báo mưa (15 phút), lưu lượng mưa (mỗi giờ)...
# Log: backend/storage/logs/*.log, iot/storage/logs/*.log

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PHP="${PHP_BIN:-$(command -v php)}"
AGENTS="$HOME/Library/LaunchAgents"
PREFIX="vn.nhanong.dev"

# nhãn | thư mục | lệnh artisan | file log
SERVICES=(
  "backend-schedule|backend|schedule:work|schedule.log"
  "backend-queue|backend|queue:work --sleep=3 --tries=3 --max-time=3600|queue.log"
  "iot-schedule|iot|schedule:work|schedule.log"
  "iot-queue|iot|queue:work --sleep=3 --tries=3 --max-time=3600|queue.log"
)

plist_path() { echo "$AGENTS/$PREFIX.$1.plist"; }

install() {
  mkdir -p "$AGENTS"
  for entry in "${SERVICES[@]}"; do
    IFS='|' read -r name dir command log <<< "$entry"
    local plist
    plist="$(plist_path "$name")"
    local args="<string>$PHP</string><string>artisan</string>"
    for part in $command; do args="$args<string>$part</string>"; done

    cat > "$plist" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$PREFIX.$name</string>
  <key>ProgramArguments</key><array>$args</array>
  <key>WorkingDirectory</key><string>$ROOT/$dir</string>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ThrottleInterval</key><integer>30</integer>
  <key>StandardOutPath</key><string>$ROOT/$dir/storage/logs/$log</string>
  <key>StandardErrorPath</key><string>$ROOT/$dir/storage/logs/$log</string>
</dict>
</plist>
EOF
    launchctl unload "$plist" 2>/dev/null || true
    launchctl load "$plist"
    echo "Đã bật $name"
  done
}

uninstall() {
  for entry in "${SERVICES[@]}"; do
    IFS='|' read -r name _ <<< "$entry"
    local plist
    plist="$(plist_path "$name")"
    if [ -f "$plist" ]; then
      launchctl unload "$plist" 2>/dev/null || true
      rm -f "$plist"
      echo "Đã tắt $name"
    fi
  done
}

status() {
  for entry in "${SERVICES[@]}"; do
    IFS='|' read -r name _ <<< "$entry"
    local line
    line="$(launchctl list | awk -v label="$PREFIX.$name" '$3 == label')"
    if [ -n "$line" ]; then
      echo "$name: đang bật (pid $(echo "$line" | awk '{print $1}'))"
    else
      echo "$name: tắt"
    fi
  done
}

case "${1:-status}" in
  install) install ;;
  uninstall) uninstall ;;
  status) status ;;
  *) echo "Dùng: $0 install|uninstall|status" >&2; exit 1 ;;
esac
