"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import styles from "./document-number.module.css";

type Series = {
  id: string;
  code: string;
  name: string;
  prefix: string;
  buddhist_year: number;
  start_number: number;
  current_number: number;
  padding: number;
  mode: "TEST" | "LIVE" | "ARCHIVED";
  is_active: boolean;
  next_formatted_number: string;
};

export default function DocumentNumberSection() {
  const supabase = useMemo(() => createClient(), []);
  const [series, setSeries] = useState<Series[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [goLive, setGoLive] = useState<Series | null>(null);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    code: "LEAVE",
    name: "เลขที่ใบลา",
    prefix: "ผม.",
    buddhistYear: 2569,
    startNumber: 1,
    padding: 3,
  });
  const [liveForm, setLiveForm] = useState({
    prefix: "ผม.",
    buddhistYear: 2569,
    startNumber: 1,
    reason: "เริ่มใช้งานระบบจริง",
    confirmation: "",
  });

  const token = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) throw new Error("กรุณาเข้าสู่ระบบใหม่");
    return session.access_token;
  }, [supabase]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const accessToken = await token();
      const response = await fetch("/api/admin/document-sequences", {
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: "no-store",
      });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.message);
      setSeries(result.series ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "โหลดชุดเลขไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { void load(); }, [load]);

  async function addSeries(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true); setMessage(""); setError("");
    try {
      const accessToken = await token();
      const response = await fetch("/api/admin/document-sequences", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(form),
      });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.message);
      setMessage(result.message);
      setShowAdd(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "เพิ่มชุดเลขไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  function openGoLive(item: Series) {
    setLiveForm({
      prefix: item.prefix,
      buddhistYear: item.buddhist_year,
      startNumber: 1,
      reason: "เริ่มใช้งานระบบจริง",
      confirmation: "",
    });
    setGoLive(item);
  }

  async function confirmGoLive(event: React.FormEvent) {
    event.preventDefault();
    if (!goLive) return;
    setSaving(true); setMessage(""); setError("");
    try {
      const accessToken = await token();
      const response = await fetch("/api/admin/document-sequences/go-live", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ seriesId: goLive.id, ...liveForm }),
      });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.message);
      setMessage(result.message);
      setGoLive(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "เริ่มใช้งานจริงไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className={styles.section}>
      <div className={styles.header}>
        <div>
          <p className={styles.eyebrow}>ระบบเลขกลาง</p>
          <h2>การจัดการเลขเอกสาร</h2>
          <p>กำหนดเลขใบลา บันทึกข้อความ คำสั่ง และเอกสารประเภทอื่นในอนาคต</p>
        </div>
        <button type="button" className={styles.addButton} onClick={() => setShowAdd(true)}>
          + เพิ่มชุดเลขเอกสาร
        </button>
      </div>

      {message && <div className={styles.success}>{message}</div>}
      {error && <div className={styles.error}>{error}</div>}
      {loading ? <div className={styles.loading}>กำลังโหลด...</div> : (
        <div className={styles.grid}>
          {series.map((item) => (
            <article className={styles.card} key={item.id}>
              <div className={styles.cardTop}>
                <div>
                  <h3>{item.name}</h3>
                  <small>รหัส {item.code}</small>
                </div>
                <span className={`${styles.badge} ${item.mode === "LIVE" ? styles.live : styles.test}`}>
                  {item.mode === "LIVE" ? "ใช้งานจริง" : item.mode === "TEST" ? "โหมดทดสอบ" : "เก็บถาวร"}
                </span>
              </div>
              <dl>
                <div><dt>คำนำหน้า</dt><dd>{item.prefix || "ไม่มี"}</dd></div>
                <div><dt>ปี</dt><dd>{item.buddhist_year}</dd></div>
                <div><dt>เลขล่าสุด</dt><dd>{item.current_number}</dd></div>
                <div><dt>เลขถัดไป</dt><dd>{item.next_formatted_number}</dd></div>
              </dl>
              {item.mode === "TEST" && item.is_active && (
                <button type="button" className={styles.liveButton} onClick={() => openGoLive(item)}>
                  เริ่มใช้งานจริง
                </button>
              )}
            </article>
          ))}
        </div>
      )}

      {showAdd && (
        <div className={styles.overlay}>
          <form className={styles.modal} onSubmit={addSeries}>
            <h3>เพิ่มชุดเลขเอกสาร</h3>
            <label>ชื่อชุดเลข<input value={form.name} onChange={e => setForm({...form, name:e.target.value})}/></label>
            <label>รหัสประเภท<input value={form.code} onChange={e => setForm({...form, code:e.target.value.toUpperCase()})}/></label>
            <label>คำนำหน้า<input value={form.prefix} onChange={e => setForm({...form, prefix:e.target.value})}/></label>
            <div className={styles.twoCols}>
              <label>ปี พ.ศ.<input type="number" value={form.buddhistYear} onChange={e => setForm({...form, buddhistYear:Number(e.target.value)})}/></label>
              <label>เลขเริ่มต้น<input type="number" min="1" value={form.startNumber} onChange={e => setForm({...form, startNumber:Number(e.target.value)})}/></label>
            </div>
            <p className={styles.preview}>
              ตัวอย่าง: {form.prefix ? `${form.prefix} ` : ""}
              {String(form.startNumber).padStart(form.padding, "0")}/{form.buddhistYear}
            </p>
            <div className={styles.actions}>
              <button type="button" onClick={() => setShowAdd(false)}>ยกเลิก</button>
              <button disabled={saving}>{saving ? "กำลังบันทึก..." : "เพิ่มชุดเลข"}</button>
            </div>
          </form>
        </div>
      )}

      {goLive && (
        <div className={styles.overlay}>
          <form className={styles.modal} onSubmit={confirmGoLive}>
            <h3>เริ่มใช้งานจริง</h3>
            <div className={styles.warning}>
              ระบบจะสำรองเลขทดสอบทั้งหมด ปิดชุดเดิม และเริ่มเลขจริงชุดใหม่
            </div>
            <label>คำนำหน้า<input value={liveForm.prefix} onChange={e => setLiveForm({...liveForm, prefix:e.target.value})}/></label>
            <div className={styles.twoCols}>
              <label>ปี พ.ศ.<input type="number" value={liveForm.buddhistYear} onChange={e => setLiveForm({...liveForm, buddhistYear:Number(e.target.value)})}/></label>
              <label>เริ่มจากเลข<input type="number" min="1" value={liveForm.startNumber} onChange={e => setLiveForm({...liveForm, startNumber:Number(e.target.value)})}/></label>
            </div>
            <label>เหตุผล<input value={liveForm.reason} onChange={e => setLiveForm({...liveForm, reason:e.target.value})}/></label>
            <label>
              พิมพ์ “เริ่มใช้งานจริง” เพื่อยืนยัน
              <input value={liveForm.confirmation} onChange={e => setLiveForm({...liveForm, confirmation:e.target.value})}/>
            </label>
            <div className={styles.actions}>
              <button type="button" onClick={() => setGoLive(null)}>ยกเลิก</button>
              <button className={styles.danger} disabled={saving || liveForm.confirmation !== "เริ่มใช้งานจริง"}>
                {saving ? "กำลังดำเนินการ..." : "ยืนยันเริ่มใช้งานจริง"}
              </button>
            </div>
          </form>
        </div>
      )}
    </section>
  );
}
