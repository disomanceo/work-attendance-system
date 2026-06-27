"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import styles from "./settings.module.css";

type RoleKey =
  | "director"
  | "teacher"
  | "staff"
  | "janitor";

type Policy = {
  role_key: RoleKey;
  fiscal_year: number;
  sick_leave_days: number;
  personal_leave_days: number;
  late_limit_count: number;
  grace_minutes: number;
    combined_leave_times_limit: number;
  combined_leave_days_limit: number;
is_active: boolean;
};

type RoleRow = {
  key: RoleKey;
  title: string;
  description: string;
};

type Props = {
  roles: RoleRow[];
  getStartTime: (role: RoleKey) => string;
  getEndTime: (role: RoleKey) => string;
  onTimeChange: (
    role: RoleKey,
    type: "start" | "end",
    value: string
  ) => void;
};

export default function PositionWorkPolicySection({
  roles,
  getStartTime,
  getEndTime,
  onTimeChange,
}: Props) {
  const supabase = useMemo(
    () => createClient(),
    []
  );

  const [fiscalYear, setFiscalYear] =
    useState(0);

  const [policies, setPolicies] =
    useState<Policy[]>([]);

  const [loading, setLoading] =
    useState(true);

  const [saving, setSaving] =
    useState(false);

  const [message, setMessage] =
    useState("");

  const [error, setError] =
    useState("");

  useEffect(() => {
    async function loadPolicies() {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!session?.access_token) {
          throw new Error(
            "กรุณาเข้าสู่ระบบใหม่"
          );
        }

        const response = await fetch(
          "/api/admin/position-policies",
          {
            headers: {
              Authorization:
                `Bearer ${session.access_token}`,
            },
            cache: "no-store",
          }
        );

        const result = await response.json();

        if (!response.ok || !result.ok) {
          throw new Error(
            result.detail ||
              result.message ||
              "โหลดสิทธิ์ตามตำแหน่งไม่สำเร็จ"
          );
        }

        setFiscalYear(result.fiscalYear);
        setPolicies(result.policies);
      } catch (loadError) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "โหลดสิทธิ์ตามตำแหน่งไม่สำเร็จ"
        );
      } finally {
        setLoading(false);
      }
    }

    void loadPolicies();
  }, [supabase]);

  function getPolicy(role: RoleKey) {
    return policies.find(
      (item) => item.role_key === role
    );
  }

  function updatePolicy(
    role: RoleKey,
    field:
      | "sick_leave_days"
      | "personal_leave_days"
      | "late_limit_count"
      | "grace_minutes"
      | "combined_leave_times_limit"
      | "combined_leave_days_limit",
    value: number
  ) {
    setPolicies((current) =>
      current.map((item) =>
        item.role_key === role
          ? {
              ...item,
              [field]: Math.max(
                0,
                Number.isFinite(value)
                  ? value
                  : 0
              ),
            }
          : item
      )
    );
  }

  async function savePolicies() {
    setSaving(true);
    setMessage("");
    setError("");

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        throw new Error(
          "กรุณาเข้าสู่ระบบใหม่"
        );
      }

      const response = await fetch(
        "/api/admin/position-policies",
        {
          method: "PUT",
          headers: {
            Authorization:
              `Bearer ${session.access_token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            fiscalYear,
            policies,
          }),
        }
      );

      const result = await response.json();

      if (!response.ok || !result.ok) {
        throw new Error(
          result.detail ||
            result.message ||
            "บันทึกสิทธิ์ไม่สำเร็จ"
        );
      }

      setMessage(
        result.message ||
          "บันทึกสิทธิ์ตามตำแหน่งเรียบร้อยแล้ว"
      );
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "บันทึกสิทธิ์ไม่สำเร็จ"
      );
    } finally {
      setSaving(false);
    }
  }


  return (
    <section className={styles.policySection}>
      <div className={styles.policyHeader}>
        <h2>
          การปฏิบัติงาน สิทธิ์การลา
          และเกณฑ์มาสายตามตำแหน่ง
        </h2>

        <p>
          ปีงบประมาณ {fiscalYear || "-"} —
          กำหนดค่าทั้งหมดแยกตามตำแหน่ง
        </p>
      </div>

      {message && (
        <div className={styles.policyMessage}>
          {message}
        </div>
      )}

      {error && (
        <div className={styles.policyError}>
          {error}
        </div>
      )}

      {loading ? (
        <p>กำลังโหลดสิทธิ์ตามตำแหน่ง...</p>
      ) : (
        <div className={styles.policyGrid}>
          {roles.map((role) => {
            const policy =
              getPolicy(role.key);

            if (!policy) {
              return null;
            }

            return (
              <article
                key={role.key}
                className={styles.policyCard}
              >
                <div>
                  <h3>
                    {role.title}
                  </h3>

                  <p>
                    {role.description}
                  </p>
                </div>

                <div className={styles.policyFields}>
                  <label>
                    <span>เวลาเริ่ม</span>
                    <input
                      type="time"
                      required
                      className={styles.policyInput}
                      value={getStartTime(
                        role.key
                      )}
                      onChange={(event) =>
                        onTimeChange(
                          role.key,
                          "start",
                          event.target.value
                        )
                      }
                    />
                  </label>

                  <label>
                    <span>เวลาเลิกงาน</span>
                    <input
                      type="time"
                      required
                      className={styles.policyInput}
                      value={getEndTime(
                        role.key
                      )}
                      onChange={(event) =>
                        onTimeChange(
                          role.key,
                          "end",
                          event.target.value
                        )
                      }
                    />
                  </label>

                  <label>
                    <span>ลาป่วย (วัน)</span>
                    <input
                      type="number"
                      min="0"
                      max="365"
                      className={styles.policyInput}
                      value={
                        policy.sick_leave_days
                      }
                      onChange={(event) =>
                        updatePolicy(
                          role.key,
                          "sick_leave_days",
                          Number(
                            event.target.value
                          )
                        )
                      }
                    />
                  </label>

                  <label>
                    <span>ลากิจ (วัน)</span>
                    <input
                      type="number"
                      min="0"
                      max="365"
                      className={styles.policyInput}
                      value={
                        policy.personal_leave_days
                      }
                      onChange={(event) =>
                        updatePolicy(
                          role.key,
                          "personal_leave_days",
                          Number(
                            event.target.value
                          )
                        )
                      }
                    />
                  </label>
                  <label>
                    <span>เกณฑ์รวมลา (ครั้ง)</span>
                    <input
                      type="number"
                      min="0"
                      max="999"
                      className={styles.policyInput}
                      value={policy.combined_leave_times_limit}
                      onChange={(event) =>
                        updatePolicy(
                          role.key,
                          "combined_leave_times_limit",
                          Number(event.target.value)
                        )
                      }
                    />
                  </label>

                  <label>
                    <span>เกณฑ์รวมลา (วัน)</span>
                    <input
                      type="number"
                      min="0"
                      max="365"
                      className={styles.policyInput}
                      value={policy.combined_leave_days_limit}
                      onChange={(event) =>
                        updatePolicy(
                          role.key,
                          "combined_leave_days_limit",
                          Number(event.target.value)
                        )
                      }
                    />
                  </label>



                  <label>
                    <span>มาสายได้ (ครั้ง)</span>
                    <input
                      type="number"
                      min="0"
                      max="999"
                      className={styles.policyInput}
                      value={
                        policy.late_limit_count
                      }
                      onChange={(event) =>
                        updatePolicy(
                          role.key,
                          "late_limit_count",
                          Number(
                            event.target.value
                          )
                        )
                      }
                    />
                  </label>

                  <label>
                    <span>ผ่อนผัน (นาที)</span>
                    <input
                      type="number"
                      min="0"
                      max="180"
                      className={styles.policyInput}
                      value={
                        policy.grace_minutes
                      }
                      onChange={(event) =>
                        updatePolicy(
                          role.key,
                          "grace_minutes",
                          Number(
                            event.target.value
                          )
                        )
                      }
                    />
                  </label>
                </div>
              </article>
            );
          })}
        </div>
      )}

      <button
        type="button"
        disabled={
          saving ||
          loading ||
          policies.length === 0
        }
        onClick={() =>
          void savePolicies()
        }
        className={styles.policySaveButton}
      >
        {saving
          ? "กำลังบันทึกสิทธิ์..."
          : "บันทึกสิทธิ์การลา เกณฑ์รวม และเกณฑ์มาสาย"}
      </button>
    </section>
  );
}
