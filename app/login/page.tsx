"use client";

import Link from "next/link";
import Image from "next/image";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import styles from "./login.module.css";

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

function formatPhoneForInput(value: string) {
  if (value.startsWith("66") && value.length === 11) {
    return `0${value.slice(2)}`;
  }

  return value;
}

export default function LoginPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [phone, setPhone] = useState("");
  const [pin, setPin] = useState("");
  const [rememberPhone, setRememberPhone] = useState(true);
  const [showPin, setShowPin] = useState(false);
  const [loading, setLoading] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const remembered = window.localStorage.getItem("attendance_phone");

    if (remembered) {
      setPhone(formatPhoneForInput(remembered));
      setRememberPhone(true);
    }
  }, []);

  useEffect(() => {
    let mounted = true;

    async function checkSession() {
      try {
        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser();

        if (userError || !user) {
          return;
        }

        const { data: profile, error: profileError } = await supabase
          .from("profiles")
          .select("account_status")
          .eq("id", user.id)
          .single();

        if (
          profileError ||
          !profile ||
          profile.account_status !== "active"
        ) {
          await supabase.auth.signOut();
          return;
        }

        router.replace("/dashboard");
        router.refresh();
      } catch (error) {
        console.error("Check session error:", error);
      } finally {
        if (mounted) {
          setCheckingSession(false);
        }
      }
    }

    void checkSession();

    return () => {
      mounted = false;
    };
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

      const { data: signInData, error: signInError } =
        await supabase.auth.signInWithPassword({
          email: loginEmail,
          password: pin,
        });

      if (signInError || !signInData.user) {
        setMessage("เบอร์โทรศัพท์หรือ PIN ไม่ถูกต้อง");
        return;
      }

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("account_status")
        .eq("id", signInData.user.id)
        .single();

      if (profileError || !profile) {
        console.error("Load profile after login error:", profileError);
        await supabase.auth.signOut();
        setMessage("ไม่พบข้อมูลสมาชิก กรุณาติดต่อผู้ดูแลระบบ");
        return;
      }

      if (profile.account_status === "pending") {
        await supabase.auth.signOut();
        setMessage("บัญชีของคุณอยู่ระหว่างรอผู้ดูแลอนุมัติ");
        return;
      }

      if (profile.account_status === "suspended") {
        await supabase.auth.signOut();
        setMessage("บัญชีของคุณถูกระงับ กรุณาติดต่อผู้ดูแลระบบ");
        return;
      }

      if (profile.account_status !== "active") {
        await supabase.auth.signOut();
        setMessage("สถานะบัญชีไม่ถูกต้อง กรุณาติดต่อผู้ดูแลระบบ");
        return;
      }

      if (rememberPhone) {
        window.localStorage.setItem("attendance_phone", formattedPhone);
      } else {
        window.localStorage.removeItem("attendance_phone");
      }

      router.replace("/dashboard");
      router.refresh();
    } catch (error) {
      console.error("Login error:", error);
      await supabase.auth.signOut();
      setMessage("ไม่สามารถเชื่อมต่อระบบได้ กรุณาลองใหม่");
    } finally {
      setLoading(false);
    }
  }

  if (checkingSession) {
    return (
      <main className={styles.loadingScreen}>
        <span className={styles.loadingSpinner} />
        กำลังตรวจสอบบัญชี...
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <div className={styles.decorLineOne} />
      <div className={styles.decorLineTwo} />
      <div className={styles.decorLineThree} />

      <Image
        className={styles.topPanda}
        src="/images/login-panda.png"
        alt=""
        width={230}
        height={230}
        priority
      />

      <section className={styles.card}>
        <header className={styles.header}>
          <h1>ระบบลงเวลา</h1>

          <div className={styles.logoWrap}>
            <Image
              src="/images/school-logo.png"
              alt="ตราโรงเรียนวัดไผ่มุ้ง"
              width={180}
              height={180}
              priority
            />
          </div>

          <h2>โรงเรียนวัดไผ่มุ้ง</h2>
        </header>

        <form onSubmit={handleSubmit} className={styles.form}>
          <label className={styles.field}>
            <span className={styles.srOnly}>เบอร์โทรศัพท์</span>
            <input
              type="tel"
              inputMode="numeric"
              autoComplete="tel"
              placeholder="เบอร์โทรศัพท์"
              maxLength={10}
              value={phone}
              onChange={(event) =>
                setPhone(event.target.value.replace(/\D/g, "").slice(0, 10))
              }
              disabled={loading}
            />
          </label>

          <label className={styles.field}>
            <span className={styles.srOnly}>PIN 6 หลัก</span>

            <div className={styles.pinWrap}>
              <input
                type={showPin ? "text" : "password"}
                inputMode="numeric"
                autoComplete="current-password"
                placeholder="PIN 6 หลัก"
                maxLength={6}
                value={pin}
                onChange={(event) =>
                  setPin(event.target.value.replace(/\D/g, "").slice(0, 6))
                }
                disabled={loading}
              />

              <button
                type="button"
                className={styles.showPin}
                onClick={() => setShowPin((current) => !current)}
                disabled={loading}
              >
                {showPin ? "ซ่อน" : "แสดง"}
              </button>
            </div>
          </label>

          <label className={styles.rememberRow}>
            <input
              type="checkbox"
              checked={rememberPhone}
              onChange={(event) => setRememberPhone(event.target.checked)}
              disabled={loading}
            />

            <span>
              <strong>จำเบอร์โทรและ PIN บนเครื่องนี้</strong>
              <small>ระบบจะจำเฉพาะเบอร์โทรเพื่อความปลอดภัย</small>
            </span>
          </label>

          {message && (
            <div className={styles.message} role="alert">
              {message}
            </div>
          )}

          <button
            className={styles.loginButton}
            type="submit"
            disabled={loading}
          >
            {loading ? (
              <>
                <span className={styles.buttonSpinner} />
                กำลังเข้าสู่ระบบ...
              </>
            ) : (
              "Login"
            )}
          </button>
        </form>

        <p className={styles.registerLink}>
          ยังไม่มีบัญชี? <Link href="/register">สมัครสมาชิก</Link>
        </p>
      </section>

      <Image
        className={styles.bottomPanda}
        src="/images/login-panda.png"
        alt="มาสคอตแพนด้าโรงเรียนวัดไผ่มุ้ง"
        width={520}
        height={520}
        priority
      />
    </main>
  );
}
