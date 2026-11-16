// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { QuestVerification, VerificationSettings } from "./Verification";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
const response = (data: unknown) =>
  Promise.resolve({ ok: true, json: () => Promise.resolve({ data }) });
const settings = {
  configured: true,
  keyMask: "key-****12345678",
  model: "mock/reviewer",
  effort: "none",
};
it("deletes the saved key without exposing it", async () => {
  const fetch = vi.fn((...args: [string, RequestInit?]) =>
    args[0].endsWith("verification-models")
      ? response([{ id: "mock/reviewer", name: "Reviewer", efforts: ["none"] }])
      : response(settings),
  );
  vi.stubGlobal("fetch", fetch);
  render(<VerificationSettings />);
  fireEvent.click(await screen.findByRole("button", { name: "Delete key" }));
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(3));
  expect(JSON.parse(fetch.mock.calls[2][1]!.body as string)).toEqual({
    key: "",
    model: "mock/reviewer",
    effort: "none",
  });
});
it("rejects empty evidence and submits a message as multipart", async () => {
  const fetch = vi.fn((...args: [string, RequestInit?]) =>
    args[0].endsWith("verification-settings")
      ? response(settings)
      : response([]),
  );
  vi.stubGlobal("fetch", fetch);
  render(
    <QuestVerification
      questId="quest"
      disabled={false}
      staleCompletion={false}
      onActiveChange={() => {}}
      onComplete={() => {}}
    />,
  );
  const button = await screen.findByRole("button", {
    name: "Request verification",
  });
  await waitFor(() => expect(button).not.toHaveProperty("disabled", true));
  fireEvent.click(button);
  expect(screen.getByRole("alert").textContent).toContain("Add a message");
  fireEvent.change(screen.getByLabelText("Evidence message"), {
    target: { value: "Done" },
  });
  fireEvent.click(button);
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(3));
  expect((fetch.mock.calls[2][1]!.body as FormData).get("message")).toBe(
    "Done",
  );
});
it("refreshes a stale completed quest only when there is no unsaved draft", async () => {
  const fetch = vi.fn((url: string) =>
    url.endsWith("verification-settings")
      ? response(settings)
      : response([
          {
            id: "run",
            status: "completed",
            completionApplied: true,
            attachments: [],
            unmetCriteria: [],
          },
        ]),
  );
  vi.stubGlobal("fetch", fetch);
  const refresh = vi.fn();
  const props = {
    questId: "quest",
    staleCompletion: true,
    onActiveChange: () => {},
    onComplete: refresh,
  };
  const view = render(<QuestVerification {...props} disabled />);
  await screen.findByText("Review attempts");
  expect(refresh).not.toHaveBeenCalled();
  view.rerender(<QuestVerification {...props} disabled={false} />);
  await waitFor(() => expect(refresh).toHaveBeenCalledOnce());
});
