"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import styles from "./notification-settings.module.css";

type ThemeKey =
  | "document"
  | "leave"
  | "official-duty"
  | "memo"
  | "order"
  | "all";

type SettingItem = {
  key: string;
  label: string;
};

type SettingGroup = {
  id: string;
  title: string;
  description: string;
  testTheme?: ThemeKey;
  note?: string;
  items: SettingItem[];
};

const GROUPS: SettingGroup[] = [
  {
    id: "attendance",
    title: "การลงเวลา",
    description: "ข้อความที่ส่งเข้ากลุ่ม Telegram สำหรับการลงเวลา",
    note: "สรุปลงเวลาเป็นข้อความอย่างเดียว ไม่มีปุ่ม",
    items: [
      {
        key: "attendance.check_in_group",
        label: "แจ้งเช็กอินเข้ากลุ่ม",
      },
      {
        key: "attendance.daily_summary",
        label: "สรุปการลงเวลาเวลา 08:15 น.",
      },
    ],
  },
  {
    id: "document",
    title: "หนังสือราชการ",
    description: "แจ้งครูและผู้บริหารตามสถานะของงาน",
    testTheme: "document",
    items: [
      {
        key: "document.assigned",
        label: "มอบหมายงานให้ครู",
      },
      {
        key: "document.started",
        label: "ครูเริ่มดำเนินการ",
      },
      {
        key: "document.completed",
        label: "ครูดำเนินการเสร็จสิ้น",
      },
    ],
  },
  {
    id: "leave",
    title: "การลา",
    description: "แจ้งคำขอใหม่และผลการพิจารณา",
    testTheme: "leave",
    items: [
      {
        key: "leave.submitted",
        label: "ยื่นคำขอใหม่",
      },
      {
        key: "leave.approved",
        label: "อนุมัติ",
      },
      {
        key: "leave.rejected",
        label: "ไม่อนุมัติ",
      },
    ],
  },
  {
    id: "official-duty",
    title: "ไปราชการ",
    description: "แจ้งคำขอใหม่และผลการพิจารณา",
    testTheme: "official-duty",
    items: [
      {
        key: "official_duty.submitted",
        label: "ยื่นคำขอใหม่",
      },
      {
        key: "official_duty.approved",
        label: "อนุมัติ",
      },
      {
        key: "official_duty.rejected",
        label: "ไม่อนุมัติ",
      },
    ],
  },
  {
    id: "memo",
    title: "บันทึกข้อความ",
    description: "แจ้งรายการใหม่และผลการพิจารณา",
    testTheme: "memo",
    items: [
      {
        key: "memo.submitted",
        label: "ยื่นรายการใหม่",
      },
      {
        key: "memo.approved",
        label: "อนุมัติ",
      },
      {
        key: "memo.acknowledged",
        label: "รับทราบ",
      },
      {
        key: "memo.rejected",
        label: "ไม่อนุมัติ",
      },
      {
        key: "memo.revision",
        label: "ส่งกลับแก้ไข",
      },
    ],
  },
  {
    id: "order",
    title: "คำสั่ง",
    description: "แจ้งการส่งคำสั่งและผลการพิจารณา",
    testTheme: "order",
    items: [
      {
        key: "order.submitted",
        label: "ส่งคำสั่งใหม่",
      },
      {
        key: "order.resubmitted",
        label: "ส่งคำสั่งแก้ไข",
      },
      {
        key: "order.approved",
        label: "อนุมัติ",
      },
      {
        key: "order.revision",
        label: "ส่งกลับแก้ไข",
      },
    ],
  },
];

const ALL_SETTING_KEYS = [
  "telegram.enabled",
  ...GROUPS.flatMap((group) => group.items.map((item) => item.key)),
];

const DEFAULT_SETTINGS = Object.fromEntries(
  ALL_SETTING_KEYS.map((key) => [key, true])
) as Record<string, boolean>;

export default function NotificationSettingsTab() {
  const supabase = useMemo(() => createClient(), []);
  const [settingsMap, setSettingsMap] =
    useState<Record<string, boolean>>(DEFAULT_SETTINGS);
  const [loadingSettings, setLoadingSettings] = useState(true);
  const [savingSettings, setSavingSettings] = useState(false);
  const [testing, setTesting] = useState<ThemeKey | null>(null);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] =
    useState<"success" | "error">("success");

  const masterEnabled = settingsMap["telegram.enabled"] !== false;

  async function authToken() {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.access_token) {
      throw new Error("ไม่พบเซสชัน กรุณาเข้าสู่ระบบใหม่");
    }

    return session.access_token;
  }

  async function loadNotificationSettings() {
    setLoadingSettings(true);
    setMessage("");

    try {
      const token = await authToken();
      const response = await fetch("/api/admin/telegram-settings", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
        cache: "no-store",
      });

      const result = (await response.json()) as {
        ok?: boolean;
        message?: string;
        settings?: Record<string, boolean>;
      };

      if (!response.ok || !result.ok) {
        throw new Error(result.message || "โหลดการตั้งค่าไม่สำเร็จ");
      }

      setSettingsMap({
        ...DEFAULT_SETTINGS,
        ...(result.settings ?? {}),
      });
    } catch (error) {
      setMessageType("error");
      setMessage(
        error instanceof Error
          ? error.message
          : "โหลดการตั้งค่าไม่สำเร็จ"
      );
    } finally {
      setLoadingSettings(false);
    }
  }

  useEffect(() => {
    void loadNotificationSettings();
  }, []);

  function updateSetting(key: string, value: boolean) {
    setSettingsMap((current) => ({
      ...current,
      [key]: value,
    }));
  }

  function updateGroup(group: SettingGroup, value: boolean) {
    setSettingsMap((current) => {
      const next = { ...current };

      for (const item of group.items) {
        next[item.key] = value;
      }

      return next;
    });
  }

  function groupEnabled(group: SettingGroup) {
    return group.items.every(
      (item) => settingsMap[item.key] !== false
    );
  }

  async function saveNotificationSettings() {
    setSavingSettings(true);
    setMessage("");

    try {
      const token = await authToken();
      const response = await fetch("/api/admin/telegram-settings", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          settings: settingsMap,
        }),
      });

      const result = (await response.json()) as {
        ok?: boolean;
        message?: string;
      };

      if (!response.ok || !result.ok) {
        throw new Error(
          result.message || "บันทึกการตั้งค่าไม่สำเร็จ"
        );
      }

      setMessageType("success");
      setMessage("บันทึกการตั้งค่าการแจ้งเตือนแล้ว");
    } catch (error) {
      setMessageType("error");
      setMessage(
        error instanceof Error
          ? error.message
          : "บันทึกการตั้งค่าไม่สำเร็จ"
      );
    } finally {
      setSavingSettings(false);
    }
  }

  async function testTheme(theme: ThemeKey) {
    setTesting(theme);
    setMessage("");

    try {
      const token = await authToken();
      const response = await fetch("/api/telegram/test-theme", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ theme }),
      });

      const result = (await response.json()) as {
        ok?: boolean;
        message?: string;
      };

      if (!response.ok || !result.ok) {
        throw new Error(
          result.message || "ส่งข้อความทดสอบไม่สำเร็จ"
        );
      }

      setMessageType("success");
      setMessage(
        theme === "all"
          ? "ส่งข้อความทดสอบครบทุกหมวดแล้ว"
          : "ส่งข้อความทดสอบไปยัง Telegram ส่วนตัวแล้ว"
      );
    } catch (error) {
      setMessageType("error");
      setMessage(
        error instanceof Error
          ? error.message
          : "ส่งข้อความทดสอบไม่สำเร็จ"
      );
    } finally {
      setTesting(null);
    }
  }

  return (
    <section className={styles.pageSection}>
      <div className={styles.hero}>
        <div>
          <span>TELEGRAM NOTIFICATIONS</span>
          <h2>ตั้งค่าการแจ้งเตือน</h2>
          <p>
            เปิด–ปิดข้อความ Telegram แยกตามงาน และทดสอบข้อความส่วนตัว
          </p>
        </div>

        <button
          type="button"
          disabled={
            loadingSettings ||
            testing !== null ||
            !masterEnabled
          }
          onClick={() => void testTheme("all")}
        >
          {testing === "all"
            ? "กำลังส่ง..."
            : "ทดสอบทุกหมวด"}
        </button>
      </div>

      {message && (
        <div
          className={
            messageType === "success"
              ? styles.successNotice
              : styles.errorNotice
          }
          role="status"
        >
          {message}
        </div>
      )}

      <div className={styles.masterCard}>
        <div>
          <strong>การแจ้งเตือน Telegram ทั้งระบบ</strong>
          <p>
            เมื่อปิด Workflow และการบันทึกข้อมูลยังทำงานตามปกติ
            แต่ระบบจะไม่ส่งข้อความ Telegram
          </p>
        </div>

        <label className={styles.switch}>
          <input
            type="checkbox"
            checked={masterEnabled}
            disabled={loadingSettings}
            onChange={(event) =>
              updateSetting(
                "telegram.enabled",
                event.target.checked
              )
            }
          />
          <span />
        </label>
      </div>

      {!masterEnabled && (
        <div className={styles.errorNotice}>
          ปิดการแจ้งเตือน Telegram ทั้งระบบอยู่
        </div>
      )}

      <div className={styles.grid}>
        {GROUPS.map((group) => {
          const enabled = groupEnabled(group);

          return (
            <article className={styles.card} key={group.id}>
              <div className={styles.cardHeader}>
                <div>
                  <h3>{group.title}</h3>
                  <p>{group.description}</p>
                </div>

                <label className={styles.switch}>
                  <input
                    type="checkbox"
                    checked={enabled}
                    disabled={
                      loadingSettings || !masterEnabled
                    }
                    onChange={(event) =>
                      updateGroup(group, event.target.checked)
                    }
                  />
                  <span />
                </label>
              </div>

              <div className={styles.itemList}>
                {group.items.map((item) => (
                  <div key={item.key}>
                    <span>{item.label}</span>

                    <label className={styles.switchSmall}>
                      <input
                        type="checkbox"
                        checked={
                          settingsMap[item.key] !== false
                        }
                        disabled={
                          loadingSettings || !masterEnabled
                        }
                        onChange={(event) =>
                          updateSetting(
                            item.key,
                            event.target.checked
                          )
                        }
                      />
                      <span />
                    </label>
                  </div>
                ))}
              </div>

              {group.testTheme && (
                <button
                  type="button"
                  className={styles.testButton}
                  disabled={
                    testing !== null ||
                    !masterEnabled ||
                    !enabled
                  }
                  onClick={() =>
                    void testTheme(group.testTheme!)
                  }
                >
                  {testing === group.testTheme
                    ? "กำลังส่ง..."
                    : `ทดสอบ${group.title}`}
                </button>
              )}

              {group.note && (
                <p className={styles.groupNote}>
                  {group.note}
                </p>
              )}
            </article>
          );
        })}
      </div>

      <button
        type="button"
        className={styles.testButton}
        disabled={loadingSettings || savingSettings}
        onClick={() => void saveNotificationSettings()}
      >
        {savingSettings
          ? "กำลังบันทึก..."
          : "บันทึกการตั้งค่าการแจ้งเตือน"}
      </button>

      <div className={styles.nextStep}>
        <strong>หมายเหตุ</strong>
        <p>
          การตั้งค่าจะมีผลกับข้อความส่วนตัวทุก Workflow
          และสรุปลงเวลา 08:15 น.
          ส่วนแจ้งเช็กอินรายคนเข้ากลุ่มจะเชื่อมกับจุดส่งจริงในขั้นถัดไป
        </p>
      </div>
    </section>
  );
}
