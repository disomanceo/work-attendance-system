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
$apiPath  = Join-Path $ProjectPath "app\api\leave\route.ts"
$cssPath  = Join-Path $ProjectPath "app\leave\leave.module.css"
$snippetPath = Join-Path $PSScriptRoot "member-leave-history-snippet.txt"

foreach ($path in @($pagePath, $apiPath, $cssPath, $snippetPath)) {
    if (-not (Test-Path -LiteralPath $path)) {
        throw "ไม่พบไฟล์ $path"
    }
}

$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backupDir = Join-Path $ProjectPath "_backup\fix-evidence-member-history-$timestamp"
New-Item -ItemType Directory -Path $backupDir -Force | Out-Null

Copy-Item -LiteralPath $pagePath -Destination (Join-Path $backupDir "page.tsx") -Force
Copy-Item -LiteralPath $apiPath  -Destination (Join-Path $backupDir "route.ts") -Force
Copy-Item -LiteralPath $cssPath  -Destination (Join-Path $backupDir "leave.module.css") -Force
Ok "สำรองไฟล์ไว้ที่ $backupDir"

$page = [System.IO.File]::ReadAllText($pagePath, [System.Text.Encoding]::UTF8)
$api  = [System.IO.File]::ReadAllText($apiPath, [System.Text.Encoding]::UTF8)
$css  = [System.IO.File]::ReadAllText($cssPath, [System.Text.Encoding]::UTF8)
$memberSnippet = [System.IO.File]::ReadAllText($snippetPath, [System.Text.Encoding]::UTF8)

Step "แก้ช่องคำอธิบายหลักฐานให้ไม่บังคับ"

$oldFormLine = 'form.set("evidenceDescription", attachment ? evidenceDescription.trim() || "-" : "-");'
$newFormLine = 'form.set("evidenceDescription", evidenceDescription.trim());'

if ($page.Contains($oldFormLine)) {
    $page = $page.Replace($oldFormLine, $newFormLine)
    Ok "หน้าเว็บส่งคำอธิบายตามที่พิมพ์จริง และยอมให้ว่าง"
}
elseif ($page.Contains($newFormLine)) {
    Ok "หน้าเว็บแก้เงื่อนไขคำอธิบายไว้แล้ว"
}
else {
    throw "ไม่พบบรรทัด form.set evidenceDescription ใน page.tsx"
}

$validationPattern = '(?s)\s*if\s*\(attachment\)\s*\{\s*if\s*\(evidenceDescriptionInput\.length\s*<\s*2\)\s*\{\s*return\s+NextResponse\.json\(\s*\{\s*ok:\s*false,\s*message:\s*"กรุณาระบุหลักฐาน เช่น ใบรับรองแพทย์ หรือ รูปถ่าย"\s*\},\s*\{\s*status:\s*400\s*\}\s*\);\s*\}\s*'

if ([regex]::IsMatch($api, $validationPattern)) {
    $api = [regex]::Replace($api, $validationPattern, "`r`n    if (attachment) {`r`n", 1)
    Ok "ยกเลิกการบังคับข้อความเมื่อแนบไฟล์แล้ว"
}
elseif ($api -notmatch 'กรุณาระบุหลักฐาน เช่น ใบรับรองแพทย์ หรือ รูปถ่าย') {
    Ok "API ไม่มีเงื่อนไขบังคับข้อความแล้ว"
}
else {
    throw "พบข้อความแจ้งเตือน แต่รูปแบบโค้ดไม่ตรง กรุณาใช้ไฟล์ปัจจุบันเพื่อตรวจเพิ่ม"
}

$api = $api.Replace(
    'evidenceDescription: evidence ? evidenceDescriptionInput : "-",',
    'evidenceDescription: evidenceDescriptionInput,'
)

Ok "กำหนดค่า {{ใบรับรอง}} เป็นข้อความที่พิมพ์ หรือค่าว่าง"

Step "เพิ่ม State และข้อมูลแบ่งหน้าสำหรับประวัติของสมาชิก"

if ($page -notmatch 'const\s+\[memberHistoryPage,\s*setMemberHistoryPage\]') {
    $statePatterns = @(
        '(\s*const\s+\[adminLeavePage,\s*setAdminLeavePage\]\s*=\s*useState\(1\);)',
        '(\s*const\s+\[historyOpen,\s*setHistoryOpen\]\s*=\s*useState\(false\);)'
    )

    $stateAdded = $false
    foreach ($pattern in $statePatterns) {
        if ([regex]::IsMatch($page, $pattern)) {
            $page = [regex]::Replace(
                $page,
                $pattern,
                '$1' + "`r`n  const [memberHistoryPage, setMemberHistoryPage] = useState(1);",
                1
            )
            $stateAdded = $true
            break
        }
    }

    if (-not $stateAdded) {
        throw "ไม่พบตำแหน่งเพิ่ม memberHistoryPage"
    }

    Ok "เพิ่ม State หน้าประวัติสมาชิกแล้ว"
}
else {
    Ok "มี State ประวัติสมาชิกแล้ว"
}

if ($page -notmatch 'const\s+memberHistoryPageSize\s*=\s*10') {
    $insertBefore = "  async function submitLeave("
    if (-not $page.Contains($insertBefore)) {
        throw "ไม่พบตำแหน่งก่อน submitLeave"
    }

    $derived = @'
  const memberHistoryPageSize = 10;
  const memberHistoryTotalPages = Math.max(
    1,
    Math.ceil(requests.length / memberHistoryPageSize)
  );
  const safeMemberHistoryPage = Math.min(
    memberHistoryPage,
    memberHistoryTotalPages
  );
  const pagedMemberHistoryRequests = requests.slice(
    (safeMemberHistoryPage - 1) * memberHistoryPageSize,
    safeMemberHistoryPage * memberHistoryPageSize
  );

  useEffect(() => {
    if (memberHistoryPage > memberHistoryTotalPages) {
      setMemberHistoryPage(memberHistoryTotalPages);
    }
  }, [memberHistoryPage, memberHistoryTotalPages]);

'@

    $page = $page.Replace($insertBefore, $derived + $insertBefore)
    Ok "เพิ่มข้อมูลแบ่งหน้า 10 รายการแล้ว"
}
else {
    Ok "มีข้อมูลแบ่งหน้าสมาชิกแล้ว"
}

Step "เพิ่มประวัติของครูและเจ้าหน้าที่"

if ($page.Contains("memberOwnLeaveHistory")) {
    Ok "มีส่วนประวัติของสมาชิกแล้ว"
}
else {
    $adminEndPattern = '(?s)(\{\["director",\s*"admin"\]\.includes\(profileRole\)\s*&&\s*\(\s*<div\s+className=\{styles\.leaveManagementGroups\}>.*?</div>\s*\)\})'

    if (-not [regex]::IsMatch($page, $adminEndPattern)) {
        throw "ไม่พบส่วน leaveManagementGroups ของผู้บริหาร จึงยังไม่เพิ่มประวัติสมาชิก"
    }

    $page = [regex]::Replace(
        $page,
        $adminEndPattern,
        '$1' + "`r`n`r`n" + $memberSnippet.TrimEnd(),
        1
    )

    Ok "เพิ่มประวัติการยื่นใบลาของครูและเจ้าหน้าที่แล้ว"
}

Write-Utf8Bom -Path $pagePath -Text $page
Write-Utf8Bom -Path $apiPath -Text $api

Step "เพิ่ม CSS ประวัติสมาชิก"

$startMarker = "/* MEMBER OWN LEAVE HISTORY START */"
$endMarker   = "/* MEMBER OWN LEAVE HISTORY END */"

if ($css.Contains($startMarker)) {
    $startIndex = $css.IndexOf($startMarker)
    $endIndex = $css.IndexOf($endMarker, $startIndex)

    if ($endIndex -ge 0) {
        $endIndex += $endMarker.Length
        $css = $css.Remove($startIndex, $endIndex - $startIndex).TrimEnd()
    }
}

$memberCss = @'

/* MEMBER OWN LEAVE HISTORY START */

.memberOwnLeaveHistory{
  display:grid;
  gap:10px;
  width:100%;
  min-width:0;
}

.memberOwnLeaveHeader{
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:10px;
}

.memberOwnLeaveHeader h3{
  margin:0;
  color:#264d3e;
  font-size:16px;
  font-weight:800;
}

.memberOwnLeaveHeader strong{
  padding:5px 9px;
  border-radius:999px;
  background:#e8f5ee;
  color:#236448;
  font-size:10px;
  font-weight:800;
  white-space:nowrap;
}

.memberOwnLeaveList{
  display:grid;
  gap:7px;
  width:100%;
  min-width:0;
}

.memberOwnLeaveItem{
  width:100%;
  min-width:0;
  padding:9px;
  border:1px solid #dfe7e2;
  border-left:4px solid #8a9a92;
  border-radius:10px;
  background:#fff;
  box-sizing:border-box;
  overflow:hidden;
}

.memberOwnLeaveItem[data-status="pending"]{
  border-left-color:#dfa623;
  background:#fffaf0;
}

.memberOwnLeaveItem[data-status="approved"]{
  border-left-color:#2f9964;
  background:#f3fbf6;
}

.memberOwnLeaveItem[data-status="rejected"]{
  border-left-color:#c84d4d;
  background:#fff6f6;
}

.memberOwnLeaveItem[data-status="cancelled"]{
  border-left-color:#89958f;
  background:#f7f9f8;
}

.memberOwnLeaveMain{
  display:grid;
  grid-template-columns:36px 96px 62px minmax(130px,1fr) 42px;
  align-items:center;
  gap:5px;
  width:100%;
  min-width:0;
  color:#405b50;
  font-size:9.5px;
}

.memberOwnLeaveMain>*{
  min-width:0;
  overflow-wrap:anywhere;
}

.memberOwnLeaveMain strong{
  color:#285d48;
  font-weight:800;
}

.memberOwnLeaveFooter{
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:6px;
  margin-top:6px;
  padding-top:6px;
  border-top:1px dashed rgba(99,123,112,.22);
  flex-wrap:wrap;
}

.memberOwnLeaveActions{
  display:flex;
  align-items:center;
  justify-content:flex-end;
  gap:5px;
  margin-left:auto;
  flex-wrap:wrap;
}

.memberOwnLeaveActions a,
.memberOwnLeaveActions button{
  display:inline-flex;
  align-items:center;
  justify-content:center;
  min-width:72px;
  height:28px;
  padding:3px 6px;
  border:1px solid #b8c9c0;
  border-radius:7px;
  background:#fff;
  color:#285d48;
  font:inherit;
  font-size:9px;
  font-weight:800;
  text-decoration:none;
  cursor:pointer;
  box-sizing:border-box;
}

.memberOwnLeaveHistory .adminLeavePagination{
  display:flex!important;
}

@media(max-width:760px){
  .memberOwnLeaveMain{
    grid-template-columns:1fr;
    gap:5px;
  }

  .memberOwnLeaveMain>*{
    display:grid;
    grid-template-columns:82px minmax(0,1fr);
    gap:6px;
  }

  .memberOwnLeaveMain>*::before{
    content:attr(data-label);
    color:#718278;
    font-size:9px;
    font-weight:800;
  }

  .memberOwnLeaveFooter{
    align-items:stretch;
    flex-direction:column;
  }

  .memberOwnLeaveActions{
    display:grid;
    grid-template-columns:repeat(2,minmax(0,1fr));
    width:100%;
    margin:0;
  }

  .memberOwnLeaveActions a,
  .memberOwnLeaveActions button{
    width:100%;
    min-width:0;
  }
}

/* MEMBER OWN LEAVE HISTORY END */
'@

$css = $css.TrimEnd() + $memberCss
Write-Utf8Bom -Path $cssPath -Text $css
Ok "บันทึก CSS ประวัติสมาชิกแล้ว"

Step "ตรวจ UTF-8 BOM"

foreach ($path in @($pagePath, $apiPath, $cssPath)) {
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
