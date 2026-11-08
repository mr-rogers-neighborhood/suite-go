import { describe, expect, it, vi } from "vitest";
import { createNote, openNote } from "./note.js";

describe("note", () => {
  it("starts empty and collects captures on their own lines", () => {
    const note = createNote();
    expect(note.text()).toBe("");
    note.append("first");
    note.append("second");
    expect(note.text()).toBe("first\nsecond");
  });

  it("replaces the whole text when the editor says so", () => {
    const note = createNote();
    note.append("old");
    note.setText("new");
    expect(note.text()).toBe("new");
  });

  it("round-trips through a snapshot, which is the point of the module", () => {
    const note = createNote();
    note.append("survives");
    const snapshot = note.snapshot();

    expect(snapshot.length).toBeGreaterThan(0);
    expect(openNote(snapshot).text()).toBe("survives");
  });

  it("keeps editing after a reopen, with a peer id of its own", () => {
    const first = createNote();
    first.append("a");
    const reopened = openNote(first.snapshot());
    reopened.append("b");
    // A replica that reused the snapshot's peer id would collide on this edit.
    expect(reopened.text()).toBe("a\nb");
    expect(openNote(reopened.snapshot()).text()).toBe("a\nb");
  });

  it("notifies subscribers on a local edit and stops when unsubscribed", () => {
    const note = createNote();
    const listener = vi.fn();
    const stop = note.onChange(listener);

    note.append("kept");
    expect(listener).toHaveBeenCalled();

    stop();
    listener.mockClear();
    note.append("ignored");
    expect(listener).not.toHaveBeenCalled();
  });
});
