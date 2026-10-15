import { describe, expect, it } from "vitest";
import { fromApi, resolveCity, toggle, toPayload } from "../src/lib/prefsForm.js";

const prefs = {
  homeCity: "pune",
  radiusKm: 150 as const,
  format: "online_near" as const,
  priorities: { hackathon: "top" as const, contest: "normal" as const, workshop: "off" as const, fest: "off" as const },
  topics: [],
  includeSocial: true,
  channels: { digest: ["email" as const], ping: [], reminders: [] },
};
const contact = { email: "a@example.com", emailLocked: true, phone: null, hasCallmebotKey: true, discordWebhookSet: false };

describe("prefs form conversion", () => {
  it("fromApi never carries a key and maps nulls to empty strings", () => {
    const f = fromApi({ prefs, contact });
    expect(f.callmebotKey).toBe("");
    expect(f.hasCallmebotKey).toBe(true);
    expect(f.phone).toBe("");
    expect(f.email).toBe("a@example.com");
  });

  it("toPayload omits a locked email and a blank key", () => {
    const body = toPayload(fromApi({ prefs, contact }), [{ key: "pune" }]);
    expect(body.contact).toEqual({ phone: "" });
  });

  it("toPayload sends an unlocked email (empty clears) and a typed key", () => {
    const f = {
      ...fromApi({ prefs, contact: { ...contact, emailLocked: false } }),
      email: " ",
      callmebotKey: " abc123 ",
      phone: " +91 98765 43210 ",
    };
    expect(toPayload(f).contact).toEqual({ phone: "+91 98765 43210", email: "", callmebotKey: "abc123" });
  });

  it("discord webhook is write-only: fromApi carries only the set flag, toPayload sends it only when typed or cleared", () => {
    const f = fromApi({ prefs, contact: { ...contact, discordWebhookSet: true } });
    expect(f.discordWebhook).toBe("");
    expect(f.discordWebhookSet).toBe(true);
    expect(toPayload(f).contact).not.toHaveProperty("discordWebhook");
    const url = "https://discord.com/api/webhooks/1/tok";
    expect(toPayload({ ...f, discordWebhook: ` ${url} ` }).contact.discordWebhook).toBe(url);
    expect(toPayload({ ...f, clearDiscordWebhook: true }).contact.discordWebhook).toBe("");
    expect(toPayload({ ...f, discordWebhook: url, clearDiscordWebhook: true }).contact.discordWebhook).toBe(url);
  });

  it("resolveCity falls back to the first place for an unknown city, and keeps a known one", () => {
    const places = [{ key: "mumbai" }, { key: "pune" }];
    expect(resolveCity("pune", places)).toBe("pune");
    expect(resolveCity("atlantis", places)).toBe("mumbai");
    expect(resolveCity("atlantis", [])).toBe("atlantis");
    expect(toPayload(fromApi({ prefs: { ...prefs, homeCity: "atlantis" }, contact }), places).prefs.homeCity).toBe("mumbai");
  });

  it("toggle keeps canonical order and removes", () => {
    const order = ["email", "discord", "whatsapp"] as const;
    expect(toggle(["whatsapp"], "email", true, order)).toEqual(["email", "whatsapp"]);
    expect(toggle(["email", "whatsapp"], "email", false, order)).toEqual(["whatsapp"]);
  });
});
