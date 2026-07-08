param(
  [string]$OfficialDutyDeploymentId = "AKfycbwKgxErXsRSU4cvAXc_zXW1C5dtXnX7DdwtMtDlAAlIdt1cNs16ufdP8IcdwpohzOCcrg",
  [string]$LeaveDeploymentId = "",
  [switch]$SkipBuild,
  [switch]$SkipVercel,
  [switch]$SkipGas,
  [switch]$SkipOfficialDuty,
  [switch]$SkipLeave
)

$ErrorActionPreference = "Stop"

function Step($message) {
  Write-Host ""
  Write-Host "==> $message" -ForegroundColor Cyan
}

function Run($command, $arguments, $workingDirectory) {
  Step "$command $($arguments -join ' ')"
  Push-Location $workingDirectory
  try {
    & $command @arguments
    if ($LASTEXITCODE -ne 0) {
      throw "Command failed with exit code $LASTEXITCODE"
    }
  } finally {
    Pop-Location
  }
}

function New-ClaspVersion($workingDirectory, $message) {
  Step "Create clasp version: $message"
  Push-Location $workingDirectory
  try {
    $output = & npx.cmd clasp version $message 2>&1
    $output | ForEach-Object { Write-Host $_ }
    if ($LASTEXITCODE -ne 0) {
      throw "clasp version failed with exit code $LASTEXITCODE"
    }

    $matches = [regex]::Matches(($output -join "`n"), "\b\d+\b")
    if ($matches.Count -eq 0) {
      throw "Could not detect clasp version number. Run 'npx clasp versions' and deploy manually."
    }

    return [int]$matches[$matches.Count - 1].Value
  } finally {
    Pop-Location
  }
}

$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$officialDutyDir = Join-Path $root "gas-official-duty"
$leaveDir = Join-Path $root "gas-leave-document"
$sqlFile = Join-Path $root "supabase\migrations\20260708110000_create_user_notification_reads.sql"

Step "Preflight"
Write-Host "Project: $root"
Write-Host "SQL migration: $sqlFile"
Write-Host "Official duty deployment: $OfficialDutyDeploymentId"
Write-Host "Leave deployment: $(if ($LeaveDeploymentId) { $LeaveDeploymentId } else { '(not set)' })"

if (-not (Test-Path $sqlFile)) {
  throw "SQL migration file not found: $sqlFile"
}

if (-not $SkipBuild) {
  Run "npx.cmd" @("next", "build") $root
}

if (-not $SkipVercel) {
  Run "npx.cmd" @("vercel", "deploy", "--prod", "--yes") $root
}

if (-not $SkipGas -and -not $SkipOfficialDuty) {
  Run "npx.cmd" @("clasp", "push") $officialDutyDir
  $version = New-ClaspVersion $officialDutyDir "Fix official duty placeholder and signature"
  Run "npx.cmd" @(
    "clasp",
    "deploy",
    "--deploymentId",
    $OfficialDutyDeploymentId,
    "--versionNumber",
    "$version"
  ) $officialDutyDir
}

if (-not $SkipGas -and -not $SkipLeave) {
  if (-not $LeaveDeploymentId) {
    Step "Leave GAS deployments"
    Push-Location $leaveDir
    try {
      & npx.cmd clasp deployments
    } finally {
      Pop-Location
    }

    $LeaveDeploymentId = Read-Host "Paste leave document deploymentId"
  }

  if (-not $LeaveDeploymentId) {
    throw "LeaveDeploymentId is required for leave GAS deploy."
  }

  Run "npx.cmd" @("clasp", "push") $leaveDir
  $version = New-ClaspVersion $leaveDir "Fix leave signature sizing"
  Run "npx.cmd" @(
    "clasp",
    "deploy",
    "--deploymentId",
    $LeaveDeploymentId,
    "--versionNumber",
    "$version"
  ) $leaveDir
}

Step "Done"
Write-Host "Deploy steps finished. If SQL was not run yet, run this file in Supabase SQL Editor:"
Write-Host $sqlFile
