"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type ApiResponse = {
  ok: boolean;
  message?: string;
};

export default function ChangePinPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [currentPin, setCurrentPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [success, setSuccess] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setSuccess(false);

    if (!/^\d{6}$/.test(currentPin) || !/^\d{6}$/.test(newPin)) {
      setMessage("PIN ต้องเป็นตัวเลข 6 หลัก");
      return;
    }

    if (newPin !== confirmPin) {
      setMessage("ยืนยัน PIN ใหม่ไม่ตรงกัน");
      return;
    }

    setSaving(true);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        router.replace("/login");
        return;
      }

      const response = await fetch("/api/account/change-pin", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ currentPin, newPin }),
      });

      const result = (await response.json()) as ApiResponse;

      if (!response.ok || !result.ok) {
        throw new Error(result.message || "เปลี่ยน PIN ไม่สำเร็จ");
      }

      setCurrentPin("");
      setNewPin("");
      setConfirmPin("");
      setSuccess(true);
      setMessage(result.message || "เปลี่ยน PIN เรียบร้อยแล้ว");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "เกิดข้อผิดพลาดระหว่างเปลี่ยน PIN"
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="dashboard-shell">
      <header className="dashboard-header">
        <div>
          <p>ACCOUNT SECURITY</p>
          <h1>เปลี่ยน PIN</h1>
        </div>

        <button type="button" onClick={() => router.push("/attendance")}>
          กลับหน้าหลัก
        </button>
      </header>

      <section
        style={{
          maxWidth: 560,
          margin: "32px auto 0",
          padding: 24,
          border: "1px solid #d8e2ed",
          borderRadius: 24,
          background: "#ffffff",
          boxShadow: "0 18px 45px rgba(28, 60, 93, 0.08)",
        }}
      >
        <h2 style={{ marginTop: 0, color: "#071d32" }}>ตั้ง PIN ใหม่</h2>
        <p style={{ color: "#667085" }}>
          กรอก PIN ปัจจุบัน แล้วกำหนด PIN ใหม่เป็นตัวเลข 6 หลัก
        </p>

        {message && (
          <div
            role="alert"
            style={{
              margin: "18px 0",
              padding: 14,
              borderRadius: 14,
              color: success ? "#146c2e" : "#c81e1e",
              background: success ? "#f1fff5" : "#fff5f5",
              border: success ? "1px solid #a7e3ba" : "1px solid #f2b8b8",
              fontWeight: 700,
            }}
          >
            {message}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: "grid", gap: 16 }}>
          {[
            ["PIN ปัจจุบัน", currentPin, setCurrentPin],
            ["PIN ใหม่", newPin, setNewPin],
            ["ยืนยัน PIN ใหม่", confirmPin, setConfirmPin],
          ].map(([label, value, setter]) => (
            <label key={label as string}>
              <span style={{ display: "block", marginBottom: 7, fontWeight: 700 }}>
                {label as string}
              </span>
              <input
                type="password"
                inputMode="numeric"
                pattern="\d{6}"
                maxLength={6}
                value={value as string}
                onChange={(event) =>
                  (setter as (value: string) => void)(
                    event.target.value.replace(/\D/g, "").slice(0, 6)
                  )
                }
                required
                style={{
                  width: "100%",
                  height: 48,
                  padding: "0 14px",
                  border: "1px solid #d8e2ed",
                  borderRadius: 12,
                  fontSize: 18,
                  letterSpacing: 4,
                  boxSizing: "border-box",
                }}
              />
            </label>
          ))}

          <button
            type="submit"
            disabled={saving}
            style={{
              height: 48,
              border: 0,
              borderRadius: 12,
              color: "#ffffff",
              background: "linear-gradient(135deg, #1877f2, #3799ff)",
              fontWeight: 800,
              cursor: saving ? "wait" : "pointer",
              opacity: saving ? 0.7 : 1,
            }}
          >
            {saving ? "กำลังเปลี่ยน PIN..." : "บันทึก PIN ใหม่"}
          </button>
        </form>
      </section>
    </main>
  );
}
