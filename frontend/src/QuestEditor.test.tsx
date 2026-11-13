// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import QuestEditor from "./QuestEditor";
import { createFixture, type Model, type Quest } from "./model";

afterEach(cleanup);
function setup(quest: Quest, model: Model) {
  const onSave = vi.fn<(model: Model) => void>();
  render(
    <QuestEditor
      model={model}
      quest={quest}
      onSave={onSave}
      onCancel={() => {}}
    />,
  );
  return onSave;
}
const save = () =>
  fireEvent.click(screen.getByRole("button", { name: "Save quest" }));

describe("QuestEditor", () => {
  it("creates a quest with its initial tree and edited fields", () => {
    const model = createFixture();
    const onSave = setup({ ...model.quests[0], id: "new", title: "" }, model);
    fireEvent.change(screen.getByLabelText("Title"), {
      target: { value: "New quest" },
    });
    fireEvent.change(screen.getByLabelText("Description"), {
      target: { value: "A new description" },
    });
    save();
    const result = onSave.mock.calls[0][0];
    expect(result.quests.find((item) => item.id === "new")).toMatchObject({
      title: "New quest",
      description: "A new description",
      homePageId: "foundations",
    });
    expect(result.appearances).toContainEqual({
      questId: "new",
      pageId: "foundations",
      x: 0,
      y: 0,
    });
    expect(result.verifications).toEqual(model.verifications);
  });

  it("rejects an empty title", () => {
    const model = createFixture();
    const onSave = setup(model.quests[0], model);
    fireEvent.change(screen.getByLabelText("Title"), {
      target: { value: "  " },
    });
    save();
    expect(screen.getByRole("alert").textContent).toContain("title");
    expect(onSave).not.toHaveBeenCalled();
  });

  it("requires at least one tree", () => {
    const model = createFixture();
    const onSave = setup(model.quests[0], model);
    fireEvent.click(screen.getByRole("checkbox", { name: "Foundations" }));
    save();
    expect(screen.getByRole("alert").textContent).toContain(
      "at least one tree",
    );
    expect(onSave).not.toHaveBeenCalled();
  });

  it("updates shared membership and home without duplicating the quest or losing history", () => {
    const model = createFixture();
    const quest = model.quests.find((item) => item.id === "milestone")!;
    const onSave = setup(quest, model);
    fireEvent.change(screen.getByLabelText("Title"), {
      target: { value: "Shared milestone" },
    });
    fireEvent.change(screen.getByLabelText("Home tree"), {
      target: { value: "launch" },
    });
    const launchPosition = screen.getByRole("group", {
      name: "Launch path position",
    });
    fireEvent.change(within(launchPosition).getByLabelText("X"), {
      target: { value: "123" },
    });
    fireEvent.click(screen.getByRole("checkbox", { name: "Foundations" }));
    save();
    const result = onSave.mock.calls[0][0];
    expect(result.quests.filter((item) => item.id === quest.id)).toEqual([
      { ...quest, title: "Shared milestone", homePageId: "launch" },
    ]);
    expect(
      result.appearances.filter((item) => item.questId === quest.id),
    ).toEqual([expect.objectContaining({ pageId: "launch", x: 123 })]);
    expect(result.verifications).toEqual(model.verifications);
    expect(
      result.quests.find((item) => item.id === quest.id)?.completionState,
    ).toBe(quest.completionState);
  });

  it("rejects a dependency that creates a cycle", () => {
    const model = createFixture();
    const onSave = setup(
      model.quests.find((item) => item.id === "vision")!,
      model,
    );
    fireEvent.click(
      screen.getByRole("checkbox", { name: "Map the landscape" }),
    );
    save();
    expect(screen.getByRole("alert").textContent).toContain("cycle");
    expect(onSave).not.toHaveBeenCalled();
  });
});
