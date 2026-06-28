#requires -Version 5.1
[CmdletBinding()]
param(
    [string]$ProjectPath = "D:\work-attendance-main",
    [switch]$SkipBuild
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

function Write-Step([string]$Message) {
    Write-Host ""
    Write-Host "==> $Message" -ForegroundColor Cyan
}

function Write-Ok([string]$Message) {
    Write-Host "[OK] $Message" -ForegroundColor Green
}

function Write-WarnText([string]$Message) {
    Write-Host "[คำเตือน] $Message" -ForegroundColor Yellow
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
$backupDir = Join-Path $ProjectPath "_backup\pending-leave-ui-v3-$timestamp"
New-Item -ItemType Directory -Path $backupDir -Force | Out-Null

Copy-Item -LiteralPath $pagePath -Destination (Join-Path $backupDir "page.tsx") -Force
Copy-Item -LiteralPath $cssPath -Destination (Join-Path $backupDir "leave.module.css") -Force
Write-Ok "สำรองไฟล์ไว้ที่ $backupDir"

$page = [System.IO.File]::ReadAllText($pagePath, [System.Text.Encoding]::UTF8)
$css  = [System.IO.File]::ReadAllText($cssPath, [System.Text.Encoding]::UTF8)

Write-Step "ตรวจและเพิ่ม created_at"

$typePattern = '(?s)(type\s+AdminPendingLeaveRequest\s*=\s*\{.*?)(\r?\n\};)'
$typeMatch = [regex]::Match($page, $typePattern)

if (-not $typeMatch.Success) {
    throw "ไม่พบ type AdminPendingLeaveRequest"
}

$typeBlock = $typeMatch.Groups[1].Value

if ($typeBlock -notmatch 'created_at\s*:\s*string\s*;') {
    if ($typeBlock -notmatch 'status\s*:\s*string\s*;') {
        throw "ไม่พบ status ภายใน AdminPendingLeaveRequest"
    }

    $newTypeBlock = [regex]::Replace(
        $typeBlock,
        '(status\s*:\s*string\s*;)',
        '$1' + "`r`n  created_at: string;",
        1
    )

    $page = $page.Substring(0, $typeMatch.Index) +
        $newTypeBlock +
        $typeMatch.Groups[2].Value +
        $page.Substring($typeMatch.Index + $typeMatch.Length)

    Write-Ok "เพิ่ม created_at แล้ว"
}
else {
    Write-Ok "มี created_at อยู่แล้ว"
}

Write-Step "ตรวจและเพิ่มตัวจัดรูปแบบวันเวลา"

if ($page -notmatch 'function\s+formatPendingSubmittedAt\s*\(') {
    $formatter = @'
function formatPendingSubmittedAt(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return {
      date: "ไม่พบวันที่ยื่น",
      time: "",
    };
  }

  return {
    date: new Intl.DateTimeFormat("th-TH", {
      timeZone: "Asia/Bangkok",
      day: "numeric",
      month: "short",
      year: "numeric",
    }).format(date),
    time: new Intl.DateTimeFormat("th-TH", {
      timeZone: "Asia/Bangkok",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(date),
  };
}

'@

    $page = [regex]::Replace(
        $page,
        '(export\s+default\s+function\s+LeavePage\s*\(\s*\))',
        [System.Text.RegularExpressions.MatchEvaluator]{
            param($m)
            return $formatter + $m.Value
        },
        1
    )

    if ($page -notmatch 'function\s+formatPendingSubmittedAt\s*\(') {
        throw "เพิ่ม formatPendingSubmittedAt ไม่สำเร็จ"
    }

    Write-Ok "เพิ่ม formatPendingSubmittedAt แล้ว"
}
else {
    Write-Ok "มี formatPendingSubmittedAt อยู่แล้ว"
}

Write-Step "ตรวจและเพิ่ม index ในรายการ"

if ($page -match 'pendingRequests\.map\s*\(\s*\(\s*item\s*,\s*index\s*\)\s*=>') {
    Write-Ok "มี index อยู่แล้ว"
}
elseif ($page -match 'pendingRequests\.map\s*\(\s*\(\s*item\s*\)\s*=>') {
    $page = [regex]::Replace(
        $page,
        'pendingRequests\.map\s*\(\s*\(\s*item\s*\)\s*=>',
        'pendingRequests.map((item, index) =>',
        1
    )
    Write-Ok "เพิ่ม index แล้ว"
}
else {
    throw "ไม่พบ pendingRequests.map"
}

Write-Step "เพิ่มกล่องลำดับและวันเวลายื่นด้วย Regex"

if ($page -match 'className=\{styles\.reviewSequence\}') {
    Write-Ok "มี reviewSequence อยู่แล้ว"
}
else {
    $insert = @'
<article
                      key={item.id}
                      className={styles.reviewItem}
                    >
                      <div className={styles.reviewSequence}>
                        <strong>{index + 1}</strong>
                        <span>ลำดับที่ยื่น</span>
                        <time dateTime={item.created_at}>
                          {formatPendingSubmittedAt(item.created_at).date}
                          <b>
                            {formatPendingSubmittedAt(item.created_at).time} น.
                          </b>
                        </time>
                      </div>
'@

    $articlePattern = '(?s)<article\s+key=\{item\.id\}\s+className=\{styles\.reviewItem\}\s*>'

    if (-not [regex]::IsMatch($page, $articlePattern)) {
        throw "ไม่พบ article ของรายการรอพิจารณา"
    }

    $page = [regex]::Replace(
        $page,
        $articlePattern,
        [System.Text.RegularExpressions.MatchEvaluator]{
            param($m)
            return $insert.TrimEnd()
        },
        1
    )

    if ($page -notmatch 'className=\{styles\.reviewSequence\}') {
        throw "เพิ่ม reviewSequence ไม่สำเร็จ"
    }

    Write-Ok "เพิ่ม reviewSequence แล้ว"
}

Write-Step "ปรับรายละเอียดวันลาและเหตุผล"

if ($page -match 'className=\{styles\.reviewLeavePeriod\}') {
    Write-Ok "มี reviewLeavePeriod อยู่แล้ว"
}
else {
    $dateBlockPattern = '(?s)<p>\s*\{item\.start_date\}\s*ถึง\s*\{item\.end_date\}\s*</p>\s*<p>\s*\{item\.reason\}\s*</p>'

    $dateReplacement = @'
<p className={styles.reviewLeavePeriod}>
                        <span>ข้อมูลวันลา</span>
                        <b>จากวันที่ {item.start_date}</b>
                        <b>ถึงวันที่ {item.end_date}</b>
                        <strong>รวม {item.total_work_days} วัน</strong>
                      </p>

                      <p className={styles.reviewReason}>
                        <span>เหตุผลการลา</span>
                        {item.reason}
                      </p>
'@

    if (-not [regex]::IsMatch($page, $dateBlockPattern)) {
        throw "ไม่พบชุดข้อมูลวันลาเดิม"
    }

    $page = [regex]::Replace(
        $page,
        $dateBlockPattern,
        $dateReplacement.TrimEnd(),
        1
    )

    Write-Ok "ปรับรายละเอียดวันลาแล้ว"
}

Write-Utf8Bom -Path $pagePath -Text $page
Write-Ok "บันทึก page.tsx เป็น UTF-8 with BOM"

Write-Step "ติดตั้ง CSS Responsive"

$cssStart = "/* PENDING LEAVE RESPONSIVE DETAIL START */"
$cssEnd   = "/* PENDING LEAVE RESPONSIVE DETAIL END */"

if ($css.Contains($cssStart)) {
    $startIndex = $css.IndexOf($cssStart)
    $endIndex = $css.IndexOf($cssEnd, $startIndex)

    if ($endIndex -ge 0) {
        $endIndex += $cssEnd.Length
        $css = $css.Remove($startIndex, $endIndex - $startIndex).TrimEnd()
    }
}

$responsiveCss = @'

/* PENDING LEAVE RESPONSIVE DETAIL START */

.reviewItem{
  display:grid;
  grid-template-columns:
    104px
    minmax(220px,1.25fr)
    minmax(215px,1fr)
    minmax(92px,.38fr)
    minmax(150px,auto);
  grid-template-rows:auto auto;
  align-items:start;
  gap:10px 14px;
  width:100%;
  min-width:0;
  padding:14px;
  overflow:visible;
}

.reviewSequence{
  grid-column:1;
  grid-row:1 / span 2;
  display:grid;
  align-content:start;
  justify-items:center;
  gap:4px;
  min-width:0;
  padding:10px 8px;
  border:1px solid #d8e8df;
  border-radius:12px;
  background:#f6fbf8;
  text-align:center;
}

.reviewSequence>strong{
  display:grid;
  place-items:center;
  width:38px;
  height:38px;
  border-radius:10px;
  background:#e4f5eb;
  color:#176044;
  font-size:20px;
}

.reviewSequence>span{
  color:#61796e;
  font-size:11px;
  font-weight:800;
}

.reviewSequence time{
  display:grid;
  gap:2px;
  color:#52685e;
  font-size:11px;
  line-height:1.35;
}

.reviewSequence time b{
  color:#245f49;
  font-size:12px;
}

.reviewItemTop{
  display:contents;
}

.reviewItemTop>div{
  grid-column:2;
  grid-row:1;
  min-width:0;
}

.reviewItemTop h4{
  margin:4px 0 3px;
  white-space:normal;
  overflow:visible;
  text-overflow:clip;
  overflow-wrap:anywhere;
  word-break:normal;
  font-size:16px;
  line-height:1.35;
}

.reviewItemTop p{
  margin:0;
  white-space:normal;
  overflow-wrap:anywhere;
}

.reviewItemTop>strong{
  grid-column:4;
  grid-row:1;
  align-self:center;
  justify-self:center;
  min-width:78px;
  padding:7px 8px;
  border-radius:10px;
  background:#e8f7ee;
  color:#176044;
  text-align:center;
  white-space:normal;
  line-height:1.25;
}

.reviewLeavePeriod{
  grid-column:3;
  grid-row:1;
  display:grid;
  gap:4px;
  min-width:0;
  margin:0!important;
  padding:9px 10px;
  border-radius:10px;
  background:#f8fbf9;
  color:#52685e!important;
  overflow-wrap:anywhere;
}

.reviewLeavePeriod span,
.reviewReason span{
  color:#718278;
  font-size:11px;
  font-weight:900;
}

.reviewLeavePeriod b{
  color:#304f42;
  font-size:13px;
  font-weight:700;
}

.reviewLeavePeriod strong{
  width:max-content;
  max-width:100%;
  margin-top:2px;
  padding:5px 9px;
  border-radius:999px;
  background:#dff5e7;
  color:#176044;
  font-size:12px;
  white-space:normal;
}

.reviewReason{
  grid-column:2 / 5;
  grid-row:2;
  display:grid!important;
  gap:3px;
  min-width:0;
  margin:0!important;
  padding:8px 10px;
  border-radius:9px;
  background:#f7faf8;
  color:#52685e!important;
  white-space:normal;
  overflow-wrap:anywhere;
  word-break:break-word;
}

.reviewItem .reviewWarning{
  grid-column:2 / 5;
  display:inline-flex;
  width:max-content;
  max-width:100%;
  white-space:normal;
}

.reviewActions{
  grid-column:5;
  grid-row:1 / span 2;
  display:flex;
  align-self:start;
  justify-content:flex-end;
  gap:7px;
  min-width:0;
  margin:0;
  flex-wrap:wrap;
}

.reviewActions button{
  flex:0 1 auto;
  min-width:0;
  max-width:100%;
  min-height:36px;
  padding:8px 11px;
  white-space:normal;
  line-height:1.2;
  overflow-wrap:anywhere;
}

@media(max-width:1120px){
  .reviewItem{
    grid-template-columns:
      96px
      minmax(210px,1.2fr)
      minmax(210px,1fr)
      minmax(86px,.35fr);
  }

  .reviewActions{
    grid-column:2 / -1;
    grid-row:3;
    justify-content:flex-end;
  }

  .reviewReason,
  .reviewItem .reviewWarning{
    grid-column:2 / -1;
  }
}

@media(max-width:820px){
  .reviewItem{
    grid-template-columns:90px minmax(0,1fr) auto;
    gap:9px 12px;
  }

  .reviewSequence{
    grid-column:1;
    grid-row:1 / span 3;
  }

  .reviewItemTop>div{
    grid-column:2;
    grid-row:1;
  }

  .reviewItemTop>strong{
    grid-column:3;
    grid-row:1;
  }

  .reviewLeavePeriod{
    grid-column:2 / -1;
    grid-row:2;
  }

  .reviewReason{
    grid-column:2 / -1;
    grid-row:3;
  }

  .reviewItem .reviewWarning{
    grid-column:2 / -1;
  }

  .reviewActions{
    grid-column:1 / -1;
    grid-row:auto;
    justify-content:stretch;
  }

  .reviewActions button{
    flex:1 1 140px;
  }
}

@media(max-width:560px){
  .reviewItem{
    grid-template-columns:minmax(0,1fr) auto;
    padding:12px;
  }

  .reviewSequence{
    grid-column:1;
    grid-row:1;
    display:flex;
    align-items:center;
    justify-content:flex-start;
    gap:8px;
    padding:8px;
    text-align:left;
  }

  .reviewSequence>strong{
    flex:0 0 34px;
    width:34px;
    height:34px;
  }

  .reviewSequence time{
    margin-left:auto;
    justify-items:end;
    text-align:right;
  }

  .reviewItemTop>div{
    grid-column:1 / -1;
    grid-row:2;
  }

  .reviewItemTop>strong{
    grid-column:2;
    grid-row:1;
    align-self:center;
    min-width:70px;
  }

  .reviewLeavePeriod{
    grid-column:1 / -1;
    grid-row:3;
  }

  .reviewReason{
    grid-column:1 / -1;
    grid-row:4;
  }

  .reviewItem .reviewWarning{
    grid-column:1 / -1;
  }

  .reviewActions{
    grid-column:1 / -1;
    grid-row:auto;
    display:grid;
    grid-template-columns:1fr 1fr;
    width:100%;
  }

  .reviewActions button{
    width:100%;
    min-width:0;
  }
}

@media(max-width:380px){
  .reviewItem{
    grid-template-columns:1fr;
  }

  .reviewSequence,
  .reviewItemTop>div,
  .reviewItemTop>strong,
  .reviewLeavePeriod,
  .reviewReason,
  .reviewItem .reviewWarning,
  .reviewActions{
    grid-column:1;
  }

  .reviewItemTop>strong{
    grid-row:auto;
    justify-self:start;
  }

  .reviewActions{
    grid-template-columns:1fr;
  }

  .reviewActions button{
    grid-column:1!important;
  }
}

/* PENDING LEAVE RESPONSIVE DETAIL END */
'@

$css = $css.TrimEnd() + $responsiveCss
Write-Utf8Bom -Path $cssPath -Text $css
Write-Ok "บันทึก leave.module.css เป็น UTF-8 with BOM"

Write-Step "ตรวจ UTF-8 BOM"

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

    Write-Ok "UTF-8 BOM: $path"
}

if (-not $SkipBuild) {
    Write-Step "รัน npm run build"
    npm run build

    if ($LASTEXITCODE -ne 0) {
        throw "Build ไม่ผ่าน สามารถกู้ไฟล์จาก $backupDir"
    }

    Write-Ok "Build ผ่าน"
}

Write-Step "เสร็จสิ้น"
Write-Host "ไฟล์สำรอง: $backupDir"
Write-Host "ทดสอบต่อด้วย: npm run dev"
