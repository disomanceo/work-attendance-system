#requires -Version 5.1
<#
.SYNOPSIS
  ตรวจสอบและเตรียมไฟล์ระบบใบลาให้ใช้งานกับ Windows PowerShell
  โดยสำรองไฟล์เดิมและบันทึกกลับเป็น UTF-8 with BOM

.DESCRIPTION
  สคริปต์นี้ไม่เพิ่มตัวแปร issuedNumber/documentNumber ที่ไม่มีอยู่ในโค้ดจริง
  แต่จะ:
  1) ตรวจสอบตำแหน่งโปรเจกต์
  2) ตรวจสอบ Git
  3) สำรอง app\api\leave\route.ts
  4) ตรวจสอบโครงสร้าง leaveCreatePending
  5) บันทึกไฟล์เดิมกลับเป็น UTF-8 with BOM
  6) รัน npm install และ npm run build
#>

[CmdletBinding()]
param(
    [string]$ProjectPath = "D:\work-attendance-system",
    [switch]$SkipInstall,
    [switch]$SkipBuild
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

function Write-Step {
    param([string]$Message)
    Write-Host ""
    Write-Host "==> $Message" -ForegroundColor Cyan
}

function Write-Ok {
    param([string]$Message)
    Write-Host "[OK] $Message" -ForegroundColor Green
}

function Write-WarnText {
    param([string]$Message)
    Write-Host "[คำเตือน] $Message" -ForegroundColor Yellow
}

function Write-Utf8Bom {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Path,

        [Parameter(Mandatory = $true)]
        [string]$Text
    )

    # UTF8Encoding($true) = UTF-8 with BOM
    $utf8Bom = New-Object System.Text.UTF8Encoding($true)
    [System.IO.File]::WriteAllText($Path, $Text, $utf8Bom)
}

Write-Step "ตรวจสอบโฟลเดอร์โปรเจกต์"

if (-not (Test-Path -LiteralPath $ProjectPath -PathType Container)) {
    throw "ไม่พบโฟลเดอร์โปรเจกต์: $ProjectPath"
}

Set-Location -LiteralPath $ProjectPath
Write-Ok "พบโปรเจกต์ที่ $ProjectPath"

Write-Step "ตรวจสอบ Git และสถานะไฟล์"

if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    throw "ไม่พบคำสั่ง git กรุณาติดตั้ง Git for Windows ก่อน"
}

git status --short
if ($LASTEXITCODE -ne 0) {
    throw "ไม่สามารถอ่านสถานะ Git ได้"
}

$routePath = Join-Path $ProjectPath "app\api\leave\route.ts"

Write-Step "ตรวจสอบไฟล์ API ใบลา"

if (-not (Test-Path -LiteralPath $routePath -PathType Leaf)) {
    throw "ไม่พบไฟล์: $routePath"
}

$rawBytes = [System.IO.File]::ReadAllBytes($routePath)
$hasBom = (
    $rawBytes.Length -ge 3 -and
    $rawBytes[0] -eq 0xEF -and
    $rawBytes[1] -eq 0xBB -and
    $rawBytes[2] -eq 0xBF
)

if ($hasBom) {
    Write-Ok "ไฟล์ route.ts เป็น UTF-8 with BOM อยู่แล้ว"
}
else {
    Write-WarnText "ไฟล์ route.ts ยังไม่มี UTF-8 BOM"
}

$text = [System.IO.File]::ReadAllText(
    $routePath,
    [System.Text.Encoding]::UTF8
)

$requiredMarkers = @(
    'action: "leaveCreatePending"',
    'gasResult.leaveNumber',
    'action: "leaveDiscardPending"',
    '.from("leave_requests")'
)

foreach ($marker in $requiredMarkers) {
    if (-not $text.Contains($marker)) {
        throw "โครงสร้างไฟล์ไม่ตรงกับระบบปัจจุบัน ไม่พบข้อความ: $marker"
    }
}

Write-Ok "พบระบบสร้างเอกสารรอพิจารณา บันทึก Supabase และลบเอกสารค้าง"

if ($text.Contains("issuedNumber") -or $text.Contains("documentNumber: issuedNumber")) {
    Write-WarnText "พบ issuedNumber/documentNumber ในไฟล์ โปรดตรวจว่าเป็นโค้ดรุ่นใหม่จริง"
}
else {
    Write-WarnText "ไฟล์ปัจจุบันไม่มี issuedNumber และ documentNumber จึงไม่เพิ่มโค้ดสมมติให้โดยอัตโนมัติ"
}

Write-Step "สำรองไฟล์ก่อนดำเนินการ"

$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backupDir = Join-Path $ProjectPath "_backup\leave-fix-$timestamp"
New-Item -ItemType Directory -Path $backupDir -Force | Out-Null

$backupPath = Join-Path $backupDir "route.ts"
Copy-Item -LiteralPath $routePath -Destination $backupPath -Force
Write-Ok "สำรองไฟล์ไว้ที่ $backupPath"

Write-Step "บันทึก route.ts เป็น UTF-8 with BOM"

# ตัด BOM เดิมออกจากข้อความก่อนเขียน เพื่อไม่ให้เกิด BOM ซ้ำ
$text = $text.TrimStart([char]0xFEFF)
Write-Utf8Bom -Path $routePath -Text $text

$verifyBytes = [System.IO.File]::ReadAllBytes($routePath)
$verifiedBom = (
    $verifyBytes.Length -ge 3 -and
    $verifyBytes[0] -eq 0xEF -and
    $verifyBytes[1] -eq 0xBB -and
    $verifyBytes[2] -eq 0xBF
)

if (-not $verifiedBom) {
    throw "บันทึก UTF-8 BOM ไม่สำเร็จ"
}

Write-Ok "ยืนยันแล้ว: route.ts เป็น UTF-8 with BOM"

if (-not $SkipInstall) {
    Write-Step "ติดตั้งแพ็กเกจ"
    npm install

    if ($LASTEXITCODE -ne 0) {
        throw "npm install ไม่สำเร็จ"
    }

    Write-Ok "ติดตั้งแพ็กเกจสำเร็จ"
}
else {
    Write-WarnText "ข้าม npm install ตามพารามิเตอร์ -SkipInstall"
}

if (-not $SkipBuild) {
    Write-Step "ตรวจสอบการ Build"
    npm run build

    if ($LASTEXITCODE -ne 0) {
        throw "Build ไม่ผ่าน ไฟล์สำรองอยู่ที่ $backupPath"
    }

    Write-Ok "Build ผ่าน"
}
else {
    Write-WarnText "ข้าม npm run build ตามพารามิเตอร์ -SkipBuild"
}

Write-Step "สรุป"
Write-Host "ไฟล์หลัก : $routePath"
Write-Host "ไฟล์สำรอง: $backupPath"
Write-Host "Encoding  : UTF-8 with BOM"
Write-Host ""
Write-Host "ขั้นต่อไปให้รัน:" -ForegroundColor Cyan
Write-Host "  npm run dev"
Write-Host ""
Write-Host "หมายเหตุ: ยังไม่มีการเพิ่ม issuedNumber/documentNumber เพราะไม่มีตัวแปรดังกล่าวในโค้ดจริงบน main" -ForegroundColor Yellow
