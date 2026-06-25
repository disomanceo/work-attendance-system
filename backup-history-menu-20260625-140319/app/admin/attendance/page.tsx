"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import styles from "./attendance-report.module.css";

type AttendanceReportRecord = {
  id: string;
  user_id: string;
  work_date: string;
  check_in_at: string | null;
  check_out_at: string | null;
  check_in_distance_meters: number | null;
  check_out_distance_meters: number | null;
  check_in_status: string;
  check_out_status: string | null;
  note: string | null;
  full_name: string;
  phone: string;
  position: string | null;
  role: string;
  account_status: string;
};

type AttendanceSummary = {
  total: number;
  complete: number;
  late: number;
  early: number;
  incomplete: number;
};

type AttendanceApiResponse = {
  ok: boolean;
  message?: string;
  summary?: AttendanceSummary;
  records?: AttendanceReportRecord[];
};

const THAI_MONTHS = [
  "มกราคม",
  "กุมภาพันธ์",
  "มีนาคม",
  "เมษายน",
  "พฤษภาคม",
  "มิถุนายน",
  "กรกฎาคม",
  "สิงหาคม",
  "กันยายน",
  "ตุลาคม",
  "พฤศจิกายน",
  "ธันวาคม",
];

const THAI_WEEKDAYS = ["อา.", "จ.", "อ.", "พ.", "พฤ.", "ศ.", "ส."];

function getBangkokDateParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  return {
    year: Number(parts.find((part) => part.type === "year")?.value ?? 0),
    month: Number(parts.find((part) => part.type === "month")?.value ?? 1),
    day: Number(parts.find((part) => part.type === "day")?.value ?? 1),
  };
}

function getToday() {
  const { year, month, day } = getBangkokDateParts();
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function parseLocalDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function toIsoDate(year: number, monthIndex: number, day: number) {
  return `${year}-${String(monthIndex + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function formatThaiLongDate(value: string) {
  const date = parseLocalDate(value);
  return new Intl.DateTimeFormat("th-TH", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}

function formatThaiShortDate(value: string) {
  const date = parseLocalDate(value);
  return new Intl.DateTimeFormat("th-TH", {
    day: "numeric",
    month: "short",
    year: "2-digit",
  }).format(date);
}

function formatThaiTime(value: string | null) {
  if (!value) return "-";

  return new Intl.DateTimeFormat("th-TH", {
    timeZone: "Asia/Bangkok",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function getRoleLabel(role: string) {
  const labels: Record<string, string> = {
    admin: "ผู้ดูแลระบบ",
    director: "ผู้บริหาร",
    teacher: "ครู",
    staff: "เจ้าหน้าที่",
    janitor: "ภารโรง",
  };

  return labels[role] ?? role ?? "-";
}

function getAttendanceStatus(record: AttendanceReportRecord) {
  if (!record.check_in_at) {
    return { label: "ไม่ลงเวลา", tone: "danger" as const };
  }

  if (record.check_in_status === "late") {
    return { label: "มาสาย", tone: "warning" as const };
  }

  if (record.check_out_status === "early") {
    return { label: "ออกก่อนเวลา", tone: "warning" as const };
  }

  if (!record.check_out_at) {
    return { label: "ยังไม่ลงเวลาออก", tone: "neutral" as const };
  }

  return { label: "ปกติ", tone: "success" as const };
}

function getReviewStatus(record: AttendanceReportRecord) {
  if (
    record.check_in_status === "pending" ||
    record.check_in_status === "outside_area" ||
    record.check_out_status === "pending" ||
    record.check_out_status === "outside_area"
  ) {
    return { label: "รอตรวจสอบ", tone: "pending" as const };
  }

  return { label: "-", tone: "muted" as const };
}

function CalendarIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M7 3v3M17 3v3M4.5 9.5h15M6 5h12a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z" />
    </svg>
  );
}

function HistoryIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M3.5 12a8.5 8.5 0 1 0 2.1-5.6M3.5 4.5v4h4M12 7.5V12l3 2" />
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 3v11m0 0 4-4m-4 4-4-4M5 17v2a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-2" />
    </svg>
  );
}

export default function AdminAttendancePage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const calendarRef = useRef<HTMLDivElement>(null);

  const today = useMemo(() => getToday(), []);
  const initialDate = useMemo(() => parseLocalDate(today), [today]);

  const [selectedDate, setSelectedDate] = useState(today);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [calendarYear, setCalendarYear] = useState(initialDate.getFullYear());
  const [calendarMonth, setCalendarMonth] = useState(initialDate.getMonth());

  const [records, setRecords] = useState<AttendanceReportRecord[]>([]);
  const [summary, setSummary] = useState<AttendanceSummary>({
    total: 0,
    complete: 0,
    late: 0,
    early: 0,
    incomplete: 0,
  });
  const [searchText, setSearchText] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  const loadReport = useCallback(async () => {
    setLoading(true);
    setMessage("");

    try {
      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError || !session?.access_token) {
        router.replace("/login");
        return;
      }

      const query = new URLSearchParams({
        startDate: selectedDate,
        endDate: selectedDate,
      });

      const response = await fetch(`/api/admin/attendance?${query.toString()}`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
        cache: "no-store",
      });

      const result = (await response.json()) as AttendanceApiResponse;

      if (!response.ok || !result.ok) {
        if (response.status === 401) {
          await supabase.auth.signOut();
          router.replace("/login");
          return;
        }

        if (response.status === 403) {
          router.replace("/dashboard");
          return;
        }

        throw new Error(result.message || "ไม่สามารถโหลดประวัติการปฏิบัติงานได้");
      }

      setRecords(result.records ?? []);
      setSummary(
        result.summary ?? {
          total: 0,
          complete: 0,
          late: 0,
          early: 0,
          incomplete: 0,
        }
      );
    } catch (error) {
      console.error(error);
      setRecords([]);
      setSummary({
        total: 0,
        complete: 0,
        late: 0,
        early: 0,
        incomplete: 0,
      });
      setMessage(
        error instanceof Error
          ? error.message
          : "ไม่สามารถโหลดประวัติการปฏิบัติงานได้"
      );
    } finally {
      setLoading(false);
    }
  }, [router, selectedDate, supabase]);

  useEffect(() => {
    void loadReport();
  }, [loadReport]);

  useEffect(() => {
    function closeCalendar(event: MouseEvent) {
      if (
        calendarRef.current &&
        !calendarRef.current.contains(event.target as Node)
      ) {
        setCalendarOpen(false);
      }
    }

    document.addEventListener("mousedown", closeCalendar);
    return () => document.removeEventListener("mousedown", closeCalendar);
  }, []);

  const filteredRecords = useMemo(() => {
    const keyword = searchText.trim().toLowerCase();

    return records.filter((record) => {
      const attendanceStatus = getAttendanceStatus(record);

      const matchesSearch =
        !keyword ||
        record.full_name.toLowerCase().includes(keyword) ||
        (record.position ?? "").toLowerCase().includes(keyword) ||
        getRoleLabel(record.role).toLowerCase().includes(keyword);

      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "normal" && attendanceStatus.label === "ปกติ") ||
        (statusFilter === "late" && attendanceStatus.label === "มาสาย") ||
        (statusFilter === "incomplete" &&
          attendanceStatus.label === "ยังไม่ลงเวลาออก") ||
        (statusFilter === "absent" && attendanceStatus.label === "ไม่ลงเวลา");

      return matchesSearch && matchesStatus;
    });
  }, [records, searchText, statusFilter]);

  const calendarDays = useMemo(() => {
    const firstDay = new Date(calendarYear, calendarMonth, 1).getDay();
    const daysInMonth = new Date(
      calendarYear,
      calendarMonth + 1,
      0
    ).getDate();
    const previousMonthDays = new Date(
      calendarYear,
      calendarMonth,
      0
    ).getDate();

    return Array.from({ length: 42 }, (_, index) => {
      const rawDay = index - firstDay + 1;

      if (rawDay < 1) {
        const date = new Date(
          calendarYear,
          calendarMonth - 1,
          previousMonthDays + rawDay
        );
        return {
          date,
          iso: toIsoDate(
            date.getFullYear(),
            date.getMonth(),
            date.getDate()
          ),
          outside: true,
        };
      }

      if (rawDay > daysInMonth) {
        const date = new Date(
          calendarYear,
          calendarMonth + 1,
          rawDay - daysInMonth
        );
        return {
          date,
          iso: toIsoDate(
            date.getFullYear(),
            date.getMonth(),
            date.getDate()
          ),
          outside: true,
        };
      }

      const date = new Date(calendarYear, calendarMonth, rawDay);
      return {
        date,
        iso: toIsoDate(calendarYear, calendarMonth, rawDay),
        outside: false,
      };
    });
  }, [calendarMonth, calendarYear]);

  function changeMonth(offset: number) {
    const date = new Date(calendarYear, calendarMonth + offset, 1);
    setCalendarYear(date.getFullYear());
    setCalendarMonth(date.getMonth());
  }

  function chooseDate(iso: string) {
    const date = parseLocalDate(iso);
    setSelectedDate(iso);
    setCalendarYear(date.getFullYear());
    setCalendarMonth(date.getMonth());
    setCalendarOpen(false);
  }

  function openCalendar() {
    const date = parseLocalDate(selectedDate);
    setCalendarYear(date.getFullYear());
    setCalendarMonth(date.getMonth());
    setCalendarOpen((current) => !current);
  }

  function exportCsv() {
    if (filteredRecords.length === 0) {
      setMessage("ไม่มีข้อมูลสำหรับส่งออก");
      return;
    }

    const headers = [
      "ลำดับ",
      "วันที่",
      "ชื่อ-นามสกุล",
      "ตำแหน่ง",
      "บทบาท",
      "เวลาเข้า",
      "เวลาออก",
      "สถานะเวลา",
      "สถานะตรวจสอบ",
      "เหตุผล",
    ];

    const rows = filteredRecords.map((record, index) => {
      const status = getAttendanceStatus(record);
      const review = getReviewStatus(record);

      return [
        index + 1,
        formatThaiShortDate(record.work_date),
        record.full_name,
        record.position ?? "",
        getRoleLabel(record.role),
        formatThaiTime(record.check_in_at),
        formatThaiTime(record.check_out_at),
        status.label,
        review.label,
        record.note ?? "",
      ];
    });

    const csv = [headers, ...rows]
      .map((row) =>
        row
          .map((value) => `"${String(value).replace(/"/g, '""')}"`)
          .join(",")
      )
      .join("\n");

    const blob = new Blob([`\uFEFF${csv}`], {
      type: "text/csv;charset=utf-8;",
    });

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `attendance-${selectedDate}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <main className={styles.page}>
      <section className={styles.panel}>
        <header className={styles.pageHeader}>
          <div className={styles.titleGroup}>
            <span className={styles.titleIcon}>
              <HistoryIcon />
            </span>
            <div>
              <p>ATTENDANCE HISTORY</p>
              <h1>ประวัติการปฏิบัติงาน</h1>
            </div>
          </div>

          <button
            type="button"
            className={styles.backButton}
            onClick={() => router.push("/dashboard")}
          >
            กลับ Dashboard
          </button>
        </header>

        <div className={styles.toolbar}>
          <div className={styles.datePickerWrap} ref={calendarRef}>
            <button
              type="button"
              className={`${styles.dateButton} ${
                calendarOpen ? styles.dateButtonActive : ""
              }`}
              onClick={openCalendar}
              aria-expanded={calendarOpen}
            >
              <span className={styles.dateIcon}>
                <CalendarIcon />
              </span>
              <span>
                <small>วันที่แสดงข้อมูล</small>
                <strong>{formatThaiLongDate(selectedDate)}</strong>
              </span>
              <span className={styles.chevron}>⌄</span>
            </button>

            {calendarOpen && (
              <div className={styles.calendar}>
                <div className={styles.calendarHeader}>
                  <button
                    type="button"
                    aria-label="เดือนก่อนหน้า"
                    onClick={() => changeMonth(-1)}
                  >
                    ‹
                  </button>

                  <strong>
                    {THAI_MONTHS[calendarMonth]} {calendarYear + 543}
                  </strong>

                  <button
                    type="button"
                    aria-label="เดือนถัดไป"
                    onClick={() => changeMonth(1)}
                  >
                    ›
                  </button>
                </div>

                <div className={styles.weekdayGrid}>
                  {THAI_WEEKDAYS.map((day) => (
                    <span key={day}>{day}</span>
                  ))}
                </div>

                <div className={styles.dayGrid}>
                  {calendarDays.map(({ date, iso, outside }) => {
                    const isSelected = iso === selectedDate;
                    const isToday = iso === today;

                    return (
                      <button
                        key={iso}
                        type="button"
                        className={[
                          outside ? styles.outsideDay : "",
                          isToday ? styles.today : "",
                          isSelected ? styles.selectedDay : "",
                        ]
                          .filter(Boolean)
                          .join(" ")}
                        onClick={() => chooseDate(iso)}
                        aria-label={formatThaiLongDate(iso)}
                        aria-current={isToday ? "date" : undefined}
                      >
                        {date.getDate()}
                        {isToday && <span className={styles.todayDot} />}
                      </button>
                    );
                  })}
                </div>

                <div className={styles.calendarFooter}>
                  <button type="button" onClick={() => chooseDate(today)}>
                    วันนี้
                  </button>
                  <span>
                    วันที่เลือก: {formatThaiShortDate(selectedDate)}
                  </span>
                </div>
              </div>
            )}
          </div>

          <div className={styles.summaryBar}>
            <div>
              <span>ทั้งหมด</span>
              <strong>{summary.total}</strong>
            </div>
            <div className={styles.summaryNormal}>
              <span>ปกติ</span>
              <strong>{summary.complete}</strong>
            </div>
            <div className={styles.summaryLate}>
              <span>มาสาย</span>
              <strong>{summary.late}</strong>
            </div>
            <div className={styles.summaryIncomplete}>
              <span>ไม่ครบ</span>
              <strong>{summary.incomplete}</strong>
            </div>
          </div>

          <button
            type="button"
            className={styles.exportButton}
            onClick={exportCsv}
          >
            <DownloadIcon />
            ส่งออกข้อมูล
          </button>
        </div>

        <div className={styles.subToolbar}>
          <div>
            <h2>{formatThaiLongDate(selectedDate)}</h2>
            <p>แสดงข้อมูลการลงเวลาของบุคลากรในวันที่เลือก</p>
          </div>

          <div className={styles.filters}>
            <input
              type="search"
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
              placeholder="ค้นหาชื่อหรือตำแหน่ง"
            />

            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
            >
              <option value="all">ทุกสถานะ</option>
              <option value="normal">ปกติ</option>
              <option value="late">มาสาย</option>
              <option value="incomplete">ยังไม่ลงเวลาออก</option>
              <option value="absent">ไม่ลงเวลา</option>
            </select>
          </div>
        </div>

        {message && <div className={styles.message}>{message}</div>}

        <div className={styles.tableWrap}>
          <table>
            <thead>
              <tr>
                <th>ลำดับที่</th>
                <th>ชื่อ - นามสกุล</th>
                <th>ตำแหน่ง</th>
                <th>เวลาเข้า</th>
                <th>เวลาออก</th>
                <th>สถานะเวลา</th>
                <th>สถานะตรวจสอบ</th>
                <th>เหตุผล</th>
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} className={styles.emptyCell}>
                    กำลังโหลดข้อมูล...
                  </td>
                </tr>
              ) : filteredRecords.length === 0 ? (
                <tr>
                  <td colSpan={8} className={styles.emptyCell}>
                    ไม่พบข้อมูลในวันที่เลือก
                  </td>
                </tr>
              ) : (
                filteredRecords.map((record, index) => {
                  const attendanceStatus = getAttendanceStatus(record);
                  const reviewStatus = getReviewStatus(record);
                  const abnormal =
                    attendanceStatus.tone === "danger" ||
                    attendanceStatus.tone === "warning";

                  return (
                    <tr
                      key={record.id}
                      className={abnormal ? styles.abnormalRow : undefined}
                    >
                      <td>{index + 1}</td>
                      <td>
                        <div className={styles.personCell}>
                          <strong>{record.full_name}</strong>
                          <small>{getRoleLabel(record.role)}</small>
                        </div>
                      </td>
                      <td>{record.position || getRoleLabel(record.role)}</td>
                      <td>{formatThaiTime(record.check_in_at)}</td>
                      <td>{formatThaiTime(record.check_out_at)}</td>
                      <td>
                        <span
                          className={`${styles.badge} ${
                            styles[`badge_${attendanceStatus.tone}`]
                          }`}
                        >
                          <i />
                          {attendanceStatus.label}
                        </span>
                      </td>
                      <td>
                        <span
                          className={`${styles.reviewBadge} ${
                            styles[`review_${reviewStatus.tone}`]
                          }`}
                        >
                          {reviewStatus.label}
                        </span>
                      </td>
                      <td>{record.note || "-"}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <footer className={styles.tableFooter}>
          แสดง {filteredRecords.length} รายการ วันที่{" "}
          {formatThaiShortDate(selectedDate)}
        </footer>
      </section>
    </main>
  );
}
