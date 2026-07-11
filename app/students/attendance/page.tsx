"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { STUDENT_CLASS_LEVELS } from "@/lib/students/settings";

type AttendanceStatus = "present" | "absent" | "sick" | "personal" | "late";

type Profile = { id: string; full_name: string | null; phone?: string | null; profile_image_file_id?: string | null };
type ClassSetting = {
  class_level: string;
  class_room?: string | null;
  adviser_profile_id?: string | null;
  adviser_profile_ids?: string[] | null;
};
type AttendanceStudent = {
  id: string;
  no?: number | string | null;
  number?: number | string | null;
  student_no?: number | string | null;
  student_number?: number | string | null;
  name?: string | null;
  full_name?: string | null;
  status?: string | null;
};
type SettingsResponse = { profiles?: Profile[]; classSettings?: ClassSetting[]; message?: string; error?: string };
type AttendanceResponse = { students?: AttendanceStudent[]; adviserNames?: string[]; message?: string; error?: string };
type AttendanceRecord = { studentId: string; status: AttendanceStatus };
type WorkCalendarDayResponse = {
  ok: boolean;
  date: string;
  isWorkingDay: boolean;
  dayType:
    | "PUBLIC_HOLIDAY"
    | "SCHOOL_HOLIDAY"
    | "SPECIAL_WORKDAY"
    | null;
  title: string;
  reportText?: string;
  note?: string;
  message?: string;
};

const CLASS_ROOMS = ["", "1", "2", "3"];
const STATUS_OPTIONS: Array<{ key: AttendanceStatus; label: string; icon: string; active: string }> = [
  { key: "present", label: "มา", icon: "✓", active: "bg-emerald-500 text-white border-emerald-500" },
  { key: "absent", label: "ขาด", icon: "×", active: "bg-rose-500 text-white border-rose-500" },
  { key: "sick", label: "ป่วย", icon: "+", active: "bg-sky-500 text-white border-sky-500" },
  { key: "personal", label: "กิจ", icon: "◷", active: "bg-amber-500 text-white border-amber-500" },
  { key: "late", label: "สาย", icon: "!", active: "bg-violet-500 text-white border-violet-500" },
];
const THAI_WEEKDAYS = ["อา.", "จ.", "อ.", "พ.", "พฤ.", "ศ.", "ส."];
const THAI_MONTHS_SHORT = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];

function todayInputValue() {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}
function toIsoDate(date: Date) {
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}
function parseIsoDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}
function weekDates(value: string) {
  const selected = parseIsoDate(value);
  const day = selected.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(selected);
    date.setDate(selected.getDate() + mondayOffset + index);
    return date;
  });
}
function getStudentNo(student: AttendanceStudent, index: number) {
  return String(student.no ?? student.number ?? student.student_no ?? student.student_number ?? index + 1);
}
function getStudentName(student: AttendanceStudent) {
  return String(student.name || student.full_name || "ไม่ระบุชื่อ");
}
function getProfileName(profile?: Profile) {
  if (!profile) return "-";
  return profile.full_name || profile.phone || profile.id;
}
function normalizeStatus(value: unknown): AttendanceStatus {
  if (value === "absent" || value === "sick" || value === "personal" || value === "late") return value;
  if (value === "leave") return "personal";
  return "present";
}

function initials(name: string) {
  const value = name.trim();
  if (!value || value === "-") return "ครู";
  return value.slice(0, 2);
}

async function blobToDataUrl(blob: Blob) {
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("อ่านรูปโปรไฟล์ไม่สำเร็จ"));
    reader.readAsDataURL(blob);
  });
}

export default function StudentAttendancePage() {
  const supabase = useMemo(() => createClient(), []);
  const [date, setDate] = useState(todayInputValue());
  const [classLevel, setClassLevel] = useState<string>(STUDENT_CLASS_LEVELS[0] ?? "อนุบาล 2");
  const [classRoom, setClassRoom] = useState<string>("");
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [classSettings, setClassSettings] = useState<ClassSetting[]>([]);
  const [students, setStudents] = useState<AttendanceStudent[]>([]);
  const [adviserNames, setAdviserNames] = useState<string[]>([]);
  const [profileImageCache, setProfileImageCache] = useState<Record<string, string>>({});
  const [records, setRecords] = useState<Record<string, AttendanceRecord>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [workCalendarDay, setWorkCalendarDay] =
    useState<WorkCalendarDayResponse | null>(null);

  const selectedWeek = useMemo(() => weekDates(date), [date]);

  const fetchJson = useCallback(async <T,>(url: string, options: RequestInit = {}): Promise<T> => {
    const { data: { session } } = await supabase.auth.getSession();
    const headers = new Headers(options.headers);
    headers.set("Accept", "application/json");
    if (options.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
    if (session?.access_token) headers.set("Authorization", `Bearer ${session.access_token}`);

    const response = await fetch(url, { ...options, headers, cache: options.cache ?? "no-store" });
    const contentType = response.headers.get("content-type") || "";
    const data = contentType.includes("application/json") ? await response.json() : { message: await response.text() };
    if (!response.ok) throw new Error(data?.message || data?.error || "โหลดข้อมูลไม่สำเร็จ");
    return data as T;
  }, [supabase]);

  const profileMap = useMemo(() => new Map(profiles.map((profile) => [profile.id, profile])), [profiles]);
  const currentClassSetting = useMemo(() => {
    return classSettings.find((item) => item.class_level === classLevel && String(item.class_room || "") === classRoom)
      || classSettings.find((item) => item.class_level === classLevel);
  }, [classLevel, classRoom, classSettings]);

  const automaticAdviserNames = useMemo(() => {
    const ids = Array.from(new Set([
      currentClassSetting?.adviser_profile_id || "",
      ...((currentClassSetting?.adviser_profile_ids || []) as string[]),
    ].filter(Boolean)));
    return ids.map((id) => getProfileName(profileMap.get(id))).filter((name) => name !== "-");
  }, [currentClassSetting, profileMap]);

  const adviserProfiles = useMemo(() => {
    const ids = Array.from(new Set([
      currentClassSetting?.adviser_profile_id || "",
      ...((currentClassSetting?.adviser_profile_ids || []) as string[]),
    ].filter(Boolean)));

    return ids
      .map((id) => profileMap.get(id))
      .filter((profile): profile is Profile => Boolean(profile));
  }, [currentClassSetting, profileMap]);

  const visibleAdviserNames = adviserNames.length > 0 ? adviserNames : automaticAdviserNames;

  useEffect(() => {
    const key = "student-adviser-profile-image-cache-v1";
    try {
      const raw = window.localStorage.getItem(key);
      if (raw) setProfileImageCache(JSON.parse(raw) as Record<string, string>);
    } catch {
      // Ignore cache read errors.
    }
  }, []);

  useEffect(() => {
    const missingFileIds = adviserProfiles
      .map((profile) => profile.profile_image_file_id || "")
      .filter((fileId) => fileId && !profileImageCache[fileId]);

    if (missingFileIds.length === 0) return;

    let alive = true;

    async function loadImages() {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) return;

      const next: Record<string, string> = {};

      await Promise.all(
        Array.from(new Set(missingFileIds)).map(async (fileId) => {
          try {
            const response = await fetch(`/api/account/profile-assets?fileId=${encodeURIComponent(fileId)}`, {
              headers: { Authorization: `Bearer ${session.access_token}` },
              cache: "force-cache",
            });
            if (!response.ok) return;
            const dataUrl = await blobToDataUrl(await response.blob());
            if (dataUrl) next[fileId] = dataUrl;
          } catch {
            // Ignore image load errors and keep fallback initials.
          }
        }),
      );

      if (!alive || Object.keys(next).length === 0) return;

      setProfileImageCache((current) => {
        const merged = { ...current, ...next };
        try {
          window.localStorage.setItem("student-adviser-profile-image-cache-v1", JSON.stringify(merged));
        } catch {
          // Ignore cache write errors.
        }
        return merged;
      });
    }

    void loadImages();

    return () => {
      alive = false;
    };
  }, [adviserProfiles, profileImageCache, supabase]);

  const summary = useMemo(() => {
    const base = { present: 0, absent: 0, sick: 0, personal: 0, late: 0 } as Record<AttendanceStatus, number>;
    students.forEach((student) => {
      const record = records[student.id];
      base[record?.status || "present"] += 1;
    });
    return base;
  }, [records, students]);

  const loadWorkCalendarDay = useCallback(async () => {
    const data =
      await fetchJson<WorkCalendarDayResponse>(
        `/api/work-calendar/day?date=${encodeURIComponent(
          date,
        )}`,
      );

    setWorkCalendarDay(data);
  }, [date, fetchJson]);

  const loadSettings = useCallback(async () => {
    const data = await fetchJson<SettingsResponse>("/api/students/settings");
    setProfiles(data.profiles ?? []);
    setClassSettings(data.classSettings ?? []);
  }, [fetchJson]);

  const loadAttendance = useCallback(async () => {
    const params = new URLSearchParams({ classLevel, date });
    if (classRoom) params.set("classRoom", classRoom);
    const data = await fetchJson<AttendanceResponse>(`/api/students/attendance?${params}`);
    const nextStudents = data.students ?? [];
    setStudents(nextStudents);
    setAdviserNames(data.adviserNames ?? []);
    setRecords(Object.fromEntries(nextStudents.map((student) => [
      student.id,
      { studentId: student.id, status: normalizeStatus(student.status) },
    ])));
  }, [classLevel, classRoom, date, fetchJson]);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setMessage("");
    Promise.all([loadSettings(), loadAttendance(), loadWorkCalendarDay()])
      .then(() => {
        if (alive) setLoading(false);
      })
      .catch((error) => {
        if (!alive) return;
        setLoading(false);
        setMessage(error instanceof Error ? error.message : "โหลดข้อมูลไม่สำเร็จ");
      });
    return () => {
      alive = false;
    };
  }, [loadAttendance, loadSettings, loadWorkCalendarDay]);

  function updateStatus(studentId: string, status: AttendanceStatus) {
    setRecords((current) => ({ ...current, [studentId]: { studentId, status } }));
  }

  async function saveAttendance() {
    setSaving(true);
    setMessage("");
    try {
      if (workCalendarDay?.isWorkingDay === false) {
        throw new Error(
          "วันนี้เป็นวันหยุด ไม่มีการเช็กชื่อนักเรียน",
        );
      }
      await fetchJson("/api/students/attendance", {
        method: "POST",
        body: JSON.stringify({
          date,
          classLevel,
          classRoom,
          records: Object.values(records).map((record) => ({
            ...record,
            status: record.status === "personal" ? "leave" : record.status,
            note: "",
          })),
        }),
      });
      setMessage("บันทึกแล้ว");
      await loadAttendance();
      window.setTimeout(() => setMessage(""), 2400);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "บันทึกไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#fbf7ef] px-2 py-2 sm:px-4 sm:py-4 lg:px-6 xl:px-8">
      <div className="mx-auto flex w-full max-w-none flex-col gap-2 xl:max-w-7xl">
        <header className="relative rounded-[24px] border border-orange-100 bg-white/85 px-3 py-3 shadow-sm">
          {message ? (
            <div className="absolute left-1/2 top-2 -translate-x-1/2 rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700 shadow-sm ring-1 ring-emerald-100">
              ● {message}
            </div>
          ) : null}
          <div className="flex items-start justify-between gap-2 pt-4">
            <div className="min-w-0">
              <h1 className="text-[19px] font-semibold leading-tight text-orange-800">เช็คชื่อนักเรียน</h1>
              <p className="mt-1 text-[13px] leading-snug text-slate-700">{classLevel} / {classRoom || "-"}</p>
              <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[12px] leading-snug text-slate-600">
                <span>ครูประจำชั้น:</span>
                {adviserProfiles.length > 0 ? adviserProfiles.map((profile) => {
                  const name = getProfileName(profile);
                  const fileId = profile.profile_image_file_id || "";
                  const cachedImage = fileId ? profileImageCache[fileId] : "";
                  return (
                    <span key={profile.id} className="inline-flex max-w-full items-center gap-1 rounded-full bg-orange-50 px-1.5 py-0.5 text-slate-700 ring-1 ring-orange-100">
                      {cachedImage ? (
                        <img src={cachedImage} alt="" className="h-8 w-8 shrink-0 rounded-full object-cover ring-2 ring-white shadow-sm" />
                      ) : (
                        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-orange-200 text-[11px] font-medium text-orange-800 ring-2 ring-white shadow-sm">
                          {initials(name)}
                        </span>
                      )}
                      <span className="max-w-[220px] truncate">{name}</span>
                    </span>
                  );
                }) : (
                  <span>{visibleAdviserNames.join(", ") || "ยังไม่ได้กำหนด"}</span>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={saveAttendance}
              disabled={saving || loading || students.length === 0 || workCalendarDay?.isWorkingDay === false}
              className="shrink-0 rounded-full bg-gradient-to-r from-orange-500 via-amber-500 to-violet-500 px-4 py-2 text-[13px] font-semibold tracking-wide text-white shadow-[0_8px_22px_rgba(249,115,22,0.28)] transition active:scale-95 disabled:opacity-40"
              aria-label="บันทึก"
              title="บันทึก"
            >
              {workCalendarDay?.isWorkingDay === false
                ? workCalendarDay.title || "วันนี้เป็นวันหยุด"
                : "บันทึก"}
            </button>
          </div>
        </header>

        <section className="rounded-[22px] border border-orange-100 bg-white/85 p-2 shadow-sm">
          <div className="grid grid-cols-[1fr_72px] gap-2">
            <select value={classLevel} onChange={(event) => setClassLevel(event.target.value)} className="h-9 rounded-xl border border-orange-100 bg-white px-2 text-[13px] outline-none focus:border-orange-300">
              {STUDENT_CLASS_LEVELS.map((level) => <option key={level} value={level}>{level}</option>)}
            </select>
            <select value={classRoom} onChange={(event) => setClassRoom(event.target.value)} className="h-9 rounded-xl border border-orange-100 bg-white px-2 text-[13px] outline-none focus:border-orange-300">
              {CLASS_ROOMS.map((room) => <option key={room || "none"} value={room}>{room || "-"}</option>)}
            </select>
          </div>
          <div className="mt-2 grid grid-cols-7 gap-1">
            {selectedWeek.map((item) => {
              const iso = toIsoDate(item);
              const active = iso === date;
              return (
                <button key={iso} type="button" onClick={() => setDate(iso)} className={`rounded-xl border px-0.5 py-1.5 text-center leading-tight ${active ? "border-orange-500 bg-orange-500 text-white shadow-sm" : "border-slate-200 bg-white text-slate-700"}`}>
                  <span className="block text-[10px]">{THAI_WEEKDAYS[item.getDay()]}</span>
                  <span className="inline-flex items-baseline justify-center gap-0.5">
                    <span className="text-[15px] font-semibold">{item.getDate()}</span>
                    <span className="text-[8.5px]">{THAI_MONTHS_SHORT[item.getMonth()]}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        <section className="rounded-[22px] border border-emerald-100 bg-gradient-to-br from-emerald-50 to-white p-2 shadow-sm">
          <div className="flex flex-wrap items-center gap-1.5 text-[12px]">
            <span className="rounded-full bg-white px-2.5 py-1 font-medium text-slate-700 ring-1 ring-slate-200">ทั้งหมด {students.length}</span>
            <span className="rounded-full bg-emerald-100 px-2.5 py-1 font-medium text-emerald-700">มา {summary.present}</span>
            <span className="rounded-full bg-rose-100 px-2.5 py-1 font-medium text-rose-700">ขาด {summary.absent}</span>
            <span className="rounded-full bg-sky-100 px-2.5 py-1 font-medium text-sky-700">ป่วย {summary.sick}</span>
            <span className="rounded-full bg-amber-100 px-2.5 py-1 font-medium text-amber-700">กิจ {summary.personal}</span>
            <span className="rounded-full bg-violet-100 px-2.5 py-1 font-medium text-violet-700">สาย {summary.late}</span>
          </div>
        </section>

        <section className="overflow-hidden rounded-[22px] border border-slate-200 bg-white shadow-sm">
          <div className="grid grid-cols-[1fr_160px] bg-slate-50 px-2 py-2 text-[13px] font-semibold text-slate-700">
            <span>รายชื่อนักเรียน</span>
            <span className="text-center">สถานะ</span>
          </div>
          {loading ? (
            <div className="p-4 text-sm text-slate-600">กำลังโหลดข้อมูล...</div>
          ) : students.length === 0 ? (
            <div className="p-4 text-sm text-slate-600">ยังไม่มีรายชื่อนักเรียนในชั้นนี้</div>
          ) : (
            <div className="divide-y divide-slate-100">
              {students.map((student, index) => {
                const record = records[student.id] || { studentId: student.id, status: "present" as AttendanceStatus };
                return (
                  <div key={student.id} className="grid grid-cols-[1fr_160px] items-center gap-1.5 px-2 py-1.5">
                    <div className="flex min-w-0 items-center gap-1.5">
                      <span className="w-5 shrink-0 text-right text-[12px] text-slate-500">{getStudentNo(student, index)}.</span>
                      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-orange-100 text-[14px]">◉</span>
                      <span className="min-w-0 truncate text-[13px] font-normal leading-tight text-slate-900">{getStudentName(student)}</span>
                    </div>
                    <div className="grid grid-cols-5 gap-1">
                      {STATUS_OPTIONS.map((option) => {
                        const active = record.status === option.key;
                        return (
                          <button key={option.key} type="button" onClick={() =>
                                updateStatus(
                                  student.id,
                                  option.key,
                                )
                              }
                              disabled={
                                workCalendarDay?.isWorkingDay === false
                              } className={`h-7 rounded-full border px-0 text-[10.5px] font-medium shadow-sm ${active ? option.active : "border-slate-300 bg-white text-slate-600"}`}>
                            {option.icon}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
