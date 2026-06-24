"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function DashboardPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadUser() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.replace("/login");
        return;
      }

      setPhone(user.phone ?? "-");
      setLoading(false);
    }

    void loadUser();
  }, [router, supabase]);

  async function handleLogout() {
    await supabase.auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  if (loading) {
    return (
      <main className="dashboard-loading">
        <span className="spinner dark" />
        กำลังตรวจสอบบัญชี...
      </main>
    );
  }

  return (
    <main className="dashboard-shell">
      <header className="dashboard-header">
        <div>
          <p>WORK ATTENDANCE</p>
          <h1>ระบบลงเวลาปฏิบัติงาน</h1>
        </div>
        <button type="button" onClick={handleLogout}>
          ออกจากระบบ
        </button>
      </header>

      <section className="welcome-card">
        <div className="avatar">👤</div>
        <div>
          <p>เข้าสู่ระบบสำเร็จ</p>
          <h2>{phone}</h2>
          <span>บัญชีของคุณพร้อมใช้งาน</span>
        </div>
      </section>

      <section className="dashboard-grid">
        <article>
          <span>✓</span>
          <h3>ระบบล็อกอินพร้อมแล้ว</h3>
          <p>ขั้นถัดไปจะเชื่อมข้อมูลบุคลากรจากตาราง profiles</p>
        </article>
        <article>
          <span>◷</span>
          <h3>ระบบลงเวลา</h3>
          <p>อยู่ระหว่างเตรียมพัฒนาในขั้นตอนถัดไป</p>
        </article>
      </section>
    </main>
  );
}
