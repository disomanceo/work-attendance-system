"use client";

import { useEffect, useMemo, useState, type DragEvent, type KeyboardEvent } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  STUDENT_CLASS_LEVELS,
  STUDENT_WORK_PERMISSION_KEYS,
  STUDENT_WORK_PERMISSION_LABELS,
} from "@/lib/students/settings";

type Profile = { id: string; full_name: string | null; phone?: string | null };
type ClassSetting = {
  id?: string;
  class_level: string;
  class_room: string;
  adviser_profile_id?: string | null;
  adviser_profile_ids?: string[] | null;
};
type WorkPermission = { id?: string; profile_id: string; permission_key: string; class_levels: string[] };
type DutyRoster = { id?: string; weekday: number; profile_id: string };
type CalendarDayType = "PUBLIC_HOLIDAY" | "SCHOOL_HOLIDAY" | "SPECIAL_WORKDAY";
type CalendarDay = { work_date: string; day_type: CalendarDayType; title?: string | null; report_text?: string | null; note?: string | null };
type StudentSettingsAccess = {
  isAdmin?: boolean;
  canManageStudentSettings?: boolean;
  canManageClassAdvisers?: boolean;
  canManageDutyRoster?: boolean;
  canManageCalendar?: boolean;
};
type SettingsResponse = {
  profiles?: Profile[];
  classSettings?: ClassSetting[];
  workPermissions?: WorkPermission[];
  dutyRoster?: DutyRoster[];
  access?: StudentSettingsAccess;
  message?: string;
  error?: string;
};
type CalendarResponse = { ok?: boolean; days?: CalendarDay[]; message?: string; error?: string };
type TabKey = "duty" | "advisers" | "calendar" | "permissions";

const WEEKDAYS = [
  { value: 1, label: "จันทร์" },
  { value: 2, label: "อังคาร" },
  { value: 3, label: "พุธ" },
  { value: 4, label: "พฤหัส" },
  { value: 5, label: "ศุกร์" },
  { value: 6, label: "เสาร์" },
  { value: 7, label: "อาทิตย์" },
];
const TABS: Array<{ key: TabKey; label: string }> = [
  { key: "duty", label: "ครูเวร" },
  { key: "advisers", label: "ครูประจำชั้น" },
  { key: "calendar", label: "ปฏิทิน" },
  { key: "permissions", label: "สิทธิ์" },
];
const THAI_MONTHS = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
const TYPE_OPTIONS: Array<{ value: CalendarDayType; label: string }> = [
  { value: "PUBLIC_HOLIDAY", label: "วันหยุดราชการ" },
  { value: "SCHOOL_HOLIDAY", label: "วันหยุดพิเศษ" },
  { value: "SPECIAL_WORKDAY", label: "วันเปิดเรียน/เปิดปฏิบัติงาน" },
];

const supabase = createClient();

function monthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}
function dateKey(date: Date) {
  return `${monthKey(date)}-${String(date.getDate()).padStart(2, "0")}`;
}
function thaiYear(year: number) {
  return year + 543;
}
function displayName(profile?: Profile) {
  if (!profile) return "-";
  return profile.full_name || profile.phone || profile.id;
}
function teacherChipName(profile?: Profile) {
  const name = displayName(profile).trim();
  if (!name || name === "-") return "-";
  const cleanName = name.replace(/^(นาย|นางสาว|นาง|ครู)\s*/u, "").trim();
  const firstName = cleanName.split(/\s+/)[0] || cleanName;
  return `ครู${firstName}`;
}
function emptyClassSettings(): ClassSetting[] {
  return STUDENT_CLASS_LEVELS.map((level) => ({ class_level: level, class_room: "", adviser_profile_id: null, adviser_profile_ids: [] }));
}
function academicMonths(year: number) {
  return Array.from({ length: 12 }, (_, index) => new Date(year, 4 + index, 1));
}
function monthCells(month: Date) {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const blanks = Array.from({ length: first.getDay() }, () => null);
  const dates = Array.from({ length: days }, (_, index) => new Date(month.getFullYear(), month.getMonth(), index + 1));
  return [...blanks, ...dates];
}
function typeLabel(type: CalendarDayType) {
  return TYPE_OPTIONS.find((item) => item.value === type)?.label || "-";
}
async function fetchJson<T>(url: string, options: RequestInit = {}): Promise<T> {
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
}

export default function StudentClassroomSettingsPage() {
  const [activeTab, setActiveTab] = useState<TabKey>("calendar");
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [classSettings, setClassSettings] = useState<ClassSetting[]>(emptyClassSettings());
  const [workPermissions, setWorkPermissions] = useState<WorkPermission[]>([]);
  const [dutyRoster, setDutyRoster] = useState<DutyRoster[]>([]);
  const [selectedProfileId, setSelectedProfileId] = useState("");
  const [selectedDutyWeekday, setSelectedDutyWeekday] = useState(1);
  const [selectedDutyProfileId, setSelectedDutyProfileId] = useState("");
  const [academicYear, setAcademicYear] = useState(new Date().getFullYear());
  const [calendarDays, setCalendarDays] = useState<Record<string, CalendarDay>>({});
  const [selectedDate, setSelectedDate] = useState<string>("");
  const [selectedType, setSelectedType] = useState<CalendarDayType>("SCHOOL_HOLIDAY");
  const [selectedTitle, setSelectedTitle] = useState("");
  const [selectedReportText, setSelectedReportText] = useState("");
  const [draggedProfileId, setDraggedProfileId] = useState("");
  const [draggedFromLevel, setDraggedFromLevel] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState("");
  const [message, setMessage] = useState("");
  const [access, setAccess] = useState<StudentSettingsAccess | null>(null);

  const profileMap = useMemo(() => new Map(profiles.map((profile) => [profile.id, profile])), [profiles]);
  const months = useMemo(() => academicMonths(academicYear), [academicYear]);
  const selectedPermissions = useMemo(() => workPermissions.filter((item) => item.profile_id === selectedProfileId), [workPermissions, selectedProfileId]);
  const visibleTabs = useMemo(() => {
    const canManageAll = Boolean(access?.isAdmin || access?.canManageStudentSettings);
    return TABS.filter((tab) => {
      if (tab.key === "calendar") return Boolean(canManageAll || access?.canManageCalendar);
      if (tab.key === "advisers") return Boolean(canManageAll || access?.canManageClassAdvisers);
      if (tab.key === "duty") return Boolean(canManageAll || access?.canManageDutyRoster);
      if (tab.key === "permissions") return canManageAll;
      return false;
    });
  }, [access]);

  async function loadData() {
    setLoading(true);
    setMessage("");
    try {
      const data = await fetchJson<SettingsResponse>("/api/students/settings");
      const savedSettings = data.classSettings ?? [];
      const loadedProfiles = data.profiles ?? [];
      setAccess(data.access ?? null);
      setProfiles(loadedProfiles);
      setClassSettings(emptyClassSettings().map((base) => savedSettings.find((item) => item.class_level === base.class_level && String(item.class_room ?? "") === "") ?? base));
      setWorkPermissions(data.workPermissions ?? []);
      setDutyRoster(data.dutyRoster ?? []);
      setSelectedProfileId((current) => current || loadedProfiles[0]?.id || "");
      setSelectedDutyProfileId((current) => current || loadedProfiles[0]?.id || "");
      const nextTabs = TABS.filter((tab) => {
        const canManageAll = Boolean(data.access?.isAdmin || data.access?.canManageStudentSettings);
        if (tab.key === "calendar") return Boolean(canManageAll || data.access?.canManageCalendar);
        if (tab.key === "advisers") return Boolean(canManageAll || data.access?.canManageClassAdvisers);
        if (tab.key === "duty") return Boolean(canManageAll || data.access?.canManageDutyRoster);
        if (tab.key === "permissions") return canManageAll;
        return false;
      });
      setActiveTab((current) => nextTabs.some((tab) => tab.key === current) ? current : nextTabs[0]?.key ?? "advisers");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "โหลดข้อมูลไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }

  async function loadCalendar() {
    const results = await Promise.all(
      months.map(async (month) => {
        const data = await fetchJson<CalendarResponse>(`/api/admin/work-calendar?month=${monthKey(month)}`);
        return data.days ?? [];
      }),
    );
    const next: Record<string, CalendarDay> = {};
    results.flat().forEach((item) => { next[item.work_date] = item; });
    setCalendarDays(next);
  }

  useEffect(() => { void loadData(); }, []);
  useEffect(() => {
    if (!access || !(access.isAdmin || access.canManageStudentSettings || access.canManageCalendar)) return;
    void loadCalendar().catch((error) => setMessage(error instanceof Error ? error.message : "โหลดปฏิทินไม่สำเร็จ"));
  }, [academicYear, access]);

  function openDate(date: Date) {
    const key = dateKey(date);
    const existing = calendarDays[key];
    setSelectedDate(key);
    setSelectedType(existing?.day_type ?? "SCHOOL_HOLIDAY");
    setSelectedTitle(existing?.title ?? "");
    setSelectedReportText(existing?.report_text ?? "");
  }

  async function saveSelectedDate() {
    if (!selectedDate) return;
    const item: CalendarDay = {
      work_date: selectedDate,
      day_type: selectedType,
      title: selectedTitle.trim() || typeLabel(selectedType),
      report_text: selectedReportText.trim(),
      note: "",
    };
    const next = { ...calendarDays, [selectedDate]: item };
    setCalendarDays(next);
    await saveMonth(selectedDate.slice(0, 7), next);
    setSelectedDate("");
  }

  async function clearSelectedDate() {
    if (!selectedDate) return;
    const next = { ...calendarDays };
    delete next[selectedDate];
    setCalendarDays(next);
    await saveMonth(selectedDate.slice(0, 7), next);
    setSelectedDate("");
  }

  async function saveMonth(month: string, source = calendarDays) {
    setSaving("calendar");
    setMessage("");
    try {
      const rows = Object.values(source).filter((item) => item.work_date.startsWith(`${month}-`));
      const data = await fetchJson<CalendarResponse>("/api/admin/work-calendar", {
        method: "PUT",
        body: JSON.stringify({ month, days: rows }),
      });
      setMessage(data.message || "บันทึกปฏิทินแล้ว");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "บันทึกปฏิทินไม่สำเร็จ");
    } finally {
      setSaving("");
    }
  }

  async function saveClassSettings() {
    setSaving("class");
    try {
      await fetchJson("/api/students/settings", { method: "POST", body: JSON.stringify({ type: "class-settings", rows: classSettings }) });
      setMessage("บันทึกครูประจำชั้นแล้ว");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "บันทึกไม่สำเร็จ");
    } finally {
      setSaving("");
    }
  }

  function updateClassAdvisers(level: string, ids: string[]) {
    const uniqueIds = Array.from(new Set(ids.filter(Boolean)));
    setClassSettings((current) => current.map((item) => item.class_level === level ? { ...item, adviser_profile_id: uniqueIds[0] || null, adviser_profile_ids: uniqueIds } : item));
  }

  function addClassAdviser(level: string, profileId: string) {
    if (!profileId) return;
    setClassSettings((current) => current.map((item) => {
      const currentIds = Array.isArray(item.adviser_profile_ids)
        ? item.adviser_profile_ids
        : item.adviser_profile_id
          ? [item.adviser_profile_id]
          : [];
      const withoutMovedProfile = currentIds.filter((id) => id !== profileId);
      const nextIds = item.class_level === level
        ? Array.from(new Set([...withoutMovedProfile, profileId]))
        : withoutMovedProfile;

      return {
        ...item,
        adviser_profile_id: nextIds[0] || null,
        adviser_profile_ids: nextIds,
      };
    }));
  }

  function removeClassAdviser(level: string, profileId: string) {
    const setting = classSettings.find((item) => item.class_level === level);
    const currentIds = Array.isArray(setting?.adviser_profile_ids)
      ? setting.adviser_profile_ids
      : setting?.adviser_profile_id
        ? [setting.adviser_profile_id]
      : [];
    updateClassAdvisers(level, currentIds.filter((id) => id !== profileId));
  }

  function beginTeacherDrag(event: DragEvent<HTMLElement>, profileId: string, sourceLevel = "") {
    setDraggedProfileId(profileId);
    setDraggedFromLevel(sourceLevel);
    event.dataTransfer.setData("text/plain", profileId);
    event.dataTransfer.setData("application/x-profile-id", profileId);
    event.dataTransfer.setData("application/x-source-level", sourceLevel);
    event.dataTransfer.effectAllowed = sourceLevel ? "move" : "copyMove";
  }

  function droppedTeacherId(event: DragEvent<HTMLElement>) {
    return event.dataTransfer.getData("application/x-profile-id") || event.dataTransfer.getData("text/plain") || draggedProfileId;
  }

  function droppedSourceLevel(event: DragEvent<HTMLElement>) {
    return event.dataTransfer.getData("application/x-source-level") || draggedFromLevel;
  }

  function clearTeacherDrag() {
    setDraggedProfileId("");
    setDraggedFromLevel("");
  }

  function selectTeacher(profileId: string) {
    setDraggedProfileId((current) => current === profileId ? "" : profileId);
    setDraggedFromLevel("");
  }

  function selectTeacherByKeyboard(event: KeyboardEvent<HTMLElement>, profileId: string) {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    selectTeacher(profileId);
  }

  function selectedPermission(permissionKey: string) {
    return selectedPermissions.find((item) => item.permission_key === permissionKey);
  }

  function togglePermission(permissionKey: string, enabled: boolean) {
    if (!selectedProfileId) return;
    setWorkPermissions((current) => {
      const others = current.filter((item) => !(item.profile_id === selectedProfileId && item.permission_key === permissionKey));
      if (!enabled) return others;
      return [...others, { profile_id: selectedProfileId, permission_key: permissionKey, class_levels: [] }];
    });
  }

  function togglePermissionLevel(permissionKey: string, level: string, enabled: boolean) {
    if (!selectedProfileId) return;
    setWorkPermissions((current) => {
      const existing = current.find((item) => item.profile_id === selectedProfileId && item.permission_key === permissionKey);
      const base = existing ?? { profile_id: selectedProfileId, permission_key: permissionKey, class_levels: [] };
      const nextLevels = enabled ? Array.from(new Set([...(base.class_levels ?? []), level])) : (base.class_levels ?? []).filter((item) => item !== level);
      return [...current.filter((item) => !(item.profile_id === selectedProfileId && item.permission_key === permissionKey)), { ...base, class_levels: nextLevels }];
    });
  }

  async function saveWorkPermissions() {
    if (!selectedProfileId) return;
    setSaving("permissions");
    setMessage("");
    try {
      await fetchJson("/api/students/settings", {
        method: "POST",
        body: JSON.stringify({ type: "work-permissions", profile_id: selectedProfileId, permissions: selectedPermissions }),
      });
      setMessage("บันทึกสิทธิ์งานนักเรียนแล้ว");
      await loadData();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "บันทึกไม่สำเร็จ");
    } finally {
      setSaving("");
    }
  }

  async function saveDutyRoster(nextRows = dutyRoster) {
    setSaving("duty");
    try {
      await fetchJson("/api/students/settings", { method: "POST", body: JSON.stringify({ type: "duty-roster", rows: nextRows }) });
      setDutyRoster(nextRows);
      setMessage("บันทึกครูเวรแล้ว");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "บันทึกไม่สำเร็จ");
    } finally {
      setSaving("");
    }
  }

  function addDutyTeacher() {
    if (!selectedDutyProfileId) return;
    const exists = dutyRoster.some((item) => item.weekday === selectedDutyWeekday && item.profile_id === selectedDutyProfileId);
    if (exists) return;
    void saveDutyRoster([...dutyRoster, { weekday: selectedDutyWeekday, profile_id: selectedDutyProfileId }]);
  }

  return (
    <main className="min-h-screen bg-[#fbf7ef] px-2 py-2 sm:px-4 sm:py-4 lg:px-6 xl:px-8">
      <div className="mx-auto flex w-full max-w-none flex-col gap-2 xl:max-w-7xl">
        <header className="rounded-[24px] border border-orange-100 bg-white/85 px-3 py-3 shadow-sm">
          <div className="flex items-center justify-between gap-2">
            <h1 className="text-[19px] font-semibold leading-tight text-orange-800">ตั้งค่าห้องเรียน</h1>
            {activeTab === "advisers" ? (
              <button type="button" onClick={() => void saveClassSettings()} disabled={saving === "class"} className="h-8 shrink-0 rounded-xl bg-orange-500 px-3 text-[12px] font-medium text-white disabled:opacity-50">บันทึก</button>
            ) : null}
          </div>
        </header>

        <section className="grid grid-cols-4 gap-1.5 rounded-[22px] border border-orange-100 bg-white/85 p-1.5 shadow-sm">
          {visibleTabs.map((tab) => (
            <button key={tab.key} type="button" onClick={() => setActiveTab(tab.key)} className={`h-9 rounded-2xl text-[12px] font-medium ${activeTab === tab.key ? "bg-orange-500 text-white" : "bg-slate-50 text-slate-700"}`}>
              {tab.label}
            </button>
          ))}
        </section>

        {message ? <div className="rounded-2xl bg-blue-50 px-3 py-2 text-[12px] font-medium text-blue-700">{message}</div> : null}
        {loading ? <section className="rounded-2xl bg-white p-4 text-sm text-slate-600">กำลังโหลดข้อมูล...</section> : null}

        {!loading && activeTab === "duty" ? (
          <section className="rounded-[22px] border border-slate-200 bg-white p-2 shadow-sm">
            <div className="grid grid-cols-[92px_1fr_58px] gap-1.5">
              <select value={selectedDutyWeekday} onChange={(event) => setSelectedDutyWeekday(Number(event.target.value))} className="h-9 rounded-xl border border-slate-200 px-2 text-[12px]">
                {WEEKDAYS.map((day) => <option key={day.value} value={day.value}>{day.label}</option>)}
              </select>
              <select value={selectedDutyProfileId} onChange={(event) => setSelectedDutyProfileId(event.target.value)} className="h-9 rounded-xl border border-slate-200 px-2 text-[12px]">
                {profiles.map((profile) => <option key={profile.id} value={profile.id}>{displayName(profile)}</option>)}
              </select>
              <button type="button" onClick={addDutyTeacher} className="h-9 rounded-xl bg-orange-500 text-[12px] text-white">เพิ่ม</button>
            </div>
            <div className="mt-2 grid gap-1.5 sm:grid-cols-2 lg:grid-cols-4">
              {WEEKDAYS.map((day) => {
                const rows = dutyRoster.filter((item) => Number(item.weekday) === day.value);
                return (
                  <div key={day.value} className="rounded-2xl border border-slate-100 bg-slate-50 p-2">
                    <h3 className="text-[13px] font-semibold text-slate-800">{day.label}</h3>
                    <div className="mt-1 space-y-1">
                      {rows.length === 0 ? <p className="text-[12px] text-slate-400">-</p> : null}
                      {rows.map((item) => (
                        <div key={`${item.weekday}-${item.profile_id}`} className="flex items-center justify-between rounded-xl bg-white px-2 py-1 text-[12px]">
                          <span>{displayName(profileMap.get(item.profile_id))}</span>
                          <button type="button" onClick={() => void saveDutyRoster(dutyRoster.filter((row) => !(row.weekday === item.weekday && row.profile_id === item.profile_id)))} className="text-rose-600">×</button>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        ) : null}

        {!loading && activeTab === "advisers" ? (
          <section className="rounded-[22px] border border-slate-200 bg-white p-3 shadow-sm">
            <div className="mb-2">
              <h2 className="text-[14px] font-semibold text-slate-800">ครูประจำชั้น</h2>
            </div>
            <div className="space-y-0.5">
              {classSettings.map((setting) => {
                const selectedIds = Array.isArray(setting.adviser_profile_ids) ? setting.adviser_profile_ids : setting.adviser_profile_id ? [setting.adviser_profile_id] : [];
                const selectedProfiles = selectedIds.map((id) => profileMap.get(id)).filter((profile): profile is Profile => Boolean(profile));
                return (
                  <div
                    key={setting.class_level}
                    className="grid grid-cols-[64px_1fr] items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 p-1 [&>span:last-child]:hidden"
                  >
                    <span className="text-[11px] font-semibold leading-tight text-slate-900 sm:text-[12px]">{setting.class_level}</span>
                    <select
                      value={selectedIds[0] || ""}
                      onChange={(event) => updateClassAdvisers(setting.class_level, event.target.value ? [event.target.value] : [])}
                      className="h-8 min-w-0 rounded-lg border border-slate-200 bg-white px-2 text-[11px] text-slate-800 outline-none focus:border-orange-300 focus:ring-2 focus:ring-orange-100 sm:text-[12px]"
                    >
                      <option value="">ไม่เลือกครู</option>
                      {profiles.map((profile) => (
                        <option key={profile.id} value={profile.id}>{displayName(profile)}</option>
                      ))}
                    </select>
                    <div className="hidden">
                      {selectedProfiles.length === 0 ? (
                        <span className="text-[7px] leading-none text-slate-400 sm:text-[8px]">ยังไม่มีครู</span>
                      ) : null}
                      {selectedProfiles.map((profile) => (
                        <span
                          key={profile.id}
                          role="button"
                          tabIndex={0}
                          draggable
                          onMouseDown={() => {
                            setDraggedProfileId(profile.id);
                            setDraggedFromLevel(setting.class_level);
                          }}
                          onTouchStart={() => {
                            setDraggedProfileId(profile.id);
                            setDraggedFromLevel(setting.class_level);
                          }}
                          onDragStart={(event) => {
                            event.stopPropagation();
                            beginTeacherDrag(event, profile.id, setting.class_level);
                          }}
                          onDragEnd={clearTeacherDrag}
                          onClick={(event) => {
                            event.stopPropagation();
                            removeClassAdviser(setting.class_level, profile.id);
                          }}
                          onKeyDown={(event) => {
                            if (event.key !== "Enter" && event.key !== " ") return;
                            event.preventDefault();
                            removeClassAdviser(setting.class_level, profile.id);
                          }}
                          className="inline-flex h-4 min-h-0 max-w-full cursor-grab select-none items-center overflow-hidden rounded bg-orange-100 px-0.5 py-0 text-[6px] font-medium leading-none text-orange-800 sm:h-4 sm:text-[8px]"
                          style={{ fontSize: "6px", lineHeight: 0.95, touchAction: "none" }}
                          title="คลิกเพื่อนำออก"
                        >
                          <span className="line-clamp-2 break-words leading-none">{teacherChipName(profile)}</span>
                        </span>
                      ))}
                    </div>
                    <span className="justify-self-end rounded bg-blue-50 px-0.5 py-px text-[7px] font-medium leading-none text-blue-700 sm:text-[8.5px]">{selectedIds.length} คน</span>
                  </div>
                );
              })}
            </div>
          </section>
        ) : null}

        {!loading && activeTab === "calendar" ? (
          <section className="rounded-[22px] border border-slate-200 bg-white p-2 shadow-sm">
            <div className="mb-2 flex items-center justify-between gap-2">
              <h2 className="text-[15px] font-semibold text-slate-800">ปีการศึกษา {thaiYear(academicYear)}</h2>
              <div className="flex gap-1">
                <button type="button" onClick={() => setAcademicYear((value) => value - 1)} className="h-8 rounded-xl bg-slate-100 px-2 text-xs">‹</button>
                <button type="button" onClick={() => setAcademicYear((value) => value + 1)} className="h-8 rounded-xl bg-slate-100 px-2 text-xs">›</button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
              {months.map((month) => (
                <div key={monthKey(month)} className="rounded-2xl border border-slate-100 bg-slate-50 p-1.5 lg:p-2">
                  <h3 className="mb-1 text-center text-[12px] font-semibold text-orange-800">{THAI_MONTHS[month.getMonth()]} {thaiYear(month.getFullYear())}</h3>
                  <div className="grid grid-cols-7 gap-0.5 text-center text-[9px] text-slate-400">
                    {["อ", "จ", "อ", "พ", "พ", "ศ", "ส"].map((day, index) => <span key={`${day}-${index}`}>{day}</span>)}
                  </div>
                  <div className="mt-0.5 grid grid-cols-7 gap-0.5">
                    {monthCells(month).map((date, index) => {
                      if (!date) return <span key={`blank-${index}`} className="h-5" />;
                      const key = dateKey(date);
                      const item = calendarDays[key];
                      const isWeekend = date.getDay() === 0 || date.getDay() === 6;
                      return (
                        <button key={key} type="button" onClick={() => openDate(date)} className={`h-5 rounded-md text-[10px] leading-none ${item?.day_type === "SPECIAL_WORKDAY" ? "bg-emerald-500 text-white" : item ? "bg-rose-500 text-white" : isWeekend ? "bg-slate-200 text-slate-500" : "bg-white text-slate-700"}`} title={item?.title || ""}>
                          {date.getDate()}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {!loading && activeTab === "permissions" ? (
          <section className="rounded-[22px] border border-slate-200 bg-white p-3 shadow-sm">
            <div className="mb-3 flex items-center justify-between gap-2">
              <div>
                <h2 className="text-[15px] font-semibold text-slate-800">ตั้งค่าสิทธิ์งานนักเรียน</h2>
                <p className="text-[11px] text-slate-500">กำหนดสิทธิ์ตามครูแต่ละคน</p>
              </div>
              <button type="button" onClick={() => void saveWorkPermissions()} disabled={saving === "permissions"} className="h-8 rounded-xl bg-orange-500 px-3 text-[12px] text-white">บันทึก</button>
            </div>
            <select value={selectedProfileId} onChange={(event) => setSelectedProfileId(event.target.value)} className="mb-3 h-9 w-full rounded-xl border border-slate-200 px-2 text-[13px]">
              {profiles.map((profile) => <option key={profile.id} value={profile.id}>{displayName(profile)}</option>)}
            </select>
            <div className="space-y-2">
              {Object.entries(STUDENT_WORK_PERMISSION_LABELS).map(([permissionKey, label]) => {
                const permission = selectedPermission(permissionKey);
                const enabled = Boolean(permission);
                return (
                  <div key={permissionKey} className="rounded-2xl border border-slate-200 p-2">
                    <label className="flex items-center gap-2 text-[13px] font-medium text-slate-800">
                      <input type="checkbox" checked={enabled} onChange={(event) => togglePermission(permissionKey, event.target.checked)} />
                      {label}
                    </label>
                    {permissionKey === STUDENT_WORK_PERMISSION_KEYS.classAdviser || permissionKey === STUDENT_WORK_PERMISSION_KEYS.allClassRecorder ? (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {STUDENT_CLASS_LEVELS.map((level) => {
                          const checked = permission?.class_levels?.includes(level) ?? false;
                          return (
                            <button key={level} type="button" disabled={!enabled} onClick={() => togglePermissionLevel(permissionKey, level, !checked)} className={`rounded-full px-2 py-1 text-[11px] ${checked ? "bg-orange-500 text-white" : "bg-slate-100 text-slate-600 disabled:opacity-40"}`}>
                              {level}
                            </button>
                          );
                        })}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </section>
        ) : null}

        {selectedDate && activeTab === "calendar" ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-3">
            <section className="w-full max-w-md rounded-[24px] border border-orange-100 bg-white p-3 shadow-xl">
              <div className="mb-2 flex items-center justify-between">
                <h2 className="text-[16px] font-semibold text-orange-800">ตั้งค่าวันที่ {selectedDate}</h2>
                <button type="button" onClick={() => setSelectedDate("")} className="rounded-full bg-slate-100 px-2 py-1 text-xs">ปิด</button>
              </div>
              <div className="grid gap-2">
                <label className="text-[12px] text-slate-600">กำหนดเป็น
                  <select value={selectedType} onChange={(event) => setSelectedType(event.target.value as CalendarDayType)} className="mt-1 h-9 w-full rounded-xl border border-slate-200 px-2 text-[13px]">
                    {TYPE_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                  </select>
                </label>
                <label className="text-[12px] text-slate-600">หยุดทำไม / เปิดเรียนเพราะอะไร
                  <input value={selectedTitle} onChange={(event) => setSelectedTitle(event.target.value)} className="mt-1 h-9 w-full rounded-xl border border-slate-200 px-2 text-[13px]" placeholder="เช่น วันหยุดพิเศษ, เรียนชดเชย" />
                </label>
                <label className="text-[12px] text-slate-600">ข้อความในรายงาน
                  <input value={selectedReportText} onChange={(event) => setSelectedReportText(event.target.value)} className="mt-1 h-9 w-full rounded-xl border border-slate-200 px-2 text-[13px]" placeholder="ข้อความแสดงในรายงาน/เช็คชื่อ" />
                </label>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button type="button" onClick={() => void clearSelectedDate()} className="h-10 rounded-2xl border border-rose-200 bg-rose-50 text-[13px] text-rose-700">ล้างค่าวันนี้</button>
                <button type="button" onClick={() => void saveSelectedDate()} disabled={saving === "calendar"} className="h-10 rounded-2xl bg-orange-500 text-[13px] text-white">บันทึกวันนี้</button>
              </div>
            </section>
          </div>
        ) : null}
      </div>
    </main>
  );
}
