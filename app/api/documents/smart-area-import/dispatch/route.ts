import { NextResponse } from "next/server";
import { adminClient, requireUser } from "../_shared";

export const dynamic = "force-dynamic";

const WORKFLOW_FILE = "smart-area-import.yml";
const GITHUB_API_VERSION = "2022-11-28";
const DISPATCH_TIMEOUT_MS = 12000;
const TRANSIENT_STATUSES = new Set([408, 429, 500, 502, 503, 504]);

type WorkflowToken = {
  label: string;
  value: string;
};

type DispatchAttempt = {
  token: string;
  attempt: number;
  status?: number;
  message: string;
  transient?: boolean;
};

function workflowTokens() {
  const candidates: WorkflowToken[] = [
    { label: "primary", value: process.env.GITHUB_WORKFLOW_TOKEN || "" },
    { label: "backup", value: process.env.GITHUB_WORKFLOW_TOKEN_BACKUP || "" },
    { label: "backup2", value: process.env.GITHUB_WORKFLOW_TOKEN_2 || "" },
  ];
  const seen = new Set<string>();

  return candidates.filter((token) => {
    const value = token.value.trim();
    if (!value || seen.has(value)) return false;
    seen.add(value);
    token.value = value;
    return true;
  });
}

async function readGitHubError(response: Response) {
  const text = await response.text().catch(() => "");
  let detail = text.trim();

  try {
    const json = JSON.parse(text) as { message?: string };
    detail = json.message || detail;
  } catch {
    // GitHub may return an empty body for some responses.
  }

  return detail || response.statusText || "Unknown GitHub error";
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function dispatchWorkflow({
  repo,
  ref,
  token,
}: {
  repo: string;
  ref: string;
  token: WorkflowToken;
}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DISPATCH_TIMEOUT_MS);

  try {
    const response = await fetch(
      `https://api.github.com/repos/${repo}/actions/workflows/${WORKFLOW_FILE}/dispatches`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${token.value}`,
          accept: "application/vnd.github+json",
          "x-github-api-version": GITHUB_API_VERSION,
          "content-type": "application/json",
        },
        body: JSON.stringify({ ref, inputs: { force: "true" } }),
        signal: controller.signal,
      },
    );

    if (response.ok) return { ok: true as const };

    const message = await readGitHubError(response);

    return {
      ok: false as const,
      status: response.status,
      message,
      transient: TRANSIENT_STATUSES.has(response.status),
    };
  } catch (error) {
    return {
      ok: false as const,
      message:
        error instanceof Error ? error.message : "Cannot reach GitHub API",
      transient: true,
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function startWorkflow(repo: string, ref: string) {
  const tokens = workflowTokens();
  const attempts: DispatchAttempt[] = [];

  if (tokens.length === 0) {
    return {
      ok: false as const,
      attempts,
      message:
        "ยังไม่ได้ตั้งค่า GITHUB_WORKFLOW_TOKEN หรือ token สำรองสำหรับสั่ง GitHub workflow",
    };
  }

  for (const token of tokens) {
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      const result = await dispatchWorkflow({ repo, ref, token });

      if (result.ok) {
        return {
          ok: true as const,
          attempts,
          tokenLabel: token.label,
        };
      }

      attempts.push({
        token: token.label,
        attempt,
        status: result.status,
        message: result.message,
        transient: result.transient,
      });

      if (!result.transient) break;
      await sleep(400 * attempt);
    }
  }

  const last = attempts.at(-1);

  return {
    ok: false as const,
    attempts,
    message: last
      ? `GitHub HTTP ${last.status || "-"}: ${last.message}`
      : "Cannot start GitHub workflow",
  };
}

export async function POST(request: Request) {
  const user = await requireUser(request);
  if (!user) {
    return NextResponse.json(
      { ok: false, message: "Unauthorized" },
      { status: 401 },
    );
  }

  const repo =
    process.env.GITHUB_WORKFLOW_REPOSITORY || "disomanceo/work-attendance-system";
  const ref = process.env.GITHUB_WORKFLOW_REF || "main";
  const admin = adminClient();
  const { data: run, error } = await admin
    .from("smart_area_import_runs")
    .insert({ status: "queued", created_by: user.id })
    .select("id")
    .single();

  if (error) {
    return NextResponse.json(
      { ok: false, message: error.message },
      { status: 500 },
    );
  }

  const result = await startWorkflow(repo, ref);

  if (!result.ok) {
    await admin
      .from("smart_area_import_runs")
      .update({
        status: "failed",
        finished_at: new Date().toISOString(),
        errors: [
          {
            message: result.message,
            repo,
            ref,
            workflow: WORKFLOW_FILE,
            attempts: result.attempts,
          },
        ],
      })
      .eq("id", run.id);

    return NextResponse.json(
      {
        ok: false,
        message: `เริ่ม GitHub workflow ไม่สำเร็จ (${result.message})`,
        attempts: result.attempts,
        fallback: "extension",
      },
      { status: 502 },
    );
  }

  return NextResponse.json({
    ok: true,
    runId: run.id,
    githubToken: result.tokenLabel,
  });
}
