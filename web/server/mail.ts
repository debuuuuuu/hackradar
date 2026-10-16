import nodemailer from "nodemailer";

function transport() {
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_APP_PASSWORD;
  if (!user || !pass) throw new Error("SMTP_USER and SMTP_APP_PASSWORD must be set to send email");
  return { user, mailer: nodemailer.createTransport({ host: "smtp.gmail.com", port: 465, secure: true, auth: { user, pass } }) };
}

const escapeAttr = (s: string): string => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;");

/**
 * True when the mail server refused this recipient address itself (unknown mailbox or domain), as
 * opposed to our own SMTP being down. Only refusals the server makes during sending are caught:
 * a bounce that arrives later cannot be seen from here.
 */
export function isBadRecipient(e: unknown): boolean {
  if (!(e instanceof Error)) return false;
  const { code, responseCode } = e as { code?: unknown; responseCode?: unknown };
  return code === "EENVELOPE" || (typeof responseCode === "number" && responseCode >= 550 && responseCode <= 553);
}

/** Sends the one-time sign-in link over Gmail SMTP. Throws a clear error when SMTP env is missing. */
export async function sendLoginEmail(to: string, link: string): Promise<void> {
  const { user, mailer } = transport();
  const text = [
    "Sign in to HackRadar:",
    link,
    "",
    "It works once and expires in 15 minutes.",
    "If you did not ask for this, ignore this email.",
  ].join("\n");
  const html =
    `<p>Sign in to HackRadar:</p><p><a href="${escapeAttr(link)}">Sign in</a></p>` +
    "<p>It works once and expires in 15 minutes.</p><p>If you did not ask for this, ignore this email.</p>";
  await mailer.sendMail({ from: user, to, subject: "Your HackRadar sign-in link", text, html });
}

/** The welcome mail sent once, when an account is first created. `setupUrl` opens the setup page. */
export async function sendWelcomeEmail(to: string, setupUrl: string): Promise<void> {
  const { user, mailer } = transport();
  const text = [
    "Welcome to HackRadar.",
    "",
    "This address works, so your picks can reach you here. To choose which hackathons you hear about, finish setup:",
    setupUrl,
    "",
    "Dates in HackRadar come from the organisers' own listings. Reply to this email if something looks wrong.",
  ].join("\n");
  const html =
    "<p>Welcome to HackRadar.</p>" +
    "<p>This address works, so your picks can reach you here. To choose which hackathons you hear about, finish setup:</p>" +
    `<p><a href="${escapeAttr(setupUrl)}">Finish setup</a></p>` +
    "<p>Dates in HackRadar come from the organisers' own listings. Reply to this email if something looks wrong.</p>";
  await mailer.sendMail({ from: user, to, subject: "Welcome to HackRadar", text, html });
}
