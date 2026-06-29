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

type SeriesForm = {
  id?: string;
  code: string;
  name: string;
  prefix: string;
  buddhistYear: number;
  startNumber: number;
  padding: number;
};

const DEFAULT_FORM: SeriesForm = {
  code: "LEAVE",
  name: "เลขที่ใบลา",
  prefix: "ผม.",
  buddhistYear: 2569,
  startNumber: 1,
  padding: 3,
};

export default function DocumentNumberSection() {
  const supabase = useMemo(() => createClient(), []);
  const [series, setSeries] = useState<Series[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [formMode, setFormMode] =
    useState<"add" | "edit" | null>(null);
  const [form, setForm] = useState<SeriesForm>(DEFAULT_FORM);
  const [goLive, setGoLive] = useState<Series | null>(null);
  const [liveForm, setLiveForm] = useState({
    prefix: "ผม.",
    buddhistYear: 2569,
    startNumber: 1,
    reason: "เริ่มใช้งานระบบจริง",
    confirmation: "",
  });

  const getToken = useCallback(async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.access_token) {
      throw new Error("กรุณาเข้าสู่ระบบใหม่");
    }

    return session.access_token;
  }, [supabase]);

  const load = useCallback(async () => {
    setLoading(true);
    setErrorMessage("");

    try {
      const token = await getToken();
      const response = await fetch("/api/admin/document-sequences", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
        cache: "no-store",
      });
      const result = await response.json();

      if (!response.ok || !result.ok) {
        throw new Error(
          result.message || "ไม่สามารถโหลดชุดเลขเอกสารได้"
        );
      }

      setSeries(Array.isArray(result.series) ? result.series : []);
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "ไม่สามารถโหลดชุดเลขเอกสารได้"
      );
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [load]);

  function openAdd() {
    setForm({ ...DEFAULT_FORM });
    setFormMode("add");
  }

  function openEdit(item: Series) {
    setForm({
      id: item.id,
      code: item.code,
      name: item.name,
      prefix: item.prefix,
      buddhistYear: item.buddhist_year,
      startNumber: item.start_number,
      padding: item.padding,
    });
    setFormMode("edit");
  }

  async function saveSeries(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    setErrorMessage("");

    try {
      const token = await getToken();
      const method = formMode === "edit" ? "PATCH" : "POST";
      const response = await fetch("/api/admin/document-sequences", {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(form),
      });
      const result = await response.json();

      if (!response.ok || !result.ok) {
        throw new Error(
          result.message ||
            (formMode === "edit"
              ? "แก้ไขชุดเลขไม่สำเร็จ"
              : "เพิ่มชุดเลขไม่สำเร็จ")
        );
      }

      setMessage(result.message);
      setFormMode(null);
      await load();
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "บันทึกชุดเลขไม่สำเร็จ"
      );
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

    setSaving(true);
    setMessage("");
    setErrorMessage("");

    try {
      const token = await getToken();
      const response = await fetch(
        "/api/admin/document-sequences/go-live",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            seriesId: goLive.id,
            ...liveForm,
          }),
        }
      );
      const result = await response.json();

      if (!response.ok || !result.ok) {
        throw new Error(
          result.message || "เริ่มใช้งานจริงไม่สำเร็จ"
        );
      }

      setMessage(result.message);
      setGoLive(null);
      await load();
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "เริ่มใช้งานจริงไม่สำเร็จ"
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className={styles.documentNumberSection}>
      <div className={styles.documentNumberHeader}>
        <div>
          <span>DOCUMENT NUMBER</span>
          <h2>การจัดการเลขเอกสาร</h2>
          <p>กำหนดรูปแบบและเลขเริ่มต้นของเอกสารแต่ละประเภท</p>
        </div>

        <button type="button" onClick={openAdd}>
          + เพิ่ม
        </button>
      </div>

      {message && (
        <div className={styles.successMessage}>{message}</div>
      )}
      {errorMessage && (
        <div className={styles.errorMessage}>{errorMessage}</div>
      )}

      {loading ? (
        <div className={styles.loading}>กำลังโหลด...</div>
      ) : (
        <div className={styles.seriesList}>
          {series.map((item) => (
            <article className={styles.seriesCard} key={item.id}>
              <div className={styles.seriesTitle}>
                <div>
                  <h3>{item.name}</h3>
                  <small>{item.code}</small>
                </div>

                <span
                  className={
                    item.mode === "LIVE"
                      ? styles.liveBadge
                      : item.mode === "TEST"
                      ? styles.testBadge
                      : styles.archivedBadge
                  }
                >
                  {item.mode === "LIVE"
                    ? "ใช้งานจริง"
                    : item.mode === "TEST"
                    ? "ทดสอบ"
                    : "เก็บถาวร"}
                </span>
              </div>

              <div className={styles.seriesDetails}>
                <div>
                  <span>คำนำหน้า</span>
                  <strong>{item.prefix || "-"}</strong>
                </div>
                <div>
                  <span>ปี</span>
                  <strong>{item.buddhist_year}</strong>
                </div>
                <div>
                  <span>เลขล่าสุด</span>
                  <strong>{item.current_number}</strong>
                </div>
                <div>
                  <span>เลขถัดไป</span>
                  <strong>{item.next_formatted_number}</strong>
                </div>
              </div>

              <div className={styles.seriesActions}>
                <button
                  type="button"
                  className={styles.editButton}
                  onClick={() => openEdit(item)}
                >
                  แก้ไข
                </button>

                {item.mode === "TEST" && item.is_active && (
                  <button
                    type="button"
                    className={styles.liveButton}
                    onClick={() => openGoLive(item)}
                  >
                    เริ่มใช้งานจริง
                  </button>
                )}
              </div>
            </article>
          ))}
        </div>
      )}

      {formMode && (
        <div className={styles.modalOverlay}>
          <form className={styles.modal} onSubmit={saveSeries}>
            <h3>
              {formMode === "edit"
                ? "แก้ไขชุดเลขเอกสาร"
                : "เพิ่มชุดเลขเอกสาร"}
            </h3>

            <label>
              <span>ชื่อชุดเลข</span>
              <input
                value={form.name}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    name: event.target.value,
                  }))
                }
              />
            </label>

            <label>
              <span>รหัสประเภท</span>
              <input
                value={form.code}
                disabled={formMode === "edit"}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    code: event.target.value.toUpperCase(),
                  }))
                }
              />
            </label>

            <label>
              <span>คำนำหน้า</span>
              <input
                value={form.prefix}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    prefix: event.target.value,
                  }))
                }
              />
            </label>

            <div className={styles.formGrid}>
              <label>
                <span>ปี พ.ศ.</span>
                <input
                  type="number"
                  min="2500"
                  max="2700"
                  value={form.buddhistYear}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      buddhistYear: Number(event.target.value),
                    }))
                  }
                />
              </label>

              <label>
                <span>เลขเริ่มต้น</span>
                <input
                  type="number"
                  min="1"
                  value={form.startNumber}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      startNumber: Number(event.target.value),
                    }))
                  }
                />
              </label>

              <label>
                <span>จำนวนหลัก</span>
                <input
                  type="number"
                  min="1"
                  max="8"
                  value={form.padding}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      padding: Number(event.target.value),
                    }))
                  }
                />
              </label>
            </div>

            <div className={styles.numberPreview}>
              ตัวอย่าง: {form.prefix ? `${form.prefix} ` : ""}
              {String(form.startNumber).padStart(form.padding, "0")}/
              {form.buddhistYear}
            </div>

            <div className={styles.modalActions}>
              <button
                type="button"
                onClick={() => setFormMode(null)}
                disabled={saving}
              >
                ยกเลิก
              </button>
              <button type="submit" disabled={saving}>
                {saving ? "กำลังบันทึก..." : "บันทึก"}
              </button>
            </div>
          </form>
        </div>
      )}

      {goLive && (
        <div className={styles.modalOverlay}>
          <form className={styles.modal} onSubmit={confirmGoLive}>
            <h3>เริ่มใช้งานจริง</h3>

            <div className={styles.warningMessage}>
              ระบบจะสำรองชุดเลขทดสอบและเริ่มชุดเลขจริงใหม่
            </div>

            <label>
              <span>คำนำหน้า</span>
              <input
                value={liveForm.prefix}
                onChange={(event) =>
                  setLiveForm((current) => ({
                    ...current,
                    prefix: event.target.value,
                  }))
                }
              />
            </label>

            <div className={styles.formGrid}>
              <label>
                <span>ปี พ.ศ.</span>
                <input
                  type="number"
                  value={liveForm.buddhistYear}
                  onChange={(event) =>
                    setLiveForm((current) => ({
                      ...current,
                      buddhistYear: Number(event.target.value),
                    }))
                  }
                />
              </label>
              <label>
                <span>เริ่มจากเลข</span>
                <input
                  type="number"
                  min="1"
                  value={liveForm.startNumber}
                  onChange={(event) =>
                    setLiveForm((current) => ({
                      ...current,
                      startNumber: Number(event.target.value),
                    }))
                  }
                />
              </label>
            </div>

            <label>
              <span>เหตุผล</span>
              <input
                value={liveForm.reason}
                onChange={(event) =>
                  setLiveForm((current) => ({
                    ...current,
                    reason: event.target.value,
                  }))
                }
              />
            </label>

            <label>
              <span>พิมพ์ “เริ่มใช้งานจริง” เพื่อยืนยัน</span>
              <input
                value={liveForm.confirmation}
                onChange={(event) =>
                  setLiveForm((current) => ({
                    ...current,
                    confirmation: event.target.value,
                  }))
                }
              />
            </label>

            <div className={styles.modalActions}>
              <button
                type="button"
                onClick={() => setGoLive(null)}
                disabled={saving}
              >
                ยกเลิก
              </button>
              <button
                type="submit"
                disabled={
                  saving ||
                  liveForm.confirmation !== "เริ่มใช้งานจริง"
                }
              >
                {saving ? "กำลังดำเนินการ..." : "ยืนยัน"}
              </button>
            </div>
          </form>
        </div>
      )}
    </section>
  );
}
