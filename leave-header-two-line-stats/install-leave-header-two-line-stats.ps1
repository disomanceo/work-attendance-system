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

$pagePath = Join-Path $ProjectPath "app\leave\page.tsx"
$cssPath = Join-Path $ProjectPath "app\leave\leave.module.css"

if (-not (Test-Path -LiteralPath $pagePath)) {
    throw "ไม่พบไฟล์ $pagePath"
}
if (-not (Test-Path -LiteralPath $cssPath)) {
    throw "ไม่พบไฟล์ $cssPath"
}

$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backupDir = Join-Path $ProjectPath "_backup\leave-header-stats-$timestamp"
New-Item -ItemType Directory -Path $backupDir -Force | Out-Null

Copy-Item -LiteralPath $pagePath -Destination (Join-Path $backupDir "page.tsx") -Force
Copy-Item -LiteralPath $cssPath -Destination (Join-Path $backupDir "leave.module.css") -Force
Ok "สำรองไฟล์ไว้ที่ $backupDir"

$page = [System.IO.File]::ReadAllText($pagePath, [System.Text.Encoding]::UTF8)
$css = [System.IO.File]::ReadAllText($cssPath, [System.Text.Encoding]::UTF8)

Step "ปรับส่วนหัวและสถิติการลา"

$startMarker = '<div className={styles.headerActions}>'
$endMarkers = @(
    "</div>`r`n</header>",
    "</div>`n</header>",
    "          </div>`r`n</header>",
    "          </div>`n</header>"
)

$startIndex = $page.IndexOf($startMarker)
if ($startIndex -lt 0) {
    throw "ไม่พบ headerActions"
}

$endIndex = -1
$matchedEndMarker = ""

foreach ($marker in $endMarkers) {
    $candidate = $page.IndexOf($marker, $startIndex)
    if ($candidate -ge 0 -and ($endIndex -lt 0 -or $candidate -lt $endIndex)) {
        $endIndex = $candidate
        $matchedEndMarker = $marker
    }
}

if ($endIndex -lt 0) {
    throw "ไม่พบจุดสิ้นสุด headerActions"
}

$newHeaderActions = @'
<div className={styles.headerActions}>
            <a href="/attendance" className={styles.dashboardButton}>
              <span aria-hidden="true">⌂</span>
              กลับหน้า Dashboard
            </a>

            {summary && leaveSettings && (
              <div className={styles.leaveStatsStack}>
                <section
                  className={`${styles.leaveStatsCard} ${
                    summary.combined.times >
                      leaveSettings.combinedLeaveTimesLimit ||
                    summary.combined.days >
                      leaveSettings.combinedLeaveDaysLimit
                      ? styles.leaveStatsExceeded
                      : ""
                  }`}
                  aria-label="สถิติการลา"
                >
                  <strong>สถิติการลา</strong>

                  <span>
                    {summary.combined.times}/
                    {leaveSettings.combinedLeaveTimesLimit} ครั้ง
                    <b aria-hidden="true">•</b>
                    {summary.combined.days}/
                    {leaveSettings.combinedLeaveDaysLimit} วัน
                  </span>

                  <small>
                    ลาแล้ว {summary.combined.times} ครั้ง รวม{" "}
                    {summary.combined.days} วัน
                  </small>
                </section>

                <div
                  className={styles.leaveStatsBreakdown}
                  aria-label="สรุปวันลาป่วยและลากิจ"
                >
                  <article data-type="sick">
                    <small>ลาป่วย</small>
                    <strong>{summary.sick.days} วัน</strong>
                  </article>

                  <article data-type="personal">
                    <small>ลากิจ</small>
                    <strong>{summary.personal.days} วัน</strong>
                  </article>
                </div>
              </div>
            )}
          </div>
'@

$replaceLength = ($endIndex + $matchedEndMarker.Length) - $startIndex
$replacement = $newHeaderActions.TrimEnd() + $matchedEndMarker.Substring(
    $matchedEndMarker.IndexOf("</div>") + 6
)

# newHeaderActions มี </div> ของ headerActions อยู่แล้ว จึงต่อเฉพาะ </header>
$page = $page.Remove($startIndex, $replaceLength)
$page = $page.Insert($startIndex, $newHeaderActions.TrimEnd() + "`r`n</header>")

Step "ลบการ์ดลาป่วยและลากิจเดิมตรงกลาง หากยังมีอยู่"

$summaryGridPattern = '(?s)\s*\{summary\s*&&\s*leaveSettings\s*&&\s*\(\s*<section\s+className=\{styles\.summaryGrid\}>.*?</section>\s*\)\}'

if ([regex]::IsMatch($page, $summaryGridPattern)) {
    $page = [regex]::Replace($page, $summaryGridPattern, '', 1)
    Ok "ย้ายการ์ดลาป่วยและลากิจออกจากตรงกลางแล้ว"
}
else {
    Ok "ไม่พบการ์ดสรุปซ้ำตรงกลาง"
}

Write-Utf8Bom -Path $pagePath -Text $page
Ok "บันทึก page.tsx แล้ว"

Step "เพิ่ม CSS ส่วนหัว Desktop และ Mobile"

$cssStart = "/* LEAVE HEADER TWO LINE STATS START */"
$cssEnd = "/* LEAVE HEADER TWO LINE STATS END */"

if ($css.Contains($cssStart)) {
    $start = $css.IndexOf($cssStart)
    $end = $css.IndexOf($cssEnd, $start)

    if ($end -ge 0) {
        $end += $cssEnd.Length
        $css = $css.Remove($start, $end - $start).TrimEnd()
    }
}

$headerCss = @'

/* LEAVE HEADER TWO LINE STATS START */

.headerActions{
  display:flex;
  align-items:flex-start;
  justify-content:flex-end;
  gap:12px;
  min-width:0;
}

.leaveStatsStack{
  display:grid;
  gap:6px;
  width:max-content;
  max-width:100%;
  min-width:0;
}

.leaveStatsStack .leaveStatsCard{
  width:100%;
  min-width:0;
  box-sizing:border-box;
}

.leaveStatsBreakdown{
  display:grid;
  grid-template-columns:repeat(2,minmax(0,1fr));
  gap:6px;
  width:100%;
  min-width:0;
}

.leaveStatsBreakdown article{
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:8px;
  min-width:0;
  min-height:34px;
  padding:6px 10px;
  border:1px solid #dfe8e3;
  border-radius:10px;
  background:#fff;
  box-sizing:border-box;
}

.leaveStatsBreakdown article[data-type="sick"]{
  border-color:#f0caca;
  background:#fff5f5;
}

.leaveStatsBreakdown article[data-type="personal"]{
  border-color:#c4dfcf;
  background:#f1faf5;
}

.leaveStatsBreakdown small{
  color:#60736a;
  font-size:10px;
  font-weight:700;
  white-space:nowrap;
}

.leaveStatsBreakdown strong{
  color:#264d3e;
  font-size:11px;
  font-weight:800;
  white-space:nowrap;
}

.leaveStatsBreakdown article[data-type="sick"] strong{
  color:#9d3c3c;
}

.leaveStatsBreakdown article[data-type="personal"] strong{
  color:#1f684b;
}

/* คอมพิวเตอร์แสดงปุ่ม Dashboard */
.dashboardButton{
  display:inline-flex;
}

/* มือถือใช้เมนูสามขีด จึงซ่อนปุ่ม Dashboard */
@media(max-width:800px){
  .headerActions{
    width:100%;
    justify-content:stretch;
  }

  .dashboardButton{
    display:none!important;
  }

  .leaveStatsStack{
    width:100%;
  }

  .leaveStatsBreakdown{
    grid-template-columns:repeat(2,minmax(0,1fr));
  }

  .leaveStatsBreakdown article{
    min-height:32px;
    padding:5px 8px;
  }
}

@media(max-width:380px){
  .leaveStatsBreakdown small{
    font-size:9px;
  }

  .leaveStatsBreakdown strong{
    font-size:10px;
  }
}

/* LEAVE HEADER TWO LINE STATS END */
'@

$css = $css.TrimEnd() + $headerCss
Write-Utf8Bom -Path $cssPath -Text $css
Ok "บันทึก leave.module.css แล้ว"

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
