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
  recordedByName?: string;
  canRecord?: boolean;
  message?: string;
  error?: string;
};

type DutyRoster = {
  weekday: number;
  profile_id: string;
};

type Profile = {
  id: string;
  full_name: string | null;
  phone?: string | null;
};

type SettingsResponse = {
  profiles?: Profile[];
  dutyRoster?: DutyRoster[];
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
  recordedByName: string;
  canRecord: boolean;
};

const THAI_WEEKDAYS = [
  "วันอาทิตย์",
  "วันจันทร์",
  "วันอังคาร",
  "วันพุธ",
  "วันพฤหัสบดี",
  "วันศุกร์",
  "วันเสาร์",
];

const THAI_MONTHS_FULL = [
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

function weekdayNumber(value: string) {
  const day = parseIsoDate(value).getDay();
  return day === 0 ? 7 : day;
}

function weekdayTone(value: string) {
  const tones = [
    "weekdaySunday",
    "weekdayMonday",
    "weekdayTuesday",
    "weekdayWednesday",
    "weekdayThursday",
    "weekdayFriday",
    "weekdaySaturday",
  ];
  return tones[parseIsoDate(value).getDay()];
}

function formatThaiFullDate(value: string) {
  const date = parseIsoDate(value);
  return `${THAI_WEEKDAYS[date.getDay()]}ที่ ${date.getDate()} ${THAI_MONTHS_FULL[date.getMonth()]} ${date.getFullYear() + 543}`;
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

function attendanceLink(report: ClassReport, date: string) {
  const params = new URLSearchParams({
    date,
    classLevel: report.classLevel,
  });
  return `/students/attendance?${params.toString()}`;
}

function normalizeStatus(value: unknown): "present" | "leave" | "absent" {
  if (value === "absent") return "absent";
  if (value === "leave" || value === "sick" || value === "personal") return "leave";
  return "present";
}

function shortTeacherName(value: string) {
  const firstName = value
    .split(",")[0]
    ?.trim()
    .replace(/^(นาย|นางสาว|นาง|ครู)\s*/u, "")
    .split(/\s+/)[0];

  return firstName ? `ครู${firstName}` : "";
}

function displayProfileName(profile?: Profile) {
  return profile?.full_name || profile?.phone || profile?.id || "";
}

function buildReport(classLevel: string, data: AttendanceResponse): ClassReport {
  const students = data.students ?? [];
  const checked = (data.recordedCount ?? 0) > 0;
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
    present: checked ? counts.present : 0,
    absent: checked ? counts.absent : 0,
    leave: checked ? counts.leave : 0,
    checked,
    recordedByName: data.recordedByName ?? "",
    canRecord: Boolean(data.canRecord),
  };
}

export default function StudentDailyReportPage() {
  const supabase = useMemo(() => createClient(), []);
  const [date, setDate] = useState(todayInputValue());
  const [reports, setReports] = useState<ClassReport[]>([]);
  const [dutyTeacherNames, setDutyTeacherNames] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

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

      const settingsPromise = fetch(`/api/students/settings?date=${encodeURIComponent(date)}`, {
        headers,
        cache: "no-store",
      })
        .then(async (response) => {
          const data = (await response.json()) as SettingsResponse;
          if (!response.ok) throw new Error(data.message || data.error || "โหลดครูเวรไม่สำเร็จ");
          return data;
        })
        .catch(() => ({ profiles: [], dutyRoster: [] }) satisfies SettingsResponse);

      const nextReports = await Promise.all(
        STUDENT_CLASS_LEVELS.map(async (classLevel) => {
          const params = new URLSearchParams({ date, classLevel, view: "report" });
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
      const settings = await settingsPromise;
      const profileMap = new Map((settings.profiles ?? []).map((profile) => [profile.id, profile]));
      const dutyWeekday = weekdayNumber(date);
      const nextDutyTeacherNames = (settings.dutyRoster ?? [])
        .filter((item) => Number(item.weekday) === dutyWeekday)
        .map((item) => shortTeacherName(displayProfileName(profileMap.get(item.profile_id))))
        .filter(Boolean);

      setReports(nextReports);
      setDutyTeacherNames(Array.from(new Set(nextDutyTeacherNames)));
    } catch (error) {
      setReports([]);
      setDutyTeacherNames([]);
      setMessage(error instanceof Error ? error.message : "โหลดรายงานไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, [date, supabase]);

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
      label: "ทั้งหมด",
      icon: "👥",
      value: totals.total,
      percent: totals.total > 0 ? 100 : 0,
      tone: "blue",
    },
  ] as const;

  function exportSheet() {
    const rows = [
      ["ระดับชั้น", "ทั้งหมด", "มาเรียน", "ขาดเรียน", "ลา", "% มาเรียน", "สถานะเช็คชื่อ"],
      ...reports.map((report) => [
        report.classLevel,
        String(report.total),
        String(report.present),
        String(report.absent),
        String(report.leave),
        formatPercent(percent(report.present, report.total)),
        report.checked
          ? `เช็คชื่อแล้ว${report.recordedByName ? ` (${report.recordedByName})` : ""}`
          : "ยังไม่ได้เช็ค",
      ]),
    ];
    const csv = rows.map((row) => row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `student-daily-report-sheet-${date}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main className={styles.page}>
      <section className={styles.shell}>
        <header className={styles.header}>
          <div>
            <h1>📅 รายงานการมาเรียนประจำวัน</h1>
            <p>{formatThaiFullDate(date)}</p>
          </div>
          <div className={styles.headerAside}>
            <label className={styles.dateFilter}>
              <span>วันที่</span>
              <input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
            </label>
            <div className={`${styles.dutyBox} ${styles[weekdayTone(date)]}`}>
              <span>ครูเวรประจำวัน</span>
              <strong>{dutyTeacherNames.length > 0 ? dutyTeacherNames.join(", ") : "-"}</strong>
            </div>
          </div>
        </header>

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
              <h2>ตารางสรุปการมาเรียนรายชั้น</h2>
            </div>
          </div>

          <div className={styles.desktopTable}>
            <table>
              <thead>
                <tr>
                  <th>ระดับชั้น</th>
                  <th>ทั้งหมด</th>
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
                  const presentText = report.checked ? String(report.present) : "-";
                  const absentText = report.checked ? String(report.absent) : "-";
                  const leaveText = report.checked ? String(report.leave) : "-";
                  const percentText = report.checked ? formatPercent(presentPercent) : "-";
                  return (
                    <tr key={report.classLevel}>
                      <td><strong>{report.classLevel}</strong></td>
                      <td>{report.total}</td>
                      <td>{presentText}</td>
                      <td>{absentText}</td>
                      <td>{leaveText}</td>
                      <td>
                        <div className={styles.progressCell}>
                          <span className={styles.progressTrack}>
                            <span style={{ width: report.checked ? `${presentPercent}%` : "0%" }} />
                          </span>
                          <strong>{percentText}</strong>
                        </div>
                      </td>
                      <td>
                        {report.checked ? (
                          <span className={styles.checked}>
                            ● ✔ เช็คชื่อแล้ว
                            {report.recordedByName ? (
                              <small>{shortTeacherName(report.recordedByName)}</small>
                            ) : null}
                          </span>
                        ) : (
                          <div className={styles.notChecked}>
                            <span>● ยังไม่ได้ลงเวลา</span>
                            {report.canRecord ? (
                              <Link href={attendanceLink(report, date)} aria-label={`ไปเช็คชื่อ ${report.classLevel}`}>ไปเช็คชื่อ</Link>
                            ) : (
                              <small>ไม่มีสิทธิ์</small>
                            )}
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
              const presentText = report.checked ? String(report.present) : "-";
              const absentText = report.checked ? String(report.absent) : "-";
              const leaveText = report.checked ? String(report.leave) : "-";
              const percentText = report.checked ? formatPercent(presentPercent) : "-";
              return (
                <article key={report.classLevel} className={styles.classCard}>
                  <h3>{report.classLevel}</h3>
                  <dl>
                    <div><dt>ทั้งหมด</dt><dd>{report.total}</dd></div>
                    <div><dt>มาเรียน</dt><dd>{presentText}</dd></div>
                    <div><dt>ขาดเรียน</dt><dd>{absentText}</dd></div>
                    <div><dt>ลา</dt><dd>{leaveText}</dd></div>
                  </dl>
                  <div className={styles.mobileProgress}>
                    <span><i style={{ width: report.checked ? `${presentPercent}%` : "0%" }} /></span>
                    <strong>{percentText}</strong>
                  </div>
                  {report.checked ? (
                    <p className={styles.mobileChecked}>
                      ✔ เช็คชื่อแล้ว
                      {report.recordedByName ? (
                        <small>{shortTeacherName(report.recordedByName)}</small>
                      ) : null}
                    </p>
                  ) : (
                    <div className={styles.mobileNotChecked}>
                      <p>● ยังไม่ได้ลงเวลา</p>
                      {report.canRecord ? (
                        <Link href={attendanceLink(report, date)}>ไปเช็คชื่อ</Link>
                      ) : (
                        <small>ไม่มีสิทธิ์</small>
                      )}
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
          <button type="button" onClick={exportSheet} disabled={reports.length === 0}>Sheet</button>
          <button type="button" onClick={() => window.print()}>PDF</button>
          <button type="button" onClick={() => void loadReport()} disabled={loading}>รีเฟรชข้อมูล</button>
        </footer>
      </section>
    </main>
  );
}
