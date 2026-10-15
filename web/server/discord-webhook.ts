// Whole-string match, ASCII only: no userinfo, port, query, fragment, spaces or uppercase host.
// Mirrors pipeline/notify/webhook_url.py. JS `$` (no m flag) does not match before a trailing newline.
const DISCORD_WEBHOOK = /^https:\/\/(?:discord\.com|discordapp\.com)\/api\/webhooks\/[0-9]+\/[A-Za-z0-9_-]+$/;

/** True only for a plain https Discord webhook URL, nothing else (SSRF guard). */
export function isDiscordWebhook(url: string): boolean {
  return typeof url === "string" && DISCORD_WEBHOOK.test(url);
}
