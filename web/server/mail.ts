import nodemailer from "nodemailer";

/** Sends the one-time sign-in link over Gmail SMTP. Throws a clear error when SMTP env is missing. */
export async function sendLoginEmail(to: string, link: string): Promise<void> {
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_APP_PASSWORD;
  if (!user || !pass) throw new Error("SMTP_USER and SMTP_APP_PASSWORD must be set to send sign-in email");
  const transport = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: { user, pass },
  });
  const text = [
    "Sign in to HackRadar:",
    link,
    "",
    "It works once and expires in 15 minutes.",
    "If you did not ask for this, ignore this email.",
  ].join("\n");
  const html =
    `<p>Sign in to HackRadar:</p><p><a href="${link.replace(/&/g, "&amp;").replace(/"/g, "&quot;")}">Sign in</a></p>` +
    "<p>It works once and expires in 15 minutes.</p><p>If you did not ask for this, ignore this email.</p>";
  await transport.sendMail({ from: user, to, subject: "Your HackRadar sign-in link", text, html });
}
