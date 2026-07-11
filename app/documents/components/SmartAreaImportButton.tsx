"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type ImportRun = {
  status?: string | null;
  added?: number | null;
  updated?: number | null;
  duplicate?: number | null;
  failed?: number | null;
  finished_at?: string | null;
};

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
    const response = await authFetch("/api/documents/smart-area-import/status");
    const body = await response.json();

    if (body.ok) {
      setRun(body.run);
      if (body.run && !["queued", "running"].includes(body.run.status)) {
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

  const active = busy || ["queued", "running"].includes(run?.status || "");
  const summary = run
    ? `เพิ่มใหม่ ${run.added ?? 0} · อัปเดต ${run.updated ?? 0} · ซ้ำ ${run.duplicate ?? 0} · ผิดพลาด ${run.failed ?? 0}`
    : "";
  const finished = run?.finished_at
    ? new Date(run.finished_at).toLocaleString("th-TH")
    : "";

  return (
    <div
      style={{
        display: "flex",
        gap: 8,
        alignItems: "center",
        flexWrap: "wrap",
        marginBottom: 12,
      }}
    >
      <button
        type="button"
        onClick={start}
        disabled={active}
        style={{
          border: 0,
          borderRadius: 10,
          padding: "10px 14px",
          fontWeight: 700,
          background: active ? "#9ca3af" : "#15803d",
          color: "white",
          cursor: active ? "not-allowed" : "pointer",
        }}
      >
        {active ? "กำลังดึงหนังสือ..." : "ดึงหนังสือล่าสุด"}
      </button>

      <span style={{ fontSize: 13 }}>
        {message || summary}
        {finished && !active ? ` · เสร็จ ${finished}` : ""}
      </span>
    </div>
  );
}