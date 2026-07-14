"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import styles from "./SmartAreaImportButton.module.css";

const EXTENSION_VERSION = "1.8.33";
const EXTENSION_DOWNLOAD_URL =
  "/downloads/import-area-pms-1.8.33-installer.zip";

type ImportRun = {
  status?: string | null;
  added?: number | null;
  updated?: number | null;
  duplicate?: number | null;
  failed?: number | null;
  finished_at?: string | null;
  github_run_id?: string | null;
  errors?: unknown[] | null;
};

const ACTIVE_STATUSES = new Set(["queued", "running"]);
const TERMINAL_STATUSES = new Set([
  "success",
  "partial",
  "failed",
  "skipped",
]);

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

function isMobileLike() {
  if (typeof window === "undefined") return false;

  const coarsePointer = window.matchMedia?.("(pointer: coarse)").matches;
  const narrowScreen = window.innerWidth <= 900;
  const mobileAgent =
    /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || "");

  return mobileAgent || (coarsePointer && narrowScreen);
}

function errorText(value: unknown): string {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (value instanceof Error) return value.message;

  if (typeof value === "object") {
    const item = value as {
      message?: unknown;
      id?: unknown;
      token?: unknown;
      status?: unknown;
      stage?: unknown;
    };
    const parts = [
      item.message ? String(item.message) : "",
      item.id ? `ID ${String(item.id)}` : "",
      item.token ? `token ${String(item.token)}` : "",
      item.status ? `HTTP ${String(item.status)}` : "",
      item.stage ? String(item.stage) : "",
    ].filter(Boolean);

    if (parts.length) return parts.join(" · ");
  }

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function runErrorMessage(run: ImportRun | null) {
  const errors = Array.isArray(run?.errors) ? run.errors : [];
  const latest = errors.length ? errorText(errors[errors.length - 1]) : "";

  if (latest) return latest;
  if (run?.status === "failed") return "งานดึงข้อมูลล้มเหลว";
  if ((run?.failed ?? 0) > 0) return "มีบางรายการนำเข้าไม่สำเร็จ";
  return "";
}

function announceDocumentsUpdated(run: ImportRun | null) {
  window.dispatchEvent(
    new CustomEvent("smart-area-documents-updated", {
      detail: {
        source: "smart-area-import",
        status: run?.status || "",
        added: run?.added ?? 0,
        updated: run?.updated ?? 0,
      },
    }),
  );
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
          `Extension ยังไม่ตอบสนอง กรุณาติดตั้ง/อัปเดตเป็น v${EXTENSION_VERSION} แล้ว Reload Extension หรือเปิด Chrome ใหม่`,
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
  const announcedRunRef = useRef("");

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
      const nextRun = (body.run || null) as ImportRun | null;
      setRun(nextRun);

      if (
        nextRun &&
        TERMINAL_STATUSES.has(String(nextRun.status || ""))
      ) {
        const marker = `${nextRun.finished_at || ""}:${nextRun.status || ""}:${nextRun.added || 0}:${nextRun.updated || 0}:${nextRun.failed || 0}`;

        if (
          nextRun.finished_at &&
          announcedRunRef.current !== marker &&
          ["success", "partial"].includes(String(nextRun.status || ""))
        ) {
          announcedRunRef.current = marker;
          announceDocumentsUpdated(nextRun);
        }

        const latestError = runErrorMessage(nextRun);
        setMessage(latestError ? `ผลดึงข้อมูล: ${latestError}` : "");
      }

      return nextRun;
    }

    return null;
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
        if (isMobileLike()) {
          setMessage(
            `${body.message || "เริ่มงานผ่าน GitHub ไม่สำเร็จ"} · มือถือใช้ Extension ไม่ได้ กรุณาตรวจ GitHub App/token และลองอีกครั้ง`,
          );
          await load();
          return;
        }

        const fallback = await requestExtensionImport();

        if (fallback.ok) {
          setMessage(
            "GitHub token ใช้งานไม่ได้ จึงสั่ง Extension ให้ดึงข้อมูลแทนแล้ว",
          );
          announceDocumentsUpdated(null);
          await load();
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

      setMessage(
        body.githubToken
          ? `เริ่ม GitHub workflow แล้ว (${body.githubToken})`
          : "เริ่ม GitHub workflow แล้ว",
      );
      await load();
    } finally {
      setBusy(false);
    }
  }

  const active =
    busy || ACTIVE_STATUSES.has(run?.status || "");
  const finished = formatFinishedAt(run?.finished_at);
  const status = run?.status ? ` · ${run.status}` : "";

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
          <span>
            {message}
            {message.includes("Extension") ? (
              <>
                {" "}
                <a href={EXTENSION_DOWNLOAD_URL} target="_blank" rel="noreferrer">
                  อัปเดต Extension v{EXTENSION_VERSION}
                </a>
              </>
            ) : null}
          </span>
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
              {status}
            </span>
          </>
        )}
      </div>
    </div>
  );
}
