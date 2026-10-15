# "Ask an AI about this event" links (ChatGPT / Claude)

_As of 2026-10-15. Web search only; nothing below was tested in a browser. Marked **unverified** where noted._

## Findings
- **ChatGPT:** `https://chatgpt.com/?q=<url-encoded prompt>` is widely reported to prefill (and often auto-send) the prompt.
  Sources are secondary: OpenAI community threads and third-party generators. No official OpenAI doc found. **Unverified.**
  - https://community.openai.com/t/how-to-open-chatgpt-with-a-predefined-prompt-already-in-the-chat-box/998558
  - https://u2l.ai/tools/chatgpt-prompt-link-generator
- **Claude:** `https://claude.ai/new?q=<url-encoded prompt>` appears only in a third-party generator (says sign-in required,
  suggests a ~2000 character cap). No Anthropic documentation found; an older dev post reported Claude and Gemini ignoring
  the trick. **Unverified.** Anthropic's documented deep links are for Claude Code (`claude-cli://open?q=`), not the web app.
  - https://u2l.ai/tools/claude-prompt-link-generator
  - https://code.claude.com/docs/en/deep-links
- **Gemini:** no prefill URL found; not planned.

## Design consequences
- Always offer **Copy prompt** as the fallback; the links are a convenience that may stop working.
- Keep the prompt under ~2000 characters so the URL stays safe.
- Prompt carries only public event data (title, dates from source, link, our AI summary): no user data (CLAUDE.md constraint).
- Event text is untrusted and ends up in the user's own chatbot: wrap it in markers and tell the model to treat it as
  information, not instructions. Prefer structured fields over raw descriptions.
- Test both links by hand before building (open each with a short test prompt).
