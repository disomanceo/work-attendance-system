import { createSign } from "crypto";
import { NextResponse } from "next/server";
import { adminClient, requireUser } from "../_shared";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

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
  stage?: "auth" | "dispatch";
};

type AppTokenResult =
  | { token: WorkflowToken; error?: never }
  | { token?: never; error: DispatchAttempt }
  | null;

function base64Url(value: string) {
  return Buffer.from(value)
    .toString("base64")
    .replaceAll("=", "")
    .replaceAll("+", "-")
    .replaceAll("/", "_");
}

function normalizePrivateKey(value: string) {
  const trimmed = value.trim();

  if (trimmed.includes("BEGIN")) {
    return trimmed.replaceAll("\\n", "\n");
  }

  try {
    return Buffer.from(trimmed, "base64").toString("utf8").replaceAll("\\n", "\n");
  } catch {
    return trimmed.replaceAll("\\n", "\n");
  }
}

function createGitHubAppJwt(appId: string, privateKey: string) {
  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = base64Url(
    JSON.stringify({
      iat: now - 60,
      exp: now + 9 * 60,
      iss: appId,
    }),
  );
  const unsigned = `${header}.${payload}`;
  const signature = createSign("RSA-SHA256")
    .update(unsigned)
    .sign(privateKey, "base64")
    .replaceAll("=", "")
    .replaceAll("+", "-")
    .replaceAll("/", "_");

  return `${unsigned}.${signature}`;
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

async function createGitHubAppInstallationToken(
  repo: string,
): Promise<AppTokenResult> {
  const appId = process.env.GITHUB_APP_ID?.trim();
  const installationId = process.env.GITHUB_APP_INSTALLATION_ID?.trim();
  const rawPrivateKey =
    process.env.GITHUB_APP_PRIVATE_KEY ||
    process.env.GITHUB_APP_PRIVATE_KEY_BASE64 ||
    "";

  if (!appId || !installationId || !rawPrivateKey.trim()) return null;

  const privateKey = normalizePrivateKey(rawPrivateKey);
  const jwt = createGitHubAppJwt(appId, privateKey);
  const repositoryName = repo.split("/")[1];
  const response = await fetch(
    `https://api.github.com/app/installations/${installationId}/access_tokens`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${jwt}`,
        accept: "application/vnd.github+json",
        "x-github-api-version": GITHUB_API_VERSION,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        repositories: repositoryName ? [repositoryName] : undefined,
        permissions: {
          actions: "write",
          contents: "read",
        },
      }),
    },
  );

  if (!response.ok) {
    const message = await readGitHubError(response);
    return {
      error: {
        token: "github-app",
        attempt: 1,
        status: response.status,
        message: `GitHub App auth failed: ${message}`,
        transient: TRANSIENT_STATUSES.has(response.status),
        stage: "auth" as const,
      },
    };
  }

  const body = (await response.json()) as { token?: string };
  if (!body.token) {
    return {
      error: {
        token: "github-app",
        attempt: 1,
        message: "GitHub App auth failed: missing installation token",
        transient: false,
        stage: "auth" as const,
      },
    };
  }

  return {
    token: {
      label: "github-app",
      value: body.token,
    },
  };
}

async function workflowTokens(repo: string) {
  const attempts: DispatchAttempt[] = [];
  const appToken: AppTokenResult = await createGitHubAppInstallationToken(
    repo,
  ).catch((error) => ({
    error: {
      token: "github-app",
      attempt: 1,
      message:
        error instanceof Error
          ? `GitHub App auth failed: ${error.message}`
          : "GitHub App auth failed",
      transient: false,
      stage: "auth" as const,
    },
  }));

  if (appToken?.error) attempts.push(appToken.error);

  const candidates: WorkflowToken[] = [
    ...(appToken?.token ? [appToken.token] : []),
    { label: "primary", value: process.env.GITHUB_WORKFLOW_TOKEN || "" },
    { label: "backup", value: process.env.GITHUB_WORKFLOW_TOKEN_BACKUP || "" },
    { label: "backup2", value: process.env.GITHUB_WORKFLOW_TOKEN_2 || "" },
  ];
  const seen = new Set<string>();
  const tokens = candidates.filter((token) => {
    const value = token.value.trim();
    if (!value || seen.has(value)) return false;
    seen.add(value);
    token.value = value;
    return true;
  });

  return { tokens, attempts };
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
  const { tokens, attempts } = await workflowTokens(repo);

  if (tokens.length === 0) {
    return {
      ok: false as const,
      attempts,
      message:
        "ยังไม่ได้ตั้งค่า GitHub App หรือ GITHUB_WORKFLOW_TOKEN สำหรับสั่ง GitHub workflow",
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
        stage: "dispatch",
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
