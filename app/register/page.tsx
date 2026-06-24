"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export default function RegisterPage() {
  const router = useRouter();

  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [showPin, setShowPin] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [success, setSuccess] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setSuccess(false);

    if (!fullName.trim()) {
      setMessage("กรุณากรอกชื่อ–นามสกุล");
      return;
    }

    if (!/^0\d{9}$/.test(phone)) {
      setMessage("กรุณากรอกเบอร์โทรศัพท์ 10 หลักให้ถูกต้อง");
      return;
    }

    if (!/^\d{6}$/.test(pin)) {
      setMessage("PIN ต้องเป็นตัวเลข 6 หลัก");
      return;
    }

    if (pin !== confirmPin) {
      setMessage("PIN และยืนยัน PIN ไม่ตรงกัน");
      return;
    }

    setLoading(true);

    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          fullName: fullName.trim(),
          phone,
          pin,
        }),
      });

      const result = (await response.json()) as {
        ok?: boolean;
        message?: string;
      };

      if (!response.ok || !result.ok) {
        setMessage(result.message ?? "สมัครสมาชิกไม่สำเร็จ");
        return;
      }

      setSuccess(true);
      setMessage("สมัครสมาชิกสำเร็จ กำลังกลับไปหน้าเข้าสู่ระบบ...");

      window.setTimeout(() => {
        router.replace("/login");
      }, 1200);
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
          <p className="brand-eyebrow">NEW MEMBER</p>
          <h1>สมัครสมาชิก</h1>
          <p className="brand-description">
            ลงทะเบียนเพื่อเข้าใช้งานระบบลงเวลาปฏิบัติงาน
            ด้วยเบอร์โทรศัพท์และ PIN 6 หลัก
          </p>

          <div className="feature-list">
            <div><span>✓</span> ใช้เบอร์โทรศัพท์เป็นชื่อผู้ใช้งาน</div>
            <div><span>✓</span> PIN จัดการโดย Supabase Auth</div>
            <div><span>✓</span> ไม่บันทึก PIN ลงตารางบุคลากร</div>
          </div>
        </div>

        <div className="brand-footer">โรงเรียนวัดไผ่มุ้ง</div>
      </section>

      <section className="login-panel">
        <div className="login-card">
          <div className="mobile-logo">WPM</div>

          <div className="login-heading">
            <p className="login-kicker">สร้างบัญชีใหม่</p>
            <h2>สมัครสมาชิก</h2>
            <p>กรอกข้อมูลให้ครบถ้วนเพื่อสร้างบัญชี</p>
          </div>

          <form onSubmit={handleSubmit} className="login-form">
            <label>
              <span>ชื่อ–นามสกุล</span>
              <div className="input-wrap">
                <span className="input-icon" aria-hidden="true">👤</span>
                <input
                  type="text"
                  autoComplete="name"
                  placeholder="ชื่อ นามสกุล"
                  maxLength={120}
                  value={fullName}
                  onChange={(event) => setFullName(event.target.value)}
                  disabled={loading}
                />
              </div>
            </label>

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
                  autoComplete="new-password"
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

            <label>
              <span>ยืนยัน PIN</span>
              <div className="input-wrap">
                <span className="input-icon" aria-hidden="true">●</span>
                <input
                  type={showPin ? "text" : "password"}
                  inputMode="numeric"
                  autoComplete="new-password"
                  placeholder="••••••"
                  maxLength={6}
                  value={confirmPin}
                  onChange={(event) =>
                    setConfirmPin(event.target.value.replace(/\D/g, ""))
                  }
                  disabled={loading}
                />
              </div>
            </label>

            {message && (
              <div
                className="form-message"
                role="alert"
                style={
                  success
                    ? {
                        color: "#087443",
                        borderColor: "#a7dfc4",
                        background: "#effcf6",
                      }
                    : undefined
                }
              >
                {message}
              </div>
            )}

            <button className="login-button" type="submit" disabled={loading}>
              {loading ? (
                <>
                  <span className="spinner" />
                  กำลังสมัครสมาชิก...
                </>
              ) : (
                "สมัครสมาชิก"
              )}
            </button>
          </form>

          <p className="login-help">
            มีบัญชีแล้ว?{" "}
            <Link href="/login" style={{ color: "#1877f2", fontWeight: 800 }}>
              เข้าสู่ระบบ
            </Link>
          </p>
        </div>

        <p className="copyright">© 2026 Work Attendance System</p>
      </section>
    </main>
  );
}
