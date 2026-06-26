$ErrorActionPreference = "Stop"

$project = "D:\work-attendance-system"
$file = Join-Path $project "app\api\admin\attendance\daily-pdf\route.ts"

if (-not (Test-Path $file)) {
  throw "File not found: $file"
}

$content = Get-Content -Path $file -Raw -Encoding UTF8

$helperAnchor = @'
function attendanceStatus(record: AttendanceRecord) {
  if (!record.check_in_at) return "";
  if (record.check_in_status === "late") return "มาสาย";
  if (record.check_out_status === "early") return "ออกก่อนเวลา";
  if (!record.check_out_at) return "ยังไม่ลงเวลาออก";
  return "ปกติ";
}
'@

$helperReplacement = @'
function attendanceStatus(record: AttendanceRecord) {
  if (!record.check_in_at) return "";
  if (record.check_in_status === "late") return "มาสาย";
  if (record.check_out_status === "early") return "ออกก่อนเวลา";
  if (!record.check_out_at) return "ยังไม่ลงเวลาออก";
  return "ปกติ";
}

function formatLateReason(note: string | null) {
  if (!note) return "";

  return note
    .trim()
    .replace(/^ขออนุญาตมาสาย\s*/u, "")
    .replace(/^เนื่องจาก\s*/u, "")
    .replace(/^เพราะ\s*/u, "")
    .trim();
}
'@

if ($content.Contains($helperAnchor)) {
  $content = $content.Replace($helperAnchor, $helperReplacement)
} elseif (-not $content.Contains("function formatLateReason(")) {
  throw "Could not find attendanceStatus() anchor."
}

$oldRowNote = '      note: record.note?.trim() ?? "",'
$newRowNote = @'
      note:
        record.check_in_status === "late"
          ? formatLateReason(record.note)
          : "",
'@

if ($content.Contains($oldRowNote)) {
  $content = $content.Replace($oldRowNote, $newRowNote.TrimEnd())
} elseif (-not $content.Contains("formatLateReason(record.note)")) {
  throw "Could not find row note mapping."
}

$backup = "$file.backup-late-reason-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
Copy-Item $file $backup

Set-Content -Path $file -Value $content -Encoding UTF8

Push-Location $project
try {
  npm run build
} catch {
  Copy-Item $backup $file -Force
  throw
} finally {
  Pop-Location
}

Write-Host ""
Write-Host "Updated: app/api/admin/attendance/daily-pdf/route.ts"
Write-Host "Backup: $backup"
Write-Host "Build passed."
