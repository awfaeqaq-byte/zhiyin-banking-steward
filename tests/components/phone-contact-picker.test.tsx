import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PhoneContactPicker } from "../../src/components/phone-contact-picker";
import { requestPhoneContacts } from "../../src/lib/phone-bridge";

vi.mock("../../src/lib/phone-bridge", async () => {
  const actual = await vi.importActual<typeof import("../../src/lib/phone-bridge")>("../../src/lib/phone-bridge");
  return { ...actual, requestPhoneContacts: vi.fn() };
});

describe("phone contact picker", () => {
  beforeEach(() => vi.mocked(requestPhoneContacts).mockReset());

  it("marks bank beneficiaries by phone suffix and selects the matched recipient", async () => {
    vi.mocked(requestPhoneContacts).mockResolvedValue({
      status: "granted",
      contacts: [
        { id: "c_mother", displayName: "妈妈", phoneLast4: "6621", avatarColor: "#D58B68" },
        { id: "c_zhang", displayName: "张三", phoneLast4: "6621" },
      ],
    });
    const onSelect = vi.fn();
    render(<PhoneContactPicker open onOpenChange={vi.fn()} onSelect={onSelect} />);

    const mother = await screen.findByRole("button", { name: /妈妈.*尾号 6621.*已匹配/ });
    expect(screen.getByRole("button", { name: /张三.*尾号 6621.*未匹配/ })).toBeDisabled();
    await userEvent.setup().click(mother);
    expect(onSelect).toHaveBeenCalledWith("妈妈");
  });

  it("explains that access was denied without showing stale contacts", async () => {
    vi.mocked(requestPhoneContacts).mockResolvedValue({ status: "denied", contacts: [] });
    render(<PhoneContactPicker open onOpenChange={vi.fn()} onSelect={vi.fn()} />);
    expect(await screen.findByText("没有获得通讯录权限")).toBeInTheDocument();
    expect(screen.queryByText("妈妈")).not.toBeInTheDocument();
  });
});
