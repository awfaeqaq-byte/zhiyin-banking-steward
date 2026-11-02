import { act, fireEvent, render, screen, cleanup, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it } from "vitest";
import App from "../../src/App";
import { dispatchPhoneBack } from "../../src/lib/phone-bridge";

beforeEach(() => localStorage.clear());
afterEach(cleanup);

it("system back returns from settings to profile, then home, then releases to the phone", () => {
  render(<App />);
  fireEvent.click(screen.getAllByRole("button", { name: "我的" })[0]);
  fireEvent.click(screen.getByRole("button", { name: /设置/ }));
  expect(screen.getByRole("heading", { name: "设置" })).toBeInTheDocument();
  act(() => { expect(dispatchPhoneBack()).toBe(true); });
  expect(screen.queryByRole("heading", { name: "设置" })).not.toBeInTheDocument();
  act(() => { expect(dispatchPhoneBack()).toBe(true); });
  act(() => { expect(dispatchPhoneBack()).toBe(false); });
});

it("system back dismisses a dialog before leaving the current page", () => {
  render(<App />);
  fireEvent.click(screen.getByRole("button", { name: "选择私人管家" }));
  expect(screen.getByRole("dialog")).toBeInTheDocument();
  act(() => { expect(dispatchPhoneBack()).toBe(true); });
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  act(() => { expect(dispatchPhoneBack()).toBe(false); });
});


it("日程交接回同一首页输入框，只填草稿不自动发送", async () => {
  localStorage.setItem("zhiyin-mode", JSON.stringify("native"));
  render(<App />);
  fireEvent.click(screen.getByRole("button", {name: "任务日历"}));
  expect(screen.getByRole("heading", {name: "日程"})).toBeVisible();
  fireEvent.click(screen.getByRole("button", {name: /和宁宁安排日程/}));
  await waitFor(() => expect((screen.getByRole("textbox", {name: "和宁宁说点什么"}) as HTMLInputElement).value).toMatch(/^我想安排\d{4}-\d{2}-\d{2}的日程：$/));
  expect(screen.queryByRole("heading", {name: "日程"})).not.toBeInTheDocument();
  fireEvent.change(screen.getByRole("textbox", {name: "和宁宁说点什么"}), {target: {value: ""}});
  fireEvent.click(screen.getByRole("button", {name: "任务日历"}));
  fireEvent.click(screen.getByRole("button", {name: /和宁宁安排日程/}));
  await waitFor(() => expect((screen.getByRole("textbox", {name: "和宁宁说点什么"}) as HTMLInputElement).value).toMatch(/^我想安排\d{4}-\d{2}-\d{2}的日程：$/));
});
