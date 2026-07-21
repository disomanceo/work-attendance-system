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
  daily_status?: "present" | "sick" | "personal" | "official_duty" | "absent";
};

type AttendanceSummary = {
  total: number;
  totalPersonnel?: number;
  present?: number;
  sickLeave?: number;
  personalLeave?: number;
  officialDuty?: number;
  absent?: number;
  complete: number;
  late: number;
  early: number;
  incomplete: number;
  pendingReview?: number;
};

type AttendanceApiResponse = {
  ok: boolean;
  message?: string;
  summary?: AttendanceSummary;
  records?: AttendanceReportRecord[];
};

type DailyPdfInfo = {
  ok: boolean;
  found: boolean;
  message?: string;
  fileName?: string;
  size?: string;
  modifiedTime?: string;
};

type ReportMode = "daily" | "weekly" | "monthly";

type WeeklyPdfPeriod = {
  startDay: number;
  endDay: number;
  found: boolean;
  fileName?: string;
};

type MonthFileStatus = {
  ok: boolean;
  dailyPdfDays: number[];
  weeklyPdfPeriods: WeeklyPdfPeriod[];
  monthlyPdfFound: boolean;
  monthClosed: boolean;
  canCloseMonth: boolean;
  monthlyFileName?: string;
  message?: string;
};

const THAI_MONTHS = [
  "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
  "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม",
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

function getWeeklyPeriods(daysInMonth: number) {
  return [
    { startDay: 1, endDay: Math.min(7, daysInMonth) },
    { startDay: 8, endDay: Math.min(14, daysInMonth) },
    { startDay: 15, endDay: Math.min(21, daysInMonth) },
    { startDay: 22, endDay: daysInMonth },
  ].filter((period) => period.startDay <= period.endDay);
}

function formatThaiLongDate(value: string) {
  return new Intl.DateTimeFormat("th-TH", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(parseLocalDate(value));
}

function formatThaiShortDate(value: string) {
  return new Intl.DateTimeFormat("th-TH", {
    day: "numeric",
    month: "short",
    year: "2-digit",
  }).format(parseLocalDate(value));
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
  if (record.daily_status === "sick" || record.check_in_status === "sick") {
    return { label: "ลาป่วย", tone: "leave" as const };
  }
  if (record.daily_status === "personal" || record.check_in_status === "personal") {
    return { label: "ลากิจ", tone: "leave" as const };
  }
  if (
    record.daily_status === "official_duty" ||
    record.check_in_status === "official_duty"
  ) {
    return { label: "ไปราชการ", tone: "duty" as const };
  }
  if (record.check_in_status === "official_duty_morning") {
    return { label: "ไปราชการช่วงเช้า", tone: "duty" as const };
  }
  if (record.check_in_status === "alternate_workplace") {
    return { label: "มาปฏิบัติราชการ", tone: "success" as const };
  }
  if (record.daily_status === "absent" || record.check_in_status === "absent") {
    return { label: "ไม่มาปฏิบัติราชการ", tone: "danger" as const };
  }
  if (!record.check_in_at) {
    return { label: "ไม่มาปฏิบัติราชการ", tone: "danger" as const };
  }
  if (record.check_in_status === "late") {
    return { label: "มาสาย", tone: "warning" as const };
  }
  if (record.check_out_status === "early") {
    return { label: "ออกก่อนเวลา", tone: "warning" as const };
  }
  return { label: "ปกติ", tone: "success" as const };
}


function DownloadIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 3v11m0 0 4-4m-4 4-4-4M5 17v2a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-2" />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M7 3v3M17 3v3M4.5 9.5h15M6 5h12a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z" />
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
  const [reportMode, setReportMode] = useState<ReportMode>("daily");
  const [buildingMonthly, setBuildingMonthly] = useState(false);
  const [closingMonth, setClosingMonth] = useState(false);
  const [monthFileStatus, setMonthFileStatus] = useState<MonthFileStatus>({
    ok: true,
    dailyPdfDays: [],
    weeklyPdfPeriods: [],
    monthlyPdfFound: false,
    monthClosed: false,
    canCloseMonth: false,
  });
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [calendarYear, setCalendarYear] = useState(initialDate.getFullYear());
  const [calendarMonth, setCalendarMonth] = useState(initialDate.getMonth());
  const [records, setRecords] = useState<AttendanceReportRecord[]>([]);
  const [summary, setSummary] = useState<AttendanceSummary>({
    total: 0, complete: 0, late: 0, early: 0, incomplete: 0,
  });
  const [searchText, setSearchText] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [loadingPdf, setLoadingPdf] = useState(false);
  const [deletingDailyPdf, setDeletingDailyPdf] = useState(false);
  const [buildingDailyPdf, setBuildingDailyPdf] = useState(false);
  const [buildingWeeklyKey, setBuildingWeeklyKey] = useState("");
  const [pdfInfo, setPdfInfo] = useState<DailyPdfInfo | null>(null);
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState("");
  const [message, setMessage] = useState("");

  const selectedDateParts = useMemo(() => {
    const date = parseLocalDate(selectedDate);
    return {
      year: date.getFullYear(),
      monthIndex: date.getMonth(),
      day: date.getDate(),
    };
  }, [selectedDate]);

  const daysInSelectedMonth = useMemo(
    () =>
      new Date(
        selectedDateParts.year,
        selectedDateParts.monthIndex + 1,
        0
      ).getDate(),
    [selectedDateParts]
  );

  const weeklyPeriods = useMemo(
    () => getWeeklyPeriods(daysInSelectedMonth),
    [daysInSelectedMonth]
  );

  const selectedWeeklyPeriod = useMemo(
    () =>
      weeklyPeriods.find(
        (period) =>
          selectedDateParts.day >= period.startDay &&
          selectedDateParts.day <= period.endDay
      ) ?? weeklyPeriods[0],
    [selectedDateParts.day, weeklyPeriods]
  );

  const selectedMonthValue = `${selectedDateParts.year}-${String(
    selectedDateParts.monthIndex + 1
  ).padStart(2, "0")}`;

  function chooseDayFromStrip(day: number) {
    setReportMode("daily");
    chooseDate(
      toIsoDate(
        selectedDateParts.year,
        selectedDateParts.monthIndex,
        day
      )
    );
  }

  function chooseMonthlyReport() {
    setReportMode("monthly");
    setCalendarOpen(false);
  }

  function chooseWeeklyReport(period: { startDay: number; endDay: number }) {
    setReportMode("weekly");
    chooseDate(
      toIsoDate(
        selectedDateParts.year,
        selectedDateParts.monthIndex,
        period.startDay
      )
    );
    setReportMode("weekly");
    setCalendarOpen(false);
  }


  const loadMonthStatus = useCallback(async () => {
    try {
      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError || !session?.access_token) {
        return;
      }

      const response = await fetch(
        `/api/admin/attendance/monthly-pdf?month=${encodeURIComponent(
          selectedMonthValue
        )}&mode=status`,
        {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
          cache: "no-store",
        }
      );

      const result = (await response.json()) as MonthFileStatus;

      if (!response.ok || !result.ok) {
        throw new Error(
          result.message || "ไม่สามารถตรวจสอบสถานะไฟล์ประจำเดือนได้"
        );
      }

      setMonthFileStatus({
        ...result,
        dailyPdfDays: Array.isArray(result.dailyPdfDays)
          ? result.dailyPdfDays
          : [],
        weeklyPdfPeriods: Array.isArray(result.weeklyPdfPeriods)
          ? result.weeklyPdfPeriods
          : [],
      });
    } catch (error) {
      console.error("Load month file status error:", error);
      setMonthFileStatus({
        ok: false,
        dailyPdfDays: [],
        weeklyPdfPeriods: [],
        monthlyPdfFound: false,
        monthClosed: false,
        canCloseMonth: false,
        message:
          error instanceof Error
            ? error.message
            : "ไม่สามารถตรวจสอบสถานะไฟล์ประจำเดือนได้",
      });
    }
  }, [selectedMonthValue, supabase]);

  useEffect(() => {
    void loadMonthStatus();
  }, [loadMonthStatus]);

  const loadReport = useCallback(async () => {
    setLoading(true);
    setMessage("");

    try {
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();

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
        headers: { Authorization: `Bearer ${session.access_token}` },
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
          router.replace("/attendance");
          return;
        }
        throw new Error(result.message || "ไม่สามารถโหลดประวัติการลงเวลาได้");
      }

      setRecords(result.records ?? []);
      setSummary(result.summary ?? {
        total: 0, complete: 0, late: 0, early: 0, incomplete: 0,
      });
    } catch (error) {
      console.error(error);
      setRecords([]);
      setMessage(error instanceof Error ? error.message : "ไม่สามารถโหลดประวัติการลงเวลาได้");
    } finally {
      setLoading(false);
    }
  }, [router, selectedDate, supabase]);

  useEffect(() => {
    void loadReport();
  }, [loadReport]);

  const loadReportPdf = useCallback(async () => {
    setLoadingPdf(true);
    setPdfInfo(null);

    if (pdfPreviewUrl) {
      URL.revokeObjectURL(pdfPreviewUrl);
      setPdfPreviewUrl("");
    }

    try {
      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError || !session?.access_token) {
        router.replace("/login");
        return;
      }

      const metadataEndpoint =
        reportMode === "monthly"
          ? `/api/admin/attendance/monthly-pdf?month=${encodeURIComponent(selectedMonthValue)}&mode=metadata`
          : reportMode === "weekly" && selectedWeeklyPeriod
            ? `/api/admin/attendance/monthly-pdf?month=${encodeURIComponent(selectedMonthValue)}&mode=weekly-metadata&startDay=${selectedWeeklyPeriod.startDay}&endDay=${selectedWeeklyPeriod.endDay}`
          : `/api/admin/attendance/daily-pdf?date=${encodeURIComponent(selectedDate)}&mode=metadata`;

      const metadataResponse = await fetch(
        metadataEndpoint,
        {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
          cache: "no-store",
        }
      );

      const metadata = (await metadataResponse.json()) as DailyPdfInfo;

      if (!metadataResponse.ok) {
        throw new Error(metadata.message || "ไม่สามารถตรวจสอบไฟล์ PDF รายวันได้");
      }

      setPdfInfo(metadata);

      if (!metadata.found) {
        return;
      }

      const fileEndpoint =
        reportMode === "monthly"
          ? `/api/admin/attendance/monthly-pdf?month=${encodeURIComponent(selectedMonthValue)}&mode=file`
          : reportMode === "weekly" && selectedWeeklyPeriod
            ? `/api/admin/attendance/monthly-pdf?month=${encodeURIComponent(selectedMonthValue)}&mode=weekly-file&startDay=${selectedWeeklyPeriod.startDay}&endDay=${selectedWeeklyPeriod.endDay}`
          : `/api/admin/attendance/daily-pdf?date=${encodeURIComponent(selectedDate)}&mode=file`;

      const fileResponse = await fetch(
        fileEndpoint,
        {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
          cache: "no-store",
        }
      );

      if (!fileResponse.ok) {
        const result = (await fileResponse.json().catch(() => null)) as
          | { message?: string }
          | null;
        throw new Error(result?.message || "ไม่สามารถโหลดตัวอย่าง PDF ได้");
      }

      const blob = await fileResponse.blob();
      setPdfPreviewUrl(URL.createObjectURL(blob));
    } catch (error) {
      console.error("Load report PDF error:", error);
      setPdfInfo({
        ok: false,
        found: false,
        message:
          error instanceof Error
            ? error.message
            : "ไม่สามารถโหลดไฟล์ PDF รายวันได้",
      });
    } finally {
      setLoadingPdf(false);
    }
  }, [pdfPreviewUrl, reportMode, router, selectedDate, selectedMonthValue, selectedWeeklyPeriod, supabase]);

  useEffect(() => {
    void loadReportPdf();

    return () => {
      if (pdfPreviewUrl) {
        URL.revokeObjectURL(pdfPreviewUrl);
      }
    };
    // pdfPreviewUrl is intentionally omitted to avoid an endless reload loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate, reportMode]);

  useEffect(() => {
    function closeCalendar(event: MouseEvent) {
      if (calendarRef.current && !calendarRef.current.contains(event.target as Node)) {
        setCalendarOpen(false);
      }
    }
    document.addEventListener("mousedown", closeCalendar);
    return () => document.removeEventListener("mousedown", closeCalendar);
  }, []);

  const filteredRecords = useMemo(() => {
    const keyword = searchText.trim().toLowerCase();

    return records
      .filter((record) => Boolean(record.check_in_at))
      .filter((record) => {
        const attendanceStatus = getAttendanceStatus(record);

        const matchesSearch =
          !keyword ||
          record.full_name.toLowerCase().includes(keyword) ||
          (record.position ?? "").toLowerCase().includes(keyword) ||
          getRoleLabel(record.role).toLowerCase().includes(keyword);

        const matchesStatus =
          statusFilter === "all" ||
          (statusFilter === "normal" &&
            attendanceStatus.label === "ปกติ") ||
          (statusFilter === "late" &&
            attendanceStatus.label === "มาสาย") ||
          (statusFilter === "sick" &&
            attendanceStatus.label === "ลาป่วย") ||
          (statusFilter === "personal" &&
            attendanceStatus.label === "ลากิจ") ||
          (statusFilter === "official_duty" &&
            attendanceStatus.label === "ไปราชการ") ||
          (statusFilter === "absent" &&
            attendanceStatus.label === "ไม่มาปฏิบัติราชการ");

        return matchesSearch && matchesStatus;
      })
      .sort((left, right) => {
        const leftTime = left.check_in_at
          ? new Date(left.check_in_at).getTime()
          : Number.POSITIVE_INFINITY;

        const rightTime = right.check_in_at
          ? new Date(right.check_in_at).getTime()
          : Number.POSITIVE_INFINITY;

        if (leftTime !== rightTime) {
          return leftTime - rightTime;
        }

        return left.full_name.localeCompare(right.full_name, "th");
      });
  }, [records, searchText, statusFilter]);

  const filteredStatusRecords = useMemo(() => {
    const keyword = searchText.trim().toLowerCase();

    return records
      .filter((record) => !record.check_in_at)
      .filter((record) => {
        const attendanceStatus = getAttendanceStatus(record);

        const matchesSearch =
          !keyword ||
          record.full_name.toLowerCase().includes(keyword) ||
          (record.position ?? "").toLowerCase().includes(keyword) ||
          getRoleLabel(record.role).toLowerCase().includes(keyword);

        const matchesStatus =
          statusFilter === "all" ||
          statusFilter === "normal" ||
          statusFilter === "late" ||
          (statusFilter === "sick" &&
            attendanceStatus.label === "ลาป่วย") ||
          (statusFilter === "personal" &&
            attendanceStatus.label === "ลากิจ") ||
          (statusFilter === "official_duty" &&
            attendanceStatus.label === "ไปราชการ") ||
          (statusFilter === "absent" &&
            attendanceStatus.label === "ไม่มาปฏิบัติราชการ");

        return matchesSearch && matchesStatus;
      })
      .sort((left, right) => {
        const leftStatus = getAttendanceStatus(left).label;
        const rightStatus = getAttendanceStatus(right).label;

        if (leftStatus !== rightStatus) {
          return leftStatus.localeCompare(rightStatus, "th");
        }

        return left.full_name.localeCompare(right.full_name, "th");
      });
  }, [records, searchText, statusFilter]);

  const statusNoteText = useMemo(() => {
    if (filteredStatusRecords.length === 0) {
      return "";
    }

    return filteredStatusRecords
      .map((record) => {
        if (
          record.check_in_status === "alternate_workplace" &&
          record.note?.trim()
        ) {
          return `${record.full_name} (${record.note.trim()})`;
        }

        const status = getAttendanceStatus(record);
        return `${record.full_name} (${status.label})`;
      })
      .join(", ");
  }, [filteredStatusRecords]);



  const calendarDays = useMemo(() => {
    const firstDay = new Date(calendarYear, calendarMonth, 1).getDay();
    const daysInMonth = new Date(calendarYear, calendarMonth + 1, 0).getDate();
    const previousMonthDays = new Date(calendarYear, calendarMonth, 0).getDate();

    return Array.from({ length: 42 }, (_, index) => {
      const rawDay = index - firstDay + 1;
      if (rawDay < 1) {
        const date = new Date(calendarYear, calendarMonth - 1, previousMonthDays + rawDay);
        return { date, iso: toIsoDate(date.getFullYear(), date.getMonth(), date.getDate()), outside: true };
      }
      if (rawDay > daysInMonth) {
        const date = new Date(calendarYear, calendarMonth + 1, rawDay - daysInMonth);
        return { date, iso: toIsoDate(date.getFullYear(), date.getMonth(), date.getDate()), outside: true };
      }
      const date = new Date(calendarYear, calendarMonth, rawDay);
      return { date, iso: toIsoDate(calendarYear, calendarMonth, rawDay), outside: false };
    });
  }, [calendarMonth, calendarYear]);

  function chooseDate(iso: string) {
    const date = parseLocalDate(iso);
    setReportMode("daily");
    setSelectedDate(iso);
    setCalendarYear(date.getFullYear());
    setCalendarMonth(date.getMonth());
    setCalendarOpen(false);
  }

  function changeMonth(offset: number) {
    const date = new Date(calendarYear, calendarMonth + offset, 1);
    setCalendarYear(date.getFullYear());
    setCalendarMonth(date.getMonth());
  }

  function exportCsv() {
    if (filteredRecords.length === 0) {
      setMessage("ไม่มีข้อมูลสำหรับส่งออก");
      return;
    }

    const headers = [
      "ลำดับ", "วันที่", "ชื่อ-นามสกุล", "ตำแหน่ง", "บทบาท",
      "เวลาเข้า", "สถานะ", "หมายเหตุ",
    ];

    const rows = filteredRecords.map((record, index) => [
      index + 1,
      formatThaiShortDate(record.work_date),
      record.full_name,
      record.position ?? "",
      getRoleLabel(record.role),
      formatThaiTime(record.check_in_at),
      getAttendanceStatus(record).label,
      record.note ?? "",
    ]);

    const csv = [headers, ...rows]
      .map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(","))
      .join("\n");

    const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `attendance-${selectedDate}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    setMessage("ดาวน์โหลด CSV เรียบร้อยแล้ว");
  }

  async function downloadReportPdf() {
    if (!pdfInfo?.found) {
      setMessage(
        pdfInfo?.message ||
          "ยังไม่พบรายงาน PDF ประจำวันที่เลือก ระบบอาจยังไม่ได้สร้างรายงานประจำวัน"
      );
      return;
    }

    setLoadingPdf(true);
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

      const endpoint =
        reportMode === "monthly"
          ? `/api/admin/attendance/monthly-pdf?month=${encodeURIComponent(selectedMonthValue)}&mode=file`
          : reportMode === "weekly" && selectedWeeklyPeriod
            ? `/api/admin/attendance/monthly-pdf?month=${encodeURIComponent(selectedMonthValue)}&mode=weekly-file&startDay=${selectedWeeklyPeriod.startDay}&endDay=${selectedWeeklyPeriod.endDay}`
          : `/api/admin/attendance/daily-pdf?date=${encodeURIComponent(selectedDate)}&mode=file`;

      const response = await fetch(
        endpoint,
        {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
          cache: "no-store",
        }
      );

      if (!response.ok) {
        const result = (await response.json().catch(() => null)) as
          | { message?: string }
          | null;
        throw new Error(result?.message || "ไม่สามารถดาวน์โหลด PDF ได้");
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");

      link.href = url;
      link.download =
        pdfInfo.fileName ||
        (reportMode === "monthly"
          ? `บัญชีลงเวลาปฏิบัติราชการ_${THAI_MONTHS[selectedDateParts.monthIndex]}_${selectedDateParts.year + 543}.pdf`
          : reportMode === "weekly" && selectedWeeklyPeriod
            ? `บัญชีลงเวลาปฏิบัติราชการ_${selectedWeeklyPeriod.startDay}-${selectedWeeklyPeriod.endDay}_${THAI_MONTHS[selectedDateParts.monthIndex]}_${selectedDateParts.year + 543}.pdf`
          : `บัญชีลงเวลาปฏิบัติราชการ_${selectedDate}.pdf`);

      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);

      setMessage(`ดาวน์โหลด ${link.download} เรียบร้อยแล้ว`);
    } catch (error) {
      console.error("Download daily PDF error:", error);
      setMessage(
        error instanceof Error
          ? error.message
          : "ไม่สามารถดาวน์โหลดรายงาน PDF ได้"
      );
    } finally {
      setLoadingPdf(false);
    }
  }

  async function buildSelectedDailyPdf() {
    if (reportMode !== "daily") {
      return;
    }

    if (monthFileStatus.monthClosed) {
      setMessage("เดือนนี้ปิดแล้ว ไม่สามารถสร้าง PDF รายวันเพิ่มได้");
      return;
    }

    if (pdfInfo?.found) {
      const confirmed = window.confirm(
        `วันที่ ${formatThaiLongDate(
          selectedDate
        )} มี PDF อยู่แล้ว\n\nต้องการสร้างใหม่และแทนที่ไฟล์เดิมหรือไม่?`
      );

      if (!confirmed) {
        return;
      }
    }

    setBuildingDailyPdf(true);
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

      const response = await fetch(
        `/api/admin/attendance/daily-pdf?date=${encodeURIComponent(
          selectedDate
        )}&mode=build`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
          cache: "no-store",
        }
      );

      const result = (await response.json()) as {
        ok?: boolean;
        message?: string;
        fileName?: string;
        recordCount?: number;
        replaced?: boolean;
      };

      if (!response.ok || !result.ok) {
        throw new Error(
          result.message || "ไม่สามารถสร้าง PDF รายวันได้"
        );
      }

      setMessage(
        `${result.message || "สร้าง PDF รายวันเรียบร้อยแล้ว"} — ${
          result.recordCount ?? 0
        } รายการ`
      );

      await loadMonthStatus();
      await loadReportPdf();
    } catch (error) {
      console.error("Build daily PDF error:", error);
      setMessage(
        error instanceof Error
          ? error.message
          : "ไม่สามารถสร้าง PDF รายวันได้"
      );
    } finally {
      setBuildingDailyPdf(false);
    }
  }

  async function deleteSelectedDailyPdf() {
    if (reportMode !== "daily" || !pdfInfo?.found) {
      setMessage("วันที่เลือกยังไม่มีไฟล์ PDF ให้ลบ");
      return;
    }

    const confirmed = window.confirm(
      `ยืนยันลบไฟล์ PDF วันที่ ${formatThaiLongDate(
        selectedDate
      )}?\n\nไฟล์จะถูกย้ายไปถังขยะใน Google Drive และสามารถสร้างใหม่ภายหลังได้`
    );

    if (!confirmed) {
      return;
    }

    setDeletingDailyPdf(true);
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

      const response = await fetch(
        `/api/admin/attendance/daily-pdf?date=${encodeURIComponent(
          selectedDate
        )}&mode=delete`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
          cache: "no-store",
        }
      );

      const result = (await response.json()) as {
        ok?: boolean;
        deleted?: boolean;
        message?: string;
        fileName?: string;
      };

      if (!response.ok || !result.ok) {
        throw new Error(result.message || "ไม่สามารถลบ PDF รายวันได้");
      }

      if (pdfPreviewUrl) {
        URL.revokeObjectURL(pdfPreviewUrl);
      }

      setPdfPreviewUrl("");
      setPdfInfo({
        ok: true,
        found: false,
        message: "ลบไฟล์ PDF รายวันแล้ว",
      });
      setMessage(
        result.message ||
          `ย้าย ${result.fileName || "PDF รายวัน"} ไปถังขยะเรียบร้อยแล้ว`
      );

      await loadMonthStatus();
    } catch (error) {
      console.error("Delete daily PDF error:", error);
      setMessage(
        error instanceof Error ? error.message : "ไม่สามารถลบ PDF รายวันได้"
      );
    } finally {
      setDeletingDailyPdf(false);
    }
  }

  async function buildWeeklyReport(period: { startDay: number; endDay: number }) {
    const key = `${period.startDay}-${period.endDay}`;
    setBuildingWeeklyKey(key);
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

      const response = await fetch(
        `/api/admin/attendance/monthly-pdf?month=${encodeURIComponent(
          selectedMonthValue
        )}&mode=build-weekly&startDay=${period.startDay}&endDay=${period.endDay}`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
          cache: "no-store",
        }
      );

      const result = (await response.json()) as {
        ok?: boolean;
        message?: string;
        fileName?: string;
        includedDays?: number[];
        missingDays?: number[];
      };

      if (!response.ok || !result.ok) {
        throw new Error(
          result.message || "ไม่สามารถสร้างรายงานรวมสัปดาห์ได้"
        );
      }

      chooseWeeklyReport(period);
      setMessage(
        `${result.message || "สร้างรายงานรวมสัปดาห์เรียบร้อยแล้ว"}${
          result.missingDays?.length
            ? ` — วันที่ยังไม่มีรายงาน: ${result.missingDays.join(", ")}`
            : ""
        }`
      );

      await loadMonthStatus();
    } catch (error) {
      console.error("Build weekly report error:", error);
      setMessage(
        error instanceof Error
          ? error.message
          : "ไม่สามารถสร้างรายงานรวมสัปดาห์ได้"
      );
    } finally {
      setBuildingWeeklyKey("");
    }
  }

  async function buildMonthlyReport() {
    setBuildingMonthly(true);
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

      const response = await fetch(
        `/api/admin/attendance/monthly-pdf?month=${encodeURIComponent(
          selectedMonthValue
        )}&mode=build`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
          cache: "no-store",
        }
      );

      const result = (await response.json()) as {
        ok?: boolean;
        message?: string;
        fileName?: string;
        includedDays?: number[];
        missingDays?: number[];
      };

      if (!response.ok || !result.ok) {
        throw new Error(
          result.message || "ไม่สามารถสร้างรายงานรวมเดือนได้"
        );
      }

      setReportMode("monthly");
      setMessage(
        `${result.message || "สร้างรายงานรวมเดือนเรียบร้อยแล้ว"}${
          result.missingDays?.length
            ? ` — วันที่ยังไม่มีรายงาน: ${result.missingDays.join(", ")}`
            : ""
        }`
      );

      await loadMonthStatus();
      await loadReportPdf();
    } catch (error) {
      console.error("Build monthly report error:", error);
      setMessage(
        error instanceof Error
          ? error.message
          : "ไม่สามารถสร้างรายงานรวมเดือนได้"
      );
    } finally {
      setBuildingMonthly(false);
    }
  }


  async function closeMonthAndDeleteDailyFiles() {
    if (!monthFileStatus.monthlyPdfFound) {
      setMessage("ต้องสร้าง PDF รวมเดือนให้สำเร็จก่อนปิดเดือน");
      return;
    }

    if (!monthFileStatus.canCloseMonth) {
      setMessage(
        "ยังไม่สามารถปิดเดือนนี้ได้ ระบบอนุญาตเมื่อเดือนสิ้นสุดแล้วเท่านั้น"
      );
      return;
    }

    const confirmed = window.confirm(
      `ยืนยันปิดเดือน${THAI_MONTHS[selectedDateParts.monthIndex]} ${
        selectedDateParts.year + 543
      }?\n\nระบบจะย้าย PDF รายวันและ Google Docs รายวันไปถังขยะ และเก็บ PDF รวมเดือนไว้เพียงไฟล์เดียว`
    );

    if (!confirmed) {
      return;
    }

    setClosingMonth(true);
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

      const response = await fetch(
        `/api/admin/attendance/monthly-pdf?month=${encodeURIComponent(
          selectedMonthValue
        )}&mode=close`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
          cache: "no-store",
        }
      );

      const result = (await response.json()) as {
        ok?: boolean;
        message?: string;
        deletedDailyPdfs?: number;
        deletedDailyDocs?: number;
        deletedMonthlyDocs?: number;
      };

      if (!response.ok || !result.ok) {
        throw new Error(result.message || "ไม่สามารถปิดเดือนได้");
      }

      setReportMode("monthly");
      setMessage(
        `${result.message || "ปิดเดือนเรียบร้อยแล้ว"} — ลบ PDF รายวัน ${
          result.deletedDailyPdfs ?? 0
        } ไฟล์ และ Google Docs ${(
          (result.deletedDailyDocs ?? 0) +
          (result.deletedMonthlyDocs ?? 0)
        )} ไฟล์`
      );

      await loadMonthStatus();
      await loadReportPdf();
    } catch (error) {
      console.error("Close month error:", error);
      setMessage(
        error instanceof Error ? error.message : "ไม่สามารถปิดเดือนได้"
      );
    } finally {
      setClosingMonth(false);
    }
  }

  return (
    <main className={styles.page}>
      <section className={styles.panel}>
        <header className={styles.pageHeader}>
          <div>
            <p className={styles.eyebrow}>DAILY ATTENDANCE REPORT</p>
            <h1>การลงเวลาปฏิบัติงาน</h1>
            <p className={styles.subtitle}>ตรวจสอบสถานะการมาปฏิบัติราชการของบุคลากรโรงเรียนวัดไผ่มุ้ง</p>
          </div>
</header>

        <nav className={styles.attendanceTabs} aria-label="มุมมองการลงเวลา">
          <button
            type="button"
            className={styles.attendanceTab}
            onClick={() => router.push("/attendance/history")}
          >
            การลงเวลาของฉัน
          </button>
          <button type="button" className={styles.activeAttendanceTab}>
            การลงเวลาของโรงเรียน
          </button>
        </nav>

        <section className={styles.filterPanel}>
          <div className={styles.datePickerWrap} ref={calendarRef}>
            <label>เลือกวันที่</label>
            <button
              type="button"
              className={styles.dateButton}
              onClick={() => setCalendarOpen((value) => !value)}
            >
              <CalendarIcon />
              <strong>{formatThaiLongDate(selectedDate)}</strong>
              <span>⌄</span>
            </button>

            {calendarOpen && (
              <div className={styles.calendar}>
                <div className={styles.calendarHeader}>
                  <button type="button" onClick={() => changeMonth(-1)}>‹</button>
                  <strong>{THAI_MONTHS[calendarMonth]} {calendarYear + 543}</strong>
                  <button type="button" onClick={() => changeMonth(1)}>›</button>
                </div>
                <div className={styles.weekdayGrid}>
                  {THAI_WEEKDAYS.map((day) => <span key={day}>{day}</span>)}
                </div>
                <div className={styles.dayGrid}>
                  {calendarDays.map(({ date, iso, outside }) => (
                    <button
                      key={iso}
                      type="button"
                      className={[
                        outside ? styles.outsideDay : "",
                        iso === today ? styles.today : "",
                        iso === selectedDate ? styles.selectedDay : "",
                      ].filter(Boolean).join(" ")}
                      onClick={() => chooseDate(iso)}
                    >
                      {date.getDate()}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className={styles.field}>
            <label>ค้นหาบุคลากร</label>
            <input
              type="search"
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
              placeholder="ชื่อ-นามสกุล หรือตำแหน่ง"
            />
          </div>

          <div className={styles.field}>
            <label>สถานะการลงเวลา</label>
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              <option value="all">ทั้งหมด</option>
              <option value="normal">ปกติ</option>
              <option value="late">มาสาย</option>
              <option value="sick">ลาป่วย</option>
              <option value="personal">ลากิจ</option>
              <option value="official_duty">ไปราชการ</option>
              <option value="absent">ไม่มาปฏิบัติราชการ</option>
            </select>
          </div>

          <div className={styles.exportActions}>
            <button type="button" className={styles.csvButton} onClick={exportCsv} disabled={loading}>
              <DownloadIcon /> ดาวน์โหลด CSV
            </button>
            
          </div>
        </section>

        <section className={styles.monthReportPanel}>
          <div className={styles.monthReportHeader}>
            <div>
              <strong>
                {THAI_MONTHS[selectedDateParts.monthIndex]}{" "}
                {selectedDateParts.year + 543}
              </strong>
              <span>เลือกวันที่เพื่อดูรายงานรายวัน หรือสร้าง PDF รวมเดือน</span>
            </div>
            <div className={styles.monthActionButtons}>
              <div className={styles.weekReportButtons}>
                {weeklyPeriods.map((period) => {
                  const key = `${period.startDay}-${period.endDay}`;
                  const status = monthFileStatus.weeklyPdfPeriods.find(
                    (item) =>
                      item.startDay === period.startDay &&
                      item.endDay === period.endDay
                  );
                  const found = Boolean(status?.found);
                  const active =
                    reportMode === "weekly" &&
                    selectedWeeklyPeriod?.startDay === period.startDay &&
                    selectedWeeklyPeriod?.endDay === period.endDay;

                  return (
                    <button
                      key={key}
                      type="button"
                      className={[
                        styles.weekReportButton,
                        found ? styles.weekReportReady : styles.weekReportMissing,
                        active ? styles.weekReportActive : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                      onClick={() =>
                        found ? chooseWeeklyReport(period) : buildWeeklyReport(period)
                      }
                      disabled={Boolean(buildingWeeklyKey)}
                      title={
                        found
                          ? `ช่วง ${key}: มี PDF รวมช่วงแล้ว`
                          : `ช่วง ${key}: ยังไม่มี PDF กดเพื่อสร้าง`
                      }
                    >
                      <span>{key}</span>
                      <small>
                        {buildingWeeklyKey === key
                          ? "กำลังสร้าง"
                          : found
                            ? "พร้อม"
                            : "ยังไม่มี"}
                      </small>
                    </button>
                  );
                })}
              </div>

              {selectedWeeklyPeriod && (
                <button
                  type="button"
                  className={styles.buildWeekButton}
                  onClick={() => {
                    const key = `${selectedWeeklyPeriod.startDay}-${selectedWeeklyPeriod.endDay}`;
                    const found = monthFileStatus.weeklyPdfPeriods.some(
                      (item) =>
                        item.startDay === selectedWeeklyPeriod.startDay &&
                        item.endDay === selectedWeeklyPeriod.endDay &&
                        item.found
                    );

                    if (
                      found &&
                      !window.confirm(
                        `ช่วงวันที่ ${key} มี PDF รายสัปดาห์อยู่แล้ว\n\nต้องการสร้างใหม่และแทนที่ไฟล์เดิมหรือไม่?`
                      )
                    ) {
                      return;
                    }

                    void buildWeeklyReport(selectedWeeklyPeriod);
                  }}
                  disabled={
                    Boolean(buildingWeeklyKey) ||
                    buildingMonthly ||
                    closingMonth ||
                    monthFileStatus.monthClosed
                  }
                  title={`สร้าง PDF รายสัปดาห์ช่วง ${selectedWeeklyPeriod.startDay}-${selectedWeeklyPeriod.endDay}`}
                >
                  {buildingWeeklyKey ===
                  `${selectedWeeklyPeriod.startDay}-${selectedWeeklyPeriod.endDay}`
                    ? "กำลังสร้าง PDF รายสัปดาห์..."
                    : `สร้าง PDF รายสัปดาห์ ${selectedWeeklyPeriod.startDay}-${selectedWeeklyPeriod.endDay}`}
                </button>
              )}

              <button
                type="button"
                className={[
                  styles.buildMonthButton,
                  monthFileStatus.monthlyPdfFound
                    ? styles.monthReportReady
                    : styles.monthReportMissing,
                  reportMode === "monthly" ? styles.monthReportActive : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                onClick={
                  monthFileStatus.monthlyPdfFound
                    ? chooseMonthlyReport
                    : buildMonthlyReport
                }
                disabled={buildingMonthly || closingMonth || monthFileStatus.monthClosed}
                title={
                  monthFileStatus.monthlyPdfFound
                    ? "มี PDF รวมเดือนแล้ว กดเพื่อเปิดดู"
                    : "ยังไม่มี PDF รวมเดือน กดเพื่อสร้าง"
                }
              >
                {buildingMonthly
                  ? "กำลังสร้าง PDF รวมเดือน..."
                  : monthFileStatus.monthClosed
                    ? "ปิดเดือนแล้ว"
                    : monthFileStatus.monthlyPdfFound
                      ? "PDF รวมเดือนพร้อม"
                      : "สร้าง PDF รวมเดือน"}
              </button>
</div>
          </div>

          <div className={styles.monthDayStrip}>
            {Array.from(
              { length: daysInSelectedMonth },
              (_, index) => index + 1
            ).map((day) => {
              const active =
                reportMode === "daily" &&
                selectedDateParts.day === day;

              return (
                <button
                  key={day}
                  type="button"
                  className={[
                    active ? styles.activeMonthDay : "",
                    monthFileStatus.dailyPdfDays.includes(day)
                      ? styles.dayHasPdf
                      : styles.dayNoPdf,
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  onClick={() => chooseDayFromStrip(day)}
                  title={
                    monthFileStatus.dailyPdfDays.includes(day)
                      ? `วันที่ ${day}: มีไฟล์ PDF แล้ว`
                      : monthFileStatus.monthClosed
                        ? `วันที่ ${day}: เปิดจากไฟล์รวมเดือน`
                        : `วันที่ ${day}: ยังไม่มีไฟล์ PDF`
                  }
                >
                  <span>{day}</span>
                  {monthFileStatus.dailyPdfDays.includes(day) && (
                    <small>✓</small>
                  )}
                </button>
              );
            })}

            
          </div>

          <div className={styles.monthLegend}>
            <span><i className={styles.legendReady}></i> มี PDF รายวัน</span>
            <span><i className={styles.legendMissing}></i> ยังไม่มี PDF</span>
            <span><i className={styles.legendMonthly}></i> มี PDF รวมเดือน</span>
            {monthFileStatus.monthClosed && (
              <strong>🔒 ปิดเดือนแล้ว เหลือ PDF รวมเดือนเพียงไฟล์เดียว</strong>
            )}
          </div>
        </section>

        {message && <div className={styles.message}>{message}</div>}

        <div className={styles.contentGrid}>
          <div className={styles.leftColumn}>
                        <section className={styles.summaryCard}>
              <div className={styles.summaryTitleRow}>
                <div>
                  <p className={styles.summaryEyebrow}>DAILY PERSONNEL STATUS</p>
                  <h2>สรุปการมาปฏิบัติราชการประจำวัน</h2>
                  <p>ยอดหลักทั้ง 5 สถานะรวมกันเท่ากับจำนวนบุคลากรทั้งหมด</p>
                </div>
                <span className={styles.summaryDate}>{formatThaiLongDate(selectedDate)}</span>
              </div>

              <div className={styles.primarySummaryGrid}>
                <div className={styles.cardTotal}>
                  <span>บุคลากรทั้งหมด</span>
                  <strong>{summary.totalPersonnel ?? summary.total}<small>คน</small></strong>
                </div>
                <div className={styles.cardPresent}>
                  <span>มาปฏิบัติราชการ</span>
                  <strong>{summary.present ?? summary.complete}<small>คน</small></strong>
                </div>
                <div className={styles.cardSick}>
                  <span>ลาป่วย</span>
                  <strong>{summary.sickLeave ?? 0}<small>คน</small></strong>
                </div>
                <div className={styles.cardPersonal}>
                  <span>ลากิจ</span>
                  <strong>{summary.personalLeave ?? 0}<small>คน</small></strong>
                </div>
                <div className={styles.cardDuty}>
                  <span>ไปราชการ</span>
                  <strong>{summary.officialDuty ?? 0}<small>คน</small></strong>
                </div>
                <div className={styles.cardAbsent}>
                  <span>ไม่มาปฏิบัติราชการ</span>
                  <strong>{summary.absent ?? 0}<small>คน</small></strong>
                </div>
              </div>
            </section>

            <section className={styles.listCard}>
              <div className={styles.cardHeader}>
                <div>
                  <h2>รายชื่อผู้มาปฏิบัติงาน</h2>
                  <p>
                    {reportMode === "monthly"
                      ? `${THAI_MONTHS[selectedDateParts.monthIndex]} ${selectedDateParts.year + 543}`
                      : reportMode === "weekly" && selectedWeeklyPeriod
                        ? `${selectedWeeklyPeriod.startDay}-${selectedWeeklyPeriod.endDay} ${THAI_MONTHS[selectedDateParts.monthIndex]} ${selectedDateParts.year + 543}`
                        : formatThaiLongDate(selectedDate)}
                  </p>
                </div>
                <span>{filteredRecords.length} คนที่เช็กอินแล้ว</span>
              </div>

              <div className={styles.tableWrap}>
                <table>
                  <thead>
                    <tr>
                      <th>ลำดับ</th>
                      <th>ชื่อ-นามสกุล</th>
                      <th>ตำแหน่ง</th>
                      <th>เวลาเข้า</th>
                      <th>สถานะ</th>
                      <th>หมายเหตุ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      <tr><td colSpan={6} className={styles.emptyCell}>กำลังโหลดข้อมูล...</td></tr>
                    ) : filteredRecords.length === 0 ? (
                      <tr><td colSpan={6} className={styles.emptyCell}>ไม่พบข้อมูลในวันที่เลือก</td></tr>
                    ) : filteredRecords.map((record, index) => {
                      const status = getAttendanceStatus(record);
                      return (
                        <tr key={record.id}>
                          <td>{index + 1}</td>
                          <td className={styles.nameCell}>
                            <strong>{record.full_name}</strong>
                            <small>{getRoleLabel(record.role)}</small>
                          </td>
                          <td>{record.position || getRoleLabel(record.role)}</td>
                          <td>{formatThaiTime(record.check_in_at)}</td>
                          <td><span className={`${styles.badge} ${styles[`badge_${status.tone}`]}`}>{status.label}</span></td>
                          <td>{record.note || "-"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className={styles.statusNoteBox}>
                <strong>หมายเหตุ</strong>
                <p>
                  {loading
                    ? "กำลังโหลดข้อมูล..."
                    : statusNoteText || "ไม่มีรายการลา ไปราชการ หรือไม่มาปฏิบัติราชการ"}
                </p>
              </div>
            </section>
          </div>

          <aside className={styles.previewCard}>
            <div className={styles.previewHeader}>
              <div>
                <h2>
                  {reportMode === "monthly"
                    ? "รายงาน PDF รวมทั้งเดือน"
                    : reportMode === "weekly"
                      ? "รายงาน PDF รวมช่วง"
                      : "ไฟล์รายงาน PDF ที่บันทึกไว้"}
                </h2>
                <p>
                  {reportMode === "monthly"
                    ? `รวมรายงานเดือน${THAI_MONTHS[selectedDateParts.monthIndex]} ${selectedDateParts.year + 543}`
                    : reportMode === "weekly" && selectedWeeklyPeriod
                      ? `รวมรายงานวันที่ ${selectedWeeklyPeriod.startDay}-${selectedWeeklyPeriod.endDay} ${THAI_MONTHS[selectedDateParts.monthIndex]} ${selectedDateParts.year + 543}`
                      : "ไฟล์หลักฐานจาก Google Drive ประจำวันที่เลือก"}
                </p>
              </div>

              <div className={styles.previewActions}>
                <button
                  type="button"
                  onClick={downloadReportPdf}
                  disabled={loadingPdf || !pdfInfo?.found}
                >
                  <DownloadIcon />
                  ดาวน์โหลดไฟล์
                </button>

                {reportMode === "daily" && (
                  <button
                    type="button"
                    className={styles.previewBuildButton}
                    onClick={buildSelectedDailyPdf}
                    disabled={
                      buildingDailyPdf ||
                      deletingDailyPdf ||
                      monthFileStatus.monthClosed
                    }
                  >
                    {buildingDailyPdf
                      ? "กำลังสร้าง..."
                      : pdfInfo?.found
                        ? "สร้างใหม่"
                        : "สร้าง PDF"}
                  </button>
                )}

                {reportMode === "daily" && (
                  <button
                    type="button"
                    className={styles.previewDeleteButton}
                    onClick={deleteSelectedDailyPdf}
                    disabled={
                      deletingDailyPdf ||
                      loadingPdf ||
                      !pdfInfo?.found ||
                      monthFileStatus.monthClosed
                    }
                  >
                    {deletingDailyPdf ? "กำลังลบ..." : "ลบ PDF"}
                  </button>
                )}
              </div>
            </div>

            <div className={styles.driveFileStatus}>
              {loadingPdf ? (
                <div className={styles.pdfLoading}>
                  กำลังค้นหาไฟล์รายงานประจำวัน...
                </div>
              ) : pdfInfo?.found ? (
                <>
                  <div>
                    <span className={styles.fileIcon}>PDF</span>
                    <div>
                      <strong>{pdfInfo.fileName}</strong>
                      <small>
                        พบไฟล์ที่ระบบบันทึกไว้ใน Google Drive แล้ว
                      </small>
                    </div>
                  </div>
                  <span className={styles.fileFound}>พร้อมดาวน์โหลด</span>
                </>
              ) : (
                <div className={styles.pdfMissing}>
                  <strong>ยังไม่พบรายงาน PDF ประจำวันที่เลือก</strong>
                  <p>
                    {pdfInfo?.message ||
                      "ระบบอาจยังไม่ได้สร้างรายงานประจำวัน หรือยังไม่ได้บันทึกไฟล์ลง Google Drive"}
                  </p>
                </div>
              )}
            </div>

            <div className={styles.paperViewport}>
              {pdfPreviewUrl ? (
                <iframe
                  className={styles.pdfFrame}
                  src={pdfPreviewUrl}
                  title={
                    reportMode === "monthly"
                      ? `รายงานรวมเดือน ${THAI_MONTHS[selectedDateParts.monthIndex]} ${selectedDateParts.year + 543}`
                      : reportMode === "weekly" && selectedWeeklyPeriod
                        ? `รายงานรวมช่วง ${selectedWeeklyPeriod.startDay}-${selectedWeeklyPeriod.endDay} ${THAI_MONTHS[selectedDateParts.monthIndex]} ${selectedDateParts.year + 543}`
                        : `ตัวอย่างรายงาน PDF ${formatThaiLongDate(selectedDate)}`
                  }
                />
              ) : (
                <div className={styles.previewEmpty}>
                  <div className={styles.previewEmptyIcon}>PDF</div>
                  <h3>
                    {loadingPdf
                      ? "กำลังโหลดตัวอย่างไฟล์"
                      : "ไม่มีไฟล์สำหรับแสดงตัวอย่าง"}
                  </h3>
                  <p>
                    {reportMode === "monthly"
                      ? `${THAI_MONTHS[selectedDateParts.monthIndex]} ${selectedDateParts.year + 543}`
                      : reportMode === "weekly" && selectedWeeklyPeriod
                        ? `${selectedWeeklyPeriod.startDay}-${selectedWeeklyPeriod.endDay} ${THAI_MONTHS[selectedDateParts.monthIndex]} ${selectedDateParts.year + 543}`
                        : formatThaiLongDate(selectedDate)}
                  </p>
                </div>
              )}
            </div>

            <div className={styles.previewNote}>
              PDF นี้เป็นไฟล์ที่ระบบสร้างและบันทึกไว้จริงใน Google Drive
              ไม่ได้สร้างใหม่จากตารางบนหน้าเว็บ
            </div>
          </aside>
        </div>
      </section>
    </main>
  );
}



