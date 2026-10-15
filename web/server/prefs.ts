import { decrypt, encrypt, keyFromEnv } from "./crypto.js";
import { query, transaction } from "./db.js";

export const RADII = [50, 150, 300, 3000] as const;
export const FORMATS = ["online_near", "online", "in_person", "anything"] as const;
export const KINDS = ["hackathon", "contest", "workshop", "fest"] as const;
export const LEVELS = ["top", "normal", "off"] as const;
export const TOPICS = ["ai-ml", "web3", "web", "data", "hardware", "security", "design", "beginner"] as const;
export const MESSAGE_TYPES = ["digest", "ping", "reminders"] as const;
export const CHANNELS = ["email", "discord", "whatsapp"] as const;

export type Radius = (typeof RADII)[number];
export type Kind = (typeof KINDS)[number];
export type Level = (typeof LEVELS)[number];
export type MessageType = (typeof MESSAGE_TYPES)[number];
export type Channel = (typeof CHANNELS)[number];

export interface Prefs {
  homeCity: string;
  radiusKm: Radius;
  format: (typeof FORMATS)[number];
  priorities: Record<Kind, Level>;
  topics: string[];
  includeSocial: boolean;
  channels: Record<MessageType, Channel[]>;
}

/** What the owner sees of their own contact details. The CallMeBot key is never returned. */
export interface ContactView {
  email: string | null;
  emailLocked: boolean;
  phone: string | null;
  hasCallmebotKey: boolean;
}

/** Contact input: omitted = leave stored data alone, "" = clear. */
export interface ContactInput {
  email?: string;
  phone?: string;
  callmebotKey?: string;
}

export class ValidationError extends Error {
  constructor(
    public readonly field: string,
    message = `invalid ${field}`,
  ) {
    super(message);
    this.name = "ValidationError";
  }
}

export const DEFAULT_PREFS: Prefs = {
  homeCity: "pune",
  radiusKm: 150,
  format: "online_near",
  priorities: { hackathon: "top", contest: "normal", workshop: "off", fest: "off" },
  topics: [],
  includeSocial: true,
  channels: { digest: ["email", "discord"], ping: ["discord"], reminders: ["email", "discord"] },
};

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

/** A list drawn from `allowed`, no duplicates, at most `allowed.length` entries. */
function pickList<T extends string>(value: unknown, allowed: readonly T[], field: string): T[] {
  if (!Array.isArray(value) || value.length > allowed.length) throw new ValidationError(field);
  const seen = new Set<string>();
  for (const v of value) {
    if (typeof v !== "string" || !(allowed as readonly string[]).includes(v) || seen.has(v)) throw new ValidationError(field);
    seen.add(v);
  }
  return value as T[];
}

/** Validates the untrusted shape; throws ValidationError naming the first bad field. */
export async function validatePrefs(input: unknown): Promise<Prefs> {
  if (!isObj(input)) throw new ValidationError("prefs");
  const { homeCity, radiusKm, format, priorities, topics, includeSocial, channels } = input;

  if (typeof homeCity !== "string" || homeCity.length === 0 || homeCity.length > 64) throw new ValidationError("homeCity");
  const known = await query("SELECT 1 FROM places WHERE key = $1", [homeCity]);
  if (known.length === 0) throw new ValidationError("homeCity");

  if (typeof radiusKm !== "number" || !(RADII as readonly number[]).includes(radiusKm)) throw new ValidationError("radiusKm");
  if (typeof format !== "string" || !(FORMATS as readonly string[]).includes(format)) throw new ValidationError("format");

  if (!isObj(priorities)) throw new ValidationError("priorities");
  const prio = {} as Record<Kind, Level>;
  for (const k of KINDS) {
    const v = priorities[k];
    if (typeof v !== "string" || !(LEVELS as readonly string[]).includes(v)) throw new ValidationError("priorities");
    prio[k] = v as Level;
  }

  const topicList = pickList(topics, TOPICS, "topics");
  if (typeof includeSocial !== "boolean") throw new ValidationError("includeSocial");

  if (!isObj(channels)) throw new ValidationError("channels");
  const chans = {} as Record<MessageType, Channel[]>;
  for (const t of MESSAGE_TYPES) chans[t] = pickList(channels[t], CHANNELS, "channels");

  return {
    homeCity,
    radiusKm: radiusKm as Radius,
    format: format as Prefs["format"],
    priorities: prio,
    topics: topicList,
    includeSocial,
    channels: chans,
  };
}

const EMAIL_SHAPE = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;
const PHONE_SHAPE = /^[0-9 +-]{7,20}$/;
const KEY_SHAPE = /^[A-Za-z0-9_-]{1,64}$/;

/** Validates optional contact fields. Absent stays absent; "" means clear. */
export function validateContact(input: unknown): ContactInput {
  if (input === undefined || input === null) return {};
  if (!isObj(input)) throw new ValidationError("contact");
  const out: ContactInput = {};
  if (input.email !== undefined) {
    if (typeof input.email !== "string") throw new ValidationError("email");
    const e = input.email.trim().toLowerCase();
    if (e !== "" && (e.length > 254 || !EMAIL_SHAPE.test(e))) throw new ValidationError("email");
    out.email = e;
  }
  if (input.phone !== undefined) {
    if (typeof input.phone !== "string") throw new ValidationError("phone");
    const p = input.phone.trim();
    if (p !== "" && (!PHONE_SHAPE.test(p) || !/[0-9]/.test(p))) throw new ValidationError("phone");
    out.phone = p;
  }
  if (input.callmebotKey !== undefined) {
    if (typeof input.callmebotKey !== "string") throw new ValidationError("callmebotKey");
    const k = input.callmebotKey.trim();
    if (k !== "" && !KEY_SHAPE.test(k)) throw new ValidationError("callmebotKey");
    out.callmebotKey = k;
  }
  return out;
}

interface Row {
  home_city: string;
  radius_km: number;
  format: Prefs["format"];
  priorities: Prefs["priorities"];
  themes: string[];
  include_social: boolean;
  channels: Prefs["channels"];
  email_enc: string | null;
  email_hash: string | null;
  callmebot_phone_enc: string | null;
  callmebot_key_enc: string | null;
}

/** Preferences and the owner's own contact details (decrypted for them only); null if the user is gone. */
export async function getPrefs(uid: number): Promise<(Prefs & { contact: ContactView }) | null> {
  const rows = await query<Row>(
    `SELECT p.home_city, p.radius_km, p.format, p.priorities, p.themes, p.include_social, p.channels,
            u.email_enc, u.email_hash, u.callmebot_phone_enc, u.callmebot_key_enc
       FROM users u LEFT JOIN preferences p ON p.user_id = u.id
      WHERE u.id = $1`,
    [uid],
  );
  const r = rows[0];
  if (!r) return null;
  const key = keyFromEnv();
  const contact: ContactView = {
    email: r.email_enc ? decrypt(r.email_enc, key) : null,
    emailLocked: r.email_hash !== null,
    phone: r.callmebot_phone_enc ? decrypt(r.callmebot_phone_enc, key) : null,
    hasCallmebotKey: r.callmebot_key_enc !== null,
  };
  const prefs: Prefs = r.home_city
    ? {
        homeCity: r.home_city,
        radiusKm: Number(r.radius_km) as Radius,
        format: r.format,
        priorities: r.priorities,
        topics: r.themes,
        includeSocial: r.include_social,
        channels: r.channels,
      }
    : DEFAULT_PREFS;
  return { ...prefs, contact };
}

/**
 * Writes preferences and contact details in one transaction and stamps onboarded_at the first time.
 * The sign-in identity never changes here: a user with email_hash keeps their email read-only, and a
 * notification email for others goes into email_enc only.
 */
export async function savePrefs(uid: number, prefs: Prefs, contact: ContactInput = {}): Promise<void> {
  const needsKey = contact.email || contact.phone || contact.callmebotKey;
  const key = needsKey ? keyFromEnv() : null;
  await transaction(async (q) => {
    const user = await q<{ locked: boolean }>("SELECT email_hash IS NOT NULL AS locked FROM users WHERE id = $1 FOR UPDATE", [uid]);
    if (user.length === 0) throw new Error("user not found");

    await q(
      `INSERT INTO preferences (user_id, home_city, radius_km, format, priorities, themes, include_social, channels)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8::jsonb)
       ON CONFLICT (user_id) DO UPDATE SET home_city = EXCLUDED.home_city, radius_km = EXCLUDED.radius_km,
         format = EXCLUDED.format, priorities = EXCLUDED.priorities, themes = EXCLUDED.themes,
         include_social = EXCLUDED.include_social, channels = EXCLUDED.channels`,
      [uid, prefs.homeCity, prefs.radiusKm, prefs.format, JSON.stringify(prefs.priorities), prefs.topics, prefs.includeSocial, JSON.stringify(prefs.channels)],
    );

    const sets: string[] = ["onboarded_at = coalesce(onboarded_at, now())"];
    const params: unknown[] = [uid];
    const set = (column: string, value: string | undefined) => {
      if (value === undefined) return;
      params.push(value === "" ? null : encrypt(value, key as Buffer));
      sets.push(`${column} = $${params.length}`);
    };
    if (!user[0].locked) set("email_enc", contact.email);
    set("callmebot_phone_enc", contact.phone);
    set("callmebot_key_enc", contact.callmebotKey);
    await q(`UPDATE users SET ${sets.join(", ")} WHERE id = $1`, params);
  });
}
