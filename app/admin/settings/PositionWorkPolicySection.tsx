"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

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
      | "grace_minutes",
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

  const inputStyle = {
    width: "100%",
    minHeight: 42,
    padding: "8px 10px",
    borderRadius: 10,
    border:
      "1px solid rgba(255,255,255,0.16)",
    background:
      "rgba(255,255,255,0.07)",
    color: "inherit",
    fontSize: 15,
  } as const;

  return (
    <section
      style={{
        width: "100%",
        maxWidth: 790,
        margin: "20px auto 0",
        padding: 18,
        borderRadius: 18,
        border:
          "1px solid rgba(255,255,255,0.14)",
        background:
          "rgba(255,255,255,0.055)",
        boxSizing: "border-box",
      }}
    >
      <div style={{ marginBottom: 16 }}>
        <h2 style={{ margin: "0 0 6px" }}>
          การปฏิบัติงาน สิทธิ์การลา
          และเกณฑ์มาสายตามตำแหน่ง
        </h2>

        <p
          style={{
            margin: 0,
            opacity: 0.72,
          }}
        >
          ปีงบประมาณ {fiscalYear || "-"} —
          กำหนดค่าทั้งหมดแยกตามตำแหน่ง
        </p>
      </div>

      {message && (
        <div
          style={{
            marginBottom: 14,
            padding: 12,
            borderRadius: 10,
            background:
              "rgba(34,197,94,0.16)",
            color: "#bbf7d0",
          }}
        >
          {message}
        </div>
      )}

      {error && (
        <div
          style={{
            marginBottom: 14,
            padding: 12,
            borderRadius: 10,
            background:
              "rgba(239,68,68,0.16)",
            color: "#fecaca",
          }}
        >
          {error}
        </div>
      )}

      {loading ? (
        <p>กำลังโหลดสิทธิ์ตามตำแหน่ง...</p>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns:
              "repeat(auto-fit, minmax(300px, 1fr))",
            gap: 16,
            alignItems: "stretch",
          }}
        >
          {roles.map((role) => {
            const policy =
              getPolicy(role.key);

            if (!policy) {
              return null;
            }

            return (
              <article
                key={role.key}
                style={{
                  display: "grid",
                  gridTemplateRows:
                    "auto 1fr",
                  gap: 16,
                  width: "100%",
                  minHeight: 260,
                  padding: 16,
                  borderRadius: 14,
                  border:
                    "1px solid rgba(255,255,255,0.12)",
                  background:
                    "rgba(0,0,0,0.12)",
                  boxSizing: "border-box",
                }}
              >
                <div>
                  <h3
                    style={{
                      margin: "0 0 4px",
                    }}
                  >
                    {role.title}
                  </h3>

                  <p
                    style={{
                      margin: 0,
                      opacity: 0.66,
                      fontSize: 13,
                    }}
                  >
                    {role.description}
                  </p>
                </div>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns:
                      "repeat(2, minmax(0, 1fr))",
                    gap: 12,
                    alignContent: "start",
                  }}
                >
                  <label>
                    <span>เวลาเริ่ม</span>
                    <input
                      type="time"
                      required
                      style={inputStyle}
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
                      style={inputStyle}
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
                      style={inputStyle}
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
                      style={inputStyle}
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
                    <span>มาสายได้ (ครั้ง)</span>
                    <input
                      type="number"
                      min="0"
                      max="999"
                      style={inputStyle}
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
                      style={inputStyle}
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
        style={{
          marginTop: 16,
          minHeight: 44,
          padding: "0 18px",
          border: 0,
          borderRadius: 11,
          background:
            "linear-gradient(135deg,#7c3aed,#9333ea)",
          color: "#ffffff",
          fontWeight: 700,
          cursor: saving
            ? "not-allowed"
            : "pointer",
          opacity: saving ? 0.65 : 1,
        }}
      >
        {saving
          ? "กำลังบันทึกสิทธิ์..."
          : "บันทึกสิทธิ์การลาและเกณฑ์มาสาย"}
      </button>
    </section>
  );
}
