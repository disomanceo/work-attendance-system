# Work Attendance TODO

Updated: 2026-07-18

## Current rules

- Workspace path: `D:\work-attendance-main`
- Do not run `git add` until explicitly requested.
- Do not run `git reset`.
- Do not delete backup folders or backup files.
- Do not deploy until explicitly requested.
- Keep fixes minimal and avoid unrelated modules.

## Latest findings

- Teaching supervision module on 2026-07-17:
  - [x] Added `/teaching-supervision` under the existing `AppShell`.
  - [x] Added the sidebar menu item immediately after `/announcements`.
  - [x] Added the 100-point rubric with six weighted sections and selectable 5-1 ratings.
  - [x] Added live section totals, total percentage, average rating, and quality level.
  - [x] Added teacher/supervisor dropdowns from active Supabase `profiles`.
  - [x] Added draft/completed save flow using Firebase Firestore when configured.
  - [x] Kept evidence images as local previews and Firestore metadata only.
  - [x] Added server-side Google Drive upload APIs for inspection images.
  - [x] Added server-side PDF upload API and client-side report capture flow.
  - [x] Added server-side Google Drive file delete API.
  - [x] Switched the page font to Anuphan and tightened mobile typography.
  - [x] Switched teaching supervision Drive integration from Service Account to Apps Script.
  - [x] Added `TEACHING_SUPERVISION_DRIVE_GAS_*` to `.env.local`.
  - [x] Added teaching supervision actions to the existing `gas-school-library` Apps Script.
  - [x] Redeployed the existing school-library Web App deployment to version 6 with teaching supervision actions.
  - [x] Verified GAS can upload a tiny test image to Drive and delete it immediately.
  - [x] Changed the teaching-supervision landing tab to show all available teachers/personnel first.
  - [x] Changed assessment entry so a teacher is selected from the first tab before opening the assessment form.
  - [x] Added homeroom class lookup from `student_class_settings` and auto-fills class level for homeroom teachers.
  - [x] Added `ปฐมวัย` as the learning area for kindergarten/homeroom early-childhood teachers and auto-fills the subject as `กิจกรรมปฐมวัย`.
  - [x] After saving a completed inspection, reset the form and selection state, then show the saved result on the summary/report tab.
  - [x] Added the summary/report tab output from the latest saved assessment so PDF generation can use the saved snapshot.
  - [x] Confirmed `npm.cmd run lint` succeeds after the tab-flow adjustment.
  - [x] Confirmed `npm.cmd run build` succeeds after the tab-flow adjustment.
  - [x] Changed the first teaching-supervision tab to a compact inspection list table matching the requested overview direction.
  - [x] Added filters for search, position, status, semester, learning area, and inspection round.
  - [x] Added Firestore read support for completed teaching inspections so the overview can show saved scores/status.
  - [x] Changed the action column to one primary action: `เริ่มการนิเทศ`, `ผลการนิเทศ`, or disabled `รอการนิเทศ` based on role and status.
  - [x] Kept regular teachers in view-only mode for saved results; director/admin can open a saved result and edit it from the summary tab.
  - [x] Confirmed `npm.cmd run lint -- --quiet` succeeds after the teaching-supervision overview update.
  - [x] Confirmed `npm.cmd run build` succeeds after the teaching-supervision overview update.
  - [x] Confirmed local `/teaching-supervision` returns `200 OK` after the overview update.
  - [x] Added teacher profile photos to the teaching-supervision overview table immediately after the sequence column.
  - [x] Excluded director/admin profiles from the inspected-teacher overview and inspected-teacher dropdown while keeping them available as supervisors.
  - [x] Removed the top back button and the `สร้างการนิเทศใหม่` button from the teaching-supervision page.
  - [x] Tightened the overview table row spacing and changed the `ผลการนิเทศ` action button to green.
  - [x] Changed the summary/report tab into a print-style inspection report form with teacher info, section scores, notes, and signature lines.
  - [x] Updated PDF export on the summary tab to capture only the print-style report content.
  - [x] Confirmed `npm.cmd run lint -- --quiet` succeeds after the profile-photo/report-form adjustment.
  - [x] Confirmed `npm.cmd run build` succeeds after the profile-photo/report-form adjustment.
  - [x] Confirmed local `/teaching-supervision` returns `200 OK` after the profile-photo/report-form adjustment.
  - [x] Changed mobile teaching-supervision filters to fit into two compact rows including the reset button.
  - [x] Replaced the mobile inspection table with compact teacher cards so each teacher fits on screen without horizontal scrolling.
  - [x] Added a collapsible mobile action bar for the assessment page so evidence uploads are not blocked by fixed buttons.
  - [x] Moved the PDF button next to the review/summary button in the assessment action bar.
  - [x] Confirmed `npm.cmd run lint -- --quiet` succeeds after the mobile UI adjustment.
  - [x] Confirmed `npm.cmd run build` succeeds after the mobile UI adjustment.
  - [x] Confirmed local `/teaching-supervision` returns `200 OK` after the mobile UI adjustment.
  - [x] Kept the mobile overview summary counts on one compact line without word wrapping.
  - [x] Hid the inspected-teacher select field on mobile because the teacher is selected from the first tab.
  - [x] Compacted the mobile teacher-type radio controls so `ครูประจำชั้น` and `ครูกลุ่มสาระ` stay on one line.
  - [x] Changed mobile assessment form fields to a tighter two-column layout with smaller input text.
  - [x] Changed mobile rubric rating buttons `5 4 3 2 1` to compact circular buttons with tighter row spacing.
  - [x] Confirmed `npm.cmd run lint -- --quiet` succeeds after the compact mobile assessment adjustment.
  - [x] Confirmed `npm.cmd run build` succeeds after the compact mobile assessment adjustment.
  - [x] Confirmed local `/teaching-supervision` returns `200 OK` after the compact mobile assessment adjustment.
  - [x] Added print and PDF icon buttons after the `ผลการนิเทศ` action in the teaching-supervision overview.
  - [x] Made overview print actions switch to the selected report and print only the print-style report form.
  - [x] Made overview PDF actions switch to the selected report and export only the print-style report form.
  - [x] Reduced the report notes and signature text sizes in the summary report.
  - [x] Added the inspected teacher position under the teacher signature name.
  - [x] Changed the director signature label to `ผู้อำนวยการโรงเรียนวัดไผ่มุ้ง`.
  - [x] Confirmed `npm.cmd run lint -- --quiet` succeeds after the print/PDF action adjustment.
  - [x] Confirmed `npm.cmd run build` succeeds after the print/PDF action adjustment.
  - [x] Confirmed local `/teaching-supervision` returns `200 OK` after the print/PDF action adjustment.
  - [x] Removed the overview print icon action.
  - [x] Changed the overview PDF action to open the saved Drive PDF file instead of opening the web report page.
  - [x] Kept `ผลการนิเทศ` as the web report action.
  - [x] Changed completed inspection save so `บันทึกผลการนิเทศ` saves the web data, generates/uploads the PDF, stores the PDF metadata, shows `บันทึกเรียบร้อยแล้ว`, and returns to the first tab automatically.
  - [x] Removed the assessment footer buttons for draft, back, review summary, and manual PDF generation so the final save button handles the complete flow.
  - [x] Changed the right signature label in the web report to `ผู้นิเทศ` while keeping the director name and position line below it.
  - [x] Confirmed `npm.cmd run lint -- --quiet` succeeds after the automatic PDF-save flow.
  - [x] Confirmed `npm.cmd run build` succeeds after the automatic PDF-save flow.
  - [x] Confirmed local `/teaching-supervision` returns `200 OK` after the automatic PDF-save flow.
  - [x] Kept saved/completed inspections editable only from the web report action and only for director/admin users.
  - [x] Removed the summary/report buttons for choosing the next teacher and manually creating a PDF.
  - [x] Added a director/admin-only `ลบการนิเทศครั้งนี้` button beside the completed-save button on the assessment page.
  - [x] Added Firestore delete support for teaching inspections and deletes related Drive files when available.
  - [x] Changed PDF generation to pass the existing Drive PDF file id so Apps Script trashes the previous report before writing the new one.
  - [x] Preserved existing PDF metadata while editing an inspection so regenerated PDFs replace the previous report instead of creating multiple active reports.
  - [x] Confirmed `npm.cmd run lint -- --quiet` succeeds after the edit/delete/single-PDF adjustment.
  - [x] Confirmed `npm.cmd run build` succeeds after the edit/delete/single-PDF adjustment.
  - [x] Confirmed local `/teaching-supervision` returns `200 OK` after the edit/delete/single-PDF adjustment.
  - [x] Repaired Thai mojibake text in the teaching-supervision page, GAS script, and TODO notes, then confirmed no mojibake markers remain in the related files.
  - [x] Confirmed `npm.cmd run lint -- --quiet` succeeds after the Thai text repair.
  - [x] Confirmed `npm.cmd run build` succeeds after the Thai text repair.
  - [x] Confirmed local `/teaching-supervision` returns `200 OK` after the Thai text repair.
  - [x] Changed teaching supervision overview to use per-round selected teacher rosters instead of automatically listing every inspectable profile.
  - [x] Added Firestore-backed `teaching_supervision_round_plans` records for year/semester/round teacher selections.
  - [x] Added director/admin controls to add teacher names to the selected round and open the next round only after the current round is completed.
  - [x] Pushed the shared `gas-school-library` Apps Script source with `npx.cmd @google/clasp push --force`.
  - [x] Confirmed the active web app deployment `AKfycbyuarmxdn-5NL-3-lc69IMNuZ1fXgOKVLN9EqVsM1D-q_UG3UGxx4oiT-dYhaE_wsrQ @7` responds to teaching-supervision actions.
  - [x] Added `TEACHING_SUPERVISION_DRIVE_GAS_URL`, `TEACHING_SUPERVISION_DRIVE_GAS_SECRET`, and `TEACHING_SUPERVISION_DRIVE_ROOT_FOLDER_ID` to `.env.local`.
  - [x] Smoke-tested the teaching-supervision Apps Script endpoint; it returned `Missing fileId`, confirming the URL, secret, and action routing are active without creating or deleting a Drive file.
  - [x] Changed the teaching-supervision reset button to clear only uninspected names from the selected round while preserving completed inspections.
  - [x] Added an ordered selected-teacher box in the round roster picker and made the overview table follow the checkbox selection order.
  - [ ] Verify Firestore security rules for `teaching_inspections` before production use.
  - [ ] Verify Firestore security rules for `teaching_supervision_round_plans` before production use.

- Dashboard page addition on 2026-07-16:
  - [x] Kept `/attendance` as the existing work check-in home page.
  - [x] Added a separate `/dashboard` page wrapped in the existing `AppShell`.
  - [x] Added a `Dashboard` sidebar menu item immediately after the home item.
  - [x] Added `/api/dashboard/daily-overview` using existing staff attendance, student attendance, and Smart Area document tables.
  - [x] Added a compact date picker on the Dashboard header.
  - [x] Kept the three Dashboard summary cards in one desktop row with smaller card metrics.
  - [x] Tightened the Dashboard grid so the three main cards stay in one desktop row.
  - [x] Removed classroom slash labels from the student class summary.
  - [x] Reordered student attendance metrics to show present, absent, leave, and total.
  - [x] Changed the student class summary to show present, absent, leave, and total per class.
  - [x] Grouped unacknowledged document people into one row per person with profile fallback and document counts.
  - [x] Added unacknowledged document age counts for 1 day, 2 days, and 3+ days.
  - [x] Changed the document dashboard to show red unacknowledged, blue in-progress, and green done counts per assigned teacher.
  - [x] Added Dashboard section tabs for staff attendance, student attendance, and official documents.
  - [x] Added document status legend for red unacknowledged, blue in-progress, and green done.
  - [x] Hid teachers whose assigned document work is fully done from the document list.
  - [x] Colored per-class student counts by status: present green, absent red, leave orange, and total blue.
  - [x] Centered per-class student counts in their status columns.
  - [x] Nudged per-class student counts slightly left for visual alignment.
  - [x] Removed pending-day text and trailing total badges from document teacher rows.
  - [x] Kept mobile staff attendance metrics in two rows of three cards.
  - [x] Compacted today's highlight cards to one or two tight rows per alert.
  - [x] Run `npm.cmd run build` after the Dashboard page addition.
  - [ ] Verify `/dashboard` with a real signed-in account and confirm the daily totals match production data.

- Announcement workflow follow-up on 2026-07-16:
  - [x] Added the `/announcements` module using the order workflow pattern.
  - [x] Added annual Buddhist-year running numbers without document-number control.
  - [x] Added Word/PDF attachment support through the existing GAS file workflow.
  - [x] Added director review, return-for-revision, approval, homepage popup, and Telegram private notification wiring.
  - [x] Added Supabase migration for `announcement_documents` and `announcement_document_logs`.
  - [x] Replaced remaining order wording in the announcement page, filters, buttons, and submit/review dialogs.
  - [x] Updated GAS file naming for announcements to `ddMMyyประกาศเรื่อง...` under the same order root folder with an announcement subfolder.
  - [ ] Apply the new Supabase migration before using the module in production.
  - [ ] Verify the UI in browser after migration, especially Thai labels and the brown-gold theme.
  - [ ] Deploy the updated GAS project before testing announcement file folder/name behavior in Google Drive.

- Student attendance web/mobile UI follow-up on 2026-07-15:
  - [x] Removed the PDF button from the student attendance class report footer.
  - [x] Removed generated PDF links from the export result area.
  - [x] Shifted the adviser name left by `4ch` and director name left by `7ch` under the signature lines.
  - [x] Changed mobile ranges to `1-9`, `10-18`, `19-27`, and `28-end`.
  - [x] Added mobile table column sizing so date columns share the remaining width equally.

- Student attendance signature/mobile table follow-up on 2026-07-15:
  - [x] Moved generated adviser/director names into the lower parenthesis row only.
  - [x] Kept the upper signature line blank for printed signing.
  - [x] Shows mobile summary columns only on the final week range (`22-end`).
  - [x] Allows full student names on mobile instead of truncating with ellipsis.

- Student attendance generated Sheet/PDF placement follow-up on 2026-07-15:
  - [x] Moved the date-number row to row 7 so attendance marks no longer appear in the 1-30/31 date row.
  - [x] Moved student rows to start at row 8 so the first student no longer overwrites the table header/date row.
  - [x] Moved adviser/director names to the lower parenthesis row and keeps the signature line row untouched for printing/signing.
  - [x] Changed the generated PDF export URL to request landscape orientation.
  - [x] Tightened the mobile weekly class table so the 1-7 day view fits without a horizontal scrollbar.

- Student attendance generated Sheet placement follow-up on 2026-07-15:
  - [x] Added fallback writes for class/year and month rows when the template placeholders `ch`/`ps` are not found.
  - [x] Added fallback writes for adviser/director names in the bottom signature name row when `tea`/`ceo` are not found.
  - [x] Kept day numbers starting at `C5`.
  - [x] Moved student data rows down to avoid overwriting the template table header.

- Student attendance mobile signature/date follow-up on 2026-07-15:
  - [x] Confirmed the exported date numbers start at `C5` via `HEADER_DAY_ROW = 5` and `HEADER_DAY_START_COLUMN = 3`.
  - [x] Renamed the day-start column constant to make the `C5` template position explicit.
  - [x] Reduced mobile signature text size and weight.
  - [x] Forced adviser/director signature names to stay on one line with ellipsis on mobile to avoid overlap.
  - [x] Run `npm run build` after this mobile signature/date follow-up.

- Student attendance template placeholder/mobile UI follow-up on 2026-07-15:
  - [x] Changed the Sheet export to replace template placeholders `ch`, `ps`, `tea`, and `ceo` directly.
  - [x] Updated the Sheet fill positions for the new template: day numbers on row 5 and student rows from row 6.
  - [x] Removed manual signature-cell writes because adviser/director names now come from `tea` and `ceo` placeholders.
  - [x] Lightened the mobile monthly report typography and narrowed the mobile month table for better balance.
  - [x] Hid the duplicate template header on mobile.
  - [x] Run `npm run build` after this placeholder/mobile UI follow-up.

- Student attendance monthly Sheet/PDF follow-up on 2026-07-15:
  - [x] Wrote the month/year value to template row 4 and kept row 2 blank.
  - [x] Wrote adviser/director names through existing merged template cells so the director name appears in the right signature area.
  - [x] Removed late/`สาย` from export counts, marks, web table columns, mobile table columns, mobile cards, and summary totals.
  - [x] Updated export result links so `เปิด Sheet` uses the same green visual style as the main `Sheet` button.
  - [x] Updated mobile monthly class report with class/month info cards and four summary cards matching the requested direction.
  - [x] Run `npm run build` after this follow-up.

- Student attendance monthly Sheet/PDF template-only export revision on 2026-07-15:
  - [x] Removed Drive signature image insertion from the student attendance export payload and GAS fill path.
  - [x] Changed the export fill flow to preserve the source Sheet template structure, headers, table borders, widths, and styling.
  - [x] Kept row 2 blank and only fills the class/year and month values needed for the selected class report.
  - [x] Fills only the existing student table value area and the day numbers row; it no longer inserts rows or rewrites table headers.
  - [x] Fills the bottom adviser/director name row only, using class adviser settings and active director/admin profile data.
  - [x] Creates exports under `ปีการศึกษา <year>/<month>` and trashes existing files with the same Sheet/PDF names before creating replacements.
  - [x] Run `npm run build` after this template-only export revision.

- Student attendance monthly Sheet/PDF export fix on 2026-07-15:
  - [x] Changed the exported `ที่` column to sequential row numbers instead of `student_code`.
  - [x] Added numeric-aware student sorting before generating export rows.
  - [x] Prevented the template title from being written twice when the source Sheet already contains `แบบบันทึกการมาเรียนของนักเรียน`.
  - [x] Filled adviser and director names in the bottom signature parentheses from system profile/class settings data.
  - [x] Run `npm run build` after this export fix.
  - [x] Committed and pushed the export fix to `origin/main`.
  - [x] Vercel production deployment reached `READY` and aliases include `https://pm-coming.vercel.app`.
  - [x] Deployed `gas-attendance-pdf` Apps Script production web app to version `60`.
  - [x] Deployed `gas-student-attendance-report` Apps Script web app to version `2`.

- Student attendance monthly Sheet/PDF template export on 2026-07-15:
  - [x] Added `/api/students/attendance/export` to generate per-class monthly attendance exports from the Google Sheet template.
  - [x] Added `gas-student-attendance-report/Code.gs` for copying the template, filling class/month/student attendance rows, and creating PDF files.
  - [x] Updated the class report tab preview with the school logo/header and a total row similar to the template.
  - [x] Changed the footer `Sheet` and `PDF` buttons to call the template export API for the selected class tab.
  - [x] Ran `npm run build` after the template export update.
  - [x] Updated the monthly class preview table to fit in one page without a horizontal scrollbar.
  - [x] Added separate monthly totals for `มา`, `ขาด`, `ลา`, `สาย`, and `รวม`.
  - [x] Added adviser/director signature names in the preview and generated Sheet/PDF.
  - [x] Deployed the student attendance report Apps Script web app.
  - [x] Added production Vercel env vars: `GAS_STUDENT_ATTENDANCE_REPORT_URL` and `GAS_STUDENT_ATTENDANCE_REPORT_SECRET`.
  - [x] Added the same production env vars to the `pm-coming` Vercel project after the Sheet/PDF buttons showed missing GAS env there.
  - [x] Redeployed `pm-coming` production so the newly added GAS env vars are loaded at runtime.
  - [x] Moved student attendance Sheet/PDF generation to the existing public daily-PDF Apps Script project after the first new Apps Script deployment returned 403.
  - [x] Added a clearer GAS error response path when Apps Script returns HTML/non-JSON.
  - [x] Updated attendance marks to use green check, red cross, orange warning, and blue late symbols in the report preview.
  - [x] Added mobile-friendly student cards for monthly attendance instead of forcing the 38-column table onto small screens.
  - [x] Passed adviser/director signature file IDs to the Sheet/PDF export payload for Drive image insertion.
  - [x] Fixed the generated Sheet/PDF merge-range failure by clearing overlapping merged ranges before rewriting header/table merged cells.
  - [x] Added a guarded GAS setup action to restore `STUDENT_ATTENDANCE_REPORT_SECRET` when a new Apps Script deployment has no student-report script property.
  - [x] Changed printed student attendance exports to use simple paper marks (`✓`, `ข`, `ล`, `-`) instead of colored screen symbols.
  - [x] Replaced the student attendance PDF export path that required `UrlFetchApp.fetch` with Drive-based PDF export.
  - [x] Added post-export open/download buttons for generated Sheet/PDF files on the student attendance report page.
  - [x] Re-aligned the generated student attendance Sheet/PDF to the real Google Sheet template layout (`A:AH`, one `รวม` column) instead of rebuilding a wider `A:AL` table.
  - [x] Stopped student attendance exports from overriding template fonts, row/column sizing, logo placement, and signature images; the template now owns print styling.
  - [x] Changed the mobile class monthly report from per-student cards to week-range table tabs (`1-7`, `8-14`, `15-21`, `22-end`) matching the requested mobile layout direction.

- Student daily attendance report export button update on 2026-07-15:
  - [x] Replaced the old `ส่งออก Excel` footer button label with `Sheet`.
  - [x] Replaced the print button label with `PDF`.
  - [x] Kept the existing CSV sheet export behavior and browser print/PDF behavior.
  - [x] Ran `npm run build` after the Sheet/PDF button update.
- Student daily attendance class-tab report update on 2026-07-15:
  - [x] Added class tabs under the green daily report header from `อนุบาล 2` through `ป.6`.
  - [x] Added a read-only per-class attendance report with student names and status counts.
  - [x] Changed the footer `Sheet` export to use the currently selected class instead of the whole-school summary.
  - [x] Changed the footer `PDF` print view to focus on the selected class report.
  - [x] Ran `npm run build` after the class-tab report update.
- Student daily attendance monthly class-tab revision on 2026-07-15:
  - [x] Changed the first tab to `สรุปรายชั้น`.
  - [x] Moved the whole-school summary table into the first tab only.
  - [x] Changed each class tab to show a read-only monthly attendance grid similar to the Sheet template.
  - [x] Updated `Sheet` export to export the active class monthly grid when a class tab is selected.
  - [x] Ran `npm run build` after the monthly class-tab revision.

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
- Smart Area registration number check on 2026-07-15:
  - [x] Confirmed the documents page reads `registrationNumber` from `smart_area_books.registration_number`.
  - [x] Found one active Smart Area book on page 166 with a missing registration number: `legacy_smart_area_id=50228`.
  - [x] Backfilled `legacy_smart_area_id=50228` from `registration_number=null` to `1330`.
  - [x] Verified active Smart Area books now have zero missing `registration_number` values.
  - [x] Updated the Smart Area import flow to preserve an existing `registration_number` when a later payload is missing `receiveNo`.
  - [x] Ran `npm run build` successfully after the Smart Area registration number import guard.
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

- Tightened Smart Area importer reconciliation:
  - default central scan window is back to the latest 3 pages,
  - latest page detection probes pages after the pagination value so hidden next pages such as page 166 are included,
  - importer now compares the central 3-page ID set with `smart_area_books.legacy_smart_area_id`,
  - missing IDs are retried up to 3 import attempts before the run is marked partial/failed,
  - callback stores reconcile details so the UI can show matched/missing counts,
  - metadata-only central page/order/source URL refreshes no longer inflate the `updated` count.
- Added Smart Area import throttling and auto checks:
  - manual import dispatch is throttled to 3 minutes per system when no run is active,
  - automatic import dispatch is throttled to 15 minutes per system,
  - active queued/running imports are reused instead of starting duplicate GitHub workflows,
  - opening the documents page auto-checks once,
  - opening the attendance home page auto-checks once without showing an import button.
- Added Smart Area attachment proxy behavior:
  - original central attachments now load through the school HTTPS API without permanent file storage,
  - PDF and image files use their original central URLs for direct viewing,
  - Word, Excel, ZIP, RAR, and other files are served as downloads,
  - proxied downloads preserve or infer filename extensions from upstream headers, MIME type, or URL.
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

## Signed Smart Area assignment Telegram and 08:30 cron auth - 2026-07-15

Release status:

- [x] Added Telegram private notification after the signed Smart Area assignment save flow succeeds.
- [x] Kept LINE notification behavior for signed Smart Area assignments unchanged.
- [x] Confirmed `npm run build` passes after the signed assignment Telegram update.
- [x] Confirmed Vercel production cron `/api/cron/attendance-line-report` is scheduled at `30 1 * * *`.
- [x] Found the 08:30 production cron was reaching `/api/cron/attendance-line-report` but returning `401 Unauthorized`.
- [x] Added `CRON_SECRET` to Vercel Production and redeployed production so Vercel Cron can authenticate.

Follow-up checks:

- [ ] On 2026-07-16, confirm the 08:30 Bangkok-time cron sends the attendance Telegram summary before the 09:00 fallback.
- [ ] Sign and assign a Smart Area document to a Telegram-linked user and confirm the assignee receives a private Telegram message.

## Daily attendance PDF cron environment fix - 2026-07-15

Release status:

- [x] Confirmed Vercel production cron `/api/cron/attendance-daily-pdf` is scheduled at `15 12 * * *` (19:15 Bangkok time).
- [x] Confirmed the daily PDF cron route requires `CRON_SECRET`, `GAS_DAILY_PDF_API_URL`, `GAS_DAILY_PDF_SECRET`, Supabase URL, and Supabase service role key.
- [x] Found Vercel Production had `CRON_SECRET` and Supabase env vars, but was missing `GAS_DAILY_PDF_API_URL` and `GAS_DAILY_PDF_SECRET`.
- [x] Added `GAS_DAILY_PDF_API_URL` and `GAS_DAILY_PDF_SECRET` to Vercel Production without quoted literal wrappers.
- [x] Redeployed production so `/api/cron/attendance-daily-pdf` can read the new GAS daily PDF env vars.

Follow-up checks:

- [ ] After 19:15 Bangkok time on 2026-07-15, confirm `/api/cron/attendance-daily-pdf` returns success and creates the daily attendance PDF.
- [ ] Confirm weekend/special-calendar daily PDFs are created when the cron runs and the GAS daily PDF env vars are present.

## Director manual Telegram overview button - 2026-07-15

Release status:

- [x] Added a director/admin-only small `ส่งสรุป` button under the user name and position in the main sidebar profile card.
- [x] Added `/api/telegram/director-overview` to send one Telegram group message with the work attendance summary followed by rooms/classes that have not checked student attendance.
- [x] Added a 10-minute cooldown using notification logs to avoid repeated manual Telegram spam.
- [x] The button uses the current session token and shows compact success/error/cooldown status text under the button.
- [x] Ran `npm run build` successfully.
- [x] Fixed unchecked student attendance matching to use `class_level` like the daily student report and cron reminder, avoiding false unchecked classes from `class_room = "-"` vs empty saved attendance rooms.
- [x] Ran `npm run build` successfully after the unchecked-class matching fix.
- [x] Changed Telegram work attendance summary ordering to use check-in time first, with people who have not checked in listed after checked-in staff.
- [x] Updated the director manual Telegram overview to send two messages in order: work attendance summary first, then the student attendance report.
- [x] Changed the student Telegram report to show each active class level with the present count or `ยังไม่ได้เช็คชื่อ`.
- [x] Moved the director/admin `ส่งสรุป` button to the profile card top-right on desktop while keeping it right-aligned under the position on mobile.
- [x] Ran `npm run build` successfully after the manual Telegram overview and ordering updates.
- [x] Moved the director/admin `ส่งสรุป` button from the sidebar profile card to the main attendance date row, aligned to the top-right of the check-in frame.
- [x] Ran `npm run build` successfully after moving the `ส่งสรุป` button to the main attendance date row.

Follow-up checks:

- [ ] Sign in as director/admin and confirm the small `ส่งสรุป` button appears under the profile position.
- [ ] Press `ส่งสรุป` and confirm Telegram receives the attendance summary followed by unchecked student rooms/classes.
- [ ] Press again within 10 minutes and confirm the UI shows the cooldown message.

## Document assignment signing and director display fixes - 2026-07-16

Release status:

- [x] Fixed signed Smart Area assignment saves so retained assignee tasks refresh assignment notes, read state, and LINE notification dedupe before resending.
- [x] Improved the signing page save button validation so missing file, assignee, text, or signature states show a clear message instead of failing silently.
- [x] Changed signing uploads to send only the selected page of a PDF, with a compressed preview-PDF fallback when the selected page is still too large.
- [x] Kept original attached documents unchanged; the signed assignment file is generated separately.
- [x] Added shared person display helpers so director Suthon is shown as `ผอ.สุธน` instead of `ครูสุธน` across documents, signing, orders, announcements, review popups, and student duty/report displays.
- [x] Ran `npx tsc --noEmit`, `npm run lint`, and `npm run build` successfully.
- [x] Pushed and deployed production to Vercel.

Follow-up checks:

- [ ] Test signing a large multi-page PDF and confirm the saved signed file contains only the selected page.
- [ ] Confirm assignment save creates/updates the signed file and sends the assignee notification.
- [ ] Confirm `ครูสุธน` no longer appears in document responsibility views and shows as `ผอ.สุธน`.

## School library menu start - 2026-07-16

Release status:

- [x] Added the `คลังงานโรงเรียน` sidebar menu item above `ข้อมูลส่วนตัว`.
- [x] Pointed the new menu item to `/school-library`.
- [x] Added an AppShell-wrapped placeholder page for `/school-library` so the new menu does not open a missing route.

Follow-up checks:

- [x] Build after the menu addition.
- [ ] Open the sidebar and confirm `คลังงานโรงเรียน` appears directly above `ข้อมูลส่วนตัว`.

## School library UI and Firebase/Drive direction - 2026-07-16

Release status:

- [x] Built the first usable `/school-library` UI following the attached reference layout.
- [x] Added search, category cards, filters, recent document list, popular keywords, and an add-document form.
- [x] Kept document records in page state for this first step and prepared fields for Firebase/Firestore metadata.
- [x] Added Google Drive URL validation and used the provided Drive folder as the default document location.
- [x] Did not add Firebase dependency yet because project configuration and credentials are not present in the repo.

Next step:

- [ ] Add Firebase configuration after project credentials are provided.
- [ ] Move document reads/writes from local page state to Firestore.
- [ ] Decide whether Google Drive file upload will use an existing Apps Script flow or a new Drive API service account flow.
- [x] Run build after the UI update.

## School library Firebase wiring - 2026-07-16

Release status:

- [x] Installed the Firebase Web SDK with `npm.cmd install firebase`.
- [x] Added a Firebase client helper that reads `NEXT_PUBLIC_FIREBASE_*` values from `.env.local`.
- [x] Added Firestore helpers for the `schoolLibraryDocuments` collection.
- [x] Updated `/school-library` to load documents from Firestore when Firebase config exists.
- [x] Updated the add-document form to write metadata to Firestore when Firebase config exists.
- [x] Kept fallback sample data when Firebase is not configured yet.
- [x] Added `docs/school-library-firebase.md` with setup steps and required env names.
- [x] Ran `npm.cmd run build` successfully after Firebase wiring.

Next step:

- [ ] Create/register the Firebase Web app in Firebase Console.
- [x] Create a Firestore database.
- [x] Add the Firebase Web config values to `.env.local`.
- [ ] Restart the local dev server after editing `.env.local`.
- [ ] Add one document from `/school-library` and confirm it appears in Firestore collection `schoolLibraryDocuments`.

## School library Firebase local config - 2026-07-16

Release status:

- [x] Added the Firebase Web app config from Firebase Console to local `.env.local`.
- [x] Added `NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID` to the setup note for completeness.
- [x] Documented the local Firebase project id `savedocument-bb8ad` and collection `schoolLibraryDocuments`.

Next step:

- [x] In Firebase Console, create Firestore Database for project `savedocument-bb8ad`.
- [ ] Restart the local Next.js dev server so `.env.local` is reloaded.
- [x] Test adding a document from `/school-library` and confirm it appears in Firestore.

## School library local file upload flow - 2026-07-16

Release status:

- [x] Changed the add-document form from Drive URL entry to local file selection.
- [x] Removed manual file-type selection from the form.
- [x] Added automatic file type detection for PDF, Word, and other Drive files.
- [x] Added `/api/school-library/upload` to upload selected files through a dedicated Google Apps Script web app.
- [x] Added `gas-school-library` Apps Script source for uploading files into the provided Google Drive folder.
- [x] Extended Firestore document metadata with Drive file id, file name, MIME type, and file size.
- [x] Updated setup docs with `SCHOOL_LIBRARY_DRIVE_GAS_URL` and `SCHOOL_LIBRARY_DRIVE_GAS_SECRET`.
- [x] Removed the shared Drive upload fallback after testing showed the deployed profile/student-photo Apps Script is image-only and rejects document files with a JPG/PNG/WEBP validation message.
- [x] Made document titles and uploaded file names clickable so users can open the saved Drive file directly from the list.
- [x] Changed new school library documents to use the logged-in profile name as the owner.
- [x] Changed school library status display to `พร้อมใช้`.
- [x] Replaced the class/subject table column with file size and tightened document rows.
- [x] Expanded school library search to include title, real file name, subcategory/description, owner, year, file type, status, keywords, Drive file id, Drive URL, MIME type, and file size.
- [x] Added a delete action limited to the uploading user or `director`, with Drive deletion routed through Apps Script.

Next step:

- [x] Create/deploy the `gas-school-library` Apps Script web app for document uploads.
- [x] Add `SCHOOL_LIBRARY_DRIVE_GAS_URL` and `SCHOOL_LIBRARY_DRIVE_GAS_SECRET` to `.env.local` after deploying the dedicated Apps Script.
- [x] Smoke-tested the Apps Script endpoint with the configured secret; it returned `Unknown action`, confirming the URL is reachable and the secret matches without creating a Drive file.
- [ ] Restart `npm.cmd run dev` and test uploading a local file from `/school-library`.
- [ ] Redeploy the `gas-school-library` Apps Script so the new `deleteSchoolLibraryFile` action is available.
- [x] Added `gas-school-library/.clasp.json` for script id `1Nv0avSZXUhFhKw1h-hOW27TJK6Id82pgGDxLqm7Hc7ft3rkkMSTl9p1E`.
- [x] Pushed `gas-school-library` source to Apps Script with `npx.cmd @google/clasp push --force`.
- [x] Tried updating the existing web app deployment `AKfycbyuarmxdn-5NL-3-lc69IMNuZ1fXgOKVLN9EqVsM1D-q_UG3UGxx4oiT-dYhaE_wsrQ` to version `2` with clasp after approval.
- [x] Rolled the deployment back to version `1` after `/exec` returned 404, restoring the working upload endpoint.
- [x] Updated the Apps Script web app deployment from the Apps Script UI so it remains a Web app and includes the pushed `deleteSchoolLibraryFile` source.
- [x] Verified the active Web app deployment is `AKfycbyuarmxdn-5NL-3-lc69IMNuZ1fXgOKVLN9EqVsM1D-q_UG3UGxx4oiT-dYhaE_wsrQ @3`.
- [x] Verified `deleteSchoolLibraryFile` responds with `Missing fileId` when tested with an empty file id, confirming the delete action is deployed without deleting a real file.
- [x] Removed the three-dot open-file action beside the delete button; document/file names remain clickable.
- [x] Removed the grade-level filter from the school library filter bar.
- [x] Changed the academic-year filter to use years found in existing records, falling back to the current Buddhist year when no records exist.
- [x] Added clearer delete feedback with status text and browser alerts for permission, missing file id, success, and errors.
- [x] Added delete fallback to extract the Drive file id from `driveUrl` when older Firestore records do not have `driveFileId`.
- [x] Changed popular search terms to come from actual local search usage stored in `localStorage`, recorded on Enter/blur/click, and displayed as a single compact row.
- [x] Allowed school library rows without a Drive file id to be removed from Firestore/list metadata only, without attempting Drive deletion.
- [x] Renamed the owner filter option from `ผู้จัดทำทั้งหมด` to `ครูและบุคลากรทั้งหมด`.
- [x] Changed the owner filter choices to load active teacher/personnel names from `profiles`, with document-owner fallback if profiles cannot load.
- [x] Auto-filled the add-document title from the selected file name, truncated to a safe length.
- [x] Removed subcategory, grade level, and subject fields from the add-document modal.
- [x] Limited the latest documents list to the first 10 filtered records.
- [x] Simplified the document-name column to one clickable title only.
- [x] Made PDF/image titles open in browser while Word/Excel/other file titles use a Drive download URL when a file id is available.
- [x] Added the `วุฒิบัตร-ใบประกาศ` school library category and Drive folder mapping.
- [x] Changed the school library category summary to five compact single-row cards.
- [x] Tightened the latest document rows for a denser list.
- [ ] Test deleting a file as the uploader and as director, then confirm other users do not see the delete button.
- [x] Run build after the local file upload update.

## School library category rename - 2026-07-16

Release status:

- [x] Updated the four displayed school library categories to: แผนงานและโครงการ, การจัดการเรียนการสอน, แบบฟอร์มต่างๆ, ผลงานและรางวัล.
- [x] Updated the Google Apps Script category folder mapping to use the same four category names.
- [x] Run build after category rename.

## Local Git metadata path reset - 2026-07-17

Release status:

- [x] Confirmed the active workspace path is `D:\work-attendance-main`.
- [x] Replaced the worktree pointer with a standalone `.git` directory inside `D:\work-attendance-main`.
- [x] Confirmed `git rev-parse --git-dir` returns `.git`.
- [x] Confirmed `git rev-parse --git-common-dir` returns `.git`.
- [x] Confirmed local `main` still points to commit `4014e38`.
- [x] Kept the old worktree pointer as `.git.worktree-pointer.backup` and did not delete backup files.
- [x] Did not run `git add`, `git reset`, or deploy.

Follow-up checks:

- [x] Run build after this metadata update.

## School library sample mode fix - 2026-07-17

Release status:

- [x] Confirmed `.env.local` does not currently include `NEXT_PUBLIC_FIREBASE_*`, so `/school-library` should run in sample-data mode.
- [x] Fixed the add-document flow so sample mode does not require a Supabase session, Firebase, or Google Drive upload.
- [x] New sample-mode documents are added to the current page state with selected file metadata only.
- [x] Allowed sample-mode rows to be removed locally without calling the production delete API.
- [x] Confirmed `npm.cmd run build` succeeds.
- [x] Confirmed `http://localhost:3000/school-library` returns `200 OK` and renders the Firebase sample-mode notice plus sample documents.
- [x] Did not run `git add`, `git reset`, or deploy.

Follow-up checks:

- [ ] Re-test add/delete in a real browser after browser automation is available; `agent-browser` was not installed in this terminal session.

## Local dev server recovery - 2026-07-17

Release status:

- [x] Confirmed `npm.cmd run dev` failed because a stale Next.js dev process held `.next\dev\lock`.
- [x] Stopped only the stuck Node process reported by Next.js for the local dev server.
- [x] Confirmed the stale lock was released automatically after the stuck process stopped.
- [x] Restarted `npm.cmd run dev` successfully.
- [x] Confirmed the active local URL is `http://localhost:3000`.
- [x] Confirmed `http://localhost:3000/school-library` returns `200 OK`.
- [x] Confirmed `http://127.0.0.1:3000/school-library` returns `200 OK`.
- [x] Did not run `git add`, `git reset`, or deploy.

## School library preview and Firebase config check - 2026-07-17

Release status:

- [x] Confirmed local `.env.local` has Supabase values but no `NEXT_PUBLIC_FIREBASE_*` values, so Firestore writes cannot run yet.
- [x] Confirmed local `.env.local` has no `SCHOOL_LIBRARY_DRIVE_GAS_URL` or `SCHOOL_LIBRARY_DRIVE_GAS_SECRET`, so real Drive uploads cannot run yet.
- [x] Changed browser-viewable Drive files to open with `https://drive.google.com/file/d/<fileId>/preview` when a Drive file id is available.
- [x] Changed sample mode so selected PDF/image files get a local `blob:` preview URL and can be opened during the current browser session.
- [x] Revoke local `blob:` preview URLs when sample rows are deleted.
- [x] Confirmed `npm.cmd run build` succeeds.
- [x] Confirmed `http://localhost:3000/school-library` returns `200 OK` after the preview update.
- [x] Did not run `git add`, `git reset`, or deploy.

Follow-up checks:

- [ ] Add `NEXT_PUBLIC_FIREBASE_*` and `SCHOOL_LIBRARY_DRIVE_GAS_*` to `.env.local`, restart `npm.cmd run dev`, then confirm a real upload creates one Drive file and one Firestore document.

## School library env source investigation - 2026-07-17

Release status:

- [x] Confirmed Vercel project link points to `pm-coming` (`prj_mriTS53sAKwF0N5vTHwy2jrC2qDB`).
- [x] Confirmed Vercel CLI is installed.
- [x] Ran `vercel env ls` for the linked project; no Firebase or school-library env keys were listed.
- [x] Tried Firebase Hosting `https://savedocument-bb8ad.firebaseapp.com/__/firebase/init.json`; it returned Site Not Found, so Firebase Web config cannot be recovered from Hosting.
- [x] Confirmed Firebase CLI is not installed in this terminal environment.
- [x] Searched repo and backup folders for `NEXT_PUBLIC_FIREBASE_*` and `SCHOOL_LIBRARY_DRIVE_GAS_*`; no usable values were found.
- [x] Confirmed the Apps Script deployment id is mentioned in TODO, but the matching secret is not available locally.
- [x] Added the provided Firebase Web config to local `.env.local`.
- [x] Confirmed the local dev server reloaded `.env.local` and `/school-library` now enters Firebase load mode.
- [x] Pulled Vercel production, preview, and development env vars into temporary files to check for `SCHOOL_LIBRARY_DRIVE_GAS_*`; those keys were not present.
- [x] Removed the temporary Vercel env check files after inspection.
- [x] Confirmed `npx.cmd @google/clasp --version` works (`3.3.0`).
- [x] Added `SCHOOL_LIBRARY_DRIVE_GAS_URL` and `SCHOOL_LIBRARY_DRIVE_GAS_SECRET` to local `.env.local` from the provided Apps Script web app values.
- [x] Added `SCHOOL_LIBRARY_DRIVE_GAS_URL` and `SCHOOL_LIBRARY_DRIVE_GAS_SECRET` to Vercel production, preview, and development.
- [x] Verified the Apps Script endpoint and secret by calling `deleteSchoolLibraryFile` with an empty file id; it returned `Missing fileId` instead of `Unauthorized`.
- [x] Confirmed `npm.cmd run build` succeeds after adding Firebase and GAS env values.
- [x] Confirmed `http://localhost:3000/school-library` returns `200 OK` after local env reload.
- [x] Did not run `git add`, `git reset`, or deploy.

Blocked:

- [x] Firebase Web app config was provided and added locally.
- [x] Apps Script values were provided, added locally, added to Vercel env, and endpoint auth was verified.
- [ ] Test one real school-library upload in the browser and confirm one Drive file plus one Firestore document are created.

## School library category consolidation - 2026-07-17

Release status:

- [x] Confirmed workspace path is `D:\work-attendance-main`.
- [x] Confirmed current branch is `main`.
- [x] Checked `git status --short` before edits and did not touch unrelated untracked files, backup folders, or `_install-*` folders.
- [x] Read the real school-library page, styles, Firestore mapping, upload API, and GAS category label code before changing category behavior.
- [x] Checked existing Firestore category usage before changing values; found 3 existing documents using legacy `lesson-plan`.
- [x] Did not create a data migration or modify existing Firestore documents.
- [x] Added one shared school-library category source with exactly 6 major categories.
- [x] Normalized legacy category values on read so old `lesson-plan` data appears under `การจัดการเรียนรู้`.
- [x] Updated the upload API and GAS category labels to use the same 6 category names while keeping legacy label compatibility.
- [x] Updated the category card layout to 3 columns on desktop, adaptive tablet columns, and 2 columns on mobile without horizontal scrolling.
- [x] Kept search, filters, add-document controls, and existing document actions in place.
- [x] Confirmed local `/school-library` returns `200 OK` and includes all 6 category labels plus `ทั้งหมด`.
- [x] Confirmed `npm.cmd run lint -- --quiet` succeeds.
- [x] Confirmed `npm.cmd run build` succeeds.
- [x] Did not run `git add`, `git reset`, `git clean`, commit, push, or deploy.

Follow-up adjustment:

- [x] Reduced the school-library category card height, padding, icon size, and text size.
- [x] Changed mobile category cards to 3 columns so the 6 categories fit in 2 rows.
- [x] Confirmed `npm.cmd run lint -- --quiet` succeeds after the card-size adjustment.
- [x] Confirmed `npm.cmd run build` succeeds after the card-size adjustment.
- [x] Confirmed local `/school-library` still returns `200 OK` after the card-size adjustment.

Multi-file and file-size adjustment:

- [x] Added file count and total size display to all 6 category cards.
- [x] Changed the recent-documents table column to `ไฟล์ / ขนาด` and show file count plus file size per document.
- [x] Changed the personnel filter to load all readable `profiles` names and merge them with existing document owners.
- [x] Changed the add-document modal to support selecting multiple files.
- [x] Allowed selecting additional files later without clearing the existing selected-file queue.
- [x] Added a selected-file queue with total file count, total size, per-file type/size, and remove buttons.
- [x] Added save progress text for multi-file uploads (`กำลังบันทึกไฟล์ x/y`).
- [x] Kept the existing upload API unchanged and save each selected file as one school-library document.
- [x] Confirmed local `/school-library` includes `ไฟล์ / ขนาด`, `ไฟล์ •`, `เรื่อง`, and `ครูและบุคลากรทั้งหมด`.
- [x] Confirmed `npm.cmd run lint -- --quiet` succeeds after the multi-file adjustment.
- [x] Confirmed `npm.cmd run build` succeeds after the multi-file adjustment.
- [x] Did not run `git add`, `git reset`, `git clean`, commit, push, or deploy.

Typography adjustment:

- [x] Changed the school-library page font stack to prefer `Anuphan`.
- [x] Reduced non-heading text weights to normal weight.
- [x] Kept only page headings, section headings, category names, and table headers visually bold.
- [x] Confirmed `npm.cmd run lint -- --quiet` succeeds after the typography adjustment.
- [x] Confirmed `npm.cmd run build` succeeds after the typography adjustment.
- [x] Confirmed local `/school-library` still returns `200 OK` after the typography adjustment.
- [x] Did not run `git add`, `git reset`, `git clean`, commit, push, or deploy.

File icon adjustment:

- [x] Replaced the school-library document icon label logic so it uses `fileName`, `mimeType`, and fallback `fileType`.
- [x] Added icon labels for PDF, image files, Word, Excel, PowerPoint, video, audio, archive, text/code, and unknown file extensions.
- [x] Reduced the file badge size in the recent-documents list.
- [x] Added separate badge colors for PDF, image, Word, Excel, PowerPoint, video, audio, archive, text/code, and generic files.
- [x] Updated the add-document selected-file queue to show the same detected file type labels.
- [x] Confirmed `npm.cmd run lint -- --quiet` succeeds after the file icon adjustment.
- [x] Confirmed `npm.cmd run build` succeeds after the file icon adjustment.
- [x] Did not run `git add`, `git reset`, `git clean`, commit, push, or deploy.

Document-set adjustment:

- [x] Changed multi-file upload metadata so selected files are saved as one school-library document set instead of separate document rows.
- [x] Added `files[]` metadata for each file in a document set while keeping single-file legacy fields for backward compatibility.
- [x] Updated Firestore mapping to read `files[]` and keep old one-file documents working without a migration.
- [x] Updated file count, total size, search, primary preview URL, and delete behavior to use all files in a document set.
- [x] Updated delete behavior so a document set can delete all available Drive file ids before removing the single metadata document.
- [x] Kept personnel filtering backed by readable `profiles` names plus existing document owners.
- [x] Reduced mobile category cards to a compact two-line layout.
- [x] Changed mobile filters to stay in one row across the screen.
- [x] Clamped displayed document titles to at most two lines.
- [x] Confirmed `npm.cmd run lint -- --quiet` succeeds after the document-set adjustment.
- [x] Confirmed `npm.cmd run build` succeeds after the document-set adjustment.
- [x] Confirmed local `/school-library` still returns `200 OK` after the document-set adjustment.
- [x] Did not run `git add`, `git reset`, `git clean`, commit, push, or deploy.

Mobile compact layout adjustment:

- [x] Added distinct background and border colors for each school-library category card.
- [x] Reduced mobile category cards further and kept category text readable without ellipsis.
- [x] Reduced mobile category text sizes and kept each card to a compact two-line layout.
- [x] Reduced mobile filter height and font size so all three filters fit in one row.
- [x] Changed mobile document rows to a compact two-row layout.
- [x] Hid secondary mobile row details that caused document rows to grow too tall.
- [x] Kept document titles clamped to two lines without forced word breaking.
- [x] Confirmed `npm.cmd run lint -- --quiet` succeeds after the mobile compact layout adjustment.
- [x] Confirmed `npm.cmd run build` succeeds after the mobile compact layout adjustment.
- [x] Confirmed local `/school-library` still returns `200 OK` after the mobile compact layout adjustment.
- [x] Did not run `git add`, `git reset`, `git clean`, commit, push, or deploy.

Document tree and edit adjustment:

- [x] Restored mobile category-card count display while keeping the compact 2-row category layout.
- [x] Added expandable document-set rows so a multi-file topic can show child files as a tree.
- [x] Added per-child file links with detected file badges and file sizes.
- [x] Added an edit button for each school-library document row.
- [x] Allowed editing document-set metadata and appending more files to the existing `files[]` list.
- [x] Added Firestore update support for school-library document metadata.
- [x] Confirm `npm.cmd run lint -- --quiet` succeeds after the document tree/edit adjustment.
- [x] Confirm `npm.cmd run build` succeeds after the document tree/edit adjustment.
- [x] Confirm local `/school-library` still returns `200 OK` after the document tree/edit adjustment.
- [x] Did not run `git add`, `git reset`, `git clean`, commit, push, or deploy.

School library card color and personnel dropdown adjustment:

- [x] Confirmed the school-library page had been loading personnel names directly from client-side `profiles`, which can be incomplete when Supabase RLS limits readable rows.
- [x] Added a school-library profiles API that validates the current session and loads active personnel through the server-side Supabase service role.
- [x] Updated the school-library personnel dropdown to load active teacher/personnel names from the new API with document-owner fallback.
- [x] Changed the 6 category cards to use distinct tone colors.
- [x] Added subtle card patterns using CSS gradients without adding dependencies.
- [x] Confirm `npm.cmd run lint -- --quiet` succeeds after the card color/personnel dropdown adjustment.
- [x] Confirm `npm.cmd run build` succeeds after the card color/personnel dropdown adjustment.
- [x] Confirm local `/school-library` still returns `200 OK` after the card color/personnel dropdown adjustment.
- [x] Did not run `git add`, `git reset`, `git clean`, commit, push, or deploy.

School library hover and child-file management adjustment:

- [x] Added a light hover highlight for document rows and file rows.
- [x] Added delete buttons to child files inside expanded document-set trees.
- [x] Added existing-file visibility inside the edit modal for both single files and document sets.
- [x] Added delete controls for existing files inside the edit modal.
- [x] Updated child-file deletion to remove the file from the document set metadata and sync Firestore when configured.
- [x] Kept whole-document delete behavior when the last remaining file is removed.
- [x] Updated category pills in the document list to follow each category card color.
- [x] Increased visual separation between the 6 category card colors.
- [x] Confirm `npm.cmd run lint -- --quiet` succeeds after the hover/child-file adjustment.
- [x] Confirm `npm.cmd run build` succeeds after the hover/child-file adjustment.
- [x] Confirm local `/school-library` still returns `200 OK` after the hover/child-file adjustment.
- [x] Did not run `git add`, `git reset`, `git clean`, commit, push, or deploy.

School library personnel dropdown verification:

- [x] Queried Supabase `profiles` directly and confirmed there are 12 named profiles.
- [x] Confirmed 1 named profile is marked as deleted with `phone = deleted:*`, leaving 11 current school personnel records for the dropdown.
- [x] Updated `/api/school-library/profiles` to return all current named personnel, not only `account_status = active`.
- [x] Kept the API protected by requiring the current requester to be an active profile.
- [x] Filtered deleted-marker profiles on the server and stripped phone numbers from the API response.
- [x] Updated the school-library page to retry loading personnel when Supabase auth session becomes available.
- [x] Confirm unauthenticated `/api/school-library/profiles` does not expose personnel data.
- [x] Confirm `npm.cmd run lint -- --quiet` succeeds after personnel dropdown verification.
- [x] Confirm `npm.cmd run build` succeeds after personnel dropdown verification.
- [x] Confirm local `/school-library` still returns `200 OK` after personnel dropdown verification.
- [x] Did not run `git add`, `git reset`, `git clean`, commit, push, or deploy.

School library file proxy download:

- [x] Added a generic Google Drive download helper that can proxy binary files and export Google Docs/Sheets/Slides when needed.
- [x] Added `/api/school-library/files/[fileId]/download` for school-library file downloads.
- [x] Changed non-preview school-library file links to use the local proxy route instead of direct `drive.google.com/uc` links.
- [x] Kept PDF and image files on Drive preview links for in-browser viewing.
- [x] Confirm `npm.cmd run lint -- --quiet` succeeds after school-library proxy download.
- [x] Confirm `npm.cmd run build` succeeds after school-library proxy download.
- [x] Confirm local `/school-library` still returns `200 OK` after school-library proxy download.
- [x] Did not run `git add`, `git reset`, `git clean`, commit, push, or deploy.

School library wide layout adjustment:

- [x] Expanded the school-library workspace max width from 1240px to 1520px for desktop screens.
- [x] Reduced outer desktop horizontal padding slightly so the content uses more available screen width.
- [x] Kept mobile layout overrides unchanged to avoid horizontal overflow.
- [x] Confirm `npm.cmd run lint -- --quiet` succeeds after the wide layout adjustment.
- [x] Confirm `npm.cmd run build` succeeds after the wide layout adjustment.
- [x] Confirm local `/school-library` still returns `200 OK` after the wide layout adjustment.
- [x] Did not run `git add`, `git reset`, `git clean`, commit, push, or deploy.

Teaching supervision header and assessment form adjustment:

- [x] Moved the Firebase save status to the top-right of the teaching supervision title row.
- [x] Replaced the inspected-teacher dropdown with a read-only selected-teacher display.
- [x] Tightened the teacher-type radio controls so both options stay compact on one line.
- [x] Confirm `npm.cmd run build` succeeds after the teaching supervision UI adjustment.
- [x] Did not run `git add`, `git reset`, `git clean`, commit, push, or deploy.

Follow-up checks:

- [ ] Test the category card filtering interactively in a browser after browser automation is available.
- [ ] If the school wants legacy Firestore category values rewritten permanently, create a reviewed migration plan first.
