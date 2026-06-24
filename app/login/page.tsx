"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

function normalizeThaiPhone(phone: string) {
  const digits = phone.replace(/\D/g, "");

  if (digits.startsWith("66") && digits.length === 11) {
    return digits;
  }

  if (digits.startsWith("0") && digits.length === 10) {
    return `66${digits.slice(1)}`;
  }

  return "";
}

function phoneToLoginEmail(phone: string) {
  return `${phone}@attendance.local`;
}

export default function LoginPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [phone, setPhone] = useState("");
  const [pin, setPin] = useState("");
  const [showPin, setShowPin] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    async function checkSession() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        router.replace("/dashboard");
      }
    }

    void checkSession();
  }, [router, supabase]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");

    const formattedPhone = normalizeThaiPhone(phone);

    if (!formattedPhone) {
      setMessage("กรุณากรอกเบอร์โทรศัพท์ 10 หลักให้ถูกต้อง");
      return;
    }

    if (!/^\d{6}$/.test(pin)) {
      setMessage("PIN ต้องเป็นตัวเลข 6 หลัก");
      return;
    }

    setLoading(true);

    try {
      const loginEmail = phoneToLoginEmail(formattedPhone);

      const { error } = await supabase.auth.signInWithPassword({
        email: loginEmail,
        password: pin,
      });

      if (error) {
        setMessage("เบอร์โทรศัพท์หรือ PIN ไม่ถูกต้อง");
        return;
      }

      router.replace("/dashboard");
      router.refresh();
    } catch {
      setMessage("ไม่สามารถเชื่อมต่อระบบได้ กรุณาลองใหม่");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="login-shell">
      <section className="brand-panel">
        <div className="brand-content">
          <div className="brand-badge">WPM</div>
          <p className="brand-eyebrow">WORK ATTENDANCE</p>
          <h1>ระบบลงเวลาปฏิบัติงาน</h1>
          <p className="brand-description">
            ระบบบริหารการลงเวลาสำหรับครูและบุคลากร
            ใช้งานง่าย ปลอดภัย และรองรับทุกอุปกรณ์
          </p>

          <div className="feature-list">
            <div><span>✓</span> ลงเวลาเข้า–ออกอย่างเป็นระบบ</div>
            <div><span>✓</span> ตรวจสอบประวัติได้ตลอดเวลา</div>
            <div><span>✓</span> รองรับรายงานและเอกสารในอนาคต</div>
          </div>
        </div>

        <div className="brand-footer">โรงเรียนวัดไผ่มุ้ง</div>
      </section>

      <section className="login-panel">
        <div className="login-card">
          <div className="mobile-logo">WPM</div>

          <div className="login-heading">
            <p className="login-kicker">ยินดีต้อนรับ</p>
            <h2>เข้าสู่ระบบ</h2>
            <p>กรอกเบอร์โทรศัพท์และ PIN ของคุณ</p>
          </div>

          <form onSubmit={handleSubmit} className="login-form">
            <label>
              <span>เบอร์โทรศัพท์</span>
              <div className="input-wrap">
                <span className="input-icon" aria-hidden="true">☎</span>
                <input
                  type="tel"
                  inputMode="numeric"
                  autoComplete="tel"
                  placeholder="0812345678"
                  maxLength={10}
                  value={phone}
                  onChange={(event) =>
                    setPhone(event.target.value.replace(/\D/g, ""))
                  }
                  disabled={loading}
                />
              </div>
            </label>

            <label>
              <span>PIN 6 หลัก</span>
              <div className="input-wrap">
                <span className="input-icon" aria-hidden="true">●</span>
                <input
                  type={showPin ? "text" : "password"}
                  inputMode="numeric"
                  autoComplete="current-password"
                  placeholder="••••••"
                  maxLength={6}
                  value={pin}
                  onChange={(event) =>
                    setPin(event.target.value.replace(/\D/g, ""))
                  }
                  disabled={loading}
                />
                <button
                  className="show-pin"
                  type="button"
                  onClick={() => setShowPin((current) => !current)}
                  aria-label={showPin ? "ซ่อน PIN" : "แสดง PIN"}
                >
                  {showPin ? "ซ่อน" : "แสดง"}
                </button>
              </div>
            </label>

            {message && (
              <div className="form-message" role="alert">
                {message}
              </div>
            )}

            <button className="login-button" type="submit" disabled={loading}>
              {loading ? (
                <>
                  <span className="spinner" />
                  กำลังเข้าสู่ระบบ...
                </>
              ) : (
                "เข้าสู่ระบบ"
              )}
            </button>
          </form>

          <p className="login-help">
            ยังไม่มีบัญชี?{" "}
            <Link
              href="/register"
              style={{ color: "#1877f2", fontWeight: 800 }}
            >
              สมัครสมาชิก
            </Link>
          </p>
        </div>

        <p className="copyright">© 2026 Work Attendance System</p>
      </section>
    </main>
  );
}
