import { describe, expect, it } from "vitest";
import { isDiscordWebhook } from "../server/discord-webhook.js";

describe("isDiscordWebhook (mirrors tests/test_webhook_url.py)", () => {
  it.each([
    "https://discord.com/api/webhooks/123456789012345678/abc_DEF-123",
    "https://discordapp.com/api/webhooks/123/token",
  ])("accepts %s", (url) => expect(isDiscordWebhook(url)).toBe(true));

  it.each([
    "",
    "http://discord.com/api/webhooks/1/tok",
    "https://evil.com/api/webhooks/1/tok",
    "https://discord.com.evil.com/api/webhooks/1/tok",
    "https://discord.com/api/webhooks/abc/tok",
    "https://discord.com/api/webhooks/1/",
    "https://discord.com/api/webhooks/1/tok/extra",
    "https://169.254.169.254/latest/meta-data",
    "https://discord.com/api/webhooks/1/tok?wait=true",
    "https://x@discord.com/api/webhooks/1/tok",
    "https://discord.com:443/api/webhooks/1/tok",
    "https://DISCORD.com/api/webhooks/1/tok",
    "https://discord.com./api/webhooks/1/tok",
    "https://discord.com/api/webhooks/1/tok#frag",
    "https://discord.com/api/webhooks/١/tok",
    " https://discord.com/api/webhooks/1/tok",
    "https://discord.com/api/webhooks/1/tok\n",
    "https://discord.com/api/webhooks/1/to\tk",
    "https://discord%2Ecom/api/webhooks/1/tok",
  ])("rejects %j", (url) => expect(isDiscordWebhook(url)).toBe(false));
});
