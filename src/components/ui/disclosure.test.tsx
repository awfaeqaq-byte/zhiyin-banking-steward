import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { Disclosure } from "./disclosure";

it("展开收起保持同一个面板，关闭时立即移出辅助技术与交互", () => {
  const view = render(
    <Disclosure open={false} id="details">
      <button>详情操作</button>
    </Disclosure>,
  );
  const panel = document.getElementById("details")!;
  expect(panel).toHaveAttribute("aria-hidden", "true");
  expect(panel).toHaveAttribute("inert");
  expect(
    screen.queryByRole("button", { name: "详情操作" }),
  ).not.toBeInTheDocument();
  view.rerender(
    <Disclosure open id="details">
      <button>详情操作</button>
    </Disclosure>,
  );
  expect(document.getElementById("details")).toBe(panel);
  expect(panel).not.toHaveAttribute("inert");
  expect(screen.getByRole("button", { name: "详情操作" })).toBeInTheDocument();
  view.rerender(
    <Disclosure open={false} id="details">
      <button>详情操作</button>
    </Disclosure>,
  );
  view.rerender(
    <Disclosure open id="details">
      <button>详情操作</button>
    </Disclosure>,
  );
  expect(panel).toHaveAttribute("data-open", "true");
  expect(screen.getByRole("button", { name: "详情操作" })).toBeInTheDocument();
});
