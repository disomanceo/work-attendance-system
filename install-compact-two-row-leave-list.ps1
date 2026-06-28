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
$cssPath  = Join-Path $ProjectPath "app\leave\leave.module.css"

if (-not (Test-Path -LiteralPath $pagePath)) {
    throw "ไม่พบไฟล์ $pagePath"
}
if (-not (Test-Path -LiteralPath $cssPath)) {
    throw "ไม่พบไฟล์ $cssPath"
}

$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backupDir = Join-Path $ProjectPath "_backup\compact-leave-list-$timestamp"
New-Item -ItemType Directory -Path $backupDir -Force | Out-Null

Copy-Item -LiteralPath $pagePath -Destination (Join-Path $backupDir "page.tsx") -Force
Copy-Item -LiteralPath $cssPath -Destination (Join-Path $backupDir "leave.module.css") -Force
Ok "สำรองไฟล์ไว้ที่ $backupDir"

$page = [System.IO.File]::ReadAllText($pagePath, [System.Text.Encoding]::UTF8)
$css  = [System.IO.File]::ReadAllText($cssPath, [System.Text.Encoding]::UTF8)

Step "ตรวจโครงสร้างรายการใบลา"

$requiredTokens = @(
    "sortedAdminLeaveRequests",
    "pagedAdminLeaveRequests",
    "safeAdminLeavePage",
    "adminLeavePageSize",
    "adminLeaveTotalPages",
    "formatAdminLeaveDate",
    "adminLeaveStatusLabel",
    "adminLeaveTypeLabel",
    "openLeaveDocument"
)

foreach ($token in $requiredTokens) {
    if (-not $page.Contains($token)) {
        throw "ไม่พบ $token กรุณาใช้ไฟล์ Local รุ่นที่มีรายการใบลาแบบรวมก่อน"
    }
}

Step "แทนตารางด้วยรายการกระชับ 2 แถวต่อคน"

$blockPattern = '(?s)\{\["director",\s*"admin"\]\.includes\(profileRole\)\s*&&\s*\(\s*<section\s+className=\{styles\.adminLeaveSection\}>.*?</section>\s*\)\}'

if (-not [regex]::IsMatch($page, $blockPattern)) {
    throw "ไม่พบส่วน adminLeaveSection เดิม"
}

$newBlock = @'
{["director", "admin"].includes(profileRole) && (
            <section className={styles.compactLeaveSection}>
              <div className={styles.compactLeaveHeader}>
                <div>
                  <small>สำหรับผู้บริหาร</small>
                  <h3>รายการใบลา</h3>
                </div>

                <strong>
                  {sortedAdminLeaveRequests.length} รายการ
                </strong>
              </div>

              {sortedAdminLeaveRequests.length === 0 ? (
                <p className={styles.reviewEmpty}>
                  ยังไม่มีรายการใบลา
                </p>
              ) : (
                <>
                  <div className={styles.compactLeaveColumnHeader}>
                    <span>ลำดับ</span>
                    <span>วันที่ยื่น</span>
                    <span>ชื่อ–ตำแหน่ง</span>
                    <span>ประเภท</span>
                    <span>ช่วงวันลา</span>
                    <span>วัน</span>
                    <span>สถานะ</span>
                  </div>

                  <div className={styles.compactLeaveList}>
                    {pagedAdminLeaveRequests.map((item, index) => {
                      const rowNumber =
                        (safeAdminLeavePage - 1) *
                          adminLeavePageSize +
                        index +
                        1;

                      return (
                        <article
                          key={item.id}
                          className={styles.compactLeaveItem}
                          data-status={item.status}
                        >
                          <div className={styles.compactLeaveInfo}>
                            <strong
                              className={styles.compactLeaveNumber}
                              data-label="ลำดับ"
                            >
                              {rowNumber}
                            </strong>

                            <time
                              className={styles.compactLeaveSubmitted}
                              data-label="วันที่ยื่น"
                              dateTime={item.created_at}
                            >
                              {formatAdminLeaveDate(
                                item.created_at,
                                true
                              )}
                            </time>

                            <div
                              className={styles.compactLeavePerson}
                              data-label="ชื่อ–ตำแหน่ง"
                            >
                              <strong>
                                {item.profiles?.full_name ||
                                  "ไม่พบชื่อสมาชิก"}
                              </strong>
                              <small>
                                {item.profiles?.position ||
                                  item.profiles?.role ||
                                  "-"}
                              </small>
                            </div>

                            <span
                              className={styles.compactLeaveType}
                              data-label="ประเภท"
                              data-type={item.leave_type}
                            >
                              {adminLeaveTypeLabel(item.leave_type)}
                            </span>

                            <span
                              className={styles.compactLeavePeriod}
                              data-label="ช่วงวันลา"
                            >
                              {formatAdminLeaveDate(item.start_date)}
                              <b>–</b>
                              {formatAdminLeaveDate(item.end_date)}
                            </span>

                            <strong
                              className={styles.compactLeaveDays}
                              data-label="วัน"
                            >
                              {item.total_work_days}
                            </strong>

                            <span
                              className={styles.compactLeaveStatus}
                              data-label="สถานะ"
                              data-status={item.status}
                            >
                              {adminLeaveStatusLabel(item.status)}
                            </span>
                          </div>

                          <div className={styles.compactLeaveActions}>
                            <button
                              type="button"
                              className={styles.viewLeaveButton}
                              onClick={() => openLeaveDocument(item)}
                            >
                              ดูใบลา
                            </button>

                            {item.attachment_path ? (
                              <button
                                type="button"
                                className={
                                  styles.viewAttachmentButton
                                }
                                onClick={() =>
                                  void openAttachment(item.id)
                                }
                              >
                                ดูไฟล์แนบ
                              </button>
                            ) : (
                              <span className={styles.noAttachmentText}>
                                ไม่มีไฟล์แนบ
                              </span>
                            )}

                            {item.status === "pending" && (
                              <>
                                <button
                                  type="button"
                                  className={styles.approveButton}
                                  disabled={
                                    processingId === item.id
                                  }
                                  onClick={() =>
                                    void reviewLeave(
                                      item.id,
                                      "approve"
                                    )
                                  }
                                >
                                  อนุมัติ
                                </button>

                                <button
                                  type="button"
                                  className={styles.rejectButton}
                                  disabled={
                                    processingId === item.id
                                  }
                                  onClick={() =>
                                    void reviewLeave(
                                      item.id,
                                      "reject"
                                    )
                                  }
                                >
                                  ไม่อนุมัติ
                                </button>

                                <button
                                  type="button"
                                  className={
                                    styles.deleteLeaveButton
                                  }
                                  disabled={
                                    deletingId === item.id ||
                                    processingId === item.id
                                  }
                                  onClick={() =>
                                    void deleteLeave(item)
                                  }
                                >
                                  {deletingId === item.id
                                    ? "กำลังลบ..."
                                    : "ลบ"}
                                </button>
                              </>
                            )}
                          </div>
                        </article>
                      );
                    })}
                  </div>

                  <div className={styles.adminLeavePagination}>
                    <span>
                      แสดง{" "}
                      {(safeAdminLeavePage - 1) *
                        adminLeavePageSize +
                        1}
                      –
                      {Math.min(
                        safeAdminLeavePage *
                          adminLeavePageSize,
                        sortedAdminLeaveRequests.length
                      )}{" "}
                      จาก {sortedAdminLeaveRequests.length} รายการ
                    </span>

                    <div>
                      <button
                        type="button"
                        disabled={safeAdminLeavePage <= 1}
                        onClick={() =>
                          setAdminLeavePage((page) =>
                            Math.max(1, page - 1)
                          )
                        }
                      >
                        ก่อนหน้า
                      </button>

                      <strong>
                        หน้า {safeAdminLeavePage}/
                        {adminLeaveTotalPages}
                      </strong>

                      <button
                        type="button"
                        disabled={
                          safeAdminLeavePage >=
                          adminLeaveTotalPages
                        }
                        onClick={() =>
                          setAdminLeavePage((page) =>
                            Math.min(
                              adminLeaveTotalPages,
                              page + 1
                            )
                          )
                        }
                      >
                        ถัดไป
                      </button>
                    </div>
                  </div>
                </>
              )}
            </section>
          )}
'@

$page = [regex]::Replace(
    $page,
    $blockPattern,
    $newBlock.TrimEnd(),
    1
)

Write-Utf8Bom -Path $pagePath -Text $page
Ok "เปลี่ยนเป็นรายการ 2 แถวต่อคนแล้ว"

Step "ติดตั้ง CSS แบบไม่ล้นกรอบ"

$startMarker = "/* COMPACT TWO ROW LEAVE LIST START */"
$endMarker   = "/* COMPACT TWO ROW LEAVE LIST END */"

if ($css.Contains($startMarker)) {
    $startIndex = $css.IndexOf($startMarker)
    $endIndex = $css.IndexOf($endMarker, $startIndex)

    if ($endIndex -ge 0) {
        $endIndex += $endMarker.Length
        $css = $css.Remove(
            $startIndex,
            $endIndex - $startIndex
        ).TrimEnd()
    }
}

$compactCss = @'

/* COMPACT TWO ROW LEAVE LIST START */

.compactLeaveSection{
  width:100%;
  min-width:0;
  margin:0 0 18px;
  padding:14px;
  border:1px solid #dfe8e3;
  border-radius:16px;
  background:#fff;
  box-shadow:0 10px 26px rgba(24,69,54,.055);
  overflow:hidden;
  font-family:"Leelawadee UI","Tahoma","Noto Sans Thai",sans-serif;
}

.compactLeaveHeader{
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:12px;
  margin-bottom:10px;
}

.compactLeaveHeader small{
  color:#728178;
  font-size:11px;
  font-weight:700;
}

.compactLeaveHeader h3{
  margin:2px 0 0;
  color:#194b39;
  font-size:18px;
  font-weight:800;
  line-height:1.25;
}

.compactLeaveHeader>strong{
  flex:0 0 auto;
  padding:5px 10px;
  border-radius:999px;
  background:#e8f5ee;
  color:#236448;
  font-size:11px;
  font-weight:800;
  white-space:nowrap;
}

.compactLeaveColumnHeader,
.compactLeaveInfo{
  display:grid;
  grid-template-columns:
    42px
    112px
    minmax(150px,1.35fr)
    68px
    minmax(128px,1fr)
    42px
    92px;
  align-items:center;
  gap:7px;
  width:100%;
  min-width:0;
}

.compactLeaveColumnHeader{
  padding:7px 9px;
  border:1px solid #e1e8e4;
  border-radius:10px 10px 0 0;
  background:#f4f7f5;
  color:#52685e;
  font-size:10px;
  font-weight:800;
}

.compactLeaveList{
  display:grid;
  gap:7px;
  width:100%;
  min-width:0;
  margin-top:7px;
}

.compactLeaveItem{
  width:100%;
  min-width:0;
  padding:9px 10px 8px;
  border:1px solid #e0e7e3;
  border-left:5px solid #8aa096;
  border-radius:11px;
  background:#fff;
  overflow:hidden;
}

.compactLeaveItem[data-status="pending"]{
  border-color:#edd49b;
  border-left-color:#dfa623;
  background:#fffaf0;
}

.compactLeaveItem[data-status="approved"]{
  border-color:#a9d8bb;
  border-left-color:#2f9964;
  background:#f3fbf6;
}

.compactLeaveItem[data-status="rejected"]{
  border-color:#e6b4b4;
  border-left-color:#c84d4d;
  background:#fff6f6;
}

.compactLeaveItem[data-status="cancelled"]{
  border-color:#cfd7d3;
  border-left-color:#89958f;
  background:#f7f9f8;
}

.compactLeaveInfo{
  min-height:32px;
  color:#304f42;
  font-size:11px;
  line-height:1.25;
}

.compactLeaveInfo>*{
  min-width:0;
  max-width:100%;
  overflow-wrap:anywhere;
}

.compactLeaveNumber{
  text-align:center;
  color:#285d48;
  font-size:12px;
  font-weight:800;
}

.compactLeaveSubmitted{
  color:#52685e;
  font-size:10.5px;
  font-weight:600;
}

.compactLeavePerson{
  display:grid;
  gap:1px;
  min-width:0;
}

.compactLeavePerson strong{
  color:#234c3d;
  font-size:12px;
  font-weight:800;
  line-height:1.25;
  white-space:normal;
}

.compactLeavePerson small{
  color:#718278;
  font-size:10px;
  font-weight:500;
  line-height:1.2;
}

.compactLeaveType,
.compactLeaveStatus{
  display:inline-flex;
  align-items:center;
  justify-content:center;
  width:max-content;
  max-width:100%;
  padding:4px 7px;
  border-radius:999px;
  font-size:10px;
  font-weight:800;
  text-align:center;
  white-space:normal;
}

.compactLeaveType[data-type="personal"]{
  background:#e8f5ee;
  color:#1f684b;
}

.compactLeaveType[data-type="sick"]{
  background:#fff0f0;
  color:#9d3c3c;
}

.compactLeavePeriod{
  display:flex;
  align-items:center;
  gap:4px;
  color:#405b50;
  font-size:10.5px;
  font-weight:600;
  white-space:normal;
}

.compactLeavePeriod b{
  color:#819188;
  font-weight:500;
}

.compactLeaveDays{
  text-align:center;
  color:#285d48;
  font-size:12px;
  font-weight:800;
}

.compactLeaveStatus[data-status="pending"]{
  background:#ffe8aa;
  color:#7b4c00;
}

.compactLeaveStatus[data-status="approved"]{
  background:#dcf3e5;
  color:#17603e;
}

.compactLeaveStatus[data-status="rejected"]{
  background:#fbe1e1;
  color:#963232;
}

.compactLeaveStatus[data-status="cancelled"]{
  background:#e5e9e7;
  color:#59645f;
}

.compactLeaveActions{
  display:flex;
  align-items:center;
  justify-content:flex-end;
  gap:5px;
  width:100%;
  min-width:0;
  margin-top:7px;
  padding-top:7px;
  border-top:1px dashed rgba(99,123,112,.22);
  flex-wrap:wrap;
}

.compactLeaveActions button{
  display:inline-flex;
  align-items:center;
  justify-content:center;
  min-width:0;
  min-height:29px;
  padding:5px 8px;
  border:1px solid;
  border-radius:7px;
  font:inherit;
  font-size:10px;
  font-weight:800;
  line-height:1.15;
  white-space:normal;
  cursor:pointer;
}

.compactLeaveActions button:disabled{
  cursor:not-allowed;
  opacity:.55;
}

.compactLeaveActions .viewLeaveButton{
  border-color:#baa8cf!important;
  background:#f7f2fb!important;
  color:#60487d!important;
}

.compactLeaveActions .viewAttachmentButton{
  border-color:#9cc8df!important;
  background:#edf8fd!important;
  color:#225f7d!important;
}

.compactLeaveActions .approveButton{
  border-color:#8fcfab!important;
  background:#e5f7ec!important;
  color:#17613e!important;
}

.compactLeaveActions .rejectButton{
  border-color:#e4a6a6!important;
  background:#fff0f0!important;
  color:#9f3535!important;
}

.compactLeaveActions .deleteLeaveButton{
  border-color:#d5b6b6!important;
  background:#fff!important;
  color:#963838!important;
}

.compactLeaveActions .noAttachmentText{
  padding:4px 7px;
  color:#87938d;
  font-size:9.5px;
  white-space:normal;
}

.compactLeaveSection .adminLeavePagination{
  margin-top:10px;
  font-family:"Leelawadee UI","Tahoma","Noto Sans Thai",sans-serif;
}

/* ปรับให้ยังอยู่ในกรอบเมื่อพื้นที่แคบ */
@media(max-width:1040px){
  .compactLeaveColumnHeader,
  .compactLeaveInfo{
    grid-template-columns:
      36px
      102px
      minmax(135px,1.3fr)
      62px
      minmax(112px,.95fr)
      36px
      82px;
    gap:5px;
  }

  .compactLeaveColumnHeader{
    font-size:9.5px;
  }

  .compactLeaveInfo{
    font-size:10.5px;
  }
}

/* Tablet และมือถือ: ไม่มี Scroll bar เปลี่ยนเป็นบล็อกในกรอบเดิม */
@media(max-width:760px){
  .compactLeaveColumnHeader{
    display:none;
  }

  .compactLeaveInfo{
    grid-template-columns:repeat(2,minmax(0,1fr));
    gap:6px 10px;
  }

  .compactLeaveInfo>*{
    display:grid;
    grid-template-columns:82px minmax(0,1fr);
    align-items:start;
    gap:6px;
    text-align:left;
  }

  .compactLeaveInfo>*::before{
    content:attr(data-label);
    color:#718278;
    font-size:9.5px;
    font-weight:800;
  }

  .compactLeaveType,
  .compactLeaveStatus{
    width:100%;
    justify-content:flex-start;
    border-radius:7px;
  }

  .compactLeavePeriod{
    display:grid;
    grid-template-columns:82px minmax(0,1fr);
  }

  .compactLeavePeriod::before{
    grid-column:1;
  }

  .compactLeavePeriod b{
    display:none;
  }

  .compactLeaveActions{
    justify-content:stretch;
  }

  .compactLeaveActions button{
    flex:1 1 120px;
  }
}

@media(max-width:480px){
  .compactLeaveSection{
    padding:11px;
  }

  .compactLeaveInfo{
    grid-template-columns:1fr;
  }

  .compactLeaveActions{
    display:grid;
    grid-template-columns:repeat(2,minmax(0,1fr));
  }

  .compactLeaveActions button{
    width:100%;
  }
}

@media(max-width:360px){
  .compactLeaveActions{
    grid-template-columns:1fr;
  }
}

/* COMPACT TWO ROW LEAVE LIST END */
'@

$css = $css.TrimEnd() + $compactCss
Write-Utf8Bom -Path $cssPath -Text $css
Ok "บันทึก CSS แบบไม่ล้นกรอบแล้ว"

Step "ตรวจ UTF-8 BOM"

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
