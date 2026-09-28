// Fresh browser storage; never touches the user's wallet or conversations.
import puppeteer from "../mobilegym/node_modules/puppeteer/lib/esm/puppeteer/puppeteer.js";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import assert from "node:assert/strict";
const screenshots = resolve(".impeccable/review");
await mkdir(screenshots, { recursive: true });
const browser = await puppeteer.launch({
  headless: true,
  ...(process.platform === "darwin"
    ? {
        executablePath:
          "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      }
    : {}),
});
const page = await browser.newPage();
page.setDefaultTimeout(20000);
const clickText = async (frame, selector, text) => {
  await frame.waitForFunction(
    (s, t) =>
      Array.from(document.querySelectorAll(s)).some((e) =>
        e.textContent.includes(t),
      ),
    {},
    selector,
    text,
  );
  await frame.evaluate(
    (s, t) =>
      Array.from(document.querySelectorAll(s))
        .find((e) => e.textContent.includes(t))
        .click(),
    selector,
    text,
  );
};
try {
  await page.setViewport({
    width: 390,
    height: 844,
    isMobile: true,
    hasTouch: true,
  });
  await page.goto("http://localhost:3000/", { waitUntil: "networkidle0" });
  await page.waitForFunction(() => !!window.__OS__);
  await page.evaluate(() => window.__OS__.openApp("zhiyin"));
  await page.waitForFunction(() => !!document.querySelector("iframe"));
  let frame;
  for (let n = 0; n < 30; n++) {
    frame = page.frames().find((f) => f.url().includes("/zhiyin/index"));
    if (frame) break;
    await new Promise((r) => setTimeout(r, 100));
  }
  if (!frame) throw new Error("Missing Zhiyin frame");
  await frame.waitForSelector("button");
  await clickText(frame, "button", "我的");
  await clickText(frame, "button", "微信群智能AA");
  await clickText(frame, "button", "从微信选择群");
  await page.waitForSelector('[data-action="wechat.groupAA.authorize.submit"]');
  await page.click('[data-action="wechat.groupAA.authorize.submit"]');
  await frame.waitForSelector(".aa-members");
  assert.equal(await frame.$$eval(".aa-avatar img", (imgs) => imgs.length), 4);
  await page.screenshot({
    path: resolve(screenshots, "group-profiles-mobile.png"),
    fullPage: true,
  });
  await clickText(frame, ".aa-members-heading button", "全选");
  await clickText(frame, "button", "添加费用");
  await frame.type('[aria-label="费用1金额"]', "600");
  await frame.waitForSelector(".aa-result");
  assert.ok(
    await frame.evaluate(() =>
      document.querySelector(".aa-result").textContent.includes("450"),
    ),
  );
  await page.screenshot({
    path: resolve(screenshots, "aa-mobile.png"),
    fullPage: true,
  });
  await frame.evaluate(() =>
    document.querySelector(".aa-result").scrollIntoView({ block: "start" }),
  );
  await page.screenshot({
    path: resolve(screenshots, "aa-mobile-result.png"),
    fullPage: true,
  });
  await clickText(frame, "button", "核对群收款");
  await clickText(frame, "button", "去微信确认发起");
  await page.waitForSelector('[data-action="wechat.groupAA.publish.submit"]');
  await page.screenshot({
    path: resolve(screenshots, "aa-wechat-confirm.png"),
    fullPage: true,
  });
  await page.click('[data-action="wechat.groupAA.publish.submit"]');
  await frame.waitForFunction(() =>
    document.querySelector(".aa-records")?.textContent.includes("0/3"),
  );
  await page.evaluate(() =>
    window.__OS__.openApp("wechat", "/group-aa/group-weekend"),
  );
  await page.waitForSelector(".wx-group-collection");
  await page.screenshot({
    path: resolve(screenshots, "group-chat-mobile.png"),
    fullPage: true,
  });
  await page.click('[data-trigger="wechat.groupAA.info.open"]');
  await page.waitForSelector(".wx-group-members-grid");
  await page.screenshot({
    path: resolve(screenshots, "group-info-mobile.png"),
    fullPage: true,
  });
  await page.click('[data-action="wechat.groupAA.mute.toggle"]');
  assert.equal(
    await page.$eval('[data-action="wechat.groupAA.mute.toggle"]', (e) =>
      e.getAttribute("aria-checked"),
    ),
    "true",
  );
  await page.click('.wx-group-info [data-trigger="system.back"]');
  await page.waitForSelector(".wx-group-composer input");
  await page.type(".wx-group-composer input", "收款发好了，大家看一下");
  await page.click('[data-action="wechat.groupAA.message.submit"]');
  await page.waitForFunction(() =>
    document
      .querySelector(".wx-group-chat main")
      ?.textContent.includes("收款发好了，大家看一下"),
  );
  await page.evaluate(() => document.activeElement?.blur());
  await page.waitForNetworkIdle();
  assert.ok(
    await page.$eval('[data-trigger="wechat.groupAA.collection.open"]', (e) => {
      const r = e.getBoundingClientRect();
      return e.contains(
        document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2),
      );
    }),
    "Collection card must be reachable after closing the keyboard",
  );
  await page.click('[data-trigger="wechat.groupAA.collection.open"]');
  await page.waitForSelector(".wx-aa-page details");
  await page.click(".wx-aa-page details summary");
  await page.waitForFunction(
    () => !!JSON.parse(localStorage.getItem("wechat") ?? "{}").state?.wallet,
  );
  const balanceBefore = await page.evaluate(
    () => JSON.parse(localStorage.getItem("wechat")).state.wallet.balanceCents,
  );
  await page.click('[data-action="wechat.groupAA.payment.submit"]');
  await page.waitForFunction(() =>
    document.querySelector(".wx-aa-page")?.textContent.includes("已付"),
  );
  await page.waitForFunction(() =>
    JSON.parse(
      localStorage.getItem("wechat") ?? "{}",
    ).state?.payLedger?.transactions?.some((t) =>
      t.linkedId?.startsWith("group-aa:"),
    ),
  );
  const wallet = await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem("wechat")).state;
    return {
      balance: state.wallet.balanceCents,
      entries: state.payLedger.transactions.filter((t) =>
        t.linkedId?.startsWith("group-aa:"),
      ),
    };
  });
  assert.equal(wallet.entries.length, 1);
  assert.equal(wallet.entries[0].amountCents, 15000);
  assert.equal(wallet.balance - balanceBefore, 15000);
  assert.deepEqual(
    await page.$$eval(".wx-aa-money-summary b", (els) =>
      els.map((e) => e.textContent),
    ),
    ["¥450.00", "¥150.00", "¥300.00"],
  );
  await page.screenshot({
    path: resolve(screenshots, "aa-wechat-progress.png"),
    fullPage: true,
  });
  await page.evaluate(() =>
    window.__OS__.openApp("wechat", "/wechat-pay/ledger"),
  );
  await page.waitForFunction(() =>
    document.body.innerText.includes("李娜 · 群收款"),
  );
  await page.screenshot({
    path: resolve(screenshots, "aa-wechat-receipt.png"),
    fullPage: true,
  });
  await page.evaluate(() => window.__OS__.openApp("zhiyin"));
  await clickText(frame, "button", "刷新进度");
  await frame.waitForFunction(() =>
    document.querySelector(".aa-records")?.textContent.includes("1/3"),
  );
  await page.setViewport({ width: 1280, height: 900 });
  await page.waitForNetworkIdle();
  await page.evaluate(() => window.__OS__.openApp("zhiyin"));
  await page.waitForFunction(() => !!document.querySelector("iframe"));
  await page.waitForFunction(() =>
    Array.from(document.querySelectorAll("iframe")).some((f) =>
      f.contentDocument?.querySelector("button"),
    ),
  );
  frame = page.frames().find((f) => f.url().includes("/zhiyin/index"));
  if (!(await frame.$(".aa-records"))) {
    await clickText(frame, "button", "我的");
    await clickText(frame, "button", "微信群智能AA");
    await clickText(frame, "button", "从微信选择群");
    await page.waitForSelector(
      '[data-action="wechat.groupAA.authorize.submit"]',
    );
    await page.click('[data-action="wechat.groupAA.authorize.submit"]');
    await frame.waitForSelector(".aa-records");
  }
  await frame.evaluate(() =>
    document.querySelector(".group-aa").scrollIntoView({ block: "start" }),
  );
  await page.screenshot({
    path: resolve(screenshots, "aa-desktop.png"),
    fullPage: true,
  });
  await page.reload({ waitUntil: "networkidle0" });
  const persisted = await page.evaluate(
    () => JSON.parse(localStorage.getItem("wechat")).state,
  );
  assert.equal(
    persisted.groupAA.collections[0].members.filter((m) => !m.self && m.paid)
      .length,
    1,
  );
  assert.equal(persisted.wallet.balanceCents, wallet.balance);
  await page.evaluate(() =>
    window.__OS__.openApp("wechat", "/group-aa/group-weekend"),
  );
  await page.waitForSelector(".wx-group-collection");
  await page.screenshot({
    path: resolve(screenshots, "group-chat-desktop.png"),
    fullPage: true,
  });
  await page.click('[data-trigger="wechat.groupAA.info.open"]');
  await page.waitForSelector(".wx-group-members-grid");
  await page.screenshot({
    path: resolve(screenshots, "group-info-desktop.png"),
    fullPage: true,
  });
  await page.click('.wx-group-info [data-trigger="system.back"]');
  await page.waitForSelector(".wx-group-collection");
  await page.click('[data-trigger="wechat.groupAA.collection.open"]');
  await page.waitForSelector(".wx-aa-page details summary");
  await page.click(".wx-aa-page details summary");
  await page.click('[data-action="wechat.groupAA.payment.submit"]');
  await page.waitForFunction(
    () =>
      document.querySelectorAll('[data-action="wechat.groupAA.payment.submit"]')
        .length === 1,
  );
  await page.click('[data-action="wechat.groupAA.payment.submit"]');
  await page.waitForFunction(() =>
    document.querySelector(".wx-aa-status")?.textContent.includes("已收齐"),
  );
  assert.deepEqual(
    await page.$$eval(".wx-aa-money-summary b", (els) =>
      els.map((e) => e.textContent),
    ),
    ["¥450.00", "¥450.00", "¥0.00"],
  );
  console.log(
    JSON.stringify({
      result: "PASS",
      receipts: wallet.entries.length,
      credited: 15000,
      screenshots,
    }),
  );
} catch (error) {
  console.error(
    "PAGE",
    await page.evaluate(() => document.body.innerText.slice(-2200)),
  );
  console.error(
    "FRAMES",
    page.frames().map((f) => f.url()),
  );
  throw error;
} finally {
  await browser.close();
}
