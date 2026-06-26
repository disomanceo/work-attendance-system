param(
  [string]$BackupRoot = "D:\work-attendance-system-backup",
  [string]$OutputFile = "D:\gas-upload-candidates.txt"
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path $BackupRoot)) {
  throw "ไม่พบโฟลเดอร์สำรอง: $BackupRoot"
}

$patterns = @(
  "doPost","upload","signature","avatar","profileImage",
  "profile_image","signatureUrl","signature_url",
  "photoUrl","photo_url","ลายเซ็น","รูปภาพ",
  "ไม่พบ action","ไม่พบ Action"
)

$files = Get-ChildItem -Path $BackupRoot -Recurse -File `
  -Include *.gs,*.js,*.mjs,*.cjs,*.ts,*.tsx,*.html `
  -ErrorAction SilentlyContinue

$results = foreach ($file in $files) {
  foreach ($pattern in $patterns) {
    Select-String -Path $file.FullName -Pattern $pattern `
      -SimpleMatch -ErrorAction SilentlyContinue |
    Select-Object @{Name="File";Expression={$_.Path}},LineNumber,Line
  }
}

$results | Sort-Object File,LineNumber -Unique |
  Format-Table -AutoSize | Out-String -Width 500 |
  Set-Content -Path $OutputFile -Encoding UTF8

Write-Host "ค้นหาเสร็จแล้ว: $OutputFile" -ForegroundColor Green
Get-Content $OutputFile
