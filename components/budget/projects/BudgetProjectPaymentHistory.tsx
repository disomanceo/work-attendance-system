"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import styles from "./BudgetProjectPaymentHistory.module.css";

type Payment = {
  id: string;
  project_id: string;
  activity_id: string | null;
  details: string;
  payment_period: string | null;
  amount: number;
  status: "active" | "cancelled";
  created_at: string;
  requester_name: string;
};

type ApiResult = { ok?: boolean; payments?: Payment[] };

type Props = {
  projectId: string;
  activityId?: string | null;
  level: "project" | "activity";
};

function money(value: number) {
  return new Intl.NumberFormat("th-TH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function thaiDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("th-TH", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

export default function BudgetProjectPaymentHistory({
  projectId,
  activityId = null,
  level,
}: Props) {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const supabase = createClient();
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token) throw new Error("Missing session");

        const response = await fetch("/api/budget/payments", {
          headers: { Authorization: `Bearer ${session.access_token}` },
          cache: "no-store",
        });
        const result = (await response.json().catch(() => ({}))) as ApiResult;
        if (!response.ok || !result.ok || !Array.isArray(result.payments)) {
          throw new Error("Unable to load payments");
        }
        if (!cancelled) setPayments(result.payments);
      } catch {
        if (!cancelled) setPayments([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => { cancelled = true; };
  }, [projectId, activityId]);

  const rows = useMemo(
    () => payments
      .filter((payment) => {
        if (payment.status !== "active" || payment.project_id !== projectId) return false;
        return activityId ? payment.activity_id === activityId : !payment.activity_id;
      })
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()),
    [payments, projectId, activityId],
  );

  if (loading || rows.length === 0) return null;

  return (
    <div className={`${styles.list} ${level === "activity" ? styles.activity : styles.project}`}>
      {rows.map((payment, index) => (
        <article className={styles.row} key={payment.id}>
          <span className={styles.arrow}>↳</span>
          <strong className={styles.period}>{payment.payment_period || `งวดที่ ${index + 1}`}</strong>
          <div className={styles.detail}>
            <b>{payment.details || "-"}</b>
            <small>ผู้เบิก {payment.requester_name || "-"} · {thaiDate(payment.created_at)}</small>
          </div>
          <b className={styles.amount}>{money(Number(payment.amount) || 0)} บาท</b>
        </article>
      ))}
    </div>
  );
}
