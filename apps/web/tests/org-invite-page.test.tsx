import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import OrgInvitePage from "../src/app/dashboard/org-invite/[inviteId]/page";

const useAuthMock = vi.fn();
vi.mock("../src/lib/auth-context", () => ({
  useAuth: () => useAuthMock(),
}));

const apiFetchMock = vi.fn();
vi.mock("../src/lib/api", () => ({
  apiFetch: (...args: unknown[]) => apiFetchMock(...args),
}));

const showToastMock = vi.fn();
vi.mock("../src/lib/toast", () => ({
  showToast: (...args: unknown[]) => showToastMock(...args),
}));

const replaceMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: replaceMock, push: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
}));

describe("OrgInvitePage", () => {
  beforeEach(() => {
    useAuthMock.mockReturnValue({
      user: { id: "u1", email: "biz@example.com", role: "business" },
      businessUser: { id: "u1", email: "biz@example.com", role: "business" },
      customerUser: null,
      loading: false,
    });
    apiFetchMock.mockReset();
    showToastMock.mockReset();
    replaceMock.mockReset();
  });

  it("renders static preview and accepts invite", async () => {
    apiFetchMock.mockResolvedValue({ accepted: true });
    render(<OrgInvitePage params={{ inviteId: "invite_1" }} />);

    expect(screen.getByText("Sample Org Overview")).toBeTruthy();
    fireEvent.click(screen.getByText("Accept Invite"));

    await waitFor(() => expect(apiFetchMock).toHaveBeenCalled());
    expect(apiFetchMock).toHaveBeenCalledWith(
      "/api/business/org/invites/invite_1/accept",
      expect.objectContaining({ method: "POST" })
    );
    expect(showToastMock).toHaveBeenCalled();
    expect(replaceMock).toHaveBeenCalledWith("/dashboard");
  });

  it("declines invite", async () => {
    apiFetchMock.mockResolvedValue({ declined: true });
    render(<OrgInvitePage params={{ inviteId: "invite_2" }} />);

    fireEvent.click(screen.getByText("Decline Invite"));
    await waitFor(() => expect(apiFetchMock).toHaveBeenCalled());
    expect(apiFetchMock).toHaveBeenCalledWith(
      "/api/business/org/invites/invite_2/decline",
      expect.objectContaining({ method: "POST" })
    );
    expect(showToastMock).toHaveBeenCalled();
  });
});

