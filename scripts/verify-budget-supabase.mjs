#!/usr/bin/env node
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs/promises";
import path from "node:path";

async function loadEnv() {
  for (const name of [".env.local", ".env"]) {
    try {
      const text = await fs.readFile(path.resolve(name), "utf8");
      for (const raw of text.split(/\r?\n/)) {
        const line = raw.trim();
        if (!line || line.startsWith("#")) continue;
        const index = line.indexOf("=");
        if (index < 1) continue;
        const key = line.slice(0, index).trim();
        let value = line.slice(index + 1).trim().replace(/^['"]|['"]$/g, "");
        if (!(key in process.env)) process.env[key] = value;
      }
    } catch {}
  }
}

async function countTable(client, table) {
  const { count, error } = await client
    .from(table)
    .select("*", { count: "exact", head: true });
  if (error) throw error;
  return count ?? 0;
}

await loadEnv();
const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
if (!url || !key) throw new Error("Supabase environment variables are incomplete");

const client = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const [
  projects,
  activities,
  payments,
  projectAttachments,
  paymentAttachments,
] = await Promise.all([
  countTable(client, "budget_projects"),
  countTable(client, "budget_activities"),
  countTable(client, "budget_payment_records"),
  countTable(client, "budget_project_attachments"),
  countTable(client, "budget_payment_attachments"),
]);

const { data: totals, error: totalsError } = await client
  .from("budget_projects")
  .select("approved_budget, legacy_actual_amount");
if (totalsError) throw totalsError;

const approvedBudget = (totals ?? []).reduce(
  (sum, row) => sum + Number(row.approved_budget || 0),
  0,
);
const legacyActual = (totals ?? []).reduce(
  (sum, row) => sum + Number(row.legacy_actual_amount || 0),
  0,
);

const report = {
  checkedAt: new Date().toISOString(),
  projects,
  activities,
  payments,
  projectAttachments,
  paymentAttachments,
  approvedBudget,
  legacyActual,
};

console.log(JSON.stringify(report, null, 2));
