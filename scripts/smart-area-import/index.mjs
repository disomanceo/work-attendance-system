import { chromium } from "playwright";

const required = ["SMART_AREA_BASE_URL","SMART_AREA_USERNAME","SMART_AREA_PASSWORD","WORK_ATTENDANCE_IMPORT_URL","WORK_ATTENDANCE_IMPORT_SECRET"];
for (const key of required) if (!process.env[key]) throw new Error(`Missing ${key}`);

const result = { status: "running", scanned: 0, added: 0, updated: 0, duplicate: 0, failed: 0, errors: [] };
const callback = async (status) => {
  if (!process.env.WORK_ATTENDANCE_CALLBACK_URL) return;
  await fetch(process.env.WORK_ATTENDANCE_CALLBACK_URL, {
    method: "POST",
    headers: { "content-type": "application/json", "x-import-secret": process.env.WORK_ATTENDANCE_IMPORT_SECRET },
    body: JSON.stringify({ ...result, status, githubRunId: process.env.GITHUB_RUN_ID_VALUE || "" })
  }).catch(() => {});
};

function inWorkingHours() {
  if (process.env.FORCE_RUN === "true") return true;
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Bangkok", weekday: "short", hour: "2-digit", hour12: false }).formatToParts(new Date());
  const weekday = parts.find(p => p.type === "weekday")?.value;
  const hour = Number(parts.find(p => p.type === "hour")?.value || 0);
  return !["Sat","Sun"].includes(weekday) && hour >= 6 && hour <= 18;
}

function abs(base, href) { try { return new URL(href, base).href; } catch { return ""; } }
function clean(v) { return String(v || "").replace(/\s+/g, " ").trim(); }

await callback("running");
if (!inWorkingHours()) { result.status = "skipped"; await callback("skipped"); process.exit(0); }

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  const receiveUrl = new URL("/smartarea/index.php?option=book&task=main/receive", process.env.SMART_AREA_BASE_URL).href;
  await page.goto(receiveUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
  const password = page.locator('input[type="password"]').first();
  if (await password.count()) {
    const usernameSelectors = ['input[name*="user" i]','input[id*="user" i]','input[name*="login" i]','input[id*="login" i]','input[type="text"]'];
    let user = null;
    for (const selector of usernameSelectors) { const c = page.locator(selector).first(); if (await c.count()) { user = c; break; } }
    if (!user) throw new Error("Username field not found");
    await user.fill(process.env.SMART_AREA_USERNAME);
    await password.fill(process.env.SMART_AREA_PASSWORD);
    const submit = page.locator('button[type="submit"],input[type="submit"]').first();
    if (await submit.count()) await submit.click(); else await password.press("Enter");
    await page.waitForLoadState("domcontentloaded");
    await page.goto(receiveUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
  }
  if (await page.locator('input[type="password"]').count()) throw new Error("Login failed");

  const pageNumbers = await page.locator('a[href*="page="]').evaluateAll((links) => links
    .map((link) => {
      try { return Number(new URL(link.href).searchParams.get("page")); }
      catch { return 0; }
    })
    .filter((value) => Number.isInteger(value) && value > 0));
  const latestPage = Math.max(1, ...pageNumbers);
  const firstPage = Math.max(1, latestPage - 2);

  const items = new Map();
  for (let p = firstPage; p <= latestPage; p++) {
    const url = new URL(receiveUrl); url.searchParams.set("page", String(p));
    await page.goto(url.href, { waitUntil: "domcontentloaded", timeout: 30000 });
    const rows = await page.locator("tr").evaluateAll((trs) => trs.map((tr) => {
      const html = tr.innerHTML || "";
      const match = html.match(/b_id=(\d+)/i) || html.match(/bookdetail_school_saraban\.php[^'\"<>]*?(\d+)/i) || html.match(/check\([^)]*?(\d{2,})/i);
      const a = [...tr.querySelectorAll("a")].find(x => /b_id=\d+/i.test(x.href || ""));
      return match ? { id: match[1], url: a?.href || "" } : null;
    }).filter(Boolean));
    for (const row of rows) items.set(row.id, row);
  }
  result.scanned = items.size;

  for (const item of items.values()) {
    try {
      const detailUrl = item.url || new URL(`/smartarea/modules/book/main/bookdetail_school_saraban.php?b_id=${item.id}`, process.env.SMART_AREA_BASE_URL).href;
      await page.goto(detailUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
      const data = await page.evaluate(() => {
        const text = (v) => String(v || "").replace(/\s+/g, " ").trim();
        const rows = [...document.querySelectorAll("tr")];
        const pick = (labels) => {
          for (const row of rows) {
            const cells = [...row.querySelectorAll("th,td")];
            if (cells.some(c => labels.some(l => text(c.textContent).includes(l)))) return text(cells.at(-1)?.textContent);
          }
          return "";
        };
        const links = [...document.querySelectorAll("a[href]")].map(a => ({ text: text(a.textContent), url: a.href })).filter(x => /\.(pdf|docx?|xlsx?|pptx?|jpe?g|png|zip|rar)(\?|$)|upload_files/i.test(x.url));
        return {
          documentNo: pick(["เน€เธฅเธเธ—เธตเนเธซเธเธฑเธเธชเธทเธญ","เน€เธฅเธเธซเธเธฑเธเธชเธทเธญ"]),
          subject: pick(["เน€เธฃเธทเนเธญเธ"]),
          priority: pick(["เธเธฑเนเธเธเธงเธฒเธกเน€เธฃเนเธง","เธเธงเธฒเธกเน€เธฃเนเธง"]),
          receiveNo: pick(["เน€เธฅเธเธ—เธฐเน€เธเธตเธขเธเธซเธเธฑเธเธชเธทเธญเธฃเธฑเธ","เน€เธฅเธเธ—เธฐเน€เธเธตเธขเธเธฃเธฑเธ"]),
          documentDate: pick(["เธงเธฑเธเธ—เธตเนเธซเธเธฑเธเธชเธทเธญ","เธซเธเธฑเธเธชเธทเธญเธฅเธเธงเธฑเธเธ—เธตเน"]),
          sender: pick(["เธชเนเธเนเธ”เธข","เธเธฒเธ"]),
          summary: pick(["เน€เธเธทเนเธญเธซเธฒเนเธ”เธขเธชเธฃเธธเธ","เธซเธกเธฒเธขเน€เธซเธ•เธธ"]),
          attachments: links
        };
      });
      const payload = {
        action: "upsertDocument", sourceUrl: detailUrl, smartAreaId: item.id,
        documentNo: clean(data.documentNo), subject: clean(data.subject), priority: clean(data.priority),
        receiveNo: clean(data.receiveNo), documentDate: clean(data.documentDate), sender: clean(data.sender), summary: clean(data.summary),
        attachmentText: data.attachments.map((x,i)=>`${i+1}. ${clean(x.text) || `file-${i+1}`}`).join("\n"),
        attachmentUrl: data.attachments.map((x,i)=>`${i+1}. ${abs(detailUrl,x.url)}`).join("\n"), fileCount: data.attachments.length
      };
      const response = await fetch(process.env.WORK_ATTENDANCE_IMPORT_URL, { method: "POST", headers: { "content-type":"application/json", "x-import-secret": process.env.WORK_ATTENDANCE_IMPORT_SECRET }, body: JSON.stringify(payload) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body.ok) throw new Error(body.message || `Import HTTP ${response.status}`);
      if (body.message === "saved") result.added++; else if (body.message === "updated") result.updated++; else result.duplicate++;
    } catch (error) { result.failed++; result.errors.push({ id: item.id, message: String(error.message || error) }); }
  }
  result.status = result.failed ? "partial" : "success";
  await callback(result.status);
  console.log(JSON.stringify(result, null, 2));
  if (result.failed && result.failed === result.scanned) process.exitCode = 1;
} catch (error) {
  result.status = "failed"; result.failed++; result.errors.push({ message: String(error.message || error) });
  await callback("failed"); throw error;
} finally { await browser.close(); }
