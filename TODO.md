# Work Attendance TODO

Updated: 2026-07-13

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
