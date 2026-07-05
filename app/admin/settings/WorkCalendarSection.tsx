"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import styles from "./settings.module.css";

type DayType = "PUBLIC_HOLIDAY" | "SCHOOL_HOLIDAY" | "SPECIAL_WORKDAY";

type CalendarDay = {
  work_date: string;
  day_type: DayType;
  title: string;
  report_text: string;
  note: string;
};

type CalendarApiResponse = {
  ok: boolean;
  message?: string;
  days?: CalendarDay[];
};

const THAI_MONTHS = [
  "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน",
  "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม",
  "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม",
];

function localDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function monthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function getCalendarDayLabel(date: Date, item?: CalendarDay) {
  if (item?.title) return item.title;
  if (item?.day_type === "SPECIAL_WORKDAY") return "เปิดพิเศษ";
  if (date.getDay() === 0) return "วันอาทิตย์";
  if (date.getDay() === 6) return "วันเสาร์";
  return "";
}
function formatThaiDate(dateKey: string) {
  const date = new Date(`${dateKey}T00:00:00`);
  return `${date.getDate()} ${THAI_MONTHS[date.getMonth()]} ${date.getFullYear() + 543}`;
}

function defaultReportText(date: Date, dayType: DayType, title: string) {
  if (dayType === "SPECIAL_WORKDAY") {
    return title ? `เปิดปฏิบัติงานพิเศษ: ${title}` : "เปิดปฏิบัติงานพิเศษ";
  }

  if (title) return `หยุดเรียนเนื่องใน${title}`;

  return date.getDay() === 0
    ? "หยุดเรียนวันอาทิตย์"
    : date.getDay() === 6
      ? "หยุดเรียนวันเสาร์"
      : "หยุดเรียน";
}

export default function WorkCalendarSection() {
  const supabase = useMemo(() => createClient(), []);
  const [cursor, setCursor] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [days, setDays] = useState<Record<string, CalendarDay>>({});
  const [selectedDate, setSelectedDate] = useState("");
  const [selectedType, setSelectedType] =
    useState<DayType>("PUBLIC_HOLIDAY");
  const [title, setTitle] = useState("");
  const [reportText, setReportText] = useState("");
  const [note, setNote] = useState("");
  const [editorOpen, setEditorOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] =
    useState<"success" | "error">("success");

  const loadMonth = useCallback(async () => {
    setLoading(true);
    setMessage("");

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        throw new Error("กรุณาเข้าสู่ระบบใหม่");
      }

      const response = await fetch(
        `/api/admin/work-calendar?month=${encodeURIComponent(monthKey(cursor))}`,
        {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
          cache: "no-store",
        }
      );

      const result = (await response.json()) as CalendarApiResponse;

      if (!response.ok || !result.ok) {
        throw new Error(result.message || "โหลดปฏิทินไม่สำเร็จ");
      }

      const next: Record<string, CalendarDay> = {};
      for (const item of result.days ?? []) {
        next[item.work_date] = item;
      }

      setDays(next);
    } catch (error) {
      setMessageType("error");
      setMessage(
        error instanceof Error ? error.message : "โหลดปฏิทินไม่สำเร็จ"
      );
    } finally {
      setLoading(false);
    }
  }, [cursor, supabase]);

  useEffect(() => {
    void loadMonth();
  }, [loadMonth]);

  const calendarCells = useMemo(() => {
    const year = cursor.getFullYear();
    const month = cursor.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const totalDays = new Date(year, month + 1, 0).getDate();
    const cells: Array<Date | null> = Array.from(
      { length: firstDay },
      () => null
    );

    for (let day = 1; day <= totalDays; day += 1) {
      cells.push(new Date(year, month, day));
    }

    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [cursor]);

  function openDateEditor(date: Date) {
    const key = localDateKey(date);
    const existing = days[key];

    setSelectedDate(key);
    setSelectedType(existing?.day_type ?? "PUBLIC_HOLIDAY");
    setTitle(existing?.title ?? "");
    setReportText(
      existing?.report_text ??
        defaultReportText(date, "PUBLIC_HOLIDAY", "")
    );
    setNote(existing?.note ?? "");
    setMessage("");
    setEditorOpen(true);
  }

  function changeType(nextType: DayType) {
    setSelectedType(nextType);

    if (!selectedDate) return;

    const date = new Date(`${selectedDate}T00:00:00`);
    setReportText(defaultReportText(date, nextType, title));
  }

  function applySelectedDate() {
    if (!selectedDate) return;

    const trimmedTitle = title.trim();
    const trimmedReport = reportText.trim();

    if (selectedType !== "SPECIAL_WORKDAY" && !trimmedTitle) {
      setMessageType("error");
      setMessage("กรุณาระบุชื่อวันหยุด");
      return;
    }

    setDays((current) => ({
      ...current,
      [selectedDate]: {
        work_date: selectedDate,
        day_type: selectedType,
        title: trimmedTitle,
        report_text:
          trimmedReport ||
          defaultReportText(
            new Date(`${selectedDate}T00:00:00`),
            selectedType,
            trimmedTitle
          ),
        note: note.trim(),
      },
    }));

    setEditorOpen(false);
    setMessageType("success");
    setMessage("เพิ่มการตั้งค่าไว้แล้ว กรุณากดบันทึก");
  }

  function clearSelectedDate() {
    if (!selectedDate) return;

    setDays((current) => {
      const next = { ...current };
      delete next[selectedDate];
      return next;
    });

    setEditorOpen(false);
    setMessageType("success");
    setMessage("คืนวันที่เป็นค่าปกติแล้ว กรุณากดบันทึก");
  }

  async function saveCalendar() {
    setSaving(true);
    setMessage("");

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        throw new Error("กรุณาเข้าสู่ระบบใหม่");
      }

      const response = await fetch("/api/admin/work-calendar", {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          month: monthKey(cursor),
          days: Object.values(days),
        }),
      });

      const result = (await response.json()) as CalendarApiResponse;

      if (!response.ok || !result.ok) {
        throw new Error(result.message || "บันทึกปฏิทินไม่สำเร็จ");
      }

      setMessageType("success");
      setMessage(result.message || "บันทึกตั้งค่าปฏิทินเรียบร้อยแล้ว");
      await loadMonth();
    } catch (error) {
      setMessageType("error");
      setMessage(
        error instanceof Error ? error.message : "บันทึกปฏิทินไม่สำเร็จ"
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className={`${styles.card} ${styles.workCalendarCard}`}>
      <div className={styles.compactCalendarHeader}>
        <div>
          <span className={styles.cardIcon}>▦</span>
          <div>
            <h2>ปฏิทินปฏิบัติงาน</h2>
            <p>แดง = วันหยุด · เขียว = เปิดพิเศษ</p>
          </div>
        </div>
      </div>

      <div className={styles.calendarToolbar}>
        <button
          type="button"
          aria-label="เดือนก่อน"
          onClick={() =>
            setCursor(
              (current) =>
                new Date(current.getFullYear(), current.getMonth() - 1, 1)
            )
          }
        >
          ‹
        </button>
        <strong>
          {THAI_MONTHS[cursor.getMonth()]} {cursor.getFullYear() + 543}
        </strong>
        <button
          type="button"
          aria-label="เดือนถัดไป"
          onClick={() =>
            setCursor(
              (current) =>
                new Date(current.getFullYear(), current.getMonth() + 1, 1)
            )
          }
        >
          ›
        </button>
      </div>

      <div className={styles.calendarWeekdays}>
        {["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"].map((label) => (
          <span key={label}>{label}</span>
        ))}
      </div>

      <div className={styles.calendarGrid}>
        {calendarCells.map((date, index) => {
          if (!date) {
            return (
              <span
                key={`empty-${index}`}
                className={styles.calendarEmpty}
              />
            );
          }

          const key = localDateKey(date);
          const item = days[key];
          const isWeekend = date.getDay() === 0 || date.getDay() === 6;
          const className = [
            styles.calendarDay,
            isWeekend ? styles.calendarWeekend : "",
            item?.day_type === "SPECIAL_WORKDAY"
              ? styles.calendarSpecialWorkday
              : "",
            item && item.day_type !== "SPECIAL_WORKDAY"
              ? styles.calendarHoliday
              : "",
          ]
            .filter(Boolean)
            .join(" ");

          return (
            <button
              key={key}
              type="button"
              className={className}
              title={
                item?.title ||
                (isWeekend ? "วันหยุดประจำสัปดาห์" : "วันทำงานปกติ")
              }
              onClick={() => openDateEditor(date)}
            >
              <span className={styles.calendarDayNumber}>
                {date.getDate()}
              </span>
              <small className={styles.calendarDayLabel}>
                {getCalendarDayLabel(date, item)}
              </small>
            </button>
          );
        })}
      </div>

      {message ? (
        <div
          className={
            messageType === "success"
              ? styles.calendarMessageSuccess
              : styles.calendarMessageError
          }
        >
          {message}
        </div>
      ) : null}

      <button
        type="button"
        className={styles.calendarSaveButton}
        disabled={saving || loading}
        onClick={() => void saveCalendar()}
      >
        {saving
          ? "กำลังบันทึก..."
          : loading
            ? "กำลังโหลด..."
            : "บันทึกตั้งค่าปฏิทิน"}
      </button>

      {editorOpen ? (
        <div
          className={styles.calendarModalBackdrop}
          role="presentation"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) {
              setEditorOpen(false);
            }
          }}
        >
          <section
            className={styles.calendarModal}
            role="dialog"
            aria-modal="true"
            aria-label="ตั้งค่าวันในปฏิทิน"
          >
            <div className={styles.calendarModalHeader}>
              <div>
                <strong>{formatThaiDate(selectedDate)}</strong>
                <span>เลือกประเภทวันและข้อความรายงาน</span>
              </div>
              <button
                type="button"
                aria-label="ปิด"
                onClick={() => setEditorOpen(false)}
              >
                ×
              </button>
            </div>

            <div className={styles.calendarTypeButtons}>
              <button
                type="button"
                className={
                  selectedType === "PUBLIC_HOLIDAY"
                    ? styles.calendarHolidayActive
                    : ""
                }
                onClick={() => changeType("PUBLIC_HOLIDAY")}
              >
                วันหยุดนักขัตฤกษ์
              </button>
              <button
                type="button"
                className={
                  selectedType === "SCHOOL_HOLIDAY"
                    ? styles.calendarHolidayActive
                    : ""
                }
                onClick={() => changeType("SCHOOL_HOLIDAY")}
              >
                วันหยุดพิเศษ
              </button>
              <button
                type="button"
                className={
                  selectedType === "SPECIAL_WORKDAY"
                    ? styles.calendarWorkdayActive
                    : ""
                }
                onClick={() => changeType("SPECIAL_WORKDAY")}
              >
                เปิดปฏิบัติงานพิเศษ
              </button>
            </div>

            <label>
              <span>ชื่อวันหยุดหรือกิจกรรม</span>
              <input
                value={title}
                onChange={(event) => {
                  const value = event.target.value;
                  setTitle(value);
                  setReportText(
                    defaultReportText(
                      new Date(`${selectedDate}T00:00:00`),
                      selectedType,
                      value
                    )
                  );
                }}
                placeholder={
                  selectedType === "SPECIAL_WORKDAY"
                    ? "เช่น กิจกรรมวันวิชาการ"
                    : "เช่น วันมาฆบูชา"
                }
              />
            </label>

            <label>
              <span>ข้อความในรายงาน/PDF</span>
              <input
                value={reportText}
                onChange={(event) => setReportText(event.target.value)}
                placeholder="ข้อความที่ต้องการให้แสดงในรายงาน"
              />
            </label>

            <label>
              <span>หมายเหตุ</span>
              <input
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder="ไม่บังคับ"
              />
            </label>

            <div className={styles.calendarModalActions}>
              <button
                type="button"
                className={styles.calendarClearButton}
                onClick={clearSelectedDate}
              >
                ใช้ค่าปกติ
              </button>
              <button
                type="button"
                className={styles.calendarApplyButton}
                onClick={applySelectedDate}
              >
                บันทึกวันที่เลือก
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </section>
  );
}
