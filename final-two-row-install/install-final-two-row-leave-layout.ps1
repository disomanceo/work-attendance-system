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
$snippetPath = Join-Path $PSScriptRoot "two-row-leave-section-snippet.txt"

if (-not (Test-Path -LiteralPath $pagePath)) {
    throw "ไม่พบไฟล์ $pagePath"
}
if (-not (Test-Path -LiteralPath $cssPath)) {
    throw "ไม่พบไฟล์ $cssPath"
}
if (-not (Test-Path -LiteralPath $snippetPath)) {
    throw "ไม่พบไฟล์ $snippetPath"
}

$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backupDir = Join-Path $ProjectPath "_backup\two-row-leave-layout-$timestamp"
New-Item -ItemType Directory -Path $backupDir -Force | Out-Null

Copy-Item -LiteralPath $pagePath -Destination (Join-Path $backupDir "page.tsx") -Force
Copy-Item -LiteralPath $cssPath -Destination (Join-Path $backupDir "leave.module.css") -Force
Ok "สำรองไฟล์ไว้ที่ $backupDir"

$page = [System.IO.File]::ReadAllText($pagePath, [System.Text.Encoding]::UTF8)
$css  = [System.IO.File]::ReadAllText($cssPath, [System.Text.Encoding]::UTF8)
$snippet = [System.IO.File]::ReadAllText($snippetPath, [System.Text.Encoding]::UTF8)

Step "ตรวจตัวแปรที่ใช้"

$requiredTokens = @(
    "pendingAdminLeaveRequests",
    "adminLeaveHistoryRequests",
    "pagedAdminHistoryRequests",
    "safeAdminHistoryPage",
    "adminHistoryPageSize",
    "adminHistoryTotalPages",
    "formatAdminLeaveDate",
    "adminLeaveStatusLabel",
    "adminLeaveTypeLabel",
    "openLeaveDocument",
    "openAttachment",
    "reviewLeave",
    "deleteLeave"
)

foreach ($token in $requiredTokens) {
    if (-not $page.Contains($token)) {
        throw "ไม่พบ $token กรุณาติดตั้งชุดแยกรายการและประวัติก่อน"
    }
}

Step "แทนหน้ารายการใบลาด้วยรูปแบบ 2 บรรทัด"

$sectionPattern = '(?s)\{\["director",\s*"admin"\]\.includes\(profileRole\)\s*&&\s*\(\s*<div\s+className=\{styles\.leaveManagementGroups\}>.*?</div>\s*\)\}'

if (-not [regex]::IsMatch($page, $sectionPattern)) {
    throw "ไม่พบ leaveManagementGroups เดิม"
}

$page = [regex]::Replace(
    $page,
    $sectionPattern,
    $snippet.TrimEnd(),
    1
)

Write-Utf8Bom -Path $pagePath -Text $page
Ok "บันทึก page.tsx แล้ว"

Step "ติดตั้ง CSS รูปแบบ 2 บรรทัด"

$startMarker = "/* FINAL TWO ROW LEAVE LAYOUT START */"
$endMarker   = "/* FINAL TWO ROW LEAVE LAYOUT END */"

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

$finalCss = @'

/* FINAL TWO ROW LEAVE LAYOUT START */

.twoRowLeaveHeader,
.twoRowLeaveMain{
  display:grid;
  grid-template-columns:
    38px
    106px
    minmax(150px,1.6fr)
    62px
    minmax(125px,1fr);
  align-items:center;
  gap:6px;
  width:100%;
  min-width:0;
  box-sizing:border-box;
}

.twoRowLeaveHeader{
  margin:0;
  padding:7px 9px;
  border:1px solid #dfe7e2;
  border-bottom:0;
  border-radius:10px 10px 0 0;
  background:#f1f5f2;
  color:#52685e;
  font-size:9.5px;
  font-weight:800;
  line-height:1.2;
}

.twoRowLeaveList{
  display:grid;
  width:100%;
  min-width:0;
  border:1px solid #dfe7e2;
  border-radius:0 0 10px 10px;
  overflow:hidden;
}

.twoRowLeaveItem{
  width:100%;
  min-width:0;
  padding:8px 9px;
  border-bottom:1px solid #e2e8e4;
  background:#fff;
  box-sizing:border-box;
}

.twoRowLeaveItem:last-child{
  border-bottom:0;
}

.twoRowLeaveItem[data-status="pending"]{
  background:#fffaf0;
  box-shadow:inset 4px 0 #dfa623;
}

.twoRowLeaveItem[data-status="approved"]{
  background:#f3fbf6;
  box-shadow:inset 4px 0 #2f9964;
}

.twoRowLeaveItem[data-status="rejected"]{
  background:#fff6f6;
  box-shadow:inset 4px 0 #c84d4d;
}

.twoRowLeaveItem[data-status="cancelled"]{
  background:#f7f9f8;
  box-shadow:inset 4px 0 #89958f;
}

.twoRowLeaveMain{
  min-height:30px;
  color:#304f42;
  font-size:10px;
  line-height:1.25;
}

.twoRowLeaveMain>*{
  min-width:0;
  max-width:100%;
  overflow-wrap:anywhere;
}

.twoRowNumber{
  text-align:center;
  color:#285d48;
  font-size:11px;
  font-weight:800;
}

.twoRowSubmitted{
  color:#52685e;
  font-size:9.5px;
  font-weight:600;
  white-space:normal;
}

.twoRowPerson{
  display:grid;
  gap:1px;
  min-width:0;
}

.twoRowPerson strong{
  color:#234c3d;
  font-size:11px;
  font-weight:800;
  line-height:1.25;
  white-space:normal;
}

.twoRowPerson small{
  color:#718278;
  font-size:9px;
  font-weight:500;
  line-height:1.2;
}

.twoRowType{
  display:inline-flex;
  align-items:center;
  justify-content:center;
  width:max-content;
  max-width:100%;
  padding:3px 6px;
  border-radius:999px;
  font-size:9px;
  font-weight:800;
  text-align:center;
}

.twoRowType[data-type="personal"]{
  background:#e8f5ee;
  color:#1f684b;
}

.twoRowType[data-type="sick"]{
  background:#fff0f0;
  color:#9d3c3c;
}

.twoRowLeavePeriod{
  color:#405b50;
  font-size:9.5px;
  font-weight:600;
  white-space:normal;
}

.twoRowLeavePeriod strong{
  color:#285d48;
  font-size:10px;
  font-weight:800;
}

.twoRowLeaveFooter{
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:8px;
  width:100%;
  min-width:0;
  margin-top:6px;
  padding-top:6px;
  border-top:1px dashed rgba(99,123,112,.22);
  box-sizing:border-box;
}

.twoRowLeaveLeft,
.twoRowLeaveRight{
  display:flex;
  align-items:center;
  gap:5px;
  min-width:0;
  flex-wrap:wrap;
}

.twoRowLeaveRight{
  justify-content:flex-end;
  margin-left:auto;
}

.twoRowStatus{
  display:inline-flex;
  align-items:center;
  justify-content:center;
  width:76px;
  min-height:28px;
  padding:4px 6px;
  border-radius:7px;
  font-size:9px;
  font-weight:800;
  line-height:1.15;
  text-align:center;
  box-sizing:border-box;
}

.twoRowStatus[data-status="pending"]{
  background:#ffe8aa;
  color:#7b4c00;
}

.twoRowStatus[data-status="approved"]{
  background:#dcf3e5;
  color:#17603e;
}

.twoRowStatus[data-status="rejected"]{
  background:#fbe1e1;
  color:#963232;
}

.twoRowStatus[data-status="cancelled"]{
  background:#e5e9e7;
  color:#59645f;
}

.twoRowLeaveFooter button{
  display:inline-flex;
  align-items:center;
  justify-content:center;
  width:74px;
  min-width:74px;
  height:28px;
  padding:3px 5px;
  border:1px solid;
  border-radius:7px;
  font:inherit;
  font-size:9px;
  font-weight:800;
  line-height:1.1;
  text-align:center;
  white-space:normal;
  cursor:pointer;
  box-sizing:border-box;
}

.twoRowLeaveFooter button:disabled{
  cursor:not-allowed;
  opacity:.55;
}

.twoRowLeaveFooter .viewLeaveButton{
  border-color:#baa8cf!important;
  background:#f7f2fb!important;
  color:#60487d!important;
}

.twoRowLeaveFooter .viewAttachmentButton{
  border-color:#9cc8df!important;
  background:#edf8fd!important;
  color:#225f7d!important;
}

.twoRowLeaveFooter .approveButton{
  border-color:#8fcfab!important;
  background:#e5f7ec!important;
  color:#17613e!important;
}

.twoRowLeaveFooter .rejectButton{
  border-color:#e4a6a6!important;
  background:#fff0f0!important;
  color:#9f3535!important;
}

.twoRowLeaveFooter .deleteLeaveButton{
  border-color:#d5b6b6!important;
  background:#fff!important;
  color:#963838!important;
}

.twoRowNoAttachment{
  display:inline-flex;
  align-items:center;
  justify-content:center;
  width:74px;
  min-width:74px;
  min-height:28px;
  padding:3px 5px;
  border:1px dashed #c9d2cd;
  border-radius:7px;
  color:#87938d;
  font-size:8.5px;
  text-align:center;
  box-sizing:border-box;
}

.pendingLeaveSection,
.historyLeaveSection,
.twoRowLeaveHeader,
.twoRowLeaveList,
.twoRowLeaveItem,
.twoRowLeaveMain,
.twoRowLeaveFooter{
  max-width:100%;
  min-width:0;
  overflow:hidden;
}

@media(max-width:1080px){
  .twoRowLeaveHeader,
  .twoRowLeaveMain{
    grid-template-columns:
      32px
      94px
      minmax(125px,1.45fr)
      54px
      minmax(105px,1fr);
    gap:4px;
  }

  .twoRowLeaveHeader{
    font-size:8.8px;
  }

  .twoRowSubmitted,
  .twoRowLeavePeriod{
    font-size:9px;
  }

  .twoRowPerson strong{
    font-size:10.5px;
  }

  .twoRowLeaveFooter button,
  .twoRowNoAttachment{
    width:68px;
    min-width:68px;
  }

  .twoRowStatus{
    width:70px;
  }
}

@media(max-width:760px){
  .twoRowLeaveHeader{
    display:none;
  }

  .twoRowLeaveList{
    border-radius:10px;
  }

  .twoRowLeaveMain{
    grid-template-columns:36px minmax(0,1fr);
    gap:5px 8px;
  }

  .twoRowLeaveMain>*{
    display:grid;
    grid-template-columns:80px minmax(0,1fr);
    gap:6px;
    grid-column:1 / -1;
    text-align:left;
  }

  .twoRowLeaveMain>*::before{
    content:attr(data-label);
    color:#718278;
    font-size:9px;
    font-weight:800;
  }

  .twoRowLeaveFooter{
    align-items:stretch;
    flex-direction:column;
  }

  .twoRowLeaveLeft,
  .twoRowLeaveRight{
    display:grid;
    grid-template-columns:repeat(3,minmax(0,1fr));
    width:100%;
    margin:0;
  }

  .twoRowLeaveFooter button,
  .twoRowNoAttachment,
  .twoRowStatus{
    width:100%;
    min-width:0;
  }
}

@media(max-width:430px){
  .twoRowLeaveLeft,
  .twoRowLeaveRight{
    grid-template-columns:repeat(2,minmax(0,1fr));
  }
}

/* FINAL TWO ROW LEAVE LAYOUT END */
'@

$css = $css.TrimEnd() + $finalCss
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
