"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { STUDENT_CLASS_LEVELS } from "@/lib/students/settings";
import styles from "./student-daily-report.module.css";

type AttendanceStatus = "present" | "late" | "leave" | "sick" | "personal" | "absent";

type AttendanceStudent = {
  id: string;
  status?: AttendanceStatus | string | null;
};

type AttendanceResponse = {
  ok?: boolean;
  students?: AttendanceStudent[];
  recordedCount?: number;
  message?: string;
  error?: string;
};

type ClassReport = {
  classLevel: string;
  total: number;
  present: number;
  absent: number;
  leave: number;
  checked: boolean;
};

const SEMESTERS = ["ภาคเรียนที่ 1 / 2569", "ภาคเรียนที่ 2 / 2569"];
const ALL_CLASSES = "ทุกระดับชั้น";
const THAI_WEEKDAYS = [
  "วันอาทิตย์",
  "วันจันทร์",
  "วันอังคาร",
  "วันพุธ",
  "วันพฤหัสบดี",
  "วันศุกร์",
  "วันเสาร์",
];

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

function todayInputValue() {
  const now = new Date();
  const bangkok = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  return bangkok;
}

function parseIsoDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function thaiDayName(value: string) {
  return THAI_WEEKDAYS[parseIsoDate(value).getDay()] ?? "-";
}

function formatThaiLongDate(value: string) {
  const date = parseIsoDate(value);
  return `${THAI_WEEKDAYS[date.getDay()]}ที่ ${date.getDate()} ${THAI_MONTHS[date.getMonth()]} ${date.getFullYear() + 543}`;
}

function percent(value: number, total: number) {
  if (total <= 0) return 0;
  return Math.round((value / total) * 1000) / 10;
}

function formatPercent(value: number) {
  return Number.isInteger(value) ? `${value}%` : `${value.toFixed(1)}%`;
}

function formatThaiPercent(value: number) {
  return `ร้อยละ ${value.toFixed(2)}`;
}

function normalizeStatus(value: unknown): "present" | "leave" | "absent" {
  if (value === "absent") return "absent";
  if (value === "leave" || value === "sick" || value === "personal") return "leave";
  return "present";
}

function buildReport(classLevel: string, data: AttendanceResponse): ClassReport {
  const students = data.students ?? [];
  const counts = students.reduce(
    (result, student) => {
      result[normalizeStatus(student.status)] += 1;
      return result;
    },
    { present: 0, leave: 0, absent: 0 },
  );

  return {
    classLevel,
    total: students.length,
    present: counts.present,
    absent: counts.absent,
    leave: counts.leave,
    checked: (data.recordedCount ?? 0) > 0,
  };
}

export default function StudentDailyReportPage() {
  const supabase = useMemo(() => createClient(), []);
  const [date, setDate] = useState(todayInputValue());
  const [semester, setSemester] = useState(SEMESTERS[0]);
  const [classFilter, setClassFilter] = useState(ALL_CLASSES);
  const [reports, setReports] = useState<ClassReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  const visibleClasses = useMemo(
    () => (classFilter === ALL_CLASSES ? [...STUDENT_CLASS_LEVELS] : [classFilter]),
    [classFilter],
  );

  const loadReport = useCallback(async () => {
    setLoading(true);
    setMessage("");

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      const headers = new Headers({ Accept: "application/json" });
      if (session?.access_token) {
        headers.set("Authorization", `Bearer ${session.access_token}`);
      }

      const nextReports = await Promise.all(
        visibleClasses.map(async (classLevel) => {
          const params = new URLSearchParams({ date, classLevel });
          const response = await fetch(`/api/students/attendance?${params.toString()}`, {
            headers,
            cache: "no-store",
          });
          const data = (await response.json()) as AttendanceResponse;

          if (!response.ok || data.ok === false) {
            throw new Error(data.message || data.error || "โหลดรายงานไม่สำเร็จ");
          }

          return buildReport(classLevel, data);
        }),
      );

      setReports(nextReports);
    } catch (error) {
      setReports([]);
      setMessage(error instanceof Error ? error.message : "โหลดรายงานไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, [date, supabase, visibleClasses]);

  useEffect(() => {
    void loadReport();
  }, [loadReport]);

  const totals = useMemo(() => {
    return reports.reduce(
      (result, report) => ({
        total: result.total + report.total,
        present: result.present + report.present,
        absent: result.absent + report.absent,
        leave: result.leave + report.leave,
      }),
      { total: 0, present: 0, absent: 0, leave: 0 },
    );
  }, [reports]);

  const totalPresentPercent = percent(totals.present, totals.total);

  const summaryCards = [
    {
      label: "มาเรียน",
      icon: "✓",
      value: totals.present,
      percent: percent(totals.present, totals.total),
      tone: "green",
    },
    {
      label: "ขาดเรียน",
      icon: "×",
      value: totals.absent,
      percent: percent(totals.absent, totals.total),
      tone: "red",
    },
    {
      label: "ลา",
      icon: "✎",
      value: totals.leave,
      percent: percent(totals.leave, totals.total),
      tone: "orange",
    },
    {
      label: "นักเรียนทั้งหมด",
      icon: "👥",
      value: totals.total,
      percent: totals.total > 0 ? 100 : 0,
      tone: "blue",
    },
  ] as const;

  function exportExcel() {
    const rows = [
      ["ระดับชั้น", "นักเรียนทั้งหมด", "มาเรียน", "ขาดเรียน", "ลา", "% มาเรียน", "สถานะเช็คชื่อ"],
      ...reports.map((report) => [
        report.classLevel,
        String(report.total),
        String(report.present),
        String(report.absent),
        String(report.leave),
        formatPercent(percent(report.present, report.total)),
        report.checked ? "เช็คชื่อแล้ว" : "ยังไม่ได้เช็ค",
      ]),
    ];
    const csv = rows.map((row) => row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `student-daily-report-${date}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main className={styles.page}>
      <section className={styles.shell}>
        <header className={styles.header}>
          <div>
            <h1>📅 รายงานการมาเรียนประจำวัน</h1>
          </div>
        </header>

        <section className={styles.filters} aria-label="ตัวกรองรายงาน">
          <label>
            <span>วันที่</span>
            <input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
          </label>
          <label>
            <span>วัน</span>
            <input value={thaiDayName(date)} readOnly />
          </label>
          <label>
            <span>ภาคเรียน</span>
            <select value={semester} onChange={(event) => setSemester(event.target.value)}>
              {SEMESTERS.map((item) => (
                <option key={item} value={item}>{item}</option>
              ))}
            </select>
          </label>
          <label>
            <span>ระดับชั้น</span>
            <select value={classFilter} onChange={(event) => setClassFilter(event.target.value)}>
              <option value={ALL_CLASSES}>{ALL_CLASSES}</option>
              {STUDENT_CLASS_LEVELS.map((level) => (
                <option key={level} value={level}>{level}</option>
              ))}
            </select>
          </label>
          <button type="button" onClick={() => void loadReport()} disabled={loading}>
            {loading ? "กำลังโหลด..." : "แสดงรายงาน"}
          </button>
        </section>

        {message ? <div className={styles.message}>{message}</div> : null}

        <section className={styles.summaryScroller} aria-label="สรุปภาพรวม">
          <div className={styles.summaryGrid}>
            {summaryCards.map((card) => (
                <article key={card.label} className={`${styles.summaryCard} ${styles[card.tone]}`}>
                  <span className={styles.summaryIcon}>{formatThaiPercent(card.percent)}</span>
                  <p className={styles.summaryLine}>
                    <span className={styles.summaryLabel}>{card.label}</span>
                    <strong className={styles.summaryValue}>{card.value} <small>คน</small></strong>
                  </p>
              </article>
            ))}
          </div>
        </section>

        <section className={styles.reportCard}>
          <div className={styles.reportHeader}>
            <div>
              <h2>ตารางสรุปรายชั้น</h2>
              <p>{formatThaiLongDate(date)} · {semester}</p>
            </div>
          </div>

          <div className={styles.desktopTable}>
            <table>
              <thead>
                <tr>
                  <th>ระดับชั้น</th>
                  <th>นักเรียนทั้งหมด</th>
                  <th>มาเรียน</th>
                  <th>ขาดเรียน</th>
                  <th>ลา</th>
                  <th>% มาเรียน</th>
                  <th>การดำเนินงาน</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={7}>กำลังโหลดข้อมูล...</td></tr>
                ) : reports.length === 0 ? (
                  <tr><td colSpan={7}>ไม่พบข้อมูลรายงาน</td></tr>
                ) : reports.map((report) => {
                  const presentPercent = percent(report.present, report.total);
                  return (
                    <tr key={report.classLevel}>
                      <td><strong>{report.classLevel}</strong></td>
                      <td>{report.total}</td>
                      <td>{report.present}</td>
                      <td>{report.absent}</td>
                      <td>{report.leave}</td>
                      <td>
                        <div className={styles.progressCell}>
                          <span className={styles.progressTrack}>
                            <span style={{ width: `${presentPercent}%` }} />
                          </span>
                          <strong>{formatPercent(presentPercent)}</strong>
                        </div>
                      </td>
                      <td>
                        {report.checked ? (
                          <span className={styles.checked}>● ✔ เช็คชื่อแล้ว</span>
                        ) : (
                          <div className={styles.notChecked}>
                            <span>● ยังไม่ได้เช็ค</span>
                            <Link href="/students/attendance">ไปเช็คชื่อ</Link>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              {!loading && reports.length > 0 ? (
                <tfoot>
                  <tr>
                    <td><strong>รวม</strong></td>
                    <td>{totals.total}</td>
                    <td>{totals.present}</td>
                    <td>{totals.absent}</td>
                    <td>{totals.leave}</td>
                    <td>
                      <div className={styles.progressCell}>
                        <span className={styles.progressTrack}>
                          <span style={{ width: `${totalPresentPercent}%` }} />
                        </span>
                        <strong>{formatPercent(totalPresentPercent)}</strong>
                      </div>
                    </td>
                    <td>-</td>
                  </tr>
                </tfoot>
              ) : null}
            </table>
          </div>

          <div className={styles.mobileCards}>
            {loading ? (
              <div className={styles.mobileState}>กำลังโหลดข้อมูล...</div>
            ) : reports.length === 0 ? (
              <div className={styles.mobileState}>ไม่พบข้อมูลรายงาน</div>
            ) : reports.map((report) => {
              const presentPercent = percent(report.present, report.total);
              return (
                <article key={report.classLevel} className={styles.classCard}>
                  <h3>{report.classLevel}</h3>
                  <dl>
                    <div><dt>นักเรียนทั้งหมด</dt><dd>{report.total}</dd></div>
                    <div><dt>มาเรียน</dt><dd>{report.present}</dd></div>
                    <div><dt>ขาดเรียน</dt><dd>{report.absent}</dd></div>
                    <div><dt>ลา</dt><dd>{report.leave}</dd></div>
                  </dl>
                  <div className={styles.mobileProgress}>
                    <span><i style={{ width: `${presentPercent}%` }} /></span>
                    <strong>{formatPercent(presentPercent)}</strong>
                  </div>
                  {report.checked ? (
                    <p className={styles.mobileChecked}>✔ เช็คชื่อแล้ว</p>
                  ) : (
                    <div className={styles.mobileNotChecked}>
                      <p>● ยังไม่ได้เช็ค</p>
                      <Link href="/students/attendance">ไปเช็คชื่อ</Link>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        </section>

        <section className={styles.reportMeta}>
          <p>ⓘ ข้อมูล ณ วันที่ {date} เวลา {new Intl.DateTimeFormat("th-TH", { hour: "2-digit", minute: "2-digit" }).format(new Date())} น.</p>
        </section>

        <footer className={styles.footer}>
          <button type="button" onClick={exportExcel} disabled={reports.length === 0}>ส่งออก Excel</button>
          <button type="button" onClick={() => window.print()}>พิมพ์</button>
          <button type="button" onClick={() => void loadReport()} disabled={loading}>รีเฟรชข้อมูล</button>
        </footer>
      </section>
    </main>
  );
}
