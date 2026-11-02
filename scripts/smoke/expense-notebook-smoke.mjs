// Isolated browser wallet and server scope. Does not alter the user's records.
import puppeteer from "../../mobilegym/node_modules/puppeteer/lib/esm/puppeteer/puppeteer.js";
import { mkdir } from "node:fs/promises";
import assert from "node:assert/strict";
const browser = await puppeteer.launch({
  headless: true,
  executablePath:
    process.platform === "darwin"
      ? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
      : undefined,
});
const page = await browser.newPage();
page.on("response", async (response) => {
  if (response.url().includes("/api/zhiyin/steward-reply")) {
    try {
      const d = await response.json();
      console.log("Model:", d.output_text || d.error);
    } catch { /* Ignore non-JSON model responses in this smoke script. */ }
  }
});
page.setDefaultTimeout(20000);
const click = async (f, text) => {
  await f.waitForFunction(
    (t) =>
      [...document.querySelectorAll("button")].some((b) =>
        b.textContent.includes(t),
      ),
    {},
    text,
  );
  await f.evaluate(
    (t) =>
      [...document.querySelectorAll("button")]
        .find((b) => b.textContent.includes(t))
        .click(),
    text,
  );
};
let frame;
const snapshot = () =>
  frame.evaluate(async () => {
    const r = await fetch("/api/zhiyin/expenses", {
      headers: {
        "X-Zhiyin-Expense-Scope": localStorage.getItem("zhiyin-expense-scope"),
      },
    });
    return r.json();
  });
async function send(text) {
  await frame.waitForSelector("#steward-chat-input");
  await frame.evaluate((t) => {
    const e = document.querySelector("#steward-chat-input");
    const setter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    ).set;
    setter.call(e, t);
    e.dispatchEvent(new Event("input", { bubbles: true }));
  }, text);
  await frame.waitForSelector('button[aria-label="发送给宁宁"]:not(:disabled)');
  await frame.evaluate(() =>
    document.querySelector(".steward-chat-composer").requestSubmit(),
  );
  await frame.waitForFunction(
    () =>
      document.querySelector("#steward-chat-input").value === "" &&
      !document.querySelector(".steward-chat-home.is-working"),
    { timeout: 60000 },
  );
  const errors = await frame.$$eval("[role=alert]", (els) =>
    els.map((e) => e.textContent),
  );
  assert.deepEqual(errors, [], `Failed ${text}`);
  console.log("完成对话:", text);
}
try {
  await mkdir(".impeccable/review", { recursive: true });
  await page.setViewport({
    width: 390,
    height: 844,
    isMobile: true,
    hasTouch: true,
  });
  await page.goto("http://localhost:3000/", { waitUntil: "networkidle0" });
  await page.evaluate(() => localStorage.setItem("zhiyin-mode", '"native"'));
  await page.waitForFunction(() => !!window.__OS__);
  await page.evaluate(() => window.__OS__.openApp("zhiyin"));
  await page.waitForFunction(() => !!document.querySelector("iframe"));
  await new Promise((r) => setTimeout(r, 800));
  frame = page.frames().find((f) => f.url().includes("/zhiyin/index"));
  await frame.evaluate(() => localStorage.setItem("zhiyin-mode", '"native"'));
  await frame.goto(frame.url());
  await frame.waitForSelector(".expense-notebook");
  await send("今晚和李娜、小王吃饭，我先付，最后一起算");
  await click(frame, "从微信选择群");
  await page.waitForSelector('[data-action="wechat.groupAA.authorize.submit"]');
  await page.click('[data-action="wechat.groupAA.authorize.submit"]');
  await frame.waitForSelector(".expense-people");
  await frame.evaluate(() => {
    for (const l of document.querySelectorAll(".expense-people label"))
      if (/李娜|小王/.test(l.textContent)) l.querySelector("input").click();
  });
  await click(frame, "开始记录");
  await frame.waitForSelector(".expense-heading");
  for (const prompt of [
    "卤味42",
    "蚂蚁上树28",
    "饮料10，李娜可乐3块，剩下我和小王平分",
    "又买了饮料16",
    "刚才16说错了，是18",
    "烧烤236，小王没吃",
  ])
    await send(prompt);
  const s = await snapshot();
  assert.deepEqual(
    s.books[0].entries.map((e) => e.amount),
    [4200, 2800, 1000, 1800, 23600],
  );
  assert.equal(s.books[0].entries[2].fixed[0].amount, 300);
  assert.equal(s.books[0].entries.at(-1).shares.length, 2);
  await send("帮我群收款一下今天的消费");
  await frame.waitForSelector(".expense-review .expense-primary");
  await frame.evaluate(() =>
    document
      .querySelector(".expense-review")
      .scrollIntoView({ block: "center" }),
  );
  await page.screenshot({
    path: ".impeccable/review/expenses-mobile.png",
    fullPage: true,
  });
  await click(frame, "去微信确认收款");
  await page.waitForSelector('[data-action="wechat.groupAA.publish.submit"]');
  await page.click('[data-action="wechat.groupAA.publish.submit"]');
  await frame.waitForFunction(() =>
    document
      .querySelector(".expense-batch")
      ?.textContent.includes("已发起群收款"),
  );
  const published = await snapshot();
  assert.equal(published.books[0].batches.length, 1);
  assert.equal(published.books[0].batches[0].status, "published");
  await send("又买了饮料16");
  const final = await snapshot();
  assert.equal(final.books[0].entries.filter((e) => !e.batchId).length, 1);
  await page.reload({ waitUntil: "networkidle0" });
  await page.waitForFunction(() => !!window.__OS__);
  await page.evaluate(() => window.__OS__.openApp("zhiyin"));
  await new Promise((r) => setTimeout(r, 800));
  frame = page.frames().find((f) => f.url().includes("/zhiyin/index"));
  await frame.waitForSelector(".expense-heading");
  assert.ok(
    await frame.$eval(".expense-heading", (e) =>
      e.textContent.includes("1 笔待结算"),
    ),
  );
  await page.setViewport({ width: 1440, height: 960 });
  await page.waitForFunction(() => !!window.__OS__);
  await page.evaluate(() => window.__OS__.openApp("zhiyin"));
  await page.waitForFunction(() =>
    [...document.querySelectorAll("iframe")].some((f) =>
      f.contentDocument?.querySelector(".expense-heading"),
    ),
  );
  frame = page.frames().find((f) => f.url().includes("/zhiyin/index"));
  await frame.waitForSelector(".expense-heading");
  await click(frame, "今晚聚餐");
  await frame.evaluate(() =>
    document
      .querySelector(".expense-notebook")
      .scrollIntoView({ block: "start" }),
  );
  await page.screenshot({
    path: ".impeccable/review/expenses-desktop.png",
    fullPage: true,
  });
  console.log(
    "PASS: 实际模型连续记账、纠正、固定金额、排除成员、微信确认、去重与刷新恢复。",
  );
} catch (e) {
  console.log(
    "Failure UI:",
    await frame?.evaluate(() => document.body.innerText).catch(() => ""),
  );
  throw e;
} finally {
  await browser.close();
}
