"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type ApiResult = {
  ok?: boolean;
  activeAcademicYear?: number | null;
  message?: string;
};

export default function AcademicYearSettingsField() {
  const supabase = useMemo(() => createClient(), []);
  const [year, setYear] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] =
    useState<"success" | "error">("success");

  useEffect(() => {
    async function loadAcademicYear() {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!session?.access_token) {
          throw new Error("กรุณาเข้าสู่ระบบใหม่");
        }

        const response = await fetch(
          "/api/admin/academic-year-settings",
          {
            headers: {
              Authorization: `Bearer ${session.access_token}`,
            },
            cache: "no-store",
          },
        );

        const result =
          (await response.json()) as ApiResult;

        if (!response.ok || !result.ok) {
          throw new Error(
            result.message ||
              "ไม่สามารถโหลดปีการศึกษาได้",
          );
        }

        setYear(
          result.activeAcademicYear
            ? String(result.activeAcademicYear)
            : "",
        );
      } catch (error) {
        setMessageType("error");
        setMessage(
          error instanceof Error
            ? error.message
            : "ไม่สามารถโหลดปีการศึกษาได้",
        );
      } finally {
        setLoading(false);
      }
    }

    void loadAcademicYear();
  }, [supabase]);

  async function saveAcademicYear() {
    setSaving(true);
    setMessage("");

    try {
      const numericYear = Number(year);

      if (
        !Number.isInteger(numericYear) ||
        numericYear < 2500 ||
        numericYear > 2700
      ) {
        throw new Error(
          "ปีการศึกษาต้องเป็น พ.ศ. ระหว่าง 2500 ถึง 2700",
        );
      }

      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        throw new Error("กรุณาเข้าสู่ระบบใหม่");
      }

      const response = await fetch(
        "/api/admin/academic-year-settings",
        {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            activeAcademicYear: numericYear,
          }),
        },
      );

      const result =
        (await response.json()) as ApiResult;

      if (!response.ok || !result.ok) {
        throw new Error(
          result.message ||
            "ไม่สามารถบันทึกปีการศึกษาได้",
        );
      }

      setMessageType("success");
      setMessage(
        result.message ||
          "บันทึกปีการศึกษาเรียบร้อยแล้ว",
      );
    } catch (error) {
      setMessageType("error");
      setMessage(
        error instanceof Error
          ? error.message
          : "ไม่สามารถบันทึกปีการศึกษาได้",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      style={{
        marginTop: 14,
        paddingTop: 14,
        borderTop: "1px solid #e5e7eb",
      }}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns:
            "minmax(180px, 1fr) auto",
          gap: 10,
          alignItems: "end",
        }}
      >
        <label>
          <span
            style={{
              display: "block",
              marginBottom: 6,
              fontWeight: 700,
            }}
          >
            ปีการศึกษาที่ใช้งาน (พ.ศ.)
          </span>
          <input
            type="number"
            min="2500"
            max="2700"
            required
            value={year}
            disabled={loading || saving}
            placeholder="เช่น 2569"
            onChange={(event) =>
              setYear(event.target.value)
            }
          />
        </label>

        <button
          type="button"
          disabled={loading || saving || !year}
          onClick={() => void saveAcademicYear()}
          style={{
            minWidth: 132,
            height: 42,
            padding: "0 14px",
            border: 0,
            borderRadius: 10,
            color: "#fff",
            background: "#7c3aed",
            fontWeight: 800,
            cursor:
              loading || saving || !year
                ? "not-allowed"
                : "pointer",
            opacity:
              loading || saving || !year ? 0.6 : 1,
          }}
        >
          {saving
            ? "กำลังบันทึก..."
            : "บันทึกปีการศึกษา"}
        </button>
      </div>

      <p style={{ margin: "7px 0 0", color: "#667085" }}>
        ใช้เป็นปีอ้างอิงกลางสำหรับรหัสโครงการ เช่น
        P1-01-{year || "2569"}
      </p>

      {message && (
        <div
          role="status"
          style={{
            marginTop: 8,
            padding: "8px 10px",
            borderRadius: 8,
            color:
              messageType === "success"
                ? "#166534"
                : "#b91c1c",
            background:
              messageType === "success"
                ? "#f0fdf4"
                : "#fef2f2",
            fontSize: 13,
            fontWeight: 700,
          }}
        >
          {message}
        </div>
      )}
    </div>
  );
}
