import { describe, expect, it } from "vitest";
import { planDocumentMove } from "@/lib/documents";

describe("planDocumentMove", () => {
  it("creates at the destination when nothing was logged at from_path", () => {
    expect(
      planDocumentMove({
        fromPath: "Agents/Roger/old.md",
        vaultPath: "Agents/Roger/new.md",
        prior: null,
        destination: null,
      }),
    ).toEqual({ action: "insert", fromPath: "Agents/Roger/old.md" });
  });

  it("updates the destination when from_path was never logged", () => {
    expect(
      planDocumentMove({
        fromPath: "Agents/Roger/old.md",
        vaultPath: "Agents/Roger/new.md",
        prior: null,
        destination: { id: "dest" },
      }),
    ).toEqual({ action: "update", id: "dest", fromPath: "Agents/Roger/old.md" });
  });

  it("renames the logged document when the destination is free", () => {
    expect(
      planDocumentMove({
        fromPath: "Agents/Roger/old.md",
        vaultPath: "Agents/Roger/new.md",
        prior: { id: "prior" },
        destination: null,
      }),
    ).toEqual({ action: "update", id: "prior", fromPath: "Agents/Roger/old.md" });
  });

  it("conflicts when from_path and vault_path are two different documents", () => {
    expect(
      planDocumentMove({
        fromPath: "Agents/Roger/old.md",
        vaultPath: "Agents/Roger/new.md",
        prior: { id: "prior" },
        destination: { id: "dest" },
      }),
    ).toEqual({ action: "conflict" });
  });

  it("updates the same document when the path does not change", () => {
    expect(
      planDocumentMove({
        fromPath: "Agents/Roger/same.md",
        vaultPath: "Agents/Roger/same.md",
        prior: { id: "prior" },
        destination: { id: "prior" },
      }),
    ).toEqual({ action: "update", id: "prior", fromPath: "Agents/Roger/same.md" });
  });

  it("creates when a move omits from_path and the destination is new", () => {
    expect(
      planDocumentMove({
        fromPath: null,
        vaultPath: "Agents/Roger/new.md",
        prior: null,
        destination: null,
      }),
    ).toEqual({ action: "insert", fromPath: null });
  });

  it("updates the destination when a move omits from_path", () => {
    expect(
      planDocumentMove({
        fromPath: null,
        vaultPath: "Agents/Roger/new.md",
        prior: null,
        destination: { id: "dest" },
      }),
    ).toEqual({ action: "update", id: "dest", fromPath: null });
  });
});
