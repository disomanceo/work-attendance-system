"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import styles from "./settings.module.css";
import AcademicYearSettingsField from "./AcademicYearSettingsField";
import PositionWorkPolicySection from "./PositionWorkPolicySection";
import DocumentNumberSection from "./DocumentNumberSection";
import WorkCalendarSection from "./WorkCalendarSection";

type RoleKey = "director" | "teacher" | "staff" | "janitor";

type AttendanceSettings = {
  gps_enabled: boolean;
  latitude: number | null;
  longitude: number | null;
  allowed_radius_meters: number;
  director_start_time: string;
  director_end_time: string;
  teacher_start_time: string;
  teacher_end_time: string;
  staff_start_time: string;
  staff_end_time: string;
  janitor_start_time: string;
  janitor_end_time: string;
  active_fiscal_year: number | null;
  fiscal_year_start_date: string | null;
  fiscal_year_end_date: string | null;
};

type ApiResponse = {
  ok: boolean;
  message?: string;
  settings?: AttendanceSettings;
};

type ResetMode =
  | "attendance_only"
  | "leave_only"
  | "official_duty_only"
  | "memo_only"
  | "full_day";

type ResetItem = {
  id: string;
  label: string;
  detail: string;
};

type ResetSummary = {
  attendanceCount: number;
  leaveCount: number;
  officialDutyCount: number;
  memoCount: number;
  items?: {
    attendance: ResetItem[];
    leave: ResetItem[];
    officialDuty: ResetItem[];
    memo: ResetItem[];
  };
};

const ROLE_ROWS: Array<{
  key: RoleKey;
  title: string;
  description: string;
}> = [
  {
    key: "director",
    title: "ผู้บริหาร",
    description: "กำหนดเวลาปฏิบัติงานของผู้บริหาร",
  },
  {
    key: "teacher",
    title: "ครู",
    description: "กำหนดเวลาปฏิบัติงานของครู",
  },
  {
    key: "staff",
    title: "เจ้าหน้าที่",
    description: "กำหนดเวลาปฏิบัติงานของเจ้าหน้าที่",
  },
  {
    key: "janitor",
    title: "ภารโรง",
    description: "กำหนดเวลาปฏิบัติงานของภารโรง",
  },
];

const DEFAULT_SETTINGS: AttendanceSettings = {
  gps_enabled: true,
  latitude: null,
  longitude: null,
  allowed_radius_meters: 200,
  director_start_time: "07:50",
  director_end_time: "16:30",
  teacher_start_time: "07:50",
  teacher_end_time: "16:30",
  staff_start_time: "07:50",
  staff_end_time: "16:30",
  janitor_start_time: "06:00",
  janitor_end_time: "18:00",
  active_fiscal_year: null,
  fiscal_year_start_date: null,
  fiscal_year_end_date: null,
};

const RESET_MODE_OPTIONS: Array<{
  value: ResetMode;
  title: string;
  description: string;
}> = [
  {
    value: "attendance_only",
    title: "รีเซ็ตเฉพาะการลงเวลา",
    description: "ลบเฉพาะรายการเช็คอิน/เช็คเอาท์ของวันที่เลือก",
  },
  {
    value: "leave_only",
    title: "รีเซ็ตการลา",
    description: "ลบใบลาที่ครอบคลุมวันที่เลือก พร้อมเคลียร์เลขเอกสาร",
  },
  {
    value: "official_duty_only",
    title: "รีเซ็ตการไปราชการ",
    description: "ลบใบไปราชการที่ครอบคลุมวันที่เลือกและรายการลงเวลาไปราชการ",
  },
  {
    value: "memo_only",
    title: "รีเซ็ตบันทึกข้อความ",
    description: "ลบบันทึกข้อความที่ยื่นในวันที่เลือก พร้อมไฟล์แนบในระบบ",
  },
  {
    value: "full_day",
    title: "รีเซ็ตทั้งวัน",
    description: "ลบการลงเวลา ใบลา ไปราชการ บันทึกข้อความ และข้อมูลที่เกี่ยวข้อง",
  },
];

function normalizeTime(value: string) {
  return value.slice(0, 5);
}

function getResetTotal(summary: ResetSummary | null, mode: ResetMode) {
  if (!summary) return 0;
  if (mode === "attendance_only") return summary.attendanceCount;
  if (mode === "leave_only") return summary.leaveCount;
  if (mode === "official_duty_only") return summary.officialDutyCount;
  if (mode === "memo_only") return summary.memoCount;

  return (
    summary.attendanceCount +
    summary.leaveCount +
    summary.officialDutyCount +
    summary.memoCount
  );
}

function getResetModeTitle(mode: ResetMode) {
  return (
    RESET_MODE_OPTIONS.find((option) => option.value === mode)?.title ||
    "รีเซ็ตข้อมูล"
  );
}

function getPreviewItems(summary: ResetSummary | null, mode: ResetMode) {
  if (!summary?.items) return [];
  if (mode === "attendance_only") return summary.items.attendance;
  if (mode === "leave_only") return summary.items.leave;
  if (mode === "official_duty_only") return summary.items.officialDuty;
  if (mode === "memo_only") return summary.items.memo;

  return [
    ...summary.items.attendance,
    ...summary.items.leave,
    ...summary.items.officialDuty,
    ...summary.items.memo,
  ];
}

export default function DirectorSettingsPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [settings, setSettings] =
    useState<AttendanceSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [locating, setLocating] = useState(false);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] =
    useState<"success" | "error">("success");
  const [resetDate, setResetDate] = useState("");
  const [resetMode, setResetMode] =
    useState<ResetMode>("attendance_only");
  const [resetSummary, setResetSummary] =
    useState<ResetSummary | null>(null);
  const [checkingReset, setCheckingReset] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [resetConfirmation, setResetConfirmation] = useState("");

  useEffect(() => {
    if (!message) return;

    const timer = window.setTimeout(() => {
      setMessage("");
    }, 3500);

    return () => window.clearTimeout(timer);
  }, [message]);

  useEffect(() => {
    async function loadSettings() {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!session?.access_token) {
          router.replace("/login");
          return;
        }

        const response = await fetch(
          "/api/admin/attendance-settings",
          {
            headers: {
              Authorization: `Bearer ${session.access_token}`,
            },
            cache: "no-store",
          }
        );

        const result = (await response.json()) as ApiResponse;

        if (!response.ok || !result.ok || !result.settings) {
          if (response.status === 401) {
            router.replace("/login");
            return;
          }

          if (response.status === 403) {
            router.replace("/attendance");
            return;
          }

          throw new Error(
            result.message || "ไม่สามารถโหลดการตั้งค่าได้"
          );
        }

        setSettings({
          ...result.settings,
          director_start_time: normalizeTime(
            result.settings.director_start_time
          ),
          director_end_time: normalizeTime(
            result.settings.director_end_time
          ),
          teacher_start_time: normalizeTime(
            result.settings.teacher_start_time
          ),
          teacher_end_time: normalizeTime(
            result.settings.teacher_end_time
          ),
          staff_start_time: normalizeTime(
            result.settings.staff_start_time
          ),
          staff_end_time: normalizeTime(
            result.settings.staff_end_time
          ),
          janitor_start_time: normalizeTime(
            result.settings.janitor_start_time
          ),
          janitor_end_time: normalizeTime(
            result.settings.janitor_end_time
          ),
        });
      } catch (error) {
        setMessageType("error");
        setMessage(
          error instanceof Error
            ? error.message
            : "ไม่สามารถโหลดการตั้งค่าได้"
        );
      } finally {
        setLoading(false);
      }
    }

    void loadSettings();
  }, [router, supabase]);

  function updateTime(
    role: RoleKey,
    type: "start" | "end",
    value: string
  ) {
    const key = `${role}_${type}_time` as keyof AttendanceSettings;

    setSettings((current) => ({
      ...current,
      [key]: value,
    }));
  }

  function useCurrentLocation() {
    setMessage("");

    if (!navigator.geolocation) {
      setMessageType("error");
      setMessage("อุปกรณ์นี้ไม่รองรับการระบุตำแหน่ง");
      return;
    }

    setLocating(true);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setSettings((current) => ({
          ...current,
          latitude: Number(position.coords.latitude.toFixed(7)),
          longitude: Number(position.coords.longitude.toFixed(7)),
        }));

        setMessageType("success");
        setMessage("นำพิกัดปัจจุบันมาใส่เรียบร้อยแล้ว");
        setLocating(false);
      },
      (error) => {
        const messages: Record<number, string> = {
          1: "กรุณาอนุญาตให้เว็บไซต์เข้าถึงตำแหน่ง",
          2: "ไม่สามารถตรวจหาตำแหน่งปัจจุบันได้",
          3: "ตรวจหาตำแหน่งนานเกินไป กรุณาลองใหม่",
        };

        setMessageType("error");
        setMessage(
          messages[error.code] ||
            "ไม่สามารถตรวจหาตำแหน่งปัจจุบันได้"
        );
        setLocating(false);
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0,
      }
    );
  }

  async function checkResetDate() {
    if (!resetDate) {
      setMessageType("error");
      setMessage("กรุณาเลือกวันที่ที่ต้องการรีเซ็ต");
      return;
    }

    setCheckingReset(true);
    setMessage("");

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        router.replace("/login");
        return;
      }

      const response = await fetch(
        `/api/admin/attendance-reset?date=${encodeURIComponent(
          resetDate
        )}&mode=${encodeURIComponent(
          resetMode
        )}`,
        {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
          cache: "no-store",
        }
      );

      const result = (await response.json()) as {
        ok: boolean;
        count?: number;
        attendanceCount?: number;
        leaveCount?: number;
        officialDutyCount?: number;
        memoCount?: number;
        items?: ResetSummary["items"];
        message?: string;
      };

      if (!response.ok || !result.ok) {
        throw new Error(
          result.message || "ไม่สามารถตรวจสอบข้อมูลได้"
        );
      }

      const summary = {
        attendanceCount: result.attendanceCount ?? result.count ?? 0,
        leaveCount: result.leaveCount ?? 0,
        officialDutyCount: result.officialDutyCount ?? 0,
        memoCount: result.memoCount ?? 0,
        items: result.items,
      };
      const total = getResetTotal(summary, resetMode);

      setResetSummary(summary);

      if (total === 0) {
        setMessageType("error");
        setMessage("ไม่พบข้อมูลที่ต้องรีเซ็ตในวันที่เลือก");
        return;
      }

      setResetConfirmation("");
      setShowResetConfirm(true);
    } catch (error) {
      setMessageType("error");
      setMessage(
        error instanceof Error
          ? error.message
          : "ไม่สามารถตรวจสอบข้อมูลได้"
      );
    } finally {
      setCheckingReset(false);
    }
  }

  async function confirmResetHistory() {
    if (resetConfirmation.trim() !== "ยืนยัน") {
      setMessageType("error");
      setMessage('กรุณาพิมพ์คำว่า "ยืนยัน" ให้ตรง');
      return;
    }

    setResetting(true);
    setMessage("");

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        router.replace("/login");
        return;
      }

      const response = await fetch(
        "/api/admin/attendance-reset",
        {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            date: resetDate,
            confirmation: resetConfirmation,
            mode: resetMode,
          }),
        }
      );

      const result = (await response.json()) as {
        ok: boolean;
        deletedCount?: number;
        message?: string;
      };

      if (!response.ok || !result.ok) {
        throw new Error(
          result.message ||
            "ไม่สามารถรีเซ็ตประวัติการลงเวลาได้"
        );
      }

      setMessageType("success");
      setMessage(
        result.message ||
          "รีเซ็ตประวัติการลงเวลาเรียบร้อยแล้ว"
      );
      setResetSummary(null);
      setResetConfirmation("");
      setShowResetConfirm(false);
    } catch (error) {
      setMessageType("error");
      setMessage(
        error instanceof Error
          ? error.message
          : "ไม่สามารถรีเซ็ตประวัติการลงเวลาได้"
      );
    } finally {
      setResetting(false);
    }
  }

  async function saveSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage("");

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        router.replace("/login");
        return;
      }

      const response = await fetch(
        "/api/admin/attendance-settings",
        {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(settings),
        }
      );

      const result = (await response.json()) as ApiResponse;

      if (!response.ok || !result.ok) {
        throw new Error(
          result.message || "ไม่สามารถบันทึกการตั้งค่าได้"
        );
      }

      setMessageType("success");
      setMessage(
        result.message || "บันทึกการตั้งค่าเรียบร้อยแล้ว"
      );
    } catch (error) {
      setMessageType("error");
      setMessage(
        error instanceof Error
          ? error.message
          : "ไม่สามารถบันทึกการตั้งค่าได้"
      );
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <main className={styles.loading}>
        กำลังโหลดการตั้งค่า...
      </main>
    );
  }

  const gpsSummary = settings.gps_enabled
    ? `เปิดใช้งาน / ${settings.allowed_radius_meters} เมตร`
    : "ปิดใช้งาน";
  const coordinateSummary =
    settings.latitude !== null && settings.longitude !== null
      ? `${settings.latitude}, ${settings.longitude}`
      : "ยังไม่ได้กำหนดพิกัด";
  const fiscalSummary = settings.active_fiscal_year
    ? `พ.ศ. ${settings.active_fiscal_year}`
    : "ยังไม่ได้กำหนด";
  const fiscalRangeSummary =
    settings.fiscal_year_start_date && settings.fiscal_year_end_date
      ? `${settings.fiscal_year_start_date} - ${settings.fiscal_year_end_date}`
      : "ยังไม่ได้กำหนดช่วงวันที่";
  const resetTotal = getResetTotal(resetSummary, resetMode);
  const resetPreviewItems = getPreviewItems(resetSummary, resetMode);

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <span>SYSTEM SETTINGS</span>
          <h1>ตั้งค่าระบบ</h1>
          <p>
            จัดกลุ่มการตั้งค่าที่จำเป็นของระบบลงเวลา
            สิทธิ์การลา เลขเอกสาร และข้อมูลที่มีผลกับรายงาน
          </p>
        </div>

        <button
          type="button"
          onClick={() => router.push("/attendance")}
        >
          กลับหน้าลงเวลา
        </button>
      </header>

      {message && (
        <div
          role="status"
          className={
            messageType === "success"
              ? `${styles.centerNotice} ${styles.centerNoticeSuccess}`
              : `${styles.centerNotice} ${styles.centerNoticeError}`
          }
        >
          <strong>
            {messageType === "success" ? "ดำเนินการสำเร็จ" : "ไม่สำเร็จ"}
          </strong>
          {message}
        </div>
      )}

      <div className={styles.settingsWorkspace}>
        <div className={styles.primaryColumn}>
          <form className={styles.settingsGrid} onSubmit={saveSettings}>
            <section className={`${styles.card} ${styles.gpsCard}`}>
              <div className={styles.cardHeading}>
                <div>
                  <span className={styles.cardIcon}>⌖</span>
                  <h2>ตำแหน่งและ GPS</h2>
                  <p>
                    เปิดเพื่อตรวจระยะห่างจากพิกัดโรงเรียนก่อนบันทึกเวลา
                  </p>
                </div>

                <label className={styles.switch}>
                  <input
                    type="checkbox"
                    checked={settings.gps_enabled}
                    onChange={(event) =>
                      setSettings((current) => ({
                        ...current,
                        gps_enabled: event.target.checked,
                      }))
                    }
                  />
                  <span />
                </label>
              </div>

              <div
                className={`${styles.gpsSettings} ${
                  !settings.gps_enabled ? styles.disabled : ""
                }`}
              >
                <div className={styles.locationHeading}>
                  <div>
                    <h3>พิกัดสถานที่ลงเวลา</h3>
                    <p>
                      สามารถพิมพ์พิกัดเองหรือใช้ตำแหน่งปัจจุบันของอุปกรณ์
                    </p>
                  </div>

                  <button
                    type="button"
                    className={styles.locationButton}
                    disabled={!settings.gps_enabled || locating}
                    onClick={useCurrentLocation}
                  >
                    {locating
                      ? "กำลังค้นหาพิกัด..."
                      : "ใช้ตำแหน่งปัจจุบัน"}
                  </button>
                </div>

                <div className={styles.coordinateGrid}>
                  <label>
                    <span>ละติจูด</span>
                    <input
                      type="number"
                      step="0.0000001"
                      min="-90"
                      max="90"
                      disabled={!settings.gps_enabled}
                      value={settings.latitude ?? ""}
                      placeholder="เช่น 14.3971234"
                      onChange={(event) =>
                        setSettings((current) => ({
                          ...current,
                          latitude:
                            event.target.value === ""
                              ? null
                              : Number(event.target.value),
                        }))
                      }
                    />
                  </label>

                  <label>
                    <span>ลองจิจูด</span>
                    <input
                      type="number"
                      step="0.0000001"
                      min="-180"
                      max="180"
                      disabled={!settings.gps_enabled}
                      value={settings.longitude ?? ""}
                      placeholder="เช่น 100.1612345"
                      onChange={(event) =>
                        setSettings((current) => ({
                          ...current,
                          longitude:
                            event.target.value === ""
                              ? null
                              : Number(event.target.value),
                        }))
                      }
                    />
                  </label>

                  <label>
                    <span>ระยะที่อนุญาต</span>
                    <div className={styles.radiusInput}>
                      <input
                        type="number"
                        min="0"
                        step="1"
                        disabled={!settings.gps_enabled}
                        value={settings.allowed_radius_meters}
                        onChange={(event) =>
                          setSettings((current) => ({
                            ...current,
                            allowed_radius_meters: Number(
                              event.target.value
                            ),
                          }))
                        }
                      />
                      <b>เมตร</b>
                    </div>
                  </label>
                </div>
              </div>
            </section>
            <WorkCalendarSection />


            <PositionWorkPolicySection
              roles={ROLE_ROWS}
              getStartTime={(role) =>
                String(
                  settings[
                    `${role}_start_time` as keyof AttendanceSettings
                  ]
                )
              }
              getEndTime={(role) =>
                String(
                  settings[
                    `${role}_end_time` as keyof AttendanceSettings
                  ]
                )
              }
              onTimeChange={updateTime}
            />

        <section className={`${styles.card} ${styles.fiscalCard}`} id="fiscal-year-settings">
          <div className={styles.sectionHeading}>
            <span className={styles.cardIcon}>◷</span>
            <h2>ปีงบประมาณอ้างอิง</h2>
            <p>
              กำหนดปีงบประมาณที่ใช้กับระบบลา จำนวนครั้งลา
              รายงาน และข้อมูลเพื่อการประเมิน
            </p>
          </div>

          <div className={styles.timeGrid}>
            <label>
              <span>ปีงบประมาณ (พ.ศ.)</span>
              <input
                type="number"
                min="2500"
                max="2700"
                required
                value={settings.active_fiscal_year ?? ""}
                placeholder="เช่น 2570"
                onChange={(event) =>
                  setSettings((current) => ({
                    ...current,
                    active_fiscal_year:
                      event.target.value === ""
                        ? null
                        : Number(event.target.value),
                  }))
                }
              />
            </label>

            <label>
              <span>วันที่เริ่มปีงบประมาณ</span>
              <input
                type="date"
                required
                value={settings.fiscal_year_start_date ?? ""}
                onChange={(event) =>
                  setSettings((current) => ({
                    ...current,
                    fiscal_year_start_date:
                      event.target.value || null,
                  }))
                }
              />
            </label>

            <label>
              <span>วันที่สิ้นสุดปีงบประมาณ</span>
              <input
                type="date"
                required
                min={settings.fiscal_year_start_date ?? undefined}
                value={settings.fiscal_year_end_date ?? ""}
                onChange={(event) =>
                  setSettings((current) => ({
                    ...current,
                    fiscal_year_end_date:
                      event.target.value || null,
                  }))
                }
              />
            </label>
          </div>

          <AcademicYearSettingsField />

          <p>
            ระบบเก็บปีงบประมาณเป็น พ.ศ. โดยตรง
            จึงไม่บวก 543 ซ้ำอีก
          </p>
        </section>

        <section className={`${styles.card} ${styles.dangerCard}`}>
          <div className={styles.sectionHeading}>
            <span className={styles.dangerEyebrow}>
              DANGER ZONE
            </span>
            <h2>รีเซ็ตประวัติการลงเวลา</h2>
            <p>
              ใช้เมื่อต้องการล้างข้อมูลของวันที่เลือก
              เลือกได้ว่าจะรีเซ็ตเฉพาะลงเวลา หรือเคลียร์ทั้งวันพร้อมรายการที่เกี่ยวข้อง
            </p>
          </div>

          <div className={styles.resetModeGroup}>
            {RESET_MODE_OPTIONS.map((option) => (
              <label
                key={option.value}
                className={
                  resetMode === option.value
                    ? styles.resetModeActive
                    : ""
                }
              >
                <input
                  type="radio"
                  name="resetMode"
                  value={option.value}
                  checked={resetMode === option.value}
                  onChange={() => {
                    setResetMode(option.value);
                    setResetSummary(null);
                    setShowResetConfirm(false);
                  }}
                />
                <span>
                  <strong>{option.title}</strong>
                  <small>{option.description}</small>
                </span>
              </label>
            ))}
          </div>

          <div className={styles.resetRow}>
            <label>
              <span>วันที่ที่ต้องการรีเซ็ต</span>
              <input
                type="date"
                value={resetDate}
                onChange={(event) => {
                  setResetDate(event.target.value);
                  setResetSummary(null);
                  setShowResetConfirm(false);
                }}
              />
            </label>

            <button
              type="button"
              className={styles.resetCheckButton}
              disabled={checkingReset || !resetDate}
              onClick={() => void checkResetDate()}
            >
              {checkingReset
                ? "กำลังตรวจสอบ..."
                : "ตรวจสอบและรีเซ็ต"}
            </button>
          </div>

          {resetSummary !== null && (
            <div className={styles.resetSummary}>
              <strong>พบข้อมูลที่จะรีเซ็ต {resetTotal} รายการ</strong>
              <span>ลงเวลา {resetSummary.attendanceCount} รายการ</span>
              <span>ใบลา {resetSummary.leaveCount} รายการ</span>
              <span>ไปราชการ {resetSummary.officialDutyCount} รายการ</span>
              <span>บันทึกข้อความ {resetSummary.memoCount} รายการ</span>
              {resetPreviewItems.length > 0 && (
                <div className={styles.resetPreviewList}>
                  {resetPreviewItems.slice(0, 8).map((item) => (
                    <span key={item.id}>
                      {item.label}: {item.detail}
                    </span>
                  ))}
                  {resetPreviewItems.length > 8 && (
                    <span>และอีก {resetPreviewItems.length - 8} รายการ</span>
                  )}
                </div>
              )}
            </div>
          )}
        </section>

        {showResetConfirm && (
          <div className={styles.confirmOverlay}>
            <section
              className={styles.confirmModal}
              role="dialog"
              aria-modal="true"
            >
              <span className={styles.warningIcon}>!</span>

              <h2>ยืนยันการรีเซ็ตข้อมูล</h2>

              <p>
                ระบบจะรีเซ็ตข้อมูลวันที่ <strong>{resetDate}</strong>{" "}
                แบบ{" "}
                <strong>
                  {getResetModeTitle(resetMode)}
                </strong>{" "}
                จำนวน <strong>{resetTotal}</strong> รายการ
              </p>

              {resetSummary && (
                <div className={styles.confirmSummary}>
                  <span>ลงเวลา {resetSummary.attendanceCount} รายการ</span>
                  <span>ใบลา {resetSummary.leaveCount} รายการ</span>
                  <span>ไปราชการ {resetSummary.officialDutyCount} รายการ</span>
                  <span>บันทึกข้อความ {resetSummary.memoCount} รายการ</span>
                  {resetPreviewItems.slice(0, 8).map((item) => (
                    <span key={item.id}>
                      {item.label}: {item.detail}
                    </span>
                  ))}
                  {resetPreviewItems.length > 8 && (
                    <span>และอีก {resetPreviewItems.length - 8} รายการ</span>
                  )}
                </div>
              )}

              <p className={styles.warningText}>
                การดำเนินการนี้ไม่สามารถย้อนกลับได้
              </p>

              <label>
                <span>
                  พิมพ์คำว่า <b>ยืนยัน</b> เพื่อยืนยัน
                </span>
                <input
                  type="text"
                  value={resetConfirmation}
                  placeholder="ยืนยัน"
                  onChange={(event) =>
                    setResetConfirmation(event.target.value)
                  }
                />
              </label>

              <div className={styles.confirmActions}>
                <button
                  type="button"
                  className={styles.cancelResetButton}
                  disabled={resetting}
                  onClick={() => {
                    setShowResetConfirm(false);
                    setResetConfirmation("");
                  }}
                >
                  ยกเลิก
                </button>

                <button
                  type="button"
                  className={styles.confirmResetButton}
                  disabled={
                    resetting ||
                    resetConfirmation.trim() !== "ยืนยัน"
                  }
                  onClick={() =>
                    void confirmResetHistory()
                  }
                >
                  {resetting
                    ? "กำลังรีเซ็ต..."
                    : "ยืนยันรีเซ็ตข้อมูล"}
                </button>
              </div>
            </section>
          </div>
        )}

        <div className={styles.saveBar}>
          <div>
            <strong>บันทึกการตั้งค่ารวม</strong>
            <p>
              ใช้กับตำแหน่ง GPS เวลาทำงาน และปีงบประมาณ
              ส่วนสิทธิ์ตามตำแหน่งกับเลขเอกสารมีปุ่มบันทึกแยก
            </p>
          </div>

          <button type="submit" disabled={saving}>
            {saving ? "กำลังบันทึก..." : "บันทึกการตั้งค่ารวม"}
          </button>
        </div>
          </form>

          <DocumentNumberSection />
        </div>

        <aside className={styles.overviewPanel}>
          <div className={styles.overviewHeader}>
            <span>ภาพรวม</span>
            <h2>สถานะการตั้งค่า</h2>
          </div>

          <div className={styles.overviewList}>
            <div>
              <span>GPS</span>
              <strong>{gpsSummary}</strong>
              <small>{coordinateSummary}</small>
            </div>

            <div>
              <span>เวลาครู</span>
              <strong>
                {settings.teacher_start_time} - {settings.teacher_end_time}
              </strong>
              <small>ใช้ตรวจการมาสายและการลงเวลา</small>
            </div>

            <div>
              <span>เวลาภารโรง</span>
              <strong>
                {settings.janitor_start_time} - {settings.janitor_end_time}
              </strong>
              <small>กำหนดแยกจากครูและเจ้าหน้าที่</small>
            </div>

            <div>
              <span>ปีงบประมาณ</span>
              <strong>{fiscalSummary}</strong>
              <small>{fiscalRangeSummary}</small>
            </div>

            <div>
              <span>การบันทึกแยก</span>
              <strong>สิทธิ์ตามตำแหน่ง / เลขเอกสาร</strong>
              <small>มีปุ่มบันทึกของแต่ละหมวด</small>
            </div>
          </div>
        </aside>
      </div>
    </main>
  );
}

