// Deterministic visual fixtures, isolated browser and backend scope; no model calls.
import puppeteer from "../mobilegym/node_modules/puppeteer/lib/esm/puppeteer/puppeteer.js";
const b = await puppeteer.launch({
    headless: true,
    executablePath:
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  }),
  p = await b.newPage();
const pause = () => new Promise((r) => setTimeout(r, 600));
try {
  await p.setViewport({
    width: 390,
    height: 844,
    isMobile: true,
    hasTouch: true,
  });
  await p.goto("http://localhost:3000/", { waitUntil: "networkidle0" });
  await p.waitForFunction(() => !!window.__OS__);
  await p.evaluate(() => window.__OS__.openApp("zhiyin"));
  await p.waitForFunction(() =>
    [...document.querySelectorAll("iframe")].some((f) =>
      f.contentDocument?.querySelector(".app-shell"),
    ),
  );
  let f = p.frames().find((f) => f.url().includes("/zhiyin/index"));
  await f.evaluate(async () => {
    const scope = crypto.randomUUID(),
      id = crypto.randomUUID();
    localStorage.setItem("zhiyin-expense-scope", scope);
    localStorage.setItem("zhiyin-expense-active", id);
    localStorage.setItem("zhiyin-mode", '"native"');
    const group = {
      id: "group-weekend",
      name: "周末饭搭子（演示群）",
      revision: 1,
      members: [
        { id: "self", name: "叶先生", self: true },
        { id: "group-li", name: "李娜", gender: "female" },
        { id: "group-wang", name: "小王", gender: "male" },
      ],
    };
    let revision = 0;
    async function save(op) {
      const r = await fetch("/api/zhiyin/expenses", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Zhiyin-Expenses": "1",
          "X-Zhiyin-Expense-Scope": scope,
        },
        body: JSON.stringify({
          ...op,
          requestId: crypto.randomUUID(),
          revision,
          bookId: id,
        }),
      });
      const s = await r.json();
      if (!r.ok) throw new Error(s.error);
      revision = s.revision;
    }
    await save({
      type: "create",
      title: "今晚聚餐",
      group,
      participants: group.members.map((m) => m.id),
      defaultPayerId: "self",
    });
    for (const [title, amount, fixed, ids] of [
      ["卤味", 4200, [], ["self", "group-li", "group-wang"]],
      ["蚂蚁上树", 2800, [], ["self", "group-li", "group-wang"]],
      [
        "饮料",
        1000,
        [{ memberId: "group-li", amount: 300 }],
        ["self", "group-wang"],
      ],
      ["饮料", 1800, [], ["self", "group-li", "group-wang"]],
      ["烧烤", 23600, [], ["self", "group-li"]],
    ])
      await save({
        type: "add",
        entryId: crypto.randomUUID(),
        entry: {
          title,
          amount,
          payerId: "self",
          fixed,
          shares: ids.map((memberId) => ({ memberId, weight: 1 })),
        },
      });
  });
  await f.goto(f.url(), { waitUntil: "networkidle0" });
  await f.waitForSelector(".expense-heading");
  await pause();
  await p.screenshot({ path: ".impeccable/review/expenses-quiet-mobile.png" });
  await f.evaluate(() => {
    document.querySelector(".expense-heading").click();
  });
  await f.waitForSelector(".expense-body");
  await f.evaluate(() =>
    [...document.querySelectorAll("button")]
      .find((e) => e.textContent === "核对并结算")
      .click(),
  );
  await f.waitForSelector(".expense-review");
  await f.evaluate(() =>
    document
      .querySelector(".expense-review")
      .scrollIntoView({ block: "center" }),
  );
  await pause();
  await p.screenshot({ path: ".impeccable/review/expenses-mobile.png" });
  await p.setViewport({ width: 1440, height: 960 });
  await p.waitForFunction(() => !!window.__OS__);
  await p.evaluate(() => window.__OS__.openApp("zhiyin"));
  await p.waitForFunction(() =>
    [...document.querySelectorAll("iframe")].some((f) =>
      f.contentDocument?.querySelector(".expense-heading"),
    ),
  );
  f = p.frames().find((f) => f.url().includes("/zhiyin/index"));
  await f.waitForSelector(".expense-heading");
  if (!(await f.$(".expense-body")))
    await f.evaluate(() => document.querySelector(".expense-heading").click());
  await f.waitForSelector(".expense-body");
  if (!(await f.$(".expense-review")))
    await f.evaluate(() =>
      [...document.querySelectorAll("button")]
        .find((e) => e.textContent === "核对并结算")
        .click(),
    );
  await f.waitForSelector(".expense-review");
  await f.evaluate(() =>
    document
      .querySelector(".expense-review")
      .scrollIntoView({ block: "center" }),
  );
  await p.waitForNetworkIdle();
  await pause();
  await p.screenshot({ path: ".impeccable/review/expenses-desktop.png" });
  console.log("Captured quiet home and settlement review at mobile / desktop.");
} finally {
  await b.close();
}
