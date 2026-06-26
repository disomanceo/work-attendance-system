$ErrorActionPreference = "Stop"

$project = "D:\work-attendance-system"
$relativePath = "app/api/admin/attendance/daily-pdf/route.ts"
$target = Join-Path $project $relativePath
$temp = Join-Path $env:TEMP "work-attendance-daily-pdf-route.ts"
$backup = "$target.backup-full-route-$(Get-Date -Format 'yyyyMMdd-HHmmss')"

Set-Location $project

Write-Host "Fetching origin/development..."
git fetch origin development

if ($LASTEXITCODE -ne 0) {
  throw "git fetch failed"
}

Write-Host "Creating backup..."
Copy-Item $target $backup -Force

Write-Host "Exporting complete route.ts from origin/development..."
cmd /c "git show origin/development:$relativePath > `"$temp`""

if ($LASTEXITCODE -ne 0 -or -not (Test-Path $temp)) {
  throw "Could not export route.ts from origin/development"
}

$content = Get-Content $temp -Raw -Encoding UTF8

if (-not $content.Contains("function formatLateReason(note: string | null)")) {
  throw "Downloaded route.ts does not contain formatLateReason()"
}

if (-not $content.Contains('record.check_in_status === "late"')) {
  throw "Downloaded route.ts does not contain late-only reason logic"
}

Copy-Item $temp $target -Force

Write-Host "Running build..."
npm run build

if ($LASTEXITCODE -ne 0) {
  Write-Host "Build failed. Restoring backup..."
  Copy-Item $backup $target -Force
  throw "Build failed; original file restored"
}

Write-Host ""
Write-Host "Success"
Write-Host "Updated: $relativePath"
Write-Host "Backup: $backup"
Write-Host ""
Write-Host "Next:"
Write-Host "git diff -- $relativePath"
Write-Host "git add $relativePath"
Write-Host 'git commit -m "fix: show concise late reason in daily PDF"'
Write-Host "git push origin development"
