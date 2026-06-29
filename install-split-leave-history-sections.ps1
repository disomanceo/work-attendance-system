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
$backupDir = Join-Path $ProjectPath "_backup\split-leave-sections-$timestamp"
New-Item -ItemType Directory -Path $backupDir -Force | Out-Null

Copy-Item -LiteralPath $pagePath -Destination (Join-Path $backupDir "page.tsx") -Force
Copy-Item -LiteralPath $cssPath -Destination (Join-Path $backupDir "leave.module.css") -Force
Ok "สำรองไฟล์ไว้ที่ $backupDir"

$page = [System.IO.File]::ReadAllText($pagePath, [System.Text.Encoding]::UTF8)
$css  = [System.IO.File]::ReadAllText($cssPath, [System.Text.Encoding]::UTF8)

Step "ตรวจโครงสร้างที่จำเป็น"

$requiredTokens = @(
    "pendingRequests",
    "adminLeavePage",
    "setAdminLeavePage",
    "formatAdminLeaveDate",
    "adminLeaveStatusLabel",
    "adminLeaveTypeLabel",
    "openLeaveDocument",
    "reviewLeave",
    "deleteLeave",
    "openAttachment"
)

foreach ($token in $requiredTokens) {
    if (-not $page.Contains($token)) {
        throw "ไม่พบ $token ใน page.tsx"
    }
}

Step "เพิ่มข้อมูลแยก รอพิจารณา และ ประวัติ"

$derivedStart = "  const pendingAdminLeaveRequests = useMemo(() => {"

if (-not $page.Contains($derivedStart)) {
    $insertBefore = "  async function submitLeave("
    if (-not $page.Contains($insertBefore)) {
        throw "ไม่พบตำแหน่งเพิ่มข้อมูลแยกรายการ"
    }

    $derived = @'
  const pendingAdminLeaveRequests = useMemo(
    () =>
      [...pendingRequests]
        .filter((item) => item.status === "pending")
        .sort(
          (a, b) =>
            new Date(b.created_at).getTime() -
            new Date(a.created_at).getTime()
        ),
    [pendingRequests]
  );

  const adminLeaveHistoryRequests = useMemo(
    () =>
      [...pendingRequests]
        .filter((item) => item.status !== "pending")
        .sort(
          (a, b) =>
            new Date(b.created_at).getTime() -
            new Date(a.created_at).getTime()
        ),
    [pendingRequests]
  );

  const adminHistoryPageSize = 10;
  const adminHistoryTotalPages = Math.max(
    1,
    Math.ceil(
      adminLeaveHistoryRequests.length / adminHistoryPageSize
    )
  );
  const safeAdminHistoryPage = Math.min(
    adminLeavePage,
    adminHistoryTotalPages
  );
  const pagedAdminHistoryRequests =
    adminLeaveHistoryRequests.slice(
      (safeAdminHistoryPage - 1) * adminHistoryPageSize,
      safeAdminHistoryPage * adminHistoryPageSize
    );

  useEffect(() => {
    if (adminLeavePage > adminHistoryTotalPages) {
      setAdminLeavePage(adminHistoryTotalPages);
    }
  }, [adminLeavePage, adminHistoryTotalPages]);

'@

    $page = $page.Replace($insertBefore, $derived + $insertBefore)
    Ok "เพิ่มข้อมูลแยก 2 หมวดแล้ว"
}
else {
    Ok "มีข้อมูลแยก 2 หมวดอยู่แล้ว"
}

Step "แทนส่วนรายการเดิมด้วย 2 หมวด"

$sectionPattern = '(?s)\{\["director",\s*"admin"\]\.includes\(profileRole\)\s*&&\s*\(\s*<section\s+className=\{styles\.compactLeaveSection\}>.*?</section>\s*\)\}'

if (-not [regex]::IsMatch($page, $sectionPattern)) {
    throw "ไม่พบ compactLeaveSection เดิม"
}

$newSection = Get-Content -Raw -LiteralPath "$PSScriptRoot\split-leave-section-snippet.txt"

$page = [regex]::Replace(
    $page,
    $sectionPattern,
    $newSection.TrimEnd(),
    1
)

Step "ซ่อนประวัติแบบเดิมที่ซ้ำ"

$legacyPattern = '(?s)\{loading\s*\?\s*\(.*?\)\s*:\s*requests\.length\s*===\s*0\s*\?\s*\(.*?\)\s*:\s*\(\s*<div\s+className=\{styles\.list\}>.*?</div>\s*\)\}'

if ([regex]::IsMatch($page, $legacyPattern)) {
    $page = [regex]::Replace(
        $page,
        $legacyPattern,
        '',
        1
    )
    Ok "ลบรายการประวัติเดิมที่ซ้ำแล้ว"
}
else {
    Write-Host "[คำเตือน] ไม่พบรายการประวัติเดิมแบบตรงรูปแบบ อาจถูกลบไปแล้ว" -ForegroundColor Yellow
}

Write-Utf8Bom -Path $pagePath -Text $page
Ok "บันทึก page.tsx เป็น UTF-8 with BOM"

Step "เพิ่ม CSS แยก 2 หมวด"

$startMarker = "/* SPLIT LEAVE MANAGEMENT GROUPS START */"
$endMarker   = "/* SPLIT LEAVE MANAGEMENT GROUPS END */"

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

$splitCss = @'

/* SPLIT LEAVE MANAGEMENT GROUPS START */

.leaveManagementGroups{
  display:grid;
  gap:16px;
  width:100%;
  min-width:0;
}

.pendingLeaveSection{
  border-color:#edcf84!important;
  background:#fffdf8!important;
}

.pendingLeaveSection .compactLeaveHeader h3{
  color:#7b4d06;
}

.pendingLeaveSection .compactLeaveHeader>strong{
  background:#ffe8aa;
  color:#7b4c00;
}

.historyLeaveSection{
  border-color:#cfe0d6!important;
  background:#fbfdfc!important;
}

.historyLeaveSection .compactLeaveHeader h3{
  color:#205f45;
}

.historyLeaveSection .compactLeaveHeader>strong{
  background:#e1f3e8;
  color:#1e6547;
}

.historyContent{
  width:100%;
  min-width:0;
  overflow:hidden;
}

.historyContent>.list{
  display:none!important;
}

.pendingLeaveSection .adminLeavePagination{
  display:none!important;
}

.historyLeaveSection .adminLeavePagination{
  display:flex;
}

.pendingLeaveSection,
.historyLeaveSection,
.compactLeaveList,
.compactLeaveItem,
.compactLeaveInfo,
.compactLeaveActions{
  max-width:100%;
  min-width:0;
  box-sizing:border-box;
}

@media(max-width:760px){
  .leaveManagementGroups{
    gap:12px;
  }

  .pendingLeaveSection,
  .historyLeaveSection{
    padding:11px;
  }
}

/* SPLIT LEAVE MANAGEMENT GROUPS END */
'@

$css = $css.TrimEnd() + $splitCss
Write-Utf8Bom -Path $cssPath -Text $css
Ok "บันทึก leave.module.css เป็น UTF-8 with BOM"

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
