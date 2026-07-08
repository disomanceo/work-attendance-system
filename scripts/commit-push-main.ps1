param(
  [string]$Message = "Update notifications and document signatures",
  [string]$Branch = "codex/pdf-merge-signature-fix",
  [switch]$SkipChecks
)

$ErrorActionPreference = "Stop"

function Step($message) {
  Write-Host ""
  Write-Host "==> $message" -ForegroundColor Cyan
}

function Run($command, $arguments) {
  Step "$command $($arguments -join ' ')"
  & $command @arguments
  if ($LASTEXITCODE -ne 0) {
    throw "Command failed with exit code $LASTEXITCODE"
  }
}

$root = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $root

$files = @(
  "app/admin/attendance/attendance-report.module.css",
  "app/admin/attendance/page.tsx",
  "app/api/leave/today/route.ts",
  "app/api/notifications/seen/route.ts",
  "components/attendance/LeaveReviewPopup.tsx",
  "components/attendance/OfficialDutyReviewPopup.tsx",
  "components/attendance/OrderReviewPopup.tsx",
  "components/attendance/RequestResultPopup.tsx",
  "components/attendance/SmartAreaAssignmentPopup.tsx",
  "components/layout/AppSidebar.tsx",
  "gas-attendance-pdf/.claspignore",
  "gas-leave-document/.claspignore",
  "gas-leave-document/DocumentNumberService.gs",
  "gas-leave-document/LeaveDocumentService.gs",
  "gas-official-duty/Code.gs",
  "scripts/deploy-popup-signature-fixes.ps1",
  "scripts/commit-push-main.ps1",
  "supabase/migrations/20260707180000_fix_smart_area_task_status_ambiguity.sql",
  "supabase/migrations/20260708110000_create_user_notification_reads.sql"
)

if (-not $SkipChecks) {
  Run "npx.cmd" @(
    "eslint",
    "components/attendance/RequestResultPopup.tsx",
    "components/attendance/OrderReviewPopup.tsx",
    "components/attendance/SmartAreaAssignmentPopup.tsx",
    "app/api/notifications/seen/route.ts",
    "app/admin/attendance/page.tsx"
  )
  Run "npx.cmd" @("tsc", "--noEmit")
  Run "npx.cmd" @("next", "build")
}

Run "git" (@("add", "--") + $files)
Run "git" @("commit", "-m", $Message)
Run "git" @("push", "-u", "origin", $Branch)

Step "Fast-forward main locally and push main"
Run "git" @("branch", "-f", "main", "HEAD")
Run "git" @("push", "origin", "HEAD:main")

Step "Done"
git status --short --branch
