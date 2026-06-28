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

$pagePath = Join-Path $ProjectPath "app\attendance\history\page.tsx"
$cssPath  = Join-Path $ProjectPath "app\attendance\history\attendance-history.module.css"

foreach ($path in @($pagePath, $cssPath)) {
    if (-not (Test-Path -LiteralPath $path)) {
        throw "ไม่พบไฟล์ $path"
    }
}

$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backupDir = Join-Path $ProjectPath "_backup\fix-attendance-history-navigation-$timestamp"
New-Item -ItemType Directory -Path $backupDir -Force | Out-Null

Copy-Item -LiteralPath $pagePath -Destination (Join-Path $backupDir "page.tsx") -Force
Copy-Item -LiteralPath $cssPath -Destination (Join-Path $backupDir "attendance-history.module.css") -Force
Ok "สำรองไฟล์ไว้ที่ $backupDir"

$page = [System.IO.File]::ReadAllText($pagePath, [System.Text.Encoding]::UTF8)
$css  = [System.IO.File]::ReadAllText($cssPath, [System.Text.Encoding]::UTF8)

Step "ลบปุ่มกลับหน้าลงเวลาที่ซ้ำ"

$duplicateButton = '<button type="button" onClick={() => router.push("/attendance")}>กลับหน้าลงเวลา</button>'

if ($page.Contains($duplicateButton)) {
    $page = $page.Replace(
        "            $duplicateButton`r`n",
        ""
    )
    $page = $page.Replace(
        "            $duplicateButton`n",
        ""
    )
    $page = $page.Replace($duplicateButton, "")
    Ok "ลบปุ่มกลับหน้าลงเวลาแล้ว"
}
else {
    Write-Host "[คำเตือน] ไม่พบปุ่มกลับหน้าลงเวลา อาจถูกลบไว้แล้ว" -ForegroundColor Yellow
}

$mainButtonOld = '<button type="button" onClick={() => router.push("/attendance")}>กลับหน้าหลัก</button>'
$mainButtonNew = @'
<button
              type="button"
              className={styles.desktopHomeButton}
              onClick={() => router.push("/attendance")}
            >
              กลับหน้าหลัก
            </button>
'@

if ($page.Contains($mainButtonOld)) {
    $page = $page.Replace($mainButtonOld, $mainButtonNew.TrimEnd())
    Ok "กำหนดคลาสปุ่มกลับหน้าหลักแล้ว"
}
elseif ($page.Contains("desktopHomeButton")) {
    Ok "ปุ่มกลับหน้าหลักมีคลาสสำหรับ Responsive แล้ว"
}
else {
    throw "ไม่พบปุ่มกลับหน้าหลัก"
}

Write-Utf8Bom -Path $pagePath -Text $page
Ok "บันทึก page.tsx แล้ว"

Step "ซ่อนปุ่มบนมือถือ"

$startMarker = "/* ATTENDANCE HISTORY NAVIGATION START */"
$endMarker   = "/* ATTENDANCE HISTORY NAVIGATION END */"

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

$navCss = @'

/* ATTENDANCE HISTORY NAVIGATION START */

.desktopHomeButton{
  display:inline-flex;
  align-items:center;
  justify-content:center;
}

/* มือถือใช้เมนูสามขีด จึงไม่แสดงปุ่มย้อนกลับซ้ำ */
@media(max-width:700px){
  .headerActions{
    display:none!important;
  }

  .desktopHomeButton{
    display:none!important;
  }
}

/* ATTENDANCE HISTORY NAVIGATION END */
'@

$css = $css.TrimEnd() + $navCss
Write-Utf8Bom -Path $cssPath -Text $css
Ok "บันทึก CSS แล้ว"

Step "ตรวจ UTF-8 BOM"

foreach ($path in @($pagePath, $cssPath)) {
    $bytes = [System.IO.File]::ReadAllBytes($path)
    $hasBom = (
        $bytes.Length -ge 3 -and
        $bytes[0] -eq 0xEF -and
        $bytes[1] -eq 0xBB -and
        $bytes[2] -eq 0xBF
    )

    if (-not $hasBom) {
        throw "ไฟล์ไม่มี UTF-8 BOM: $path"
    }

    Ok "UTF-8 BOM: $path"
}

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
