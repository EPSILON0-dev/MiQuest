// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { getLocale, setLocale, useI18n } from "./i18n";

function Copy() {
  const t = useI18n();
  return <span>{t.workspaceSettings}</span>;
}

afterEach(() => {
  cleanup();
  setLocale("en");
});

describe("i18n", () => {
  it("switches to Polish and persists the selected locale", () => {
    render(<Copy />);

    act(() => setLocale("pl"));

    expect(screen.getByText("Ustawienia przestrzeni")).toBeTruthy();
    expect(getLocale()).toBe("pl");
    expect(localStorage.getItem("miquest-locale")).toBe("pl");
    expect(document.documentElement.lang).toBe("pl");
  });
});
