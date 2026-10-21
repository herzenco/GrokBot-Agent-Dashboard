import { describe, expect, it } from "vitest";
import {
  canAccessOutreach,
  mergedHasContact,
  outreachActivitySummary,
  outreachListScope,
  parseOutreachCreate,
  parseOutreachPatch,
  parseOutreachStatusFilter,
} from "@/lib/outreach";

const now = "2026-10-21T18:00:00.000Z";

const valid = {
  person_name: "Ada Lovelace",
  company: "Analytical Engines",
  title: "Founder",
  email: "ada@example.com",
  channel: "email",
  status: "sent",
  message: "Asked about a call next week.",
  source_url: "https://example.com/ada",
};

describe("outreach create validation", () => {
  it("requires person_name, channel, status, and a contact method", () => {
    expect(parseOutreachCreate({}, now)).toEqual({ ok: false, error: "person_name is required" });
    expect(parseOutreachCreate({ person_name: "  Ada  " }, now)).toEqual({ ok: false, error: "channel is required" });
    expect(parseOutreachCreate({ person_name: "Ada", channel: "email" }, now)).toEqual({
      ok: false,
      error: "status is required",
    });
    expect(parseOutreachCreate({ person_name: "Ada", channel: "email", status: "sent" }, now)).toEqual({
      ok: false,
      error: "email or linkedin_url is required",
    });
    expect(parseOutreachCreate({ ...valid, email: "   ", linkedin_url: "" }, now)).toEqual({
      ok: false,
      error: "email or linkedin_url is required",
    });
  });

  it("rejects bad enums, email, urls, and timestamps", () => {
    expect(parseOutreachCreate({ ...valid, channel: "Email" }, now)).toEqual({
      ok: false,
      error: "channel must be email, linkedin, or other",
    });
    expect(parseOutreachCreate({ ...valid, status: "opened" }, now)).toEqual({
      ok: false,
      error: "status must be drafted, sent, replied, or meeting",
    });
    expect(parseOutreachCreate({ ...valid, email: "ada" }, now)).toEqual({
      ok: false,
      error: "email must be an email address",
    });
    expect(parseOutreachCreate({ ...valid, email: null, linkedin_url: "linkedin.com/in/ada" }, now)).toEqual({
      ok: false,
      error: "linkedin_url must be http or https",
    });
    expect(parseOutreachCreate({ ...valid, source_url: "javascript:alert(1)" }, now)).toEqual({
      ok: false,
      error: "source_url must be http or https",
    });
    expect(parseOutreachCreate({ ...valid, contacted_at: "2026-10-21" }, now)).toEqual({
      ok: false,
      error: "contacted_at must be an ISO timestamp",
    });
    expect(parseOutreachCreate({ ...valid, person_name: "A".repeat(201) }, now)).toEqual({
      ok: false,
      error: "person_name must be 200 characters or fewer",
    });
    expect(parseOutreachStatusFilter("meeting")).toBe("meeting");
    expect(parseOutreachStatusFilter("")).toBeNull();
    expect(parseOutreachStatusFilter("nope")).toEqual({
      error: "status must be drafted, sent, replied, or meeting",
    });
  });

  it("accepts a linkedin-only row and defaults contacted_at to now", () => {
    const parsed = parseOutreachCreate(
      {
        person_name: "  Grace Hopper ",
        channel: "linkedin",
        status: "drafted",
        linkedin_url: "https://www.linkedin.com/in/grace",
        company: "   ",
      },
      now,
    );
    expect(parsed).toEqual({
      ok: true,
      value: {
        personName: "Grace Hopper",
        company: null,
        title: null,
        email: null,
        linkedinUrl: "https://www.linkedin.com/in/grace",
        channel: "linkedin",
        contactedAt: now,
        message: null,
        status: "drafted",
        sourceUrl: null,
      },
    });
  });

  it("keeps a supplied contacted_at as UTC", () => {
    const parsed = parseOutreachCreate({ ...valid, contacted_at: "2026-10-21T10:30:00-04:00" }, now);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.value.contactedAt).toBe("2026-10-21T14:30:00.000Z");
  });
});

describe("outreach patch validation", () => {
  it("updates status and rejects an empty body", () => {
    expect(parseOutreachPatch({ status: "replied" })).toEqual({ ok: true, value: { status: "replied" } });
    expect(parseOutreachPatch({})).toEqual({ ok: false, error: "Send at least one field to update" });
    expect(parseOutreachPatch({ status: "Sent" })).toEqual({
      ok: false,
      error: "status must be drafted, sent, replied, or meeting",
    });
    expect(parseOutreachPatch({ contacted_at: null })).toEqual({
      ok: false,
      error: "contacted_at must be an ISO timestamp",
    });
  });

  it("lets a patch clear one contact method only when the other remains", () => {
    const current = { email: "ada@example.com", linkedin_url: "https://www.linkedin.com/in/ada" };
    const clearEmail = parseOutreachPatch({ email: "" });
    expect(clearEmail.ok).toBe(true);
    if (clearEmail.ok) expect(mergedHasContact(current, clearEmail.value)).toBe(true);

    const clearBoth = parseOutreachPatch({ email: null, linkedin_url: null });
    expect(clearBoth.ok).toBe(true);
    if (clearBoth.ok) expect(mergedHasContact({ email: "ada@example.com", linkedin_url: null }, clearBoth.value)).toBe(false);
    expect(mergedHasContact(current, {})).toBe(true);
  });

  it("describes a status change in the activity feed", () => {
    expect(
      outreachActivitySummary("logged", { person_name: "Ada Lovelace", company: "Analytical Engines", status: "sent" }),
    ).toBe("logged outreach to Ada Lovelace at Analytical Engines");
    expect(
      outreachActivitySummary(
        "updated",
        { person_name: "Ada Lovelace", company: null, status: "meeting" },
        "replied",
      ),
    ).toBe("marked outreach to Ada Lovelace as meeting");
  });
});

describe("outreach auth", () => {
  const hondo = "22222222-2222-4222-8222-222222222222";
  const roger = "11111111-1111-4111-8111-111111111111";

  it("lets the owning agent and the admin read or update a row", () => {
    expect(canAccessOutreach({ admin: false, actorId: hondo, rowAgentId: hondo })).toBe(true);
    expect(canAccessOutreach({ admin: true, actorId: null, rowAgentId: hondo })).toBe(true);
    expect(canAccessOutreach({ admin: false, actorId: roger, rowAgentId: hondo })).toBe(false);
    expect(canAccessOutreach({ admin: false, actorId: null, rowAgentId: hondo })).toBe(false);
  });

  it("limits an agent key to its own list and lets admin filter by slug", () => {
    expect(outreachListScope({ admin: false, actorSlug: "hondo", requestedAgent: null })).toEqual({
      ok: true,
      agentSlug: "hondo",
    });
    expect(outreachListScope({ admin: false, actorSlug: "hondo", requestedAgent: "hondo" })).toEqual({
      ok: true,
      agentSlug: "hondo",
    });
    expect(outreachListScope({ admin: false, actorSlug: "hondo", requestedAgent: "roger" })).toEqual({
      ok: false,
      status: 403,
      error: "This key cannot read another agent's outreach",
    });
    expect(outreachListScope({ admin: true, actorSlug: null, requestedAgent: null })).toEqual({
      ok: true,
      agentSlug: null,
    });
    expect(outreachListScope({ admin: true, actorSlug: null, requestedAgent: " hondo " })).toEqual({
      ok: true,
      agentSlug: "hondo",
    });
  });
});
