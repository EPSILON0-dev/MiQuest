// @vitest-environment jsdom
import {
  act,
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
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
it("allows deleting the key when model discovery fails", async () => {
  const fetch = vi.fn((...args: [string, RequestInit?]) =>
    args[0].endsWith("verification-models")
      ? Promise.reject(new Error("offline"))
      : response(settings),
  );
  vi.stubGlobal("fetch", fetch);
  render(<VerificationSettings />);
  expect((await screen.findByRole("alert")).textContent).toContain(
    "Could not load reviewer models",
  );
  fireEvent.click(await screen.findByRole("button", { name: "Delete key" }));
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(3));
  expect(JSON.parse(fetch.mock.calls[2][1]!.body as string)).toEqual({
    key: "",
    model: "mock/reviewer",
    effort: "none",
  });
});
it("reports a disconnected review and recovers on retry", async () => {
  const run = {
    id: "run",
    status: "reviewing",
    createdAt: new Date().toISOString(),
    attachments: [],
  };
  let online = false;
  const fetch = vi.fn((url: string) => {
    if (url.endsWith("verification-settings")) return response(settings);
    if (url.endsWith("/review-runs")) return response([run]);
    return online ? response(run) : Promise.reject(new Error("offline"));
  });
  vi.stubGlobal("fetch", fetch);
  vi.stubGlobal(
    "EventSource",
    class {
      onmessage = null;
      close() {}
    },
  );
  render(
    <QuestVerification
      questId="quest"
      disabled={false}
      staleCompletion={false}
      onActiveChange={() => {}}
      onComplete={() => {}}
    />,
  );
  await screen.findByText(/Review in progress/);
  expect(
    await screen.findByText(
      /Could not refresh review status/,
      {},
      { timeout: 4000 },
    ),
  ).toBeTruthy();
  online = true;
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  });
  expect(screen.queryByText(/Could not refresh review status/)).toBeNull();
});
it("clears the active review state when the quest panel closes", async () => {
  const run = {
    id: "run",
    status: "reviewing",
    createdAt: new Date().toISOString(),
    attachments: [],
  };
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string) =>
      url.endsWith("verification-settings")
        ? response(settings)
        : response([run]),
    ),
  );
  vi.stubGlobal(
    "EventSource",
    class {
      onmessage = null;
      close() {}
    },
  );
  const onActiveChange = vi.fn();
  const view = render(
    <QuestVerification
      questId="quest"
      disabled={false}
      staleCompletion={false}
      onActiveChange={onActiveChange}
      onComplete={() => {}}
    />,
  );
  await screen.findByText(/Review in progress/);
  expect(onActiveChange).toHaveBeenLastCalledWith(true);
  view.unmount();
  expect(onActiveChange).toHaveBeenLastCalledWith(false);
});
it("shows a provider generation ID when available", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string) =>
      url.endsWith("verification-settings")
        ? response(settings)
        : response([
            {
              id: "run",
              status: "completed",
              createdAt: "2026-01-01",
              attachments: [],
              usage: {
                generationId: "gen-123",
                upstreamInputCost: 0.01,
                upstreamOutputCost: 0.02,
              },
            },
          ]),
    ),
  );
  render(
    <QuestVerification
      questId="quest"
      disabled={false}
      staleCompletion={false}
      onActiveChange={() => {}}
      onComplete={() => {}}
    />,
  );
  fireEvent.click(await screen.findByText("Review attempts"));
  expect(screen.getByText(/Generation ID: gen-123/)).toBeTruthy();
  expect(
    screen.getByText(/Upstream provider input cost \(USD\): 0.01/),
  ).toBeTruthy();
  expect(
    screen.getByText(/Upstream provider output cost \(USD\): 0.02/),
  ).toBeTruthy();
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
  expect(
    screen.getByText(/to OpenRouter and the selected model provider/),
  ).toBeTruthy();
  expect(screen.getByText(/Attachments are optional; a message alone is enough/)).toBeTruthy();
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
