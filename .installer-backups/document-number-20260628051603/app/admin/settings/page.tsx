"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import styles from "./settings.module.css";
import PositionWorkPolicySection from "./PositionWorkPolicySection";
import DocumentNumberSection from "./DocumentNumberSection";

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

function normalizeTime(value: string) {
  return value.slice(0, 5);
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
  const [resetCount, setResetCount] = useState<number | null>(null);
  const [checkingReset, setCheckingReset] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [resetConfirmation, setResetConfirmation] = useState("");

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
        message?: string;
      };

      if (!response.ok || !result.ok) {
        throw new Error(
          result.message || "ไม่สามารถตรวจสอบข้อมูลได้"
        );
      }

      const count = result.count ?? 0;
      setResetCount(count);

      if (count === 0) {
        setMessageType("error");
        setMessage("ไม่พบประวัติการลงเวลาในวันที่เลือก");
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
    if (resetConfirmation !== resetDate) {
      setMessageType("error");
      setMessage(
        `กรุณาพิมพ์วันที่ ${resetDate} ให้ตรงเพื่อยืนยัน`
      );
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
      setResetCount(null);
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

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <span>DIRECTOR SETTINGS</span>
          <h1>ตั้งค่าการลงเวลา</h1>
          <p>
            กำหนดตำแหน่งโรงเรียน การตรวจ GPS
            และเวลาปฏิบัติงานของแต่ละตำแหน่ง
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
          className={
            messageType === "success"
              ? styles.successMessage
              : styles.errorMessage
          }
        >
          {message}
        </div>
      )}

      <form className={styles.settingsGrid} onSubmit={saveSettings}>
        <section className={`${styles.card} ${styles.gpsCard}`}>
          <div className={styles.cardHeading}>
            <div>
              <h2>การตรวจจับตำแหน่ง GPS</h2>
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
              ใช้เมื่อต้องการล้างข้อมูลลงเวลาที่ผิดพลาดของทั้งวัน
              หลังรีเซ็ต บุคลากรสามารถลงเวลาใหม่ในวันดังกล่าวได้
            </p>
          </div>

          <div className={styles.resetRow}>
            <label>
              <span>วันที่ที่ต้องการรีเซ็ต</span>
              <input
                type="date"
                value={resetDate}
                onChange={(event) => {
                  setResetDate(event.target.value);
                  setResetCount(null);
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

          {resetCount !== null && resetCount > 0 && (
            <p className={styles.resetCount}>
              พบข้อมูลในวันที่เลือก {resetCount} รายการ
            </p>
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
                ระบบจะลบประวัติการลงเวลาทั้งหมดของวันที่{" "}
                <strong>{resetDate}</strong> จำนวน{" "}
                <strong>{resetCount ?? 0}</strong> รายการ
              </p>

              <p className={styles.warningText}>
                การดำเนินการนี้ไม่สามารถย้อนกลับได้
              </p>

              <label>
                <span>
                  พิมพ์วันที่ <b>{resetDate}</b> เพื่อยืนยัน
                </span>
                <input
                  type="text"
                  value={resetConfirmation}
                  placeholder={resetDate}
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
                    resetConfirmation !== resetDate
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
            <strong>ระบบจะใช้ค่าที่บันทึกทันที</strong>
            <p>
              พิกัดใช้ตรวจ GPS เวลาเริ่มใช้ตรวจมาสาย
              และเวลาเลิกงานใช้สร้างเอกสารประจำวัน
            </p>
          </div>

          <button type="submit" disabled={saving}>
            {saving ? "กำลังบันทึก..." : "บันทึกการตั้งค่า"}
          </button>
        </div>
      </form>

      <DocumentNumberSection />
    </main>
  );
}

