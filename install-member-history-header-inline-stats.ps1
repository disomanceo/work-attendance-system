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
$cssPath  = Join-Path $ProjectPath "app\leave\leave.module.css"

if (-not (Test-Path -LiteralPath $pagePath)) {
    throw "ไม่พบไฟล์ $pagePath"
}
if (-not (Test-Path -LiteralPath $cssPath)) {
    throw "ไม่พบไฟล์ $cssPath"
}

$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backupDir = Join-Path $ProjectPath "_backup\member-history-header-inline-stats-$timestamp"
New-Item -ItemType Directory -Path $backupDir -Force | Out-Null

Copy-Item -LiteralPath $pagePath -Destination (Join-Path $backupDir "page.tsx") -Force
Copy-Item -LiteralPath $cssPath -Destination (Join-Path $backupDir "leave.module.css") -Force
Ok "สำรองไฟล์ไว้ที่ $backupDir"

$page = [System.IO.File]::ReadAllText($pagePath, [System.Text.Encoding]::UTF8)
$css  = [System.IO.File]::ReadAllText($cssPath, [System.Text.Encoding]::UTF8)

Step "ย้ายสถิติลาป่วยและลากิจไปต่อท้ายคำว่า สถิติการลา"

$oldStatsBlockPattern = '(?s)<section\s+className=\{`\$\{styles\.leaveStatsCard\}.*?</section>'

# ใช้ pattern เฉพาะ JSX ปัจจุบัน
$statsPattern = '(?s)<section\s*\r?\n\s*className=\{`\$\{styles\.leaveStatsCard\}\s*\$\{.*?\}\`\}\s*\r?\n\s*aria-label="สถิติการลา"\s*\r?\n\s*>\s*<strong>สถิติการลา</strong>\s*<span>.*?</span>\s*<small>.*?</small>\s*</section>'

$newStatsBlock = @'
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
                <div className={styles.leaveStatsInline}>
                  <strong>สถิติการลา</strong>

                  <span className={styles.leaveStatPill} data-type="sick">
                    ลาป่วย {summary.sick.days} วัน
                  </span>

                  <span
                    className={styles.leaveStatPill}
                    data-type="personal"
                  >
                    ลากิจ {summary.personal.days} วัน
                  </span>
                </div>

                <small>
                  รวม {summary.combined.times}/
                  {leaveSettings.combinedLeaveTimesLimit} ครั้ง{" "}
                  {summary.combined.days}/
                  {leaveSettings.combinedLeaveDaysLimit} วัน
                </small>
              </section>
'@

if ([regex]::IsMatch($page, $statsPattern)) {
    $page = [regex]::Replace(
        $page,
        $statsPattern,
        $newStatsBlock.TrimEnd(),
        1
    )
    Ok "ปรับสถิติการลาเป็นแบบแถวเดียวแล้ว"
}
elseif ($page.Contains("leaveStatsInline")) {
    Ok "สถิติการลาเป็นแบบแถวเดียวอยู่แล้ว"
}
else {
    throw "ไม่พบส่วนสถิติการลาเดิม"
}

Step "ลบการ์ดลาป่วยและลากิจตรงกลาง"

$summaryGridPattern = '(?s)\s*\{summary\s*&&\s*leaveSettings\s*&&\s*\(\s*<section\s+className=\{styles\.summaryGrid\}>.*?</section>\s*\)\}'

if ([regex]::IsMatch($page, $summaryGridPattern)) {
    $page = [regex]::Replace(
        $page,
        $summaryGridPattern,
        '',
        1
    )
    Ok "ลบการ์ดสรุปตรงกลางแล้ว"
}
elseif ($page -notmatch 'className=\{styles\.summaryGrid\}') {
    Ok "ไม่มีการ์ดสรุปตรงกลางแล้ว"
}
else {
    throw "พบ summaryGrid แต่รูปแบบไม่ตรง"
}

Step "เพิ่มหัวข้อคอลัมน์ในประวัติของครูและเจ้าหน้าที่"

$memberHeaderMarkup = @'
<div className={styles.memberOwnLeaveColumnHeader}>
                    <span>ลำดับ</span>
                    <span>วันที่ยื่น</span>
                    <span>ประเภท</span>
                    <span>ช่วงวันลา</span>
                    <span>วัน</span>
                  </div>


'@

if ($page.Contains("memberOwnLeaveColumnHeader")) {
    Ok "มีหัวข้อคอลัมน์ประวัติสมาชิกแล้ว"
}
else {
    $memberListMarker = '<div className={styles.memberOwnLeaveList}>'

    if (-not $page.Contains($memberListMarker)) {
        throw "ไม่พบ memberOwnLeaveList"
    }

    $page = $page.Replace(
        $memberListMarker,
        $memberHeaderMarkup + $memberListMarker
    )
    Ok "เพิ่มหัวข้อคอลัมน์ประวัติสมาชิกแล้ว"
}

Write-Utf8Bom -Path $pagePath -Text $page
Ok "บันทึก page.tsx แล้ว"

Step "เพิ่ม CSS"

$startMarker = "/* INLINE LEAVE STATS AND MEMBER HEADER START */"
$endMarker   = "/* INLINE LEAVE STATS AND MEMBER HEADER END */"

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

$newCss = @'

/* INLINE LEAVE STATS AND MEMBER HEADER START */

.leaveStatsInline{
  display:flex;
  align-items:center;
  gap:7px;
  min-width:0;
  flex-wrap:wrap;
}

.leaveStatsInline>strong{
  color:#36584a;
  font-size:12px;
  font-weight:800;
  white-space:nowrap;
}

.leaveStatPill{
  display:inline-flex;
  align-items:center;
  justify-content:center;
  min-height:26px;
  padding:4px 9px;
  border-radius:999px;
  font-size:10px;
  font-weight:800;
  line-height:1.15;
  white-space:nowrap;
}

.leaveStatPill[data-type="sick"]{
  background:#fff0f0;
  color:#9d3c3c;
}

.leaveStatPill[data-type="personal"]{
  background:#e8f5ee;
  color:#1f684b;
}

.leaveStatsCard>small{
  display:block;
  margin-top:4px;
  color:#73837b;
  font-size:9px;
  line-height:1.2;
}

.memberOwnLeaveColumnHeader{
  display:grid;
  grid-template-columns:36px 96px 62px minmax(130px,1fr) 42px;
  align-items:center;
  gap:5px;
  width:100%;
  min-width:0;
  padding:7px 9px;
  border:1px solid #dfe7e2;
  border-radius:9px;
  background:#f1f5f2;
  color:#52685e;
  font-size:9px;
  font-weight:800;
  line-height:1.2;
  box-sizing:border-box;
}

.memberOwnLeaveColumnHeader>*{
  min-width:0;
  overflow-wrap:anywhere;
}

@media(max-width:760px){
  .leaveStatsInline{
    gap:5px;
  }

  .leaveStatPill{
    min-height:24px;
    padding:3px 7px;
    font-size:9px;
  }

  .memberOwnLeaveColumnHeader{
    display:none;
  }
}

/* INLINE LEAVE STATS AND MEMBER HEADER END */
'@

$css = $css.TrimEnd() + $newCss
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
