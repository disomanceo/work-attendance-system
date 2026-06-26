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

type DailyPdfInfo = {
  ok: boolean;
  found: boolean;
  message?: string;
  fileName?: string;
  size?: string;
  modifiedTime?: string;
};

type ReportMode = "daily" | "monthly";

type MonthFileStatus = {
  ok: boolean;
  dailyPdfDays: number[];
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
  if (!record.check_in_at) return { label: "ไม่ลงเวลา", tone: "danger" as const };
  if (record.check_in_status === "late") return { label: "มาสาย", tone: "warning" as const };
  if (record.check_out_status === "early") return { label: "ออกก่อนเวลา", tone: "warning" as const };
  if (!record.check_out_at) return { label: "ยังไม่ลงเวลาออก", tone: "neutral" as const };
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
  return { label: "ตรวจสอบแล้ว", tone: "success" as const };
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

      setMonthFileStatus(result);
    } catch (error) {
      console.error("Load month file status error:", error);
      setMonthFileStatus({
        ok: false,
        dailyPdfDays: [],
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
          router.replace("/dashboard");
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
  }, [pdfPreviewUrl, reportMode, router, selectedDate, selectedMonthValue, supabase]);

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
        (statusFilter === "incomplete" && attendanceStatus.label === "ยังไม่ลงเวลาออก") ||
        (statusFilter === "absent" && attendanceStatus.label === "ไม่ลงเวลา");

      return matchesSearch && matchesStatus;
    });
  }, [records, searchText, statusFilter]);



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
      "เวลาเข้า", "เวลาออก", "สถานะเวลา", "สถานะตรวจสอบ", "หมายเหตุ",
    ];

    const rows = filteredRecords.map((record, index) => [
      index + 1,
      formatThaiShortDate(record.work_date),
      record.full_name,
      record.position ?? "",
      getRoleLabel(record.role),
      formatThaiTime(record.check_in_at),
      formatThaiTime(record.check_out_at),
      getAttendanceStatus(record).label,
      getReviewStatus(record).label,
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
            <h1>รายงานการลงเวลาประจำวัน</h1>
            <p className={styles.subtitle}>ตรวจสอบข้อมูลและดาวน์โหลดรายงานในวันที่เลือก</p>
          </div>
          <button type="button" className={styles.backButton} onClick={() => router.push("/dashboard")}>
            กลับ Dashboard
          </button>
        </header>

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
            <label>ค้นหาพนักงาน</label>
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
              <option value="incomplete">ยังไม่ลงเวลาออก</option>
              <option value="absent">ไม่ลงเวลา</option>
            </select>
          </div>

          <div className={styles.exportActions}>
            <button type="button" className={styles.csvButton} onClick={exportCsv} disabled={loading}>
              <DownloadIcon /> ดาวน์โหลด CSV
            </button>
            <button
              type="button"
              className={styles.pdfButton}
              onClick={downloadReportPdf}
              disabled={loadingPdf || !pdfInfo?.found}
              title={
                pdfInfo?.found
                  ? `ดาวน์โหลด ${pdfInfo.fileName}`
                  : "ยังไม่พบไฟล์ PDF ของวันที่เลือก"
              }
            >
              <DownloadIcon />
              {loadingPdf ? "กำลังตรวจสอบ..." : reportMode === "monthly" ? "ดาวน์โหลด PDF รวมเดือน" : "ดาวน์โหลด PDF"}
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
              <span>เลือกวันที่ หรือเปิดรายงานรวมทั้งเดือน</span>
            </div>
            <div className={styles.monthActionButtons}>
              <button
                type="button"
                className={styles.buildMonthButton}
                onClick={buildMonthlyReport}
                disabled={buildingMonthly || closingMonth || monthFileStatus.monthClosed}
              >
                {buildingMonthly
                  ? "กำลังสร้างรวมทั้งเดือน..."
                  : monthFileStatus.monthClosed
                    ? "ปิดเดือนแล้ว"
                    : "สร้าง/ปรับปรุงไฟล์รวมเดือน"}
              </button>

              <button
                type="button"
                className={styles.closeMonthButton}
                onClick={closeMonthAndDeleteDailyFiles}
                disabled={
                  closingMonth ||
                  buildingMonthly ||
                  !monthFileStatus.monthlyPdfFound ||
                  !monthFileStatus.canCloseMonth ||
                  monthFileStatus.monthClosed
                }
                title={
                  monthFileStatus.monthClosed
                    ? "เดือนนี้ปิดแล้ว"
                    : !monthFileStatus.monthlyPdfFound
                      ? "ต้องสร้าง PDF รวมเดือนก่อน"
                      : !monthFileStatus.canCloseMonth
                        ? "ปิดเดือนได้เมื่อสิ้นเดือนแล้ว"
                        : "เก็บ PDF รวมเดือนเพียงไฟล์เดียว"
                }
              >
                {closingMonth
                  ? "กำลังปิดเดือน..."
                  : monthFileStatus.monthClosed
                    ? "ปิดเดือนแล้ว 🔒"
                    : "ปิดเดือนและลบรายวัน"}
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

            <button
              type="button"
              className={[
                reportMode === "monthly"
                  ? styles.activeMonthTotal
                  : styles.monthTotalButton,
                monthFileStatus.monthlyPdfFound
                  ? styles.monthTotalReady
                  : "",
              ]
                .filter(Boolean)
                .join(" ")}
              onClick={chooseMonthlyReport}
            >
              รวมทั้งเดือน
              {monthFileStatus.monthlyPdfFound && <small>✓</small>}
            </button>
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
              <h2>สรุปข้อมูลการลงเวลา</h2>
              <div className={styles.summaryGrid}>
                <div><span>พนักงานทั้งหมด</span><strong>{summary.total}</strong><small>คน</small></div>
                <div className={styles.green}><span>ลงเวลาปกติ</span><strong>{summary.complete}</strong><small>คน</small></div>
                <div className={styles.orange}><span>มาสาย</span><strong>{summary.late}</strong><small>คน</small></div>
                <div className={styles.red}><span>ลงเวลาไม่ครบ</span><strong>{summary.incomplete}</strong><small>คน</small></div>
              </div>
            </section>

            <section className={styles.listCard}>
              <div className={styles.cardHeader}>
                <div>
                  <h2>รายการลงเวลาของพนักงาน</h2>
                  <p>{reportMode === "monthly" ? `${THAI_MONTHS[selectedDateParts.monthIndex]} ${selectedDateParts.year + 543}` : formatThaiLongDate(selectedDate)}</p>
                </div>
                <span>{filteredRecords.length} รายการ</span>
              </div>

              <div className={styles.tableWrap}>
                <table>
                  <thead>
                    <tr>
                      <th>ลำดับ</th>
                      <th>ชื่อ-นามสกุล</th>
                      <th>ตำแหน่ง</th>
                      <th>เวลาเข้า</th>
                      <th>เวลาออก</th>
                      <th>สถานะ</th>
                      <th>ตรวจสอบ</th>
                      <th>หมายเหตุ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      <tr><td colSpan={8} className={styles.emptyCell}>กำลังโหลดข้อมูล...</td></tr>
                    ) : filteredRecords.length === 0 ? (
                      <tr><td colSpan={8} className={styles.emptyCell}>ไม่พบข้อมูลในวันที่เลือก</td></tr>
                    ) : filteredRecords.map((record, index) => {
                      const status = getAttendanceStatus(record);
                      const review = getReviewStatus(record);
                      return (
                        <tr key={record.id}>
                          <td>{index + 1}</td>
                          <td className={styles.nameCell}>
                            <strong>{record.full_name}</strong>
                            <small>{getRoleLabel(record.role)}</small>
                          </td>
                          <td>{record.position || getRoleLabel(record.role)}</td>
                          <td>{formatThaiTime(record.check_in_at)}</td>
                          <td>{formatThaiTime(record.check_out_at)}</td>
                          <td><span className={`${styles.badge} ${styles[`badge_${status.tone}`]}`}>{status.label}</span></td>
                          <td><span className={`${styles.reviewBadge} ${styles[`review_${review.tone}`]}`}>{review.label}</span></td>
                          <td>{record.note || "-"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          </div>

          <aside className={styles.previewCard}>
            <div className={styles.previewHeader}>
              <div>
                <h2>{reportMode === "monthly" ? "รายงาน PDF รวมทั้งเดือน" : "ไฟล์รายงาน PDF ที่บันทึกไว้"}</h2>
                <p>{reportMode === "monthly" ? `รวมรายงานเดือน${THAI_MONTHS[selectedDateParts.monthIndex]} ${selectedDateParts.year + 543}` : "ไฟล์หลักฐานจาก Google Drive ประจำวันที่เลือก"}</p>
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
                  title={reportMode === "monthly" ? `รายงานรวมเดือน ${THAI_MONTHS[selectedDateParts.monthIndex]} ${selectedDateParts.year + 543}` : `ตัวอย่างรายงาน PDF ${formatThaiLongDate(selectedDate)}`}
                />
              ) : (
                <div className={styles.previewEmpty}>
                  <div className={styles.previewEmptyIcon}>PDF</div>
                  <h3>
                    {loadingPdf
                      ? "กำลังโหลดตัวอย่างไฟล์"
                      : "ไม่มีไฟล์สำหรับแสดงตัวอย่าง"}
                  </h3>
                  <p>{reportMode === "monthly" ? `${THAI_MONTHS[selectedDateParts.monthIndex]} ${selectedDateParts.year + 543}` : formatThaiLongDate(selectedDate)}</p>
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
