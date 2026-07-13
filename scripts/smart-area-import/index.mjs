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
  const isWeekend = ["Sat", "Sun"].includes(weekday);

  if (isWeekend) {
    return hour === 12;
  }

  return [8, 9, 11, 14, 15, 19].includes(hour);
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

function stripLeadingLabel(value, labels) {
  let result = clean(value);

  for (const label of labels) {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    result = result.replace(new RegExp(`^${escaped}\\s*[:：]?\\s*`, "i"), "");
  }

  return clean(result);
}

function pageRangeValues(value) {
  return String(value || "")
    .split(",")
    .flatMap((part) => {
      const [start, end] = part
        .split("-")
        .map((item) => Number(item.trim()))
        .filter((item) => Number.isInteger(item) && item > 0);

      if (start && end) {
        const first = Math.min(start, end);
        const last = Math.max(start, end);
        const pages = [];
        for (let page = first; page <= last; page += 1) pages.push(page);
        return pages;
      }

      return start ? [start] : [];
    });
}

const LABELS = {
  detail: "\u0e23\u0e32\u0e22\u0e25\u0e30\u0e40\u0e2d\u0e35\u0e22\u0e14",
  open: "\u0e40\u0e1b\u0e34\u0e14",
  select: "\u0e40\u0e25\u0e37\u0e2d\u0e01",
  download: "\u0e14\u0e32\u0e27\u0e19\u0e4c\u0e42\u0e2b\u0e25\u0e14",
  attachment: "\u0e40\u0e2d\u0e01\u0e2a\u0e32\u0e23\u0e41\u0e19\u0e1a",
  order: "\u0e25\u0e33\u0e14\u0e31\u0e1a",
  date: "\u0e27\u0e31\u0e19\u0e17\u0e35\u0e48",
  number: "\u0e40\u0e25\u0e02\u0e17\u0e35\u0e48",
  from: "\u0e08\u0e32\u0e01",
  documentNo: "\u0e40\u0e25\u0e02\u0e17\u0e35\u0e48\u0e2b\u0e19\u0e31\u0e07\u0e2a\u0e37\u0e2d",
  documentNumber: "\u0e40\u0e25\u0e02\u0e2b\u0e19\u0e31\u0e07\u0e2a\u0e37\u0e2d",
  subject: "\u0e40\u0e23\u0e37\u0e48\u0e2d\u0e07",
  priority: "\u0e0a\u0e31\u0e49\u0e19\u0e04\u0e27\u0e32\u0e21\u0e40\u0e23\u0e47\u0e27",
  urgency: "\u0e04\u0e27\u0e32\u0e21\u0e40\u0e23\u0e47\u0e27",
  receiveNo: "\u0e40\u0e25\u0e02\u0e17\u0e30\u0e40\u0e1a\u0e35\u0e22\u0e19\u0e2b\u0e19\u0e31\u0e07\u0e2a\u0e37\u0e2d\u0e23\u0e31\u0e1a",
  receiveNumber: "\u0e40\u0e25\u0e02\u0e17\u0e30\u0e40\u0e1a\u0e35\u0e22\u0e19\u0e23\u0e31\u0e1a",
  documentDate: "\u0e27\u0e31\u0e19\u0e17\u0e35\u0e48\u0e2b\u0e19\u0e31\u0e07\u0e2a\u0e37\u0e2d",
  letterDate: "\u0e2b\u0e19\u0e31\u0e07\u0e2a\u0e37\u0e2d\u0e25\u0e07\u0e27\u0e31\u0e19\u0e17\u0e35\u0e48",
  sentBy: "\u0e2a\u0e48\u0e07\u0e42\u0e14\u0e22",
  summary: "\u0e40\u0e19\u0e37\u0e49\u0e2d\u0e2b\u0e32\u0e42\u0e14\u0e22\u0e2a\u0e23\u0e38\u0e1b",
  note: "\u0e2b\u0e21\u0e32\u0e22\u0e40\u0e2b\u0e15\u0e38",
};

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
  const requestedPages = pageRangeValues(process.env.SMART_AREA_PAGE_RANGE);
  const scanPages = requestedPages.length
    ? [...new Set(requestedPages)].sort((left, right) => left - right)
    : Array.from(
        { length: latestPage - Math.max(1, latestPage - 2) + 1 },
        (_, index) => Math.max(1, latestPage - 2) + index,
      );

  const items = new Map();

  for (const pageNumber of scanPages) {
    const url = new URL(receiveUrl);
    url.searchParams.set("page", String(pageNumber));

    await page.goto(url.href, {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });

    const rows = await page.locator("tr").evaluateAll((tableRows) =>
      tableRows
        .map((row, rowIndex) => {
          const normalize = (value) =>
            String(value || "").replace(/\s+/g, " ").trim();
          const clean = normalize;
          const stripLeadingLabel = (value, labels) => {
            let result = normalize(value);

            for (const label of labels) {
              const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
              result = result.replace(new RegExp(`^${escaped}\\s*[:ï¼š]?\\s*`, "i"), "");
            }

            return normalize(result);
          };

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

          const listDocumentNo = stripLeadingLabel(cells[1], ["เลขหนังสือ"]);
          const listSubject = clean(cells[2]);
          const listDocumentDate = clean(cells[4]);
          const listSender = clean(cells[5]);

          const labelValue = (labels) => {
            for (let index = 0; index < cells.length; index += 1) {
              const value = cells[index];
              const label = labels.find((item) => value.includes(item));
              if (!label) continue;

              const stripped = value
                .replace(new RegExp(`^.*?${label}\\s*[:：]?\\s*`), "")
                .trim();
              if (stripped && stripped !== value) return stripped;
              return cells[index + 1] || "";
            }

            return "";
          };

          const receiveNo = labelValue([
            "เลขทะเบียนหนังสือรับ",
            "เลขทะเบียนรับ",
          ]);
          const documentNo =
            listDocumentNo || labelValue(["เลขที่หนังสือ", "เลขหนังสือ"]);
          const documentDate = labelValue([
            "วันที่หนังสือ",
            "หนังสือลงวันที่",
            "ลงวันที่",
          ]) || listDocumentDate;
          const sender = labelValue(["ส่งโดย", "จาก"]) || listSender;
          const priority = labelValue(["ชั้นความเร็ว", "ความเร็ว"]);

          const subject =
            listSubject ||
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
            documentNo,
            receiveNo,
            documentDate,
            sender,
            priority,
            cells,
            rowOrder: rowIndex + 1,
          };
        })
        .filter(Boolean),
    );

    for (const [rowIndex, row] of rows.entries()) {
      items.set(row.id, {
        ...row,
        pageNumber,
        pageUrl: url.href,
        latestPage,
        rowOrder: rowIndex + 1,
      });
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

      const data = await page.evaluate(({ labels, debug }) => {
        const text = (value) =>
          String(value || "").replace(/\s+/g, " ").trim();
        const truncate = (value, length = 120) => {
          const cleaned = text(value);
          return cleaned.length > length ? `${cleaned.slice(0, length)}...` : cleaned;
        };
        const safeUrl = (value) => {
          try {
            const url = new URL(value, document.baseURI);
            const queryKeys = [...url.searchParams.keys()];
            url.search = queryKeys.length ? `?${queryKeys.join("&")}` : "";
            url.hash = "";
            return url.href;
          } catch {
            return truncate(value);
          }
        };

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

        const filePattern =
          /\.(pdf|docx?|xlsx?|pptx?|jpe?g|png|zip|rar)(?:$|[?#&])/i;
        const downloadPattern =
          /(download|file|attach|upload|document|doc|openfile|getfile|viewfile|showfile|readfile|book_file|bookfile|book_pdf|bookpdf)/i;
        const attachmentWords = [
          labels.attachment,
          "\u0e44\u0e1f\u0e25\u0e4c",
          "\u0e14\u0e32\u0e27\u0e19\u0e4c\u0e42\u0e2b\u0e25\u0e14",
          "\u0e40\u0e1b\u0e34\u0e14",
          "\u0e14\u0e39\u0e44\u0e1f\u0e25\u0e4c",
          "\u0e40\u0e2d\u0e01\u0e2a\u0e32\u0e23",
        ];

        const resolveUrl = (value) => {
          if (!String(value || "").trim()) return "";

          try {
            return new URL(value, document.baseURI).href;
          } catch {
            return "";
          }
        };

        const urlsFromAttribute = (value) => {
          const raw = String(value || "");
          const urls = [];

          for (const match of raw.matchAll(/['"]([^'"]+)['"]/g)) {
            const candidate = match[1];
            if (/^(?:https?:)?\/\//i.test(candidate) || /[/?&=]/.test(candidate)) {
              urls.push(resolveUrl(candidate));
            }
          }

          for (const match of raw.matchAll(
            /((?:https?:\/\/|\.{0,2}\/)?[A-Za-z0-9_./-]*(?:download|file|attach|upload|document|doc|openfile|getfile|viewfile|showfile|readfile|book_file|bookfile|book_pdf|bookpdf)[A-Za-z0-9_./-]*(?:\.php)?(?:\?[^'"<>\s)]*)?)/gi,
          )) {
            urls.push(resolveUrl(match[1]));
          }

          return urls.filter(Boolean);
        };

        const candidates = [];
        const debugElements = [];

        for (const element of document.querySelectorAll(
          "a,button,input,area,iframe,frame,[href],[src],[onclick],[data-url],[data-href]",
        )) {
          const href = element.getAttribute("href") || "";
          const src = element.getAttribute("src") || "";
          const onclick = element.getAttribute("onclick") || "";
          const rowText = text(element.closest("tr")?.textContent);
          const linkText = text(
            element.textContent ||
              element.getAttribute("value") ||
              element.getAttribute("alt") ||
              element.getAttribute("title"),
          );
          const urls = [
            resolveUrl(href),
            resolveUrl(src),
            ...urlsFromAttribute(onclick),
            ...urlsFromAttribute(element.getAttribute("data-url")),
            ...urlsFromAttribute(element.getAttribute("data-href")),
          ].filter(Boolean);
          const debugSearchable = [href, src, onclick, rowText, linkText].join(" ");

          if (
            debug &&
            debugElements.length < 60 &&
            (downloadPattern.test(debugSearchable) ||
              attachmentWords.some((word) => word && debugSearchable.includes(word)) ||
              urls.length > 0)
          ) {
            debugElements.push({
              tag: element.tagName.toLowerCase(),
              text: truncate(linkText || rowText, 100),
              href: href ? safeUrl(href) : "",
              src: src ? safeUrl(src) : "",
              onclick: truncate(onclick, 160),
              urls: urls.map(safeUrl).slice(0, 5),
            });
          }

          for (const url of urls) {
            if (/^(?:javascript:|#|mailto:)/i.test(url)) continue;

            const searchable = [url, href, src, onclick, rowText, linkText].join(" ");
            const directFileUrl =
              filePattern.test(url) || downloadPattern.test(url);
            const contextCanPointToFile =
              Boolean(href || onclick || element.getAttribute("data-url") || element.getAttribute("data-href")) ||
              element.tagName.toLowerCase() !== "img";
            const attachmentContext = attachmentWords.some(
              (word) => word && searchable.includes(word),
            );
            const isAttachment =
              directFileUrl ||
              filePattern.test(searchable) ||
              downloadPattern.test(searchable) ||
              (contextCanPointToFile && attachmentContext);

            if (!isAttachment) continue;

            candidates.push({
              text: linkText || rowText || url.split("/").pop() || "",
              url,
            });
          }
        }

        const seenLinks = new Set();
        const links = candidates.filter((item) => {
          const key = item.url.replace(/#.*$/, "");
          if (!key || seenLinks.has(key)) return false;
          seenLinks.add(key);
          return true;
        });

        return {
          documentNo:
            pick(["เลขที่หนังสือ", "เลขหนังสือ"]) ||
            text((document.body.innerText.match(/รายละเอียดหนังสือ\s*(ที่\s*[^\n\r]+)/) || [])[1]),
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
          knownDocumentNo: pick([labels.documentNo, labels.documentNumber]),
          knownSubject: pick([labels.subject]),
          knownPriority: pick([labels.priority, labels.urgency]),
          knownReceiveNo: pick([labels.receiveNo, labels.receiveNumber]),
          knownDocumentDate: pick([labels.documentDate, labels.letterDate]),
          knownSender: pick([labels.sentBy, labels.from]),
          knownSummary: pick([labels.summary, labels.note]),
          attachments: links,
          debugAttachmentScan: debug
            ? {
                baseUri: safeUrl(document.baseURI),
                bodyHasAttachmentWord: attachmentWords.some((word) =>
                  word ? document.body.innerText.includes(word) : false,
                ),
                elementCount: document.querySelectorAll("*").length,
                candidateCount: candidates.length,
                linkCount: links.length,
                elements: debugElements,
              }
            : null,
        };
      }, {
        labels: LABELS,
        debug: process.env.DEBUG_SMART_AREA_ID === String(item.id),
      });

      if (data.debugAttachmentScan) {
        console.log(
          `Attachment debug for ${item.id}: ${JSON.stringify(data.debugAttachmentScan)}`,
        );
      }

      const subject =
        clean(data.subject) || clean(data.knownSubject) || clean(item.subject);

      if (!subject) {
        throw new Error(
          `Missing document subject; row=${JSON.stringify(item.cells || [])}`,
        );
      }

      const payload = {
        action: "upsertDocument",
        sourceUrl: detailUrl,
        smartAreaId: item.id,
        documentNo:
          stripLeadingLabel(
            clean(data.documentNo) ||
              clean(data.knownDocumentNo) ||
              clean(item.documentNo),
            [LABELS.documentNo, LABELS.documentNumber],
          ),
        subject,
        priority:
          clean(data.priority) || clean(data.knownPriority) || clean(item.priority),
        receiveNo:
          stripLeadingLabel(
            clean(data.receiveNo) || clean(data.knownReceiveNo) || clean(item.receiveNo),
            [LABELS.receiveNo, LABELS.receiveNumber],
          ),
        documentDate:
          clean(data.documentDate) ||
          clean(data.knownDocumentDate) ||
          clean(item.documentDate),
        sender: clean(data.sender) || clean(data.knownSender) || clean(item.sender),
        summary: clean(data.summary) || clean(data.knownSummary),
        smartAreaPage: String(item.pageNumber || ""),
        centralLatestPage: String(item.latestPage || ""),
        sourcePageUrl: item.pageUrl || "",
        rowOrder: String(item.rowOrder || ""),
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
