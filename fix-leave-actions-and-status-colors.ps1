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
$backupDir = Join-Path $ProjectPath "_backup\leave-action-color-fix-$timestamp"
New-Item -ItemType Directory -Path $backupDir -Force | Out-Null

Copy-Item -LiteralPath $pagePath -Destination (Join-Path $backupDir "page.tsx") -Force
Copy-Item -LiteralPath $cssPath -Destination (Join-Path $backupDir "leave.module.css") -Force
Write-Ok "สำรองไฟล์ไว้ที่ $backupDir"

$page = [System.IO.File]::ReadAllText($pagePath, [System.Text.Encoding]::UTF8)
$css  = [System.IO.File]::ReadAllText($cssPath, [System.Text.Encoding]::UTF8)

Write-Step "เพิ่ม data-status ให้รายการประวัติ"

if ($page -match 'className=\{styles\.leaveItem\}\s+data-status=\{item\.status\}') {
    Write-Ok "มี data-status อยู่แล้ว"
}
else {
    $pattern = '<article\s+key=\{item\.id\}\s+className=\{styles\.leaveItem\}\s*>'

    if (-not [regex]::IsMatch($page, $pattern)) {
        throw "ไม่พบ article ของรายการประวัติ"
    }

    $replacement = @'
<article
                  key={item.id}
                  className={styles.leaveItem}
                  data-status={item.status}
                >
'@

    $page = [regex]::Replace(
        $page,
        $pattern,
        $replacement.TrimEnd(),
        1
    )

    Write-Ok "เพิ่ม data-status แล้ว"
}

Write-Utf8Bom -Path $pagePath -Text $page
Write-Ok "บันทึก page.tsx เป็น UTF-8 with BOM"

Write-Step "ติดตั้ง CSS กู้ปุ่มและแยกสีสถานะ"

$startMarker = "/* LEAVE ACTION VISIBILITY AND STATUS COLORS START */"
$endMarker   = "/* LEAVE ACTION VISIBILITY AND STATUS COLORS END */"

if ($css.Contains($startMarker)) {
    $startIndex = $css.IndexOf($startMarker)
    $endIndex = $css.IndexOf($endMarker, $startIndex)

    if ($endIndex -ge 0) {
        $endIndex += $endMarker.Length
        $css = $css.Remove($startIndex, $endIndex - $startIndex).TrimEnd()
    }
}

$override = @'

/* LEAVE ACTION VISIBILITY AND STATUS COLORS START */

/* กล่องใบลารอพิจารณา: สีเหลืองอำพัน */
.reviewSection{
  border:2px solid #f2c66d!important;
  background:linear-gradient(180deg,#fffaf0 0%,#fff7df 100%)!important;
  box-shadow:0 10px 28px rgba(178,119,24,.10)!important;
}

.reviewHeading h3{
  color:#8a5608!important;
}

.reviewHeading strong{
  background:#ffe9ad!important;
  color:#7a4a00!important;
}

.reviewItem{
  border:1px solid #efd28f!important;
  border-left:5px solid #e7a928!important;
  background:#fffdf8!important;
}

.reviewSequence{
  border-color:#efd28f!important;
  background:#fff5d8!important;
}

.reviewSequence>strong{
  background:#ffe6a3!important;
  color:#825100!important;
}

/* บังคับให้กลุ่มปุ่มกลับมาแสดง */
.reviewActions{
  display:flex!important;
  visibility:visible!important;
  opacity:1!important;
  position:static!important;
  z-index:3!important;
  min-height:40px!important;
  overflow:visible!important;
  pointer-events:auto!important;
}

.reviewActions button{
  display:inline-flex!important;
  align-items:center!important;
  justify-content:center!important;
  visibility:visible!important;
  opacity:1!important;
  position:static!important;
  min-height:38px!important;
  min-width:96px!important;
  padding:9px 13px!important;
  border-style:solid!important;
  border-width:1px!important;
  border-radius:10px!important;
  font-weight:900!important;
  line-height:1.2!important;
  white-space:normal!important;
  cursor:pointer!important;
  pointer-events:auto!important;
}

/* ไม่อนุมัติ = แดง */
.reviewActions .rejectButton{
  border-color:#e7a3a3!important;
  background:#fff0f0!important;
  color:#a33434!important;
}

/* อนุมัติ = เขียว */
.reviewActions .approveButton{
  border-color:#8fd0a9!important;
  background:#e5f7ec!important;
  color:#17613e!important;
}

/* ดูหลักฐาน = ฟ้า */
.reviewActions .evidenceButton{
  border-color:#9cc8df!important;
  background:#edf8fd!important;
  color:#225f7d!important;
}

/*
  ปุ่มลบอาจใช้ class เดิมหรือ inline style
  จึงครอบคลุมทั้ง deleteLeaveButton และปุ่มที่มีสีแดง
*/
.reviewActions .deleteLeaveButton,
.reviewActions button[style*="#dc2626"],
.reviewActions button[style*="rgb(220, 38, 38)"]{
  display:inline-flex!important;
  border-color:#dc2626!important;
  background:#fff1f2!important;
  color:#b91c1c!important;
}

/* สถานะรอพิจารณาในประวัติ = เหลือง */
.leaveItem[data-status="pending"]{
  border:1px solid #efd28f!important;
  border-left:5px solid #e7a928!important;
  background:linear-gradient(135deg,#fffdf7,#fff8e7)!important;
}

/* สถานะอนุมัติแล้ว = เขียว */
.leaveItem[data-status="approved"]{
  border:1px solid #9dd7b4!important;
  border-left:5px solid #2f9b65!important;
  background:linear-gradient(135deg,#f6fff9,#eaf8f0)!important;
}

/* สถานะไม่อนุมัติ = แดงอ่อน */
.leaveItem[data-status="rejected"]{
  border:1px solid #e7b1b1!important;
  border-left:5px solid #c94d4d!important;
  background:linear-gradient(135deg,#fffafa,#fff0f0)!important;
}

/* สถานะยกเลิก = เทา */
.leaveItem[data-status="cancelled"]{
  border:1px solid #cfd6d2!important;
  border-left:5px solid #83918a!important;
  background:#f7f9f8!important;
}

/* ป้องกันปุ่มและข้อความทับกันบนจอขนาดกลาง */
@media(max-width:1120px){
  .reviewActions{
    width:100%!important;
    flex-wrap:wrap!important;
    justify-content:flex-end!important;
  }

  .reviewActions button{
    flex:0 1 auto!important;
  }
}

/* Tablet และ Mobile: ปุ่มเต็มพื้นที่แบบแบ่งคอลัมน์ */
@media(max-width:820px){
  .reviewActions{
    display:grid!important;
    grid-template-columns:repeat(2,minmax(0,1fr))!important;
    gap:8px!important;
    width:100%!important;
  }

  .reviewActions button{
    width:100%!important;
    min-width:0!important;
  }
}

/* มือถือแคบ: ปุ่มเรียงแนวตั้ง */
@media(max-width:420px){
  .reviewActions{
    grid-template-columns:1fr!important;
  }

  .reviewActions button{
    grid-column:1!important;
  }
}

/* LEAVE ACTION VISIBILITY AND STATUS COLORS END */
'@

$css = $css.TrimEnd() + $override
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
