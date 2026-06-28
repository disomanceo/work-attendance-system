#requires -Version 5.1
[CmdletBinding()]
param(
    [string]$ProjectPath = "D:\work-attendance-main",
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

    $utf8Bom = New-Object System.Text.UTF8Encoding($true)
    [System.IO.File]::WriteAllText($Path, $Text, $utf8Bom)
}

Write-Step "ตรวจสอบโฟลเดอร์โปรเจกต์"

if (-not (Test-Path -LiteralPath $ProjectPath -PathType Container)) {
    throw "ไม่พบโฟลเดอร์โปรเจกต์: $ProjectPath"
}

Set-Location -LiteralPath $ProjectPath
Write-Ok "พบโปรเจกต์ที่ $ProjectPath"

Write-Step "ตรวจสอบ Git"

if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    throw "ไม่พบ Git for Windows"
}

$currentBranch = (git branch --show-current).Trim()
Write-Host "Branch ปัจจุบัน: $currentBranch"

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

Write-Step "ตรวจสอบโครงสร้างระบบใบลาแบบยืดหยุ่น"

$checks = @(
    @{
        Name = "คำสั่งสร้างเอกสารรอพิจารณา"
        Patterns = @(
            'leaveCreatePending',
            'createPending',
            'pendingDocument'
        )
    },
    @{
        Name = "ข้อมูลเลขใบลา"
        Patterns = @(
            'leaveNumber',
            'leave_number',
            'documentNumber',
            'formattedNumber'
        )
    },
    @{
        Name = "ระบบลบหรือยกเลิกเอกสารค้าง"
        Patterns = @(
            'leaveDiscardPending',
            'discardPending',
            'deletePending',
            'removePending'
        )
    },
    @{
        Name = "ตาราง leave_requests"
        Patterns = @(
            'leave_requests'
        )
    }
)

$missingGroups = @()

foreach ($check in $checks) {
    $found = $false

    foreach ($pattern in $check.Patterns) {
        if ($text.Contains($pattern)) {
            Write-Ok "$($check.Name): พบ '$pattern'"
            $found = $true
            break
        }
    }

    if (-not $found) {
        Write-WarnText "$($check.Name): ไม่พบคำที่คาดไว้"
        $missingGroups += $check.Name
    }
}

if ($missingGroups.Count -gt 0) {
    Write-WarnText "ไฟล์ Local อาจเป็นคนละรุ่นกับ GitHub แต่สคริปต์จะไม่หยุด"
}

Write-Step "แสดงบรรทัดที่เกี่ยวข้องเพื่อใช้ตรวจสอบ"

$searchTerms = @(
    "leaveCreatePending",
    "leaveNumber",
    "leave_number",
    "documentNumber",
    "leaveDiscardPending",
    "leave_requests",
    "callGas"
)

foreach ($term in $searchTerms) {
    $matches = Select-String -LiteralPath $routePath -SimpleMatch -Pattern $term

    if ($matches) {
        Write-Host ""
        Write-Host "--- $term ---" -ForegroundColor Magenta
        $matches |
            Select-Object LineNumber, Line |
            Format-Table -AutoSize
    }
}

Write-Step "สำรองไฟล์"

$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backupDir = Join-Path $ProjectPath "_backup\leave-check-$timestamp"
New-Item -ItemType Directory -Path $backupDir -Force | Out-Null

$backupPath = Join-Path $backupDir "route.ts"
Copy-Item -LiteralPath $routePath -Destination $backupPath -Force

Write-Ok "สำรองไฟล์ไว้ที่ $backupPath"

Write-Step "บันทึก route.ts เป็น UTF-8 with BOM"

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

Write-Ok "ยืนยัน UTF-8 with BOM สำเร็จ"

if (-not $SkipInstall) {
    Write-Step "ติดตั้งแพ็กเกจ"
    npm install

    if ($LASTEXITCODE -ne 0) {
        throw "npm install ไม่สำเร็จ"
    }

    Write-Ok "npm install สำเร็จ"
}

if (-not $SkipBuild) {
    Write-Step "ตรวจสอบ Build"
    npm run build

    if ($LASTEXITCODE -ne 0) {
        throw "Build ไม่ผ่าน ไฟล์สำรองอยู่ที่ $backupPath"
    }

    Write-Ok "Build ผ่าน"
}

Write-Step "เสร็จสิ้น"
Write-Host "ไฟล์หลัก : $routePath"
Write-Host "ไฟล์สำรอง: $backupPath"
Write-Host "Encoding  : UTF-8 with BOM"
Write-Host ""
Write-Host "หมายเหตุ: สคริปต์นี้ไม่ได้แก้ตรรกะเลขใบลาโดยอัตโนมัติ เพราะต้องยึดโค้ด Local จริงเป็นหลัก" -ForegroundColor Yellow
