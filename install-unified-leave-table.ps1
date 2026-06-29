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

function WarnText([string]$Text) {
    Write-Host "[คำเตือน] $Text" -ForegroundColor Yellow
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
$cssPath = Join-Path $ProjectPath "app\leave\leave.module.css"

if (-not (Test-Path -LiteralPath $pagePath)) {
    throw "ไม่พบไฟล์ $pagePath"
}
if (-not (Test-Path -LiteralPath $cssPath)) {
    throw "ไม่พบไฟล์ $cssPath"
}

$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backupDir = Join-Path $ProjectPath "_backup\unified-leave-table-$timestamp"
New-Item -ItemType Directory -Path $backupDir -Force | Out-Null

Copy-Item -LiteralPath $pagePath -Destination (Join-Path $backupDir "page.tsx") -Force
Copy-Item -LiteralPath $cssPath -Destination (Join-Path $backupDir "leave.module.css") -Force
Ok "สำรองไฟล์ไว้ที่ $backupDir"

$page = [System.IO.File]::ReadAllText($pagePath, [System.Text.Encoding]::UTF8)
$css = [System.IO.File]::ReadAllText($cssPath, [System.Text.Encoding]::UTF8)

Step "ปรับชนิดข้อมูลรายการใบลาผู้บริหาร"

$typePattern = '(?s)type\s+AdminPendingLeaveRequest\s*=\s*\{.*?\r?\n\};'
$typeReplacement = @'
type AdminPendingLeaveRequest = {
  id: string;
  leave_type: "personal" | "sick";
  start_date: string;
  end_date: string;
  total_work_days: number;
  reason: string;
  fiscal_year: number;
  submission_kind: string;
  attachment_path: string | null;
  attachment_name?: string | null;
  evidence_file_url?: string | null;
  medical_certificate_required: boolean;
  status: "pending" | "approved" | "rejected" | "cancelled";
  created_at: string;
  leave_number?: string | null;
  working_document_url?: string | null;
  pdf_file_url?: string | null;
  profiles: {
    full_name: string;
    position: string | null;
    role: string;
  } | null;
};
'@

if (-not [regex]::IsMatch($page, $typePattern)) {
    throw "ไม่พบ type AdminPendingLeaveRequest"
}

$page = [regex]::Replace(
    $page,
    $typePattern,
    $typeReplacement.TrimEnd(),
    1
)
Ok "ปรับ AdminPendingLeaveRequest แล้ว"

Step "เพิ่มฟังก์ชันวันที่ไทยและสถานะ"

$helperMarker = "function formatAdminLeaveDate("
if (-not $page.Contains($helperMarker)) {
    $insertBefore = "export default function LeavePage()"
    if (-not $page.Contains($insertBefore)) {
        throw "ไม่พบ export default function LeavePage()"
    }

    $helpers = @'
function formatAdminLeaveDate(value: string, includeTime = false) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  const datePart = new Intl.DateTimeFormat("th-TH", {
    timeZone: "Asia/Bangkok",
    day: "numeric",
    month: "short",
    year: "2-digit",
  }).format(date);

  if (!includeTime) {
    return datePart;
  }

  const timePart = new Intl.DateTimeFormat("th-TH", {
    timeZone: "Asia/Bangkok",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);

  return `${datePart} ${timePart} น.`;
}

function adminLeaveStatusLabel(
  status: AdminPendingLeaveRequest["status"]
) {
  const labels = {
    pending: "รอพิจารณา",
    approved: "อนุมัติแล้ว",
    rejected: "ไม่อนุมัติ",
    cancelled: "ยกเลิก",
  };

  return labels[status];
}

function adminLeaveTypeLabel(
  type: AdminPendingLeaveRequest["leave_type"]
) {
  return type === "sick" ? "ลาป่วย" : "ลากิจ";
}

'@

    $page = $page.Replace($insertBefore, $helpers + $insertBefore)
    Ok "เพิ่มตัวจัดรูปแบบวันที่และสถานะแล้ว"
}
else {
    Ok "มีฟังก์ชันวันที่อยู่แล้ว"
}

Step "เพิ่ม State สำหรับแบ่งหน้า"

if ($page -notmatch 'const\s+\[adminLeavePage,\s*setAdminLeavePage\]') {
    $statePattern = '(\s*const\s+\[historyOpen,\s*setHistoryOpen\]\s*=\s*useState\(false\);)'
    if (-not [regex]::IsMatch($page, $statePattern)) {
        throw "ไม่พบจุดเพิ่ม State adminLeavePage"
    }

    $page = [regex]::Replace(
        $page,
        $statePattern,
        '$1' + "`r`n  const [adminLeavePage, setAdminLeavePage] = useState(1);",
        1
    )
    Ok "เพิ่ม adminLeavePage แล้ว"
}
else {
    Ok "มี adminLeavePage อยู่แล้ว"
}

Step "โหลดใบลาทุกสถานะ"

$page = $page.Replace(
    'fetchWithTimeout("/api/admin/leave?status=pending", {',
    'fetchWithTimeout("/api/admin/leave?status=all", {'
)
Ok "เปลี่ยน API เป็น status=all แล้ว"

Step "เพิ่มข้อมูลเรียงสถานะและแบ่งหน้า"

if ($page -notmatch 'const\s+sortedAdminLeaveRequests\s*=\s*useMemo') {
    $insertPoint = "  async function submitLeave("
    if (-not $page.Contains($insertPoint)) {
        throw "ไม่พบตำแหน่งเพิ่ม sortedAdminLeaveRequests"
    }

    $derived = @'
  const sortedAdminLeaveRequests = useMemo(() => {
    const statusPriority: Record<
      AdminPendingLeaveRequest["status"],
      number
    > = {
      pending: 0,
      approved: 1,
      rejected: 2,
      cancelled: 3,
    };

    return [...pendingRequests].sort((a, b) => {
      const statusDifference =
        statusPriority[a.status] - statusPriority[b.status];

      if (statusDifference !== 0) {
        return statusDifference;
      }

      return (
        new Date(b.created_at).getTime() -
        new Date(a.created_at).getTime()
      );
    });
  }, [pendingRequests]);

  const adminLeavePageSize = 10;
  const adminLeaveTotalPages = Math.max(
    1,
    Math.ceil(sortedAdminLeaveRequests.length / adminLeavePageSize)
  );
  const safeAdminLeavePage = Math.min(
    adminLeavePage,
    adminLeaveTotalPages
  );
  const pagedAdminLeaveRequests = sortedAdminLeaveRequests.slice(
    (safeAdminLeavePage - 1) * adminLeavePageSize,
    safeAdminLeavePage * adminLeavePageSize
  );

  useEffect(() => {
    if (adminLeavePage > adminLeaveTotalPages) {
      setAdminLeavePage(adminLeaveTotalPages);
    }
  }, [adminLeavePage, adminLeaveTotalPages]);

  function openLeaveDocument(item: AdminPendingLeaveRequest) {
    const url = item.pdf_file_url || item.working_document_url;

    if (!url) {
      setErrorMessage("ยังไม่มีไฟล์ใบลาสำหรับรายการนี้");
      return;
    }

    window.open(url, "_blank", "noopener,noreferrer");
  }

'@

    $page = $page.Replace($insertPoint, $derived + $insertPoint)
    Ok "เพิ่มเรียงรายการและแบ่งหน้าแล้ว"
}
else {
    Ok "มี derived list อยู่แล้ว"
}

Step "แทนส่วนรายการผู้บริหารด้วยตารางเดียว"

$sectionPattern = '(?s)\{\["director",\s*"admin"\]\.includes\(profileRole\)\s*&&\s*\(\s*<section\s+className=\{styles\.reviewSection\}>.*?</section>\s*\)\}'

if (-not [regex]::IsMatch($page, $sectionPattern)) {
    throw "ไม่พบ section ใบลารอพิจารณาเดิม"
}

$newSection = @'
{["director", "admin"].includes(profileRole) && (
            <section className={styles.adminLeaveSection}>
              <div className={styles.adminLeaveHeader}>
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
                  <div className={styles.adminLeaveTableWrap}>
                    <table className={styles.adminLeaveTable}>
                      <thead>
                        <tr>
                          <th>ลำดับ</th>
                          <th>วันที่ยื่น</th>
                          <th>ผู้ยื่น</th>
                          <th>ประเภท</th>
                          <th>ช่วงวันที่ลา</th>
                          <th>วัน</th>
                          <th>สถานะ</th>
                          <th>จัดการ</th>
                        </tr>
                      </thead>

                      <tbody>
                        {pagedAdminLeaveRequests.map((item, index) => {
                          const rowNumber =
                            (safeAdminLeavePage - 1) *
                              adminLeavePageSize +
                            index +
                            1;

                          return (
                            <tr
                              key={item.id}
                              data-status={item.status}
                            >
                              <td data-label="ลำดับ">
                                <strong>{rowNumber}</strong>
                              </td>

                              <td data-label="วันที่ยื่น">
                                <time dateTime={item.created_at}>
                                  {formatAdminLeaveDate(
                                    item.created_at,
                                    true
                                  )}
                                </time>
                              </td>

                              <td data-label="ผู้ยื่น">
                                <strong className={styles.adminLeaveName}>
                                  {item.profiles?.full_name ||
                                    "ไม่พบชื่อสมาชิก"}
                                </strong>
                                <small>
                                  {item.profiles?.position ||
                                    item.profiles?.role ||
                                    "-"}
                                </small>
                              </td>

                              <td data-label="ประเภท">
                                <span
                                  className={styles.adminLeaveType}
                                  data-type={item.leave_type}
                                >
                                  {adminLeaveTypeLabel(item.leave_type)}
                                </span>
                              </td>

                              <td data-label="ช่วงวันที่ลา">
                                <span>
                                  {formatAdminLeaveDate(item.start_date)}
                                </span>
                                <b>–</b>
                                <span>
                                  {formatAdminLeaveDate(item.end_date)}
                                </span>
                              </td>

                              <td data-label="วัน">
                                <strong>
                                  {item.total_work_days}
                                </strong>
                              </td>

                              <td data-label="สถานะ">
                                <span
                                  className={styles.adminLeaveStatus}
                                  data-status={item.status}
                                >
                                  {adminLeaveStatusLabel(item.status)}
                                </span>
                              </td>

                              <td data-label="จัดการ">
                                <div
                                  className={styles.adminLeaveActions}
                                >
                                  <button
                                    type="button"
                                    className={styles.viewLeaveButton}
                                    onClick={() =>
                                      openLeaveDocument(item)
                                    }
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
                                    <span
                                      className={
                                        styles.noAttachmentText
                                      }
                                    >
                                      ไม่มีไฟล์แนบ
                                    </span>
                                  )}

                                  {item.status === "pending" && (
                                    <>
                                      <button
                                        type="button"
                                        className={
                                          styles.approveButton
                                        }
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
                                        className={
                                          styles.rejectButton
                                        }
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
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  <div className={styles.adminLeavePagination}>
                    <span>
                      แสดง{" "}
                      {(safeAdminLeavePage - 1) *
                        adminLeavePageSize +
                        1}
                      –
                      {Math.min(
                        safeAdminLeavePage * adminLeavePageSize,
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
                        หน้า {safeAdminLeavePage} /{" "}
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
    $sectionPattern,
    $newSection.TrimEnd(),
    1
)
Ok "แทนรายการเดิมด้วยตารางเดียวแล้ว"

Write-Utf8Bom -Path $pagePath -Text $page
Ok "บันทึก page.tsx เป็น UTF-8 with BOM"

Step "เพิ่ม CSS ตาราง Responsive"

$startMarker = "/* UNIFIED ADMIN LEAVE TABLE START */"
$endMarker = "/* UNIFIED ADMIN LEAVE TABLE END */"

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

$tableCss = @'

/* UNIFIED ADMIN LEAVE TABLE START */

.adminLeaveSection{
  margin:0 0 20px;
  padding:16px;
  border:1px solid #dfe8e3;
  border-radius:18px;
  background:#fff;
  box-shadow:0 10px 28px rgba(24,69,54,.06);
}

.adminLeaveHeader{
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:12px;
  margin-bottom:12px;
}

.adminLeaveHeader small{
  color:#718278;
  font-weight:800;
}

.adminLeaveHeader h3{
  margin:3px 0 0;
  color:#194b39;
}

.adminLeaveHeader>strong{
  padding:6px 11px;
  border-radius:999px;
  background:#e8f5ee;
  color:#236448;
  font-size:13px;
  white-space:nowrap;
}

.adminLeaveTableWrap{
  width:100%;
  overflow-x:auto;
  border:1px solid #e1e8e4;
  border-radius:14px;
}

.adminLeaveTable{
  width:100%;
  min-width:1080px;
  border-collapse:collapse;
  table-layout:fixed;
  background:#fff;
}

.adminLeaveTable th,
.adminLeaveTable td{
  padding:10px 9px;
  border-bottom:1px solid #e6ece8;
  vertical-align:middle;
  text-align:left;
  overflow-wrap:anywhere;
}

.adminLeaveTable th{
  background:#f5f8f6;
  color:#486257;
  font-size:12px;
  font-weight:900;
  white-space:nowrap;
}

.adminLeaveTable th:nth-child(1){width:56px}
.adminLeaveTable th:nth-child(2){width:118px}
.adminLeaveTable th:nth-child(3){width:180px}
.adminLeaveTable th:nth-child(4){width:88px}
.adminLeaveTable th:nth-child(5){width:170px}
.adminLeaveTable th:nth-child(6){width:54px}
.adminLeaveTable th:nth-child(7){width:112px}
.adminLeaveTable th:nth-child(8){width:300px}

.adminLeaveTable tbody tr{
  transition:background .16s ease;
}

.adminLeaveTable tbody tr[data-status="pending"]{
  background:#fffaf0;
  box-shadow:inset 5px 0 #e5a820;
}

.adminLeaveTable tbody tr[data-status="approved"]{
  background:#f2fbf6;
  box-shadow:inset 5px 0 #2f9b65;
}

.adminLeaveTable tbody tr[data-status="rejected"]{
  background:#fff5f5;
  box-shadow:inset 5px 0 #c94d4d;
}

.adminLeaveTable tbody tr[data-status="cancelled"]{
  background:#f6f8f7;
  box-shadow:inset 5px 0 #89958f;
}

.adminLeaveTable tbody tr:hover{
  filter:brightness(.985);
}

.adminLeaveName{
  display:block;
  color:#234c3d;
  font-size:13px;
  line-height:1.35;
}

.adminLeaveTable td small{
  display:block;
  margin-top:2px;
  color:#718278;
  font-size:11px;
}

.adminLeaveType,
.adminLeaveStatus{
  display:inline-flex;
  align-items:center;
  justify-content:center;
  max-width:100%;
  padding:5px 8px;
  border-radius:999px;
  font-size:11px;
  font-weight:900;
  white-space:normal;
  text-align:center;
}

.adminLeaveType[data-type="personal"]{
  background:#e8f5ee;
  color:#1f684b;
}

.adminLeaveType[data-type="sick"]{
  background:#fff0f0;
  color:#a23f3f;
}

.adminLeaveStatus[data-status="pending"]{
  background:#ffe7a6;
  color:#7c4c00;
}

.adminLeaveStatus[data-status="approved"]{
  background:#dff4e7;
  color:#17613e;
}

.adminLeaveStatus[data-status="rejected"]{
  background:#fde2e2;
  color:#9c3434;
}

.adminLeaveStatus[data-status="cancelled"]{
  background:#e5e9e7;
  color:#59645f;
}

.adminLeaveActions{
  display:flex;
  align-items:center;
  gap:5px;
  flex-wrap:wrap;
  min-width:0;
}

.adminLeaveActions button{
  display:inline-flex;
  align-items:center;
  justify-content:center;
  min-height:32px;
  padding:6px 9px;
  border:1px solid;
  border-radius:8px;
  background:#fff;
  font:inherit;
  font-size:11px;
  font-weight:900;
  line-height:1.15;
  white-space:nowrap;
  cursor:pointer;
}

.adminLeaveActions button:disabled{
  cursor:not-allowed;
  opacity:.55;
}

.viewLeaveButton{
  border-color:#bca9d3!important;
  background:#f7f2fb!important;
  color:#654b82!important;
}

.viewAttachmentButton{
  border-color:#9cc8df!important;
  background:#edf8fd!important;
  color:#225f7d!important;
}

.adminLeaveActions .approveButton{
  border-color:#8fd0a9!important;
  background:#e5f7ec!important;
  color:#17613e!important;
}

.adminLeaveActions .rejectButton{
  border-color:#e7a3a3!important;
  background:#fff0f0!important;
  color:#a33434!important;
}

.adminLeaveActions .deleteLeaveButton{
  border-color:#d4b5b5!important;
  background:#fff!important;
  color:#9b3c3c!important;
}

.noAttachmentText{
  padding:5px 7px;
  color:#8a9690;
  font-size:10px;
  white-space:nowrap;
}

.adminLeavePagination{
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:12px;
  margin-top:12px;
  color:#62786f;
  font-size:12px;
}

.adminLeavePagination>div{
  display:flex;
  align-items:center;
  gap:8px;
}

.adminLeavePagination button{
  min-height:34px;
  padding:7px 11px;
  border:1px solid #bfd4c8;
  border-radius:9px;
  background:#fff;
  color:#285f49;
  font:inherit;
  font-weight:800;
  cursor:pointer;
}

.adminLeavePagination button:disabled{
  cursor:not-allowed;
  opacity:.45;
}

/* จอแคบ: เปลี่ยนจากตารางเป็นการ์ด ไม่ให้ข้อความและปุ่มทับกัน */
@media(max-width:820px){
  .adminLeaveTableWrap{
    overflow:visible;
    border:0;
  }

  .adminLeaveTable{
    min-width:0;
    border-collapse:separate;
    border-spacing:0 10px;
  }

  .adminLeaveTable thead{
    display:none;
  }

  .adminLeaveTable,
  .adminLeaveTable tbody,
  .adminLeaveTable tr,
  .adminLeaveTable td{
    display:block;
    width:100%;
  }

  .adminLeaveTable tbody tr{
    padding:10px 12px;
    border:1px solid #e1e8e4;
    border-radius:13px;
    overflow:hidden;
  }

  .adminLeaveTable td{
    display:grid;
    grid-template-columns:94px minmax(0,1fr);
    gap:8px;
    padding:6px 0;
    border-bottom:1px dashed #e4eae6;
  }

  .adminLeaveTable td:last-child{
    border-bottom:0;
  }

  .adminLeaveTable td::before{
    content:attr(data-label);
    color:#718278;
    font-size:11px;
    font-weight:900;
  }

  .adminLeaveActions{
    display:grid;
    grid-template-columns:repeat(2,minmax(0,1fr));
    gap:7px;
  }

  .adminLeaveActions button{
    width:100%;
    min-width:0;
    min-height:36px;
    white-space:normal;
  }

  .noAttachmentText{
    display:flex;
    align-items:center;
    min-height:36px;
    white-space:normal;
  }

  .adminLeavePagination{
    align-items:flex-start;
    flex-direction:column;
  }

  .adminLeavePagination>div{
    width:100%;
    justify-content:space-between;
  }
}

@media(max-width:430px){
  .adminLeaveSection{
    padding:12px;
  }

  .adminLeaveTable td{
    grid-template-columns:82px minmax(0,1fr);
  }

  .adminLeaveActions{
    grid-template-columns:1fr;
  }
}

/* UNIFIED ADMIN LEAVE TABLE END */
'@

$css = $css.TrimEnd() + $tableCss
Write-Utf8Bom -Path $cssPath -Text $css
Ok "บันทึก leave.module.css เป็น UTF-8 with BOM"

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
