# Work Attendance TODO

Updated: 2026-07-14

## Current rules

- Workspace path: `D:\work-attendance-main`
- Do not run `git add` until explicitly requested.
- Do not run `git reset`.
- Do not delete backup folders or backup files.
- Do not deploy until explicitly requested.
- Keep fixes minimal and avoid unrelated modules.

## Latest findings

- Latest database rows imported at `2026-07-13T04:15-04:16Z` have no central page metadata:
  - `legacy_payload.smart_area_page` is empty.
  - `legacy_payload.row_order` is empty.
  - `legacy_payload.source_page_url` is empty.
- Because those fields are empty, the documents page cannot know that the new rows belong to central pages such as `163`, `164`, or `165`.
- The local import script now sends `smartAreaPage`, `centralLatestPage`, `sourcePageUrl`, and `rowOrder`, but the browser button dispatches GitHub Actions on remote `main`.
- Uncommitted local changes are not used by GitHub Actions or production Vercel until the user explicitly allows the normal release path.
- Local `.env.local` does not contain `SMART_AREA_BASE_URL`, `SMART_AREA_USERNAME`, or `SMART_AREA_PASSWORD`, so this machine cannot directly backfill the missing central page metadata from the central system.
- Rechecked import run `29224140916` from `2026-07-13T04:31:58Z`:
  - `scanned`: 60
  - `updated`: 44
  - `duplicate`: 16
  - `failed`: 0
- The latest updated rows still have empty `documentNo`, empty `smart_area_page`, empty `source_page_url`, and empty `row_order`.
- `origin/main` workflow script currently sends no `smartAreaPage`, no `sourcePageUrl`, and no `rowOrder` in the import payload, so the remote button import cannot match central page `165` until the fixed code is released.
- The central URL `http://101.51.157.107/smartarea/index.php?option=book&task=main/receive&page=165` returns HTTP 200 but shows the login page without central credentials, so local direct comparison of page rows requires central login credentials.
- After logging in and checking central page `165`, row `49880` maps as:
  - central page: `165`
  - row order: `1`
  - document number column: `ที่ ศธ 04160/ว3166`
  - subject column: `สพป.กาฬสินธุ์ เขต 1 ประกาศนโยบายไม่รับของขวัญ...`
  - document date column: `9 กค 2569`
  - sender column: `กลุ่มอำนวยการ`
- Detail page `b_id=49880` stores the document number in the line `รายละเอียดหนังสือ ที่ ศธ 04160/ว3166`, not under the old label `เลขที่หนังสือ`.
- Emergency backfill from central pages `163-165` completed:
  - found: 47
  - inserted: 7
  - updated: 40
  - page `165` now has 7 rows in Supabase
  - page `164` now has 20 rows in Supabase
  - page `163` now has 20 rows in Supabase
- Verified row `49880` after backfill:
  - registration number: `2561`
  - document number: `ที่ ศธ 04160/ว3166`
  - central page: `165`
  - row order: `1`
- Backfill from central pages `162-164` completed:
  - found: 60
  - inserted: 0
  - updated: 60
  - verified old rows now have document numbers such as `ที่ ศธ 04160/ว3197`

## Changes made

- Added daily duty teacher display to the attendance report:
  - report header now shows a `ครูเวรประจำวัน` box under the date picker,
  - duty teacher names are loaded from the active duty roster for the selected weekday,
  - the duty box is balanced with the date filter on desktop and mobile,
  - verified with `npm run build`.
- Matched desktop daily attendance report styling with mobile:
  - changed `นักเรียนทั้งหมด` labels to `ทั้งหมด` across the report,
  - applied the emerald header theme to desktop,
  - verified with `npm run build`.
- Refined the mobile daily attendance report header and table:
  - mobile header now uses an emerald highlight band,
  - report title stays on one compact line with the date centered below it,
  - the date picker is smaller and fixed to the top-right of the mobile header,
  - mobile table numbers are smaller and lighter,
  - verified with `npm run build`.
- Refined the daily attendance report layout:
  - moved the date picker to the top-right header area,
  - removed semester and class-level filters so the report always shows all classes,
  - changed the header date to a clear full Thai date such as `วันอังคารที่ 14 กรกฎาคม 2569`,
  - compacted the percentage summary cards into rounded rectangles,
  - renamed the table heading to `ตารางสรุปการมาเรียนรายชั้น` and removed duplicate date text there,
  - enlarged class-level table numbers,
  - verified with `npm run build`.
- Updated classroom settings permission visibility and save workflow:
  - duty roster edits now have an explicit `บันทึก` button and show pending/success messages,
  - class adviser saves clear old messages and continue showing save confirmation,
  - classroom settings now shows who can assign duty teachers and class advisers on every settings tab,
  - the calendar tab shows academic-side/calendar editors by name and keeps its save confirmation flow,
  - the settings API now returns departments and readable work permissions for authorized settings pages,
  - verified with `npm run build`.
- Updated the daily student attendance report mobile workflow:
  - unchecked classes now show `-` for present, absent, leave, and attendance percent instead of defaulting to present counts,
  - the action column links eligible users directly to the selected class/date attendance page,
  - users without record permission see a non-action status indicator,
  - the report defaults to the current Bangkok date and refreshes automatically without a show-report button,
  - report dates now display in the short Thai format such as `วันอังคารที่ 14 ก.ค. 2569`,
  - mobile report text was enlarged and the CSS rule that hid the action link was replaced with a tappable icon,
  - verified with `npm run build`.
- Updated budget payment completion behavior:
  - saving a payment now syncs the project status from active payment totals,
  - projects are marked `เสร็จสิ้น` automatically when paid amount reaches or exceeds 100% of budget,
  - the manual `สั่งเสร็จสิ้น` button remains available only when paid amount is still below budget,
  - manual completion now shows `เสร็จสิ้นเรียบร้อยแล้ว` on screen and prevents duplicate clicks while saving,
  - verified with `npm run build`.
- Adjusted mobile daily attendance report recorder display:
  - shortened recorder names in the UI to first-name teacher labels such as `ครูพิมวิภา`,
  - reduced the mobile `% มาเรียน` column and widened the action/status column,
  - verified with `npm run build`.
- Added attendance recorder names to the daily student attendance report:
  - `/api/students/attendance` now returns the profile name of the recorder for checked classes,
  - the report action/status column shows the recorder name under `เช็คชื่อแล้ว`,
  - export CSV includes the recorder name beside checked status,
  - verified with `npm run build`.
- Updated student attendance save status:
  - shows `ยังไม่ได้บันทึก` or `บันทึกแล้ว` under the save button,
  - marks the form unsaved when a status is changed,
  - asks for confirmation before saving edits over existing attendance records,
  - verified with `npm run build`.
- Opened the daily student attendance report for all active teachers/staff:
  - report page now requests read-only report access for every class,
  - attendance save/edit permissions still use the existing `canRecordAttendance` rules,
  - verified with `npm run build`.
- Refined the budget project activity column again:
  - pinned mobile row columns so the activity count stays on the same line,
  - shifted desktop budget/status/file columns left to give activity more space,
  - made the pending status badge smaller and plainer on mobile,
  - verified with `npm run build`.
- Adjusted the budget project list layout:
  - removed the leading chevron before project names,
  - shifted project names left and widened the activity column for mobile/tablet,
  - verified with `npm run build`.
- Fixed budget project activity column and student settings permission messages:
  - kept the mobile/tablet activity count column on one line without horizontal overflow,
  - replaced placeholder question-mark forbidden messages in `/api/students/settings`,
  - verified with `npm run build`.
- Updated budget section themes:
  - `/budget/projects` now uses a blue government-style theme for both project/activity and free-education views,
  - `/budget/payments` now uses an amber/orange payment theme for both project/activity and free-education views,
  - verified with `npm run build`.
- Updated `/budget/payments` responsive layout:
  - tightened the tablet breakpoint to prevent iPad/iOS horizontal overflow,
  - compacted project rows, action buttons, history rows, filters, and payment modal sizing for 761-1180px screens,
  - verified with `npm run build`.

- Updated the student information page:
  - replaced the class dropdown with fixed class tabs from `ทุกชั้น`, `อนุบาล 2` through `ป.6`,
  - added room, status, and sort filters,
  - the student list can now load all classes or one selected class through the existing `/api/students` filter,
  - adding a new student defaults to the currently selected class tab, or `อนุบาล 2` when `ทุกชั้น` is selected.
- Added student file import:
  - new API route `/api/students/import`,
  - supports `.docx`, `.txt`, and `.csv` preview,
  - imports core fields first: `full_name`, `class_level`, `class_room`, `status`, and an auto-generated temporary `student_code` when needed,
  - checks existing student codes before insert to avoid duplicate imports.
- Updated Telegram notifications for Smart Area official documents:
  - assignment notifications now use organized sections for document details and assignment details,
  - document status notifications now use organized sections for progress details and document details,
  - Telegram inline buttons for document notifications now say `เปิดหนังสือราชการ`,
  - document links still use `NEXT_PUBLIC_APP_URL`,
  - Vercel Production now has `NEXT_PUBLIC_APP_URL=https://pm-coming.vercel.app`,
  - Vercel alias `https://pm-coming.vercel.app` now points to the latest production deployment.
- Adjusted the official documents UI in `app/documents/page.tsx`:
  - the documents page now opens on the latest Smart Area source page by default,
  - document subjects shown in the list/detail no longer show a trailing `[ปกติ]`, `[ด่วน]`, or `[ด่วนที่สุด]` tag,
  - detail pages now show only the normalized speed level: `ปกติ`, `ด่วน`, or `ด่วนที่สุด`,
  - duplicate finish buttons inside the detail action area are hidden while the main list finish actions remain available.
- Added shared source-order helpers:
  - `lib/smart-area/source-order.ts`
- Restored director finish actions on the documents page:
  - director finish button now uses `canAssign + canClose` capabilities instead of only `workspaceMode === "manager"`,
  - director finish button is available in mobile cards, mobile detail, desktop row actions, and desktop inline detail,
  - clerk actions still show both `เสร็จสิ้น` and `เสนอ ผอ.` for `clerk_review` items.
- Updated document API serialization to derive central page/order from multiple payload shapes:
  - `smart_area_page`
  - `smartAreaPage`
  - `pageNumber`
  - `page`
  - `source_page_url`
  - `sourcePageUrl`
  - `pageUrl`
  - `row_order`
  - `rowOrder`
  - `order`
- Updated import API to accept alternate field names from GitHub script or Chrome extension.
- Updated import change detection so page URL changes mark an existing document as updated.
- Updated `/documents` sorting so central-page views always follow central page/order first.
- Updated `/documents` registration column to show central page/order in the `ที่` column, for quick comparison with the central system.
- Updated `/documents` registration column again:
  - central badge now shows only `หน้า X`, without row order,
  - registration number displays on one line as `ทะเบียนหนังสือรับ : <number>`,
  - completed-row subject text now uses the same size/weight as unread subject text.
- Updated `/documents` compact table display again:
  - subject text in the subject column now uses normal font weight,
  - the first column now shows only the registration number plus the central page badge,
  - finish buttons in compact rows are smaller and more rounded.
- Updated the Smart Area collector to:
  - read values when central detail rows put label and value in the same cell,
  - fallback `documentNo`, `receiveNo`, `documentDate`, `sender`, and `priority` from the central list row,
  - count `rowOrder` from parsed data rows instead of raw table row index,
  - strip Thai labels such as `เลขทะเบียนหนังสือรับ :` before sending values.
- Updated the collector again after checking real central HTML:
  - read `documentNo` from the list column `เลขหนังสือ`,
  - read `documentNo` from detail text `รายละเอียดหนังสือ ที่ ...`,
  - read `subject`, `documentDate`, and `sender` from fixed central list columns when detail extraction is incomplete.
- Updated the Smart Area collector attachment scan:
  - collect attachment links from normal `href`, `onclick`, `data-url`, and `data-href`,
  - accept central download/file endpoints that do not end with a file extension,
  - deduplicate attachment URLs before sending them to the import API.
- Fixed the Smart Area collector list-row browser context:
  - define local `clean` and `stripLeadingLabel` helpers inside `evaluateAll`,
  - prevents GitHub Actions from failing before it reaches detail pages.
- Expanded attachment scan again to inspect button/input/src-based file openers while avoiding image-icon false positives.
- Added optional `pageRange` workflow input and `SMART_AREA_PAGE_RANGE` support so older central pages such as page `165` can be re-imported directly.
- Filtered Smart Area UI assets under `/modules/book/images/` so status/button images are not imported as attachments.
- Fixed attachment deactivation in the import API to use `status = history` with `removed_at`, matching the database constraint.
- Updated the import API to strip Thai field labels from `receiveNo` and `documentNo` before saving.
- Kept the Chrome extension finding: extension `1.8.32` sends the correct central metadata, but its hardcoded production endpoint still needs production endpoint verification before real use.

## Files changed

- `app/api/documents/import-area-pms/route.ts`
- `app/api/documents/route.ts`
- `app/api/documents/smart-area-import/dispatch/route.ts`
- `app/documents/page.tsx`
- `lib/smart-area/document-date.ts`
- `lib/smart-area/document-response.ts`
- `lib/smart-area/source-order.ts`
- `scripts/smart-area-import/index.mjs`
- `scripts/smart-area-import/backfill-central-pages.mjs`
- `TODO.md`

## Test checklist

- [ ] Run `npm run build`.
- [x] `node --check scripts/smart-area-import/index.mjs`
- [x] `node --check scripts/smart-area-import/backfill-central-pages.mjs`
- [x] `npm run build`
- [x] Backfilled central pages `163-165` into Supabase
- [x] Backfilled central pages `162-164` into Supabase
- [x] Run `npm run build` after the latest compact table UI adjustment.
- [x] Run `node --check scripts/smart-area-import/index.mjs` after the attachment scan update.
- [x] Run `npm run build` after the attachment scan update.
- [ ] Verify `/documents` central-page buttons show the latest central pages after a fresh import that includes metadata.
- [ ] Verify each selected central page is ordered by `rowOrder` like the central system.
- [ ] Verify the import button no longer shows `Missing GitHub workflow token`.
- [ ] Verify GitHub Actions `Smart Area Import` uses the updated script after changes are pushed by user instruction.
- [ ] Verify production Vercel endpoint returns JSON and is not blocked by Vercel login/protection before using Chrome extension as fallback.

## Next action options

- If the user wants the existing 3 imported rows fixed immediately, provide or add local access to `SMART_AREA_BASE_URL`, `SMART_AREA_USERNAME`, and `SMART_AREA_PASSWORD`, then run a backfill against the central system.
- If the user wants GitHub Actions to import correctly going forward, explicitly approve the git/release path. Do not stage, push, or deploy without that instruction.
- If the user wants the next button import to use page/order fixes, the fixed collector and import API must be pushed and deployed/released first.
- If the user wants Chrome extension fallback production-ready, explicitly approve endpoint verification and extension repackaging after production endpoint is confirmed.

## Student Page TODO - 2026-07-13

- Updated the student table column order to `เลขที่ / เลขประจำตัว / รูป / ชื่อ-นามสกุล / ชั้น / จัดการ`.
- Changed `เลขที่` to show the displayed row order, separate from `เลขประจำตัว`.
- Added a small circular student photo column with a person icon fallback.
- Student photos can display from `photo_url`, `image_url`, or `avatar_url`; real image URLs use normal browser caching with lazy loading.
- Moved the compact student file import controls to the page header beside the add button.
- Compacted class tabs on mobile into a two-row button grid.
- Removed `เลขประจำตัว` from the student list table and kept it only inside the edit popup.
- Compacted each student row to one line with smaller text and class level only.
- Changed add/edit/move student forms to open in a centered popup instead of rendering below the table.
- Further compacted the mobile student page:
  - class filter buttons are smaller on phones,
  - file picker and import buttons are smaller in the header,
  - kindergarten labels display as `อ.2` and `อ.3` in filters and list rows.
- Adjusted the mobile student filters again:
  - class buttons now stay on one row,
  - search, room, status, and sort filters now share one compact row.
- Tuned the mobile student header and filters:
  - removed the Supabase description line under the student page title,
  - aligned the add button to the right side of the header controls,
  - matched file picker and class-tab text size to the student-name text,
  - enlarged filter text slightly and shortened the search field.
- Tuned the mobile import/class controls again:
  - replaced the native import file input with a compact `เลือกไฟล์` button only,
  - moved the `นำเข้า` button next to `+ เพิ่ม` on mobile,
  - reduced class-tab text size after removing conflicting responsive text classes.
- Added a student photo picker area inside the add/edit/move popup.
- Added backend support for student photo saving:
  - new `/api/students/photo` upload/read route,
  - student photo upload stores files under `ปีการศึกษา/<ชั้น>` in Google Drive,
  - student APIs now return photo metadata for list rendering,
  - new migration `20260713_student_photo_columns.sql` adds student photo columns,
  - new Apps Script sample `gas-student-photos/Code.gs` supports upload/get/delete.
- Added client-side crop before student photo upload:
  - choosing a photo opens a direct drag-to-select crop popup instead of uploading the raw file,
  - removed zoom/left-right/up-down slider controls from the crop popup,
  - cropped output is saved as a 512x512 JPEG before upload to reduce file size,
  - the form shows only the cropped preview/status and no longer displays the native selected-file text.
- Student photo Drive integration still needs environment/deployment steps before production use:
  - target root folder: `https://drive.google.com/drive/folders/1VCUDQlK0LbSlJ5HIhKsCcO2SfC3ySmyM`,
  - Apps Script profile upload deployment `AKfycbxZZxr8_GwACUVz46xUjvynKTZdqDrc0QrV255a6hjpxzX0ovCbABxFURhoEUnDFOkOrg` was redeployed to version 9 with `uploadStudentPhoto`,
  - Vercel Production env has `GAS_STUDENT_PHOTO_UPLOAD_URL`, `GAS_STUDENT_PHOTO_UPLOAD_SECRET`, and `GAS_STUDENT_PHOTO_ROOT_FOLDER_ID`,
  - local `.env.local` has matching `GAS_STUDENT_PHOTO_*` values,
  - Supabase migration was applied manually in Supabase SQL Editor by the user.
- [ ] Test `/students` in `npm run dev` and confirm the compact table width looks correct on desktop and mobile.
- [x] Apply `supabase/migrations/20260713_student_photo_columns.sql` in Supabase before testing real photo uploads.
- [x] Deploy Apps Script support for student photo upload.
- [x] Set required Vercel/local env vars for student photo upload.

## Student attendance/photo release - 2026-07-13

Release status:

- [x] Committed latest student/attendance fixes: `c9b1a8d fix: improve student attendance and photo flows`.
- [x] Pushed commit to `origin/main`.
- [x] Deployed production on Vercel.
- [x] Production alias points to `https://pm-coming.vercel.app`.
- [x] Vercel deployment URL: `https://pm-coming-ej2ka44a9-disomanceo.vercel.app`.

What changed in the latest release:

- Student photo upload now uses only `GAS_STUDENT_PHOTO_UPLOAD_URL` and `GAS_STUDENT_PHOTO_UPLOAD_SECRET`; it no longer falls back to `GAS_PROFILE_*`, so student photos should not affect teacher profile photos.
- Student photo preview in the add/edit popup now shows the existing photo in the student photo slot, and selecting a new cropped photo replaces the same preview immediately.
- Student photo file reads are cached client-side by Drive file id to reduce repeated loading on the student list.
- Student information page no longer shows room filters or room selectors because each class has only one room.
- Student attendance page no longer shows room selectors or `/room` text after class names.
- Student attendance statuses are reduced to `มา`, `สาย`, `ลา`, and `ขาด`; old `sick` and `personal` values normalize to `ลา`.
- Student attendance rows are compacted to one student per row with full names wrapping instead of truncating.
- Student names abbreviate `เด็กชาย` to `ด.ช.` and `เด็กหญิง` to `ด.ญ.`.
- Status buttons are text-only, centered, smaller, and use a simpler sans-serif style.
- Monthly attendance summary loading is isolated from other dashboard loads, so one failing background widget should not break the whole attendance page.
- Monthly official-duty summary now counts single-day duty rows where `duty_end_date` is null.
- Mobile attendance layout was tightened to reduce overlapping around checked-in/check-out state.

Verified before release:

- [x] `npm run build` passed locally.
- [x] `/students` returned HTTP 200 locally.
- [x] `/students/attendance` returned HTTP 200 locally.
- [x] Vercel production build passed.
- [x] Vercel deployment reached `READY`.

Follow-up checks for the next session:

- [ ] On a real mobile device, open `https://pm-coming.vercel.app/students` and confirm the class tabs fit and the room filter is gone.
- [ ] On a real mobile device, edit a student with an existing photo and confirm the old photo appears immediately in the popup.
- [ ] Choose a new student photo, crop it, save it, then reopen the student list and confirm the new cached photo appears without a long delay.
- [ ] On `https://pm-coming.vercel.app/students/attendance`, confirm there is no room dropdown and no class text like `ป.4/1`.
- [ ] Confirm each student row shows exactly four status buttons: `มา`, `สาย`, `ลา`, `ขาด`.
- [ ] Confirm the status button text is centered and small enough on narrow mobile screens.
- [ ] Confirm saving student attendance still writes correctly when `classRoom` is sent as an empty string.
- [ ] Recheck normal staff attendance check-out on production, especially the `ลงเวลาเลิกงาน` button after 16:30.
- [ ] Recheck production monthly stats on the attendance home page after a user with current-month attendance signs in.
- [ ] If check-out still fails, inspect `/api/attendance/check-out` request/response and the work calendar/day status for the selected account/date.
- [ ] If monthly stats still show blank/zero, inspect `/api/attendance/monthly-summary` response for the signed-in user and current Buddhist/Gregorian month range.

Git/worktree notes:

- Tracked files are clean after commit/push.
- Existing untracked backup/log files remain in the workspace and were intentionally not committed or deleted.
- Do not run `git reset`.
- Do not delete backup files unless the user explicitly asks.

## Smart Area GitHub workflow reliability - 2026-07-14

Release status:

- [x] Added workflow dispatch retry for transient GitHub errors (`408`, `429`, `5xx`, timeout).
- [x] Added PAT fallback order: `GITHUB_WORKFLOW_TOKEN`, `GITHUB_WORKFLOW_TOKEN_BACKUP`, `GITHUB_WORKFLOW_TOKEN_2`.
- [x] Added GitHub App support as the preferred dispatch method when configured.
- [x] GitHub App support creates a fresh installation token on each `/api/documents/smart-area-import/dispatch` call.
- [x] Kept PAT tokens as fallback after GitHub App.
- [x] Added attempt logging into `smart_area_import_runs.errors` when dispatch fails.
- [x] Rebuilt and pushed commit `33784b5 feat: support github app workflow dispatch`.
- [x] Vercel reported production deployments as `Ready` after the GitHub App dispatch update.
- [x] Extension package `1.8.33` exists and the production `extensionInfo` endpoint points to the hosted zip.

Current dispatch order:

1. GitHub App installation token (`GITHUB_APP_ID`, `GITHUB_APP_INSTALLATION_ID`, `GITHUB_APP_PRIVATE_KEY` or `GITHUB_APP_PRIVATE_KEY_BASE64`)
2. `GITHUB_WORKFLOW_TOKEN`
3. `GITHUB_WORKFLOW_TOKEN_BACKUP`
4. `GITHUB_WORKFLOW_TOKEN_2`
5. Web extension fallback from the documents page

GitHub App setup notes:

- GitHub App homepage can be `https://pm-coming.vercel.app` if that is the primary production domain.
- Webhook can stay disabled.
- Repository permissions required:
  - `Actions: Read and write`
  - `Contents: Read-only`
  - `Metadata: Read-only`
- Install the GitHub App only on `disomanceo/work-attendance-system`.
- Add these Vercel Production env vars:
  - `GITHUB_APP_ID`
  - `GITHUB_APP_INSTALLATION_ID`
  - `GITHUB_APP_PRIVATE_KEY` or `GITHUB_APP_PRIVATE_KEY_BASE64`
- Redeploy production after setting or changing any GitHub App env var.

Follow-up checks:

- [ ] After GitHub App env vars are added, redeploy production and press `ดึงล่าสุด`.
- [ ] Confirm the dispatch response/run log uses `github-app` before PAT tokens.
- [ ] Confirm no `GitHub HTTP 401: Bad credentials` appears after the GitHub App env vars are active.
- [ ] Keep PAT env vars in Vercel as backup even after GitHub App works.
- [ ] If extension fallback says it is not responding, install/reload Extension `v1.8.33` and refresh `/documents`.

## Smart Area mobile import reliability - 2026-07-14

Release status:

- [x] Confirmed the current workspace path is `D:\work-attendance-main`.
- [x] Checked `git status` before editing; tracked files were clean.
- [x] Confirmed `.env.local` is ignored by git and added local Smart Area central credentials there for local testing only.
- [x] Confirmed the central Smart Area login page is reachable from the machine and the supplied account can log in to the receive page.
- [x] Updated the Smart Area import button so mobile/tablet browsers do not wait for the Chrome Extension fallback when GitHub dispatch fails.
- [x] Kept Extension fallback for desktop browsers when GitHub dispatch is unavailable.
- [x] Improved the import button message so dispatch/run failures surface the latest error from `smart_area_import_runs.errors`.
- [x] After successful/partial import completion, the import button now announces a document update event.
- [x] Updated `/documents` to reload the document list when the Smart Area import update event fires, so new books appear without waiting for focus/version polling.
- [x] Ran `npm.cmd run build` successfully.

Important production setup still required:

- Mobile import depends on GitHub workflow dispatch because mobile browsers cannot use the Chrome Extension fallback.
- Vercel Production must have either GitHub App env vars or a valid workflow token:
  - `GITHUB_APP_ID`
  - `GITHUB_APP_INSTALLATION_ID`
  - `GITHUB_APP_PRIVATE_KEY` or `GITHUB_APP_PRIVATE_KEY_BASE64`
  - or `GITHUB_WORKFLOW_TOKEN`
- GitHub Actions secrets must include:
  - `SMART_AREA_BASE_URL`
  - `SMART_AREA_USERNAME`
  - `SMART_AREA_PASSWORD`
  - `WORK_ATTENDANCE_IMPORT_URL`
  - `WORK_ATTENDANCE_IMPORT_SECRET`
  - `WORK_ATTENDANCE_CALLBACK_URL`
- `WORK_ATTENDANCE_IMPORT_SECRET` in GitHub Actions must match `SMART_AREA_IMPORT_SECRET` in Vercel Production.
- After setting/changing Vercel env vars, production must be redeployed before mobile import can use the new values.

Follow-up checks:

- [ ] Press `ดึงล่าสุด` on a real mobile device and confirm it starts GitHub workflow instead of waiting for Extension.
- [ ] Confirm the latest `smart_area_import_runs` row reaches `success` or `partial`.
- [ ] Confirm `/documents` reloads and shows new Smart Area books after the import run finishes.
- [ ] If mobile still fails, inspect the visible button error and `smart_area_import_runs.errors` first.

## Smart Area central/school reconciliation - 2026-07-14

Findings:

- The latest successful GitHub workflow run `29334534729` reported:
  - `scanned`: 60
  - `added`: 0
  - `updated`: 1
  - `duplicate`: 59
  - `failed`: 0
- Direct comparison against the central receive pages found page `166` has central IDs:
  - already in school DB: `50032`, `50037`, `50072`, `50073`, `50078`
  - missing from school DB: `50085`, `50086`, `50200`, `50202`, `50205`
- These missing rows were not hidden/inactive in the school system; they did not exist in `smart_area_books`.
- The importer needed a stronger central-vs-school reconciliation step, not only a successful workflow status.

Changes made:

- Expanded the default Smart Area scan window from the latest 3 central pages to the latest 5 central pages.
- Added `SMART_AREA_LOOKBACK_PAGES` support so the scan window can be widened from GitHub Actions/Vercel secrets without changing code.
- Added a pre-import reconciliation check using `checkExistingSmartAreaItems` to log which central IDs are missing from the school DB before importing.
- Added a post-import reconciliation check so the workflow becomes `partial` with explicit missing IDs if any scanned central item is still absent from the school DB after import.
- Kept `SMART_AREA_PAGE_RANGE` support for targeted backfills.

Follow-up checks:

- [ ] Run `node --check scripts/smart-area-import/index.mjs`.
- [ ] Run `npm.cmd run build`.
- [ ] Push and deploy the importer reconciliation update.
- [ ] Press `ดึงล่าสุด` and confirm IDs `50085`, `50086`, `50200`, `50202`, and `50205` are added.
- [ ] Confirm the workflow log prints `scanPlan` with central pages, counts, and `missingBefore`.

## Student role access hardening - 2026-07-14

Release status:

- [x] Created branch `codex/student-role-access`.
- [x] Added shared student access helper in `lib/students/access.ts`.
- [x] Locked student attendance API so only director/admin/staff, class advisers, all-class recorders, or duty teachers for that date can view/save attendance.
- [x] Locked student master data APIs so director/admin/staff can manage all classes and class advisers can manage only their own classes.
- [x] Locked student import and student photo upload/read paths by the same class-level access rules.
- [x] Added auth and role checks to `/api/students/settings` and limited settings saves by permission type.
- [x] Allowed `staff` to manage the work calendar with director/admin.
- [x] Updated `/students/attendance` to load allowed class choices from the server before loading attendance rows.
- [x] Updated `/students` to use allowed class choices from the server and hide/disable management controls when not allowed.
- [x] Updated `/students/settings` tabs to show only settings areas the user can manage.
- [x] Ran `npm run build` successfully.

Policy implemented:

- `director`, `admin`, and `staff` can manage all student data, attendance, roster/settings, and work calendar.
- Class advisers can view/manage students in their own class and check attendance for their own class.
- Duty teachers can check attendance for every class only on the weekday they are assigned.
- Teachers with `student_attendance_all_classes` can check attendance for every class.
- Non-adviser teachers cannot edit student master data outside their assigned class.

Follow-up checks:

- [ ] Sign in as a class adviser and confirm `/students` only returns their class.
- [ ] Sign in as a Monday duty teacher on Monday and confirm `/students/attendance` lists all classes.
- [ ] Sign in as a non-duty teacher with no class assignment and confirm student records are not exposed.
- [ ] Sign in as `staff` and confirm the work calendar can be saved.

## Member-configured permissions alignment - 2026-07-14

Release status:

- [x] Added shared budget access helper in `lib/budget/access.ts`.
- [x] Updated budget auth profile loading to include `work_permissions` and `departments`.
- [x] `budget.procurement` and `budget_administration` now count as full budget managers.
- [x] `budget.finance` can record payments and create/edit projects where the current user is the owner.
- [x] Budget payment APIs now use the member-configured budget permissions instead of only `admin/director`.
- [x] Budget project editor now allows full budget managers to edit all projects and finance users to edit only their own projects.
- [x] Personnel administration now inherits student-management access.
- [x] Academic administration can manage the work calendar through the student settings calendar tab.
- [x] Work calendar API now allows admin/director/staff, personnel administration, and academic administration.
- [x] Smart Area clerk permission was reviewed; `smart_area.clerk` already has clerk workspace access and cannot assign work.
- [x] Ran `npm run build` successfully.

Policy implemented:

- `budget.procurement`: full budget access across every project, including editing and payment recording.
- `budget.finance`: payment recording plus create/edit access for projects owned by the current user.
- `budget_administration`: full budget access.
- `personnel_administration`: student work settings, class advisers, duty roster, attendance access, and work calendar.
- `academic_administration`: work calendar access.
- `smart_area.clerk`: official-document clerk workspace, submit/close clerk-review documents, no assignment permission.

Follow-up checks:

- [ ] Sign in as a budget procurement user and confirm all project edit/payment actions are visible and accepted.
- [ ] Sign in as a finance user and confirm they can create/edit their own project and cannot edit another owner's project.
- [ ] Sign in as an academic administration user and confirm the classroom settings page opens the calendar tab.
- [ ] Sign in as a personnel administration user and confirm student settings, duty roster, advisers, and calendar tabs are available.
- [ ] Sign in as a Smart Area clerk and confirm assignment buttons remain hidden while clerk submit/close actions work.

## Attendance duty header and checkout save fix - 2026-07-14

Release status:

- [x] Locked the daily attendance report date filter and duty teacher card to fixed compact widths so the header does not stretch on desktop or mobile.
- [x] Added weekday-colored duty teacher cards, including yellow for Monday.
- [x] Changed manual check-out saves to use `check_out_status: "normal"` so the update matches the database check constraint.
- [x] Fixed the mobile header selector so the date filter and duty teacher card no longer inherit full-width sizing.
- [x] Included `check_in_distance_meters` in the check-out API response and guarded GPS distance formatting so it never shows `NaN เมตร`.
- [x] Added GPS verification to check-out on both the attendance page and `/api/attendance/check-out`, including server-side distance calculation and radius enforcement.
- [x] Ran `npm run build` successfully.

Follow-up checks:

- [ ] Test the check-out button in production and confirm the record stores `check_out_at` with `check_out_status = normal`.
- [ ] Open the daily student attendance report on mobile and desktop and confirm the date filter and duty teacher card no longer overflow.

## Student attendance Telegram reminder - 2026-07-14

Release status:

- [x] Added `/api/cron/student-attendance-reminder` helper endpoint for the student attendance reminder.
- [x] Added Telegram group notification listing active class levels that still have no student attendance records for the day.
- [x] Skips weekends and configured school/public holidays unless the day is marked as a special workday.
- [x] Uses notification logs to avoid duplicate reminders for the same date.
- [x] Reused the existing attendance notification Vercel cron and moved it to `30 1 * * *` so it runs at 08:30 Bangkok time without adding another cron slot.
- [x] Ran `npm run build` successfully.

Follow-up checks:

- [ ] After deploy, confirm Vercel keeps the existing attendance notification cron at `30 1 * * *`.
- [ ] Confirm the Telegram group receives a message at 08:30 only when at least one class level has not checked attendance.
