import { chromium } from "playwright";

const required = [
  "SMART_AREA_BASE_URL",
  "SMART_AREA_USERNAME",
  "SMART_AREA_PASSWORD",
  "WORK_ATTENDANCE_IMPORT_URL",
  "WORK_ATTENDANCE_IMPORT_SECRET",
];

for (const key of required) {
  if (!process.env[key]) throw new Error(`Missing ${key}`);
}

const result = {
  status: "running",
  scanned: 0,
  added: 0,
  updated: 0,
  duplicate: 0,
  failed: 0,
  errors: [],
};

const callback = async (status) => {
  if (!process.env.WORK_ATTENDANCE_CALLBACK_URL) return;

  await fetch(process.env.WORK_ATTENDANCE_CALLBACK_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-import-secret": process.env.WORK_ATTENDANCE_IMPORT_SECRET,
    },
    body: JSON.stringify({
      ...result,
      status,
      githubRunId: process.env.GITHUB_RUN_ID_VALUE || "",
    }),
  }).catch(() => {});
};

function inWorkingHours() {
  if (process.env.FORCE_RUN === "true") return true;

  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Bangkok",
    weekday: "short",
    hour: "2-digit",
    hour12: false,
  }).formatToParts(new Date());

  const weekday = parts.find((part) => part.type === "weekday")?.value;
  const hour = Number(parts.find((part) => part.type === "hour")?.value || 0);

  return !["Sat", "Sun"].includes(weekday) && hour >= 6 && hour <= 18;
}

function absoluteUrl(base, href) {
  try {
    return new URL(href, base).href;
  } catch {
    return "";
  }
}

function clean(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

await callback("running");

if (!inWorkingHours()) {
  result.status = "skipped";
  await callback("skipped");
  process.exit(0);
}

const browser = await chromium.launch({ headless: true });

try {
  const page = await browser.newPage();
  const receiveUrl = new URL(
    "/smartarea/index.php?option=book&task=main/receive",
    process.env.SMART_AREA_BASE_URL,
  ).href;

  await page.goto(receiveUrl, {
    waitUntil: "domcontentloaded",
    timeout: 30000,
  });

  const password = page.locator('input[type="password"]').first();

  if (await password.count()) {
    const usernameSelectors = [
      'input[name*="user" i]',
      'input[id*="user" i]',
      'input[name*="login" i]',
      'input[id*="login" i]',
      'input[type="text"]',
    ];

    let username = null;

    for (const selector of usernameSelectors) {
      const candidate = page.locator(selector).first();
      if (await candidate.count()) {
        username = candidate;
        break;
      }
    }

    if (!username) throw new Error("Username field not found");

    await username.fill(process.env.SMART_AREA_USERNAME);
    await password.fill(process.env.SMART_AREA_PASSWORD);

    const submit = page
      .locator('button[type="submit"],input[type="submit"]')
      .first();

    if (await submit.count()) {
      await submit.click();
    } else {
      await password.press("Enter");
    }

    await page.waitForLoadState("domcontentloaded");
    await page.goto(receiveUrl, {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });
  }

  if (await page.locator('input[type="password"]').count()) {
    throw new Error("Login failed");
  }

  const pageNumbers = await page
    .locator('a[href*="page="]')
    .evaluateAll((links) =>
      links
        .map((link) => {
          try {
            return Number(new URL(link.href).searchParams.get("page"));
          } catch {
            return 0;
          }
        })
        .filter((value) => Number.isInteger(value) && value > 0),
    );

  const latestPage = Math.max(1, ...pageNumbers);
  const firstPage = Math.max(1, latestPage - 2);

  const items = new Map();

  for (let pageNumber = firstPage; pageNumber <= latestPage; pageNumber++) {
    const url = new URL(receiveUrl);
    url.searchParams.set("page", String(pageNumber));

    await page.goto(url.href, {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });

    const rows = await page.locator("tr").evaluateAll((tableRows) =>
      tableRows
        .map((row) => {
          const normalize = (value) =>
            String(value || "").replace(/\s+/g, " ").trim();

          const html = row.innerHTML || "";
          const match =
            html.match(/b_id=(\d+)/i) ||
            html.match(/bookdetail_school_saraban\.php[^'"<>]*?(\d+)/i) ||
            html.match(/check\([^)]*?(\d{2,})/i);

          if (!match) return null;

          const cells = [...row.querySelectorAll("th,td")]
            .map((cell) => normalize(cell.textContent))
            .filter(Boolean);

          const link = [...row.querySelectorAll("a")].find((anchor) =>
            /b_id=\d+/i.test(anchor.href || ""),
          );

          const ignored = [
            "รายละเอียด",
            "เปิด",
            "เลือก",
            "ดาวน์โหลด",
            "เอกสารแนบ",
            "ลำดับ",
            "วันที่",
            "เลขที่",
            "จาก",
          ];

          const subject =
            cells
              .filter((value) => value.length >= 8)
              .filter((value) => !/^\d+$/.test(value))
              .filter((value) => !/^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}$/.test(value))
              .filter(
                (value) =>
                  !ignored.some(
                    (word) =>
                      value === word ||
                      value.toLowerCase() === word.toLowerCase(),
                  ),
              )
              .sort((a, b) => b.length - a.length)[0] || "";

          return {
            id: match[1],
            url: link?.href || "",
            subject,
            cells,
          };
        })
        .filter(Boolean),
    );

    for (const row of rows) {
      items.set(row.id, row);
    }
  }

  result.scanned = items.size;

  for (const item of items.values()) {
    try {
      const detailUrl =
        item.url ||
        new URL(
          `/smartarea/modules/book/main/bookdetail_school_saraban.php?b_id=${item.id}`,
          process.env.SMART_AREA_BASE_URL,
        ).href;

      await page.goto(detailUrl, {
        waitUntil: "domcontentloaded",
        timeout: 30000,
      });

      const data = await page.evaluate(() => {
        const text = (value) =>
          String(value || "").replace(/\s+/g, " ").trim();

        const rows = [...document.querySelectorAll("tr")];

        const pick = (labels) => {
          for (const row of rows) {
            const cells = [...row.querySelectorAll("th,td")];
            const matched = cells.some((cell) =>
              labels.some((label) => text(cell.textContent).includes(label)),
            );

            if (matched) {
              return text(cells.at(-1)?.textContent);
            }
          }

          return "";
        };

        const links = [...document.querySelectorAll("a[href]")]
          .map((anchor) => ({
            text: text(anchor.textContent),
            url: anchor.href,
          }))
          .filter(
            (item) =>
              /\.(pdf|docx?|xlsx?|pptx?|jpe?g|png|zip|rar)(\?|$)/i.test(
                item.url,
              ) || /upload_files/i.test(item.url),
          );

        return {
          documentNo: pick(["เลขที่หนังสือ", "เลขหนังสือ"]),
          subject: pick(["เรื่อง"]),
          priority: pick(["ชั้นความเร็ว", "ความเร็ว"]),
          receiveNo: pick([
            "เลขทะเบียนหนังสือรับ",
            "เลขทะเบียนรับ",
          ]),
          documentDate: pick([
            "วันที่หนังสือ",
            "หนังสือลงวันที่",
          ]),
          sender: pick(["ส่งโดย", "จาก"]),
          summary: pick(["เนื้อหาโดยสรุป", "หมายเหตุ"]),
          attachments: links,
        };
      });

      const subject = clean(data.subject) || clean(item.subject);

      if (!subject) {
        throw new Error(
          `Missing document subject; row=${JSON.stringify(item.cells || [])}`,
        );
      }

      const payload = {
        action: "upsertDocument",
        sourceUrl: detailUrl,
        smartAreaId: item.id,
        documentNo: clean(data.documentNo),
        subject,
        priority: clean(data.priority),
        receiveNo: clean(data.receiveNo),
        documentDate: clean(data.documentDate),
        sender: clean(data.sender),
        summary: clean(data.summary),
        attachmentText: data.attachments
          .map(
            (attachment, index) =>
              `${index + 1}. ${clean(attachment.text) || `file-${index + 1}`}`,
          )
          .join("\n"),
        attachmentUrl: data.attachments
          .map(
            (attachment, index) =>
              `${index + 1}. ${absoluteUrl(detailUrl, attachment.url)}`,
          )
          .join("\n"),
        fileCount: data.attachments.length,
      };

      const response = await fetch(process.env.WORK_ATTENDANCE_IMPORT_URL, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-import-secret": process.env.WORK_ATTENDANCE_IMPORT_SECRET,
        },
        body: JSON.stringify(payload),
      });

      const body = await response.json().catch(() => ({}));

      if (!response.ok || !body.ok) {
        throw new Error(body.message || `Import HTTP ${response.status}`);
      }

      if (body.message === "saved") {
        result.added++;
      } else if (body.message === "updated") {
        result.updated++;
      } else {
        result.duplicate++;
      }
    } catch (error) {
      result.failed++;
      result.errors.push({
        id: item.id,
        message: String(error.message || error),
      });
    }
  }

  result.status = result.failed ? "partial" : "success";
  await callback(result.status);

  console.log(JSON.stringify(result, null, 2));

  if (result.failed && result.failed === result.scanned) {
    process.exitCode = 1;
  }
} catch (error) {
  result.status = "failed";
  result.failed++;
  result.errors.push({
    message: String(error.message || error),
  });
  await callback("failed");
  throw error;
} finally {
  await browser.close();
}
