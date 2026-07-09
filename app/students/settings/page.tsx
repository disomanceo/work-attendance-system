"use client";

import { useEffect, useMemo, useState } from "react";
import {
  STUDENT_CLASS_LEVELS,
  STUDENT_WORK_PERMISSION_KEYS,
  STUDENT_WORK_PERMISSION_LABELS,
} from "@/lib/students/settings";

type Profile = {
  id: string;
  full_name: string | null;
  phone?: string | null;
  role?: string | null;
  position?: string | null;
  status?: string | null;
};

type ClassSetting = {
  id?: string;
  class_level: string;
  class_room: string;
  adviser_profile_id?: string | null;
  adviser_profile_ids?: string[];
};

type WorkPermission = {
  id?: string;
  profile_id: string;
  permission_key: string;
  class_levels: string[];
};

type DutyRoster = {
  id?: string;
  weekday: number;
  profile_id: string;
};

const WEEKDAYS = [
  { value: 1, label: "จันทร์" },
  { value: 2, label: "อังคาร" },
  { value: 3, label: "พุธ" },
  { value: 4, label: "พฤหัสบดี" },
  { value: 5, label: "ศุกร์" },
];

function displayName(profile?: Profile) {
  if (!profile) return "-";
  return profile.full_name || profile.phone || profile.id;
}

function emptyClassSettings(): ClassSetting[] {
  return STUDENT_CLASS_LEVELS.map((level) => ({
    class_level: level,
    class_room: "",
    adviser_profile_id: null,
    adviser_profile_ids: [],
  }));
}

export default function StudentClassroomSettingsPage() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [classSettings, setClassSettings] = useState<ClassSetting[]>(emptyClassSettings());
  const [workPermissions, setWorkPermissions] = useState<WorkPermission[]>([]);
  const [dutyRoster, setDutyRoster] = useState<DutyRoster[]>([]);
  const [selectedProfileId, setSelectedProfileId] = useState("");
  const [selectedDutyWeekday, setSelectedDutyWeekday] = useState(1);
  const [selectedDutyProfileId, setSelectedDutyProfileId] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState("");
  const [message, setMessage] = useState("");

  const profileMap = useMemo(() => {
    return new Map(profiles.map((profile) => [profile.id, profile]));
  }, [profiles]);

  const selectedPermissions = useMemo(() => {
    return workPermissions.filter((item) => item.profile_id === selectedProfileId);
  }, [workPermissions, selectedProfileId]);

  async function loadData() {
    setLoading(true);
    setMessage("");
    const response = await fetch("/api/students/settings", { cache: "no-store" });
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "โหลดข้อมูลไม่สำเร็จ");
    }

    setProfiles(data.profiles ?? []);

    const savedSettings: ClassSetting[] = data.classSettings ?? [];
    const merged = emptyClassSettings().map((base) => {
      const found = savedSettings.find(
        (item) => item.class_level === base.class_level && (item.class_room ?? "") === ""
      );
      return found ?? base;
    });

    setClassSettings(merged);
    setWorkPermissions(data.workPermissions ?? []);
    setDutyRoster(data.dutyRoster ?? []);

    if (!selectedProfileId && (data.profiles ?? []).length > 0) {
      setSelectedProfileId(data.profiles[0].id);
    }

    if (!selectedDutyProfileId && (data.profiles ?? []).length > 0) {
      setSelectedDutyProfileId(data.profiles[0].id);
    }

    setLoading(false);
  }

  useEffect(() => {
    loadData().catch((error) => {
      setLoading(false);
      setMessage(error instanceof Error ? error.message : "โหลดข้อมูลไม่สำเร็จ");
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function updateClassAdvisers(level: string, adviserIds: string[]) {
    setClassSettings((current) =>
      current.map((item) =>
        item.class_level === level
          ? {
              ...item,
              adviser_profile_id: adviserIds[0] || null,
              adviser_profile_ids: adviserIds,
            }
          : item
      )
    );
  }

  function togglePermission(permissionKey: string, enabled: boolean) {
    if (!selectedProfileId) return;

    setWorkPermissions((current) => {
      const others = current.filter(
        (item) => !(item.profile_id === selectedProfileId && item.permission_key === permissionKey)
      );

      if (!enabled) return others;

      return [
        ...others,
        {
          profile_id: selectedProfileId,
          permission_key: permissionKey,
          class_levels: [],
        },
      ];
    });
  }

  function togglePermissionLevel(permissionKey: string, level: string, enabled: boolean) {
    if (!selectedProfileId) return;

    setWorkPermissions((current) => {
      const existing = current.find(
        (item) => item.profile_id === selectedProfileId && item.permission_key === permissionKey
      );

      const base = existing ?? {
        profile_id: selectedProfileId,
        permission_key: permissionKey,
        class_levels: [],
      };

      const nextLevels = enabled
        ? Array.from(new Set([...(base.class_levels ?? []), level]))
        : (base.class_levels ?? []).filter((item) => item !== level);

      return [
        ...current.filter(
          (item) => !(item.profile_id === selectedProfileId && item.permission_key === permissionKey)
        ),
        { ...base, class_levels: nextLevels },
      ];
    });
  }

  async function saveClassSettings() {
    setSaving("class");
    setMessage("");
    const response = await fetch("/api/students/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "class-settings", rows: classSettings }),
    });

    const data = await response.json();
    setSaving("");

    if (!response.ok) {
      setMessage(data.error || "บันทึกไม่สำเร็จ");
      return;
    }

    setMessage("บันทึกครูประจำชั้นแล้ว");
    await loadData();
  }

  async function saveWorkPermissions() {
    if (!selectedProfileId) return;

    setSaving("permissions");
    setMessage("");

    const response = await fetch("/api/students/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "work-permissions",
        profile_id: selectedProfileId,
        permissions: selectedPermissions,
      }),
    });

    const data = await response.json();
    setSaving("");

    if (!response.ok) {
      setMessage(data.error || "บันทึกไม่สำเร็จ");
      return;
    }

    setMessage("บันทึกสิทธิ์งานนักเรียนแล้ว");
    await loadData();
  }

  async function saveDutyRoster(nextRows: DutyRoster[]) {
    setSaving("duty");
    setMessage("");

    const response = await fetch("/api/students/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "duty-roster", rows: nextRows }),
    });

    const data = await response.json();
    setSaving("");

    if (!response.ok) {
      setMessage(data.error || "บันทึกไม่สำเร็จ");
      return;
    }

    setMessage("บันทึกครูเวรประจำวันแล้ว");
    await loadData();
  }

  function addDutyTeacher() {
    if (!selectedDutyProfileId) return;

    const exists = dutyRoster.some(
      (item) => item.weekday === selectedDutyWeekday && item.profile_id === selectedDutyProfileId
    );

    if (exists) {
      setMessage("มีรายชื่อนี้ในวันเวรแล้ว");
      return;
    }

    const nextRows = [
      ...dutyRoster,
      { weekday: selectedDutyWeekday, profile_id: selectedDutyProfileId },
    ];

    setDutyRoster(nextRows);
    saveDutyRoster(nextRows);
  }

  function removeDutyTeacher(weekday: number, profileId: string) {
    const nextRows = dutyRoster.filter(
      (item) => !(item.weekday === weekday && item.profile_id === profileId)
    );

    setDutyRoster(nextRows);
    saveDutyRoster(nextRows);
  }

  const classAdviserPermission = selectedPermissions.find(
    (item) => item.permission_key === STUDENT_WORK_PERMISSION_KEYS.classAdviser
  );

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-50 p-4 md:p-8">
        <div className="mx-auto max-w-6xl rounded-2xl bg-white p-6 shadow-sm">
          กำลังโหลดข้อมูล...
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 p-4 md:p-8">
      <div className="mx-auto flex max-w-6xl flex-col gap-6">
        <header className="rounded-3xl bg-gradient-to-r from-indigo-600 to-blue-600 p-6 text-white shadow-sm">
          <p className="text-sm opacity-90">งานนักเรียน</p>
          <h1 className="mt-1 text-2xl font-bold md:text-3xl">ตั้งค่าห้องเรียน</h1>
          <p className="mt-2 text-sm opacity-90">
            กำหนดครูประจำชั้น สิทธิ์งาน และครูเวรประจำวัน
          </p>
        </header>

        {message ? (
          <div className="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
            {message}
          </div>
        ) : null}

        <section className="rounded-3xl bg-white p-5 shadow-sm">
          <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-lg font-bold text-slate-900">ครูประจำชั้น</h2>
              <p className="text-sm text-slate-500">
                ครู 1 คนสามารถประจำชั้นได้หลายชั้น และแต่ละชั้นเลือกครูร่วมได้หลายคน
              </p>
            </div>
            <button
              type="button"
              onClick={saveClassSettings}
              disabled={saving === "class"}
              className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
            >
              {saving === "class" ? "กำลังบันทึก..." : "บันทึกครูประจำชั้น"}
            </button>
          </div>

          <div className="grid gap-3">
            {classSettings.map((setting) => {
              const selectedIds = setting.adviser_profile_ids?.length
                ? setting.adviser_profile_ids
                : setting.adviser_profile_id
                  ? [setting.adviser_profile_id]
                  : [];

              return (
                <div
                  key={setting.class_level}
                  className="rounded-2xl border border-slate-200 p-4"
                >
                  <div className="mb-3 flex items-center justify-between">
                    <div className="font-semibold text-slate-900">{setting.class_level}</div>
                    <div className="text-xs text-slate-500">
                      {selectedIds.length > 0 ? `${selectedIds.length} คน` : "ยังไม่กำหนด"}
                    </div>
                  </div>
                  <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
                    {profiles.map((profile) => (
                      <label
                        key={`${setting.class_level}-${profile.id}`}
                        className="flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2 text-sm"
                      >
                        <input
                          type="checkbox"
                          checked={selectedIds.includes(profile.id)}
                          onChange={(event) => {
                            const nextIds = event.target.checked
                              ? [...selectedIds, profile.id]
                              : selectedIds.filter((id) => id !== profile.id);
                            updateClassAdvisers(setting.class_level, nextIds);
                          }}
                        />
                        <span>{displayName(profile)}</span>
                      </label>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section className="rounded-3xl bg-white p-5 shadow-sm">
          <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-lg font-bold text-slate-900">สิทธิ์งาน</h2>
              <p className="text-sm text-slate-500">
                ใช้ร่วมกับเมนูจัดการสมาชิก เพื่อกำหนดสิทธิ์งานนักเรียนรายบุคคล
              </p>
            </div>
            <button
              type="button"
              onClick={saveWorkPermissions}
              disabled={saving === "permissions" || !selectedProfileId}
              className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
            >
              {saving === "permissions" ? "กำลังบันทึก..." : "บันทึกสิทธิ์งาน"}
            </button>
          </div>

          <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-700">
                เลือกสมาชิก
              </label>
              <select
                value={selectedProfileId}
                onChange={(event) => setSelectedProfileId(event.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
              >
                {profiles.map((profile) => (
                  <option key={profile.id} value={profile.id}>
                    {displayName(profile)}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid gap-4">
              <div className="rounded-2xl border border-slate-200 p-4">
                <label className="flex items-center gap-2 font-semibold text-slate-900">
                  <input
                    type="checkbox"
                    checked={Boolean(classAdviserPermission)}
                    onChange={(event) =>
                      togglePermission(
                        STUDENT_WORK_PERMISSION_KEYS.classAdviser,
                        event.target.checked
                      )
                    }
                  />
                  {STUDENT_WORK_PERMISSION_LABELS[STUDENT_WORK_PERMISSION_KEYS.classAdviser]}
                </label>

                <div className="mt-3 grid gap-2 md:grid-cols-4">
                  {STUDENT_CLASS_LEVELS.map((level) => (
                    <label
                      key={`perm-${level}`}
                      className="flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2 text-sm"
                    >
                      <input
                        type="checkbox"
                        disabled={!classAdviserPermission}
                        checked={Boolean(classAdviserPermission?.class_levels?.includes(level))}
                        onChange={(event) =>
                          togglePermissionLevel(
                            STUDENT_WORK_PERMISSION_KEYS.classAdviser,
                            level,
                            event.target.checked
                          )
                        }
                      />
                      <span>{level}</span>
                    </label>
                  ))}
                </div>
              </div>

              <label className="flex items-center gap-2 rounded-2xl border border-slate-200 p-4 font-semibold text-slate-900">
                <input
                  type="checkbox"
                  checked={selectedPermissions.some(
                    (item) =>
                      item.permission_key === STUDENT_WORK_PERMISSION_KEYS.dutyRosterManager
                  )}
                  onChange={(event) =>
                    togglePermission(
                      STUDENT_WORK_PERMISSION_KEYS.dutyRosterManager,
                      event.target.checked
                    )
                  }
                />
                {STUDENT_WORK_PERMISSION_LABELS[STUDENT_WORK_PERMISSION_KEYS.dutyRosterManager]}
              </label>

              <label className="flex items-center gap-2 rounded-2xl border border-slate-200 p-4 font-semibold text-slate-900">
                <input
                  type="checkbox"
                  checked={selectedPermissions.some(
                    (item) =>
                      item.permission_key === STUDENT_WORK_PERMISSION_KEYS.allClassRecorder
                  )}
                  onChange={(event) =>
                    togglePermission(
                      STUDENT_WORK_PERMISSION_KEYS.allClassRecorder,
                      event.target.checked
                    )
                  }
                />
                {STUDENT_WORK_PERMISSION_LABELS[STUDENT_WORK_PERMISSION_KEYS.allClassRecorder]}
              </label>
            </div>
          </div>
        </section>

        <section className="rounded-3xl bg-white p-5 shadow-sm">
          <div className="mb-4">
            <h2 className="text-lg font-bold text-slate-900">ครูเวรประจำวัน</h2>
            <p className="text-sm text-slate-500">
              ฝ่ายบุคคลหรือผู้มีสิทธิ์จัดการเวรเป็นผู้กำหนด คนอื่นดูตารางเวรได้อย่างเดียว
            </p>
          </div>

          <div className="mb-4 grid gap-3 md:grid-cols-[180px_1fr_auto]">
            <select
              value={selectedDutyWeekday}
              onChange={(event) => setSelectedDutyWeekday(Number(event.target.value))}
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
            >
              {WEEKDAYS.map((weekday) => (
                <option key={weekday.value} value={weekday.value}>
                  {weekday.label}
                </option>
              ))}
            </select>

            <select
              value={selectedDutyProfileId}
              onChange={(event) => setSelectedDutyProfileId(event.target.value)}
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
            >
              {profiles.map((profile) => (
                <option key={profile.id} value={profile.id}>
                  {displayName(profile)}
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={addDutyTeacher}
              disabled={saving === "duty"}
              className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
            >
              เพิ่มครูเวร
            </button>
          </div>

          <div className="grid gap-3 md:grid-cols-5">
            {WEEKDAYS.map((weekday) => {
              const rows = dutyRoster.filter((item) => item.weekday === weekday.value);

              return (
                <div key={weekday.value} className="rounded-2xl border border-slate-200 p-4">
                  <div className="mb-3 font-semibold text-slate-900">{weekday.label}</div>
                  <div className="grid gap-2">
                    {rows.length === 0 ? (
                      <div className="text-sm text-slate-400">ยังไม่กำหนด</div>
                    ) : (
                      rows.map((row) => (
                        <div
                          key={`${weekday.value}-${row.profile_id}`}
                          className="flex items-center justify-between gap-2 rounded-xl bg-slate-50 px-3 py-2 text-sm"
                        >
                          <span>{displayName(profileMap.get(row.profile_id))}</span>
                          <button
                            type="button"
                            onClick={() => removeDutyTeacher(weekday.value, row.profile_id)}
                            className="text-xs font-semibold text-red-600"
                          >
                            ลบ
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </main>
  );
}