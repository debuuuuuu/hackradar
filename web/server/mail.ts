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

/**
 * The shared look of every HackRadar email (the site's charcoal frame, cream card and coral button).
 * Table layout and inline styles only, because mail clients ignore most modern CSS. All inputs are our
 * own fixed copy plus a link, which is attribute-escaped here.
 */
function layout(o: { preheader: string; title: string; lines: string[]; cta: string; link: string; ps?: string; fine: string; unsub?: string }): string {
  const body = o.lines.map((l) => `<p style="margin:0 0 14px;font-size:16px;line-height:1.55;color:#2a1615;">${l}</p>`).join("");
  return (
    `<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${o.preheader}</div>` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#1f1e1d;padding:32px 12px;">` +
    `<tr><td align="center"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;">` +
    `<tr><td style="padding:0 4px 16px;font-family:Georgia,serif;font-size:22px;color:#ede6dc;"><img src="${escapeAttr(new URL("/email/mascot.png", o.link).toString())}" width="40" height="40" alt="[^&#8255;^]" style="vertical-align:middle;border:0;color:#e5484d;font-family:Menlo,Consolas,monospace;"> HackRadar</td></tr>` +
    `<tr><td style="background:#f3e7d7;border-radius:14px;border-top:6px solid #e5484d;padding:32px 28px;font-family:Helvetica,Arial,sans-serif;">` +
    `<h1 style="margin:0 0 18px;font-family:Georgia,serif;font-size:28px;line-height:1.2;color:#2a1615;">${o.title}</h1>` +
    body +
    `<p style="margin:24px 0;"><a href="${escapeAttr(o.link)}" style="display:inline-block;background:#e5484d;color:#ffffff;text-decoration:none;font-weight:bold;font-size:17px;padding:14px 28px;border-radius:999px;">${o.cta} &rarr;</a></p>` +
    (o.ps ? `<p style="margin:0 0 14px;font-family:Georgia,serif;font-style:italic;font-size:15px;color:#9b2b2f;">${o.ps}</p>` : "") +
    `<p style="margin:0;font-size:13px;line-height:1.5;color:#5a3532;">${o.fine}</p>` +
    (o.unsub
      ? `<p style="margin:14px 0 0;font-size:12px;color:#7a4b47;">Changed your mind? <a href="${escapeAttr(o.unsub)}" style="color:#9b2b2f;">Unsubscribe in one click</a> (I'll miss you). This also deletes your account.</p>`
      : "") +
    `</td></tr>` +
    `<tr><td style="padding:16px 4px 0;font-family:Helvetica,Arial,sans-serif;font-size:12px;color:#a59d93;">Hackathons, contests and CTFs, found for you every morning.</td></tr>` +
    `</table></td></tr></table>`
  );
}

const from = (user: string): string => `HackRadar <${user}>`;

/** Sends the one-time sign-in link over Gmail SMTP. Throws a clear error when SMTP env is missing. */
export async function sendLoginEmail(to: string, link: string): Promise<void> {
  const { user, mailer } = transport();
  const text = [
    "Ready for launch? [^o^] Your HackRadar sign-in link:",
    link,
    "",
    "It works once and expires in 15 minutes.",
    "Did not ask for this? Ignore this email and nothing happens.",
  ].join("\n");
  const html = layout({
    preheader: "Your one-time link is inside. It expires in 15 minutes.",
    title: "Ready for launch? [^o^]",
    lines: ["One tap and you are in. No password to remember, no password to forget."],
    cta: "Sign me in",
    link,
    fine: "The link works once and expires in 15 minutes. Did not ask for this? Ignore this email and nothing happens.",
  });
  await mailer.sendMail({ from: from(user), to, subject: "Your HackRadar launch link [^o^]", text, html });
}

/** The welcome mail sent once, when an account is first created. `setupUrl` opens the setup page. */
export async function sendWelcomeEmail(to: string, setupUrl: string, unsubscribeUrl: string): Promise<void> {
  const { user, mailer } = transport();
  const text = [
    "Welcome aboard, builder! [^‿^]",
    "",
    "I'm the little monitor who hunts hackathons for you. I don't sleep much, and I don't miss deadlines.",
    "Tell me what to watch for:",
    setupUrl,
    "",
    "P.S. One message a morning, max. Pinky promise.",
    "",
    `Changed your mind? Unsubscribe in one click (this also deletes your account): ${unsubscribeUrl}`,
    "",
    "Dates in HackRadar come from the organisers' own listings. Reply to this email if something looks wrong.",
  ].join("\n");
  const html = layout({
    preheader: "One minute of setup and your radar is live.",
    title: "Welcome aboard, builder! [^&#8255;^]",
    lines: [
      "I'm the little monitor who hunts hackathons for you. I don't sleep much, and I don't miss deadlines.",
      "Tell me what to watch for and I'll do the rest.",
    ],
    cta: "Tweak my picks",
    link: setupUrl,
    ps: "P.S. One message a morning, max. Pinky promise.",
    unsub: unsubscribeUrl,
    fine: "Dates come straight from the organisers' own listings. Reply to this email if something looks wrong.",
  });
  await mailer.sendMail({ from: from(user), to, subject: "You're on the radar [^‿^]", text, html });
}
