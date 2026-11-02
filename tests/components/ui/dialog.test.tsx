import { useEffect, useRef, useState } from "react";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { Dialog } from "../../../src/components/ui/dialog";

function Example({ focusNext = false, triggerState = "available", initiallyOpen = false }: { focusNext?: boolean; triggerState?: string; initiallyOpen?: boolean }) {
  const [open, setOpen] = useState(initiallyOpen);
  const [finished, setFinished] = useState(false);
  const next = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (finished && focusNext) next.current?.focus();
  }, [finished, focusNext]);
  return <>
    {triggerState !== "removed" && <button hidden={triggerState === "hidden"} style={triggerState === "css-hidden" ? { display: "none" } : undefined} disabled={triggerState === "disabled"} onClick={() => setOpen(true)}>打开确认</button>}
    <button ref={next}>下一步</button>
    <Dialog open={open} onOpenChange={setOpen} title="核对操作" description="请核对后继续">
      <button onClick={() => { setOpen(false); setFinished(true); }}>取消</button>
    </Dialog>
  </>;
}

it.each(["Escape", "取消"])("通过 %s 关闭后返回打开弹窗的按钮", async method => {
  const user = userEvent.setup();
  render(<Example />);
  const trigger = screen.getByRole("button", { name: "打开确认" });
  await user.click(trigger);
  expect(screen.getByRole("dialog")).toContainElement(document.activeElement as HTMLElement);
  if (method === "Escape") await user.keyboard("{Escape}");
  else await user.click(screen.getByRole("button", { name: "取消" }));
  await waitFor(() => expect(trigger).toHaveFocus());
});

it("保留业务在关闭时显式指定的焦点", async () => {
  const user = userEvent.setup();
  render(<Example focusNext />);
  const next = screen.getByRole("button", { name: "下一步" });
  await user.click(screen.getByRole("button", { name: "打开确认" }));
  await user.click(screen.getByRole("button", { name: "取消" }));
  await act(() => new Promise(resolve => setTimeout(resolve, 20)));
  expect(next).toHaveFocus();
});

it.each(["removed", "disabled", "hidden", "css-hidden"])("入口变为 %s 时不尝试恢复焦点", async state => {
  const user = userEvent.setup();
  const view = render(<Example />);
  const trigger = screen.getByRole("button", { name: "打开确认" });
  await user.click(trigger);
  view.rerender(<Example triggerState={state} />);
  const focus = vi.spyOn(trigger, "focus");
  await user.keyboard("{Escape}");
  await act(() => new Promise(resolve => setTimeout(resolve, 20)));
  expect(focus).not.toHaveBeenCalled();
});

it("程序直接打开弹窗时不把 body 当作恢复入口", async () => {
  const user = userEvent.setup();
  render(<Example initiallyOpen />);
  const focus = vi.spyOn(document.body, "focus");
  await user.click(screen.getByRole("button", { name: "取消" }));
  await act(() => new Promise(resolve => setTimeout(resolve, 20)));
  expect(focus).not.toHaveBeenCalled();
  focus.mockRestore();
});
