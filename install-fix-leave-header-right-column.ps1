#requires -Version 5.1
[CmdletBinding()]
param(
    [string]$ProjectPath = "D:\work-attendance-main",
    [switch]$SkipBuild
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

function Step([string]$Text) {
    Write-Host ""
    Write-Host "==> $Text" -ForegroundColor Cyan
}

function Ok([string]$Text) {
    Write-Host "[OK] $Text" -ForegroundColor Green
}

function Write-Utf8Bom([string]$Path, [string]$Text) {
    $utf8Bom = New-Object System.Text.UTF8Encoding($true)
    [System.IO.File]::WriteAllText(
        $Path,
        $Text.TrimStart([char]0xFEFF),
        $utf8Bom
    )
}

Set-Location -LiteralPath $ProjectPath

$cssPath = Join-Path $ProjectPath "app\leave\leave.module.css"

if (-not (Test-Path -LiteralPath $cssPath)) {
    throw "ไม่พบไฟล์ $cssPath"
}

$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backupDir = Join-Path $ProjectPath "_backup\fix-leave-header-right-column-$timestamp"
New-Item -ItemType Directory -Path $backupDir -Force | Out-Null

Copy-Item -LiteralPath $cssPath -Destination (Join-Path $backupDir "leave.module.css") -Force
Ok "สำรอง CSS ไว้ที่ $backupDir"

$css = [System.IO.File]::ReadAllText($cssPath, [System.Text.Encoding]::UTF8)

Step "ปรับปุ่ม Dashboard และสถิติให้เรียงแนวตั้ง"

$startMarker = "/* FIX LEAVE HEADER RIGHT COLUMN START */"
$endMarker = "/* FIX LEAVE HEADER RIGHT COLUMN END */"

if ($css.Contains($startMarker)) {
    $startIndex = $css.IndexOf($startMarker)
    $endIndex = $css.IndexOf($endMarker, $startIndex)

    if ($endIndex -ge 0) {
        $endIndex += $endMarker.Length
        $css = $css.Remove(
            $startIndex,
            $endIndex - $startIndex
        ).TrimEnd()
    }
}

$overrideCss = @'

/* FIX LEAVE HEADER RIGHT COLUMN START */

/*
  Desktop:
  - ปุ่ม Dashboard อยู่บน
  - สถิติอยู่ด้านล่าง
  - ทั้งสองส่วนกว้างเท่ากัน
  - ไม่ใช้ max-content เพื่อป้องกันหลุดกรอบ
*/
.header{
  min-width:0;
}

.headerTitle{
  min-width:0;
}

.headerActions{
  display:flex!important;
  flex:0 1 290px;
  flex-direction:column!important;
  align-items:stretch!important;
  justify-content:flex-start!important;
  gap:8px!important;
  width:min(290px,100%)!important;
  max-width:100%!important;
  min-width:0!important;
  box-sizing:border-box;
}

.headerActions .dashboardButton{
  display:flex;
  align-items:center;
  justify-content:center;
  width:100%!important;
  max-width:100%!important;
  min-width:0!important;
  min-height:42px;
  box-sizing:border-box;
}

.headerActions .leaveStatsStack{
  display:grid!important;
  gap:6px!important;
  width:100%!important;
  max-width:100%!important;
  min-width:0!important;
  box-sizing:border-box;
}

.headerActions .leaveStatsCard{
  width:100%!important;
  max-width:100%!important;
  min-width:0!important;
  box-sizing:border-box;
}

.headerActions .leaveStatsBreakdown{
  display:grid!important;
  grid-template-columns:repeat(2,minmax(0,1fr))!important;
  gap:6px!important;
  width:100%!important;
  max-width:100%!important;
  min-width:0!important;
  box-sizing:border-box;
}

.headerActions .leaveStatsBreakdown article{
  width:100%!important;
  min-width:0!important;
  max-width:100%!important;
  box-sizing:border-box;
  overflow:hidden;
}

.headerActions .leaveStatsBreakdown small,
.headerActions .leaveStatsBreakdown strong{
  min-width:0;
  white-space:nowrap;
}

/*
  Tablet:
  ลดความกว้างเล็กน้อย แต่ยังอยู่ในคอลัมน์ขวา
*/
@media(max-width:1050px) and (min-width:801px){
  .headerActions{
    flex-basis:250px;
    width:min(250px,100%)!important;
  }

  .headerActions .leaveStatsBreakdown article{
    padding-left:7px;
    padding-right:7px;
  }

  .headerActions .leaveStatsBreakdown small{
    font-size:9px;
  }

  .headerActions .leaveStatsBreakdown strong{
    font-size:10px;
  }
}

/*
  Mobile:
  - ซ่อนปุ่ม Dashboard
  - ใช้เมนูสามขีด
  - สถิติกว้างเต็มกรอบ
*/
@media(max-width:800px){
  .headerActions{
    flex:1 1 100%;
    width:100%!important;
    max-width:100%!important;
  }

  .headerActions .dashboardButton{
    display:none!important;
  }

  .headerActions .leaveStatsStack{
    width:100%!important;
  }

  .headerActions .leaveStatsCard,
  .headerActions .leaveStatsBreakdown{
    width:100%!important;
    max-width:100%!important;
  }
}

@media(max-width:380px){
  .headerActions .leaveStatsBreakdown{
    gap:5px!important;
  }

  .headerActions .leaveStatsBreakdown article{
    padding:5px 6px;
  }

  .headerActions .leaveStatsBreakdown small{
    font-size:8.5px;
  }

  .headerActions .leaveStatsBreakdown strong{
    font-size:9.5px;
  }
}

/* FIX LEAVE HEADER RIGHT COLUMN END */
'@

$css = $css.TrimEnd() + $overrideCss
Write-Utf8Bom -Path $cssPath -Text $css
Ok "ปรับ CSS เรียบร้อยแล้ว"

Step "ตรวจ UTF-8 BOM"

$bytes = [System.IO.File]::ReadAllBytes($cssPath)
$hasBom = (
    $bytes.Length -ge 3 -and
    $bytes[0] -eq 0xEF -and
    $bytes[1] -eq 0xBB -and
    $bytes[2] -eq 0xBF
)

if (-not $hasBom) {
    throw "ไฟล์ไม่มี UTF-8 BOM: $cssPath"
}

Ok "UTF-8 BOM ถูกต้อง"

if (-not $SkipBuild) {
    Step "รัน npm run build"
    npm run build

    if ($LASTEXITCODE -ne 0) {
        throw "Build ไม่ผ่าน สามารถกู้ไฟล์จาก $backupDir"
    }

    Ok "Build ผ่าน"
}

Step "เสร็จสิ้น"
Write-Host "ไฟล์สำรอง: $backupDir"
Write-Host "ทดสอบต่อด้วย: npm run dev"
