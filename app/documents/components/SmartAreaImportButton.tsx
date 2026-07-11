"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import styles from "./SmartAreaImportButton.module.css";

type ImportRun = {
  status?: string | null;
  added?: number | null;
  updated?: number | null;
  duplicate?: number | null;
  failed?: number | null;
  finished_at?: string | null;
};

function formatFinishedAt(value?: string | null) {
  if (!value) return "";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  return new Intl.DateTimeFormat("th-TH", {
    day: "numeric",
    month: "numeric",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export default function SmartAreaImportButton() {
  const [run, setRun] = useState<ImportRun | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function authFetch(url: string, init?: RequestInit) {
    const { data } = await createClient().auth.getSession();
    const token = data.session?.access_token;

    return fetch(url, {
      ...init,
      headers: {
        ...(init?.headers || {}),
        authorization: `Bearer ${token}`,
      },
    });
  }

  async function load() {
    const response = await authFetch(
      "/api/documents/smart-area-import/status",
    );
    const body = await response.json();

    if (body.ok) {
      setRun(body.run);

      if (
        body.run &&
        !["queued", "running"].includes(body.run.status)
      ) {
        setMessage("");
      }
    }
  }

  useEffect(() => {
    void load();

    const id = window.setInterval(() => {
      void load();
    }, 10000);

    return () => window.clearInterval(id);
  }, []);

  async function start() {
    setBusy(true);
    setMessage("กำลังส่งคำสั่ง...");

    try {
      const response = await authFetch(
        "/api/documents/smart-area-import/dispatch",
        { method: "POST" },
      );
      const body = await response.json();

      if (!body.ok) {
        setMessage(body.message || "เริ่มงานไม่สำเร็จ");
        return;
      }

      setMessage("");
      await load();
    } finally {
      setBusy(false);
    }
  }

  const active =
    busy || ["queued", "running"].includes(run?.status || "");
  const finished = formatFinishedAt(run?.finished_at);

  return (
    <div className={styles.importDock}>
      <button
        type="button"
        onClick={start}
        disabled={active}
        className={styles.importButton}
      >
        {active ? "กำลังดึง..." : "↻ ดึงล่าสุด"}
      </button>

      <div className={styles.importMeta} aria-live="polite">
        {message ? (
          <span>{message}</span>
        ) : (
          <>
            <span>
              เพิ่ม {run?.added ?? 0} · อัปเดต{" "}
              {run?.updated ?? 0} · ซ้ำ{" "}
              {run?.duplicate ?? 0}
            </span>
            <span>
              ผิดพลาด {run?.failed ?? 0}
              {finished ? ` · ${finished}` : ""}
            </span>
          </>
        )}
      </div>
    </div>
  );
}
