import type { Channel, ContactView, Kind, Level, MessageType, Prefs } from "../../server/prefs.js";

export type { Channel, ContactView, Kind, Level, MessageType, Prefs };

export interface PrefsResponse {
  prefs: Prefs;
  contact: ContactView;
}

/** Form-side state: contact fields are plain strings; the CallMeBot key is write-only. */
export interface FormState {
  prefs: Prefs;
  email: string;
  emailLocked: boolean;
  phone: string;
  callmebotKey: string;
  hasCallmebotKey: boolean;
  /** Write-only like the CallMeBot key: the saved URL never comes back, only whether one exists. */
  discordWebhook: string;
  discordWebhookSet: boolean;
  clearDiscordWebhook: boolean;
}

export const TOPIC_LABELS: ReadonlyArray<readonly [string, string]> = [
  ["ai-ml", "AI / ML"],
  ["web3", "Web3"],
  ["web", "Web / full-stack"],
  ["data", "Data"],
  ["hardware", "IoT / hardware"],
  ["security", "Cybersecurity"],
  ["design", "Design"],
  ["beginner", "Beginner friendly"],
];

export function fromApi(res: PrefsResponse): FormState {
  return {
    prefs: res.prefs,
    email: res.contact.email ?? "",
    emailLocked: res.contact.emailLocked,
    phone: res.contact.phone ?? "",
    callmebotKey: "",
    hasCallmebotKey: res.contact.hasCallmebotKey,
    discordWebhook: "",
    discordWebhookSet: res.contact.discordWebhookSet,
    clearDiscordWebhook: false,
  };
}

/** The stored city if the places list has it, else the first listed place (never a stale unknown value). */
export function resolveCity(city: string, places: ReadonlyArray<{ key: string }>): string {
  if (places.length === 0 || places.some((p) => p.key === city)) return city;
  return places[0].key;
}

/**
 * Request body for PUT /api/me/prefs. A locked email (sign-in identity) is never sent; a blank
 * CallMeBot key or webhook is omitted so the stored one is kept.
 */
export function toPayload(form: FormState, places: ReadonlyArray<{ key: string }> = []): { prefs: Prefs; contact: Record<string, string> } {
  const contact: Record<string, string> = { phone: form.phone.trim() };
  if (!form.emailLocked) contact.email = form.email.trim();
  const key = form.callmebotKey.trim();
  if (key !== "") contact.callmebotKey = key;
  const hook = form.discordWebhook.trim();
  if (hook !== "") contact.discordWebhook = hook;
  else if (form.clearDiscordWebhook) contact.discordWebhook = "";
  return { prefs: { ...form.prefs, homeCity: resolveCity(form.prefs.homeCity, places) }, contact };
}

/** Toggle one entry of a list while keeping the canonical order of `order`. */
export function toggle<T extends string>(list: readonly T[], item: T, on: boolean, order: readonly T[]): T[] {
  const set = new Set(list);
  if (on) set.add(item);
  else set.delete(item);
  return order.filter((o) => set.has(o));
}
