"use client";

import { useCallback, useEffect, useState } from "react";
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

function requestExtensionImport() {
  return new Promise<{ ok: boolean; error?: string }>((resolve) => {
    const requestId =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : String(Date.now());

    const timeout = window.setTimeout(() => {
      window.removeEventListener("message", onMessage);
      resolve({
        ok: false,
        error:
          "Extension ยังไม่ตอบสนอง กรุณาติดตั้ง/อัปเดต Extension แล้วเปิด Chrome ใหม่",
      });
    }, 3500);

    function onMessage(event: MessageEvent) {
      if (
        event.source !== window ||
        !event.data ||
        event.data.type !== "SMARTAREA_RUN_EXTENSION_IMPORT_RESULT" ||
        event.data.requestId !== requestId
      ) {
        return;
      }

      window.clearTimeout(timeout);
      window.removeEventListener("message", onMessage);
      resolve({
        ok: Boolean(event.data.ok),
        error: event.data.error || "",
      });
    }

    window.addEventListener("message", onMessage);
    window.postMessage(
      {
        type: "SMARTAREA_RUN_EXTENSION_IMPORT",
        requestId,
        payload: { force: true },
      },
      "*",
    );
  });
}

export default function SmartAreaImportButton() {
  const [run, setRun] = useState<ImportRun | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const authFetch = useCallback(async (url: string, init?: RequestInit) => {
    const { data } = await createClient().auth.getSession();
    const token = data.session?.access_token;

    return fetch(url, {
      ...init,
      headers: {
        ...(init?.headers || {}),
        authorization: `Bearer ${token}`,
      },
    });
  }, []);

  const load = useCallback(async () => {
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
  }, [authFetch]);

  useEffect(() => {
    void load();

    const id = window.setInterval(() => {
      void load();
    }, 10000);

    return () => window.clearInterval(id);
  }, [load]);

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
        const fallback = await requestExtensionImport();

        if (fallback.ok) {
          setMessage(
            "GitHub token ใช้งานไม่ได้ จึงสั่ง Extension ให้ดึงข้อมูลแทนแล้ว",
          );
          return;
        }

        setMessage(
          `${body.message || "เริ่มงานไม่สำเร็จ"} · ${
            fallback.error ||
            "Extension ยังไม่พร้อมทำงาน กรุณาอัปเดต Extension"
          }`,
        );
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
