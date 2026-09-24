import { act, fireEvent, render, screen, cleanup } from "@testing-library/react";
import { afterEach, beforeEach, expect, it } from "vitest";
import App from "./App";
import { dispatchPhoneBack } from "./lib/phone-bridge";

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
