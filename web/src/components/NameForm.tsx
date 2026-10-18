import { useState, type FormEvent } from "react";

/** Asks what to call the person. `onSaved` gets the cleaned name the server stored. */
export default function NameForm({
  initial,
  submitLabel,
  onSaved,
}: {
  initial: string;
  submitLabel: string;
  onSaved: (name: string) => void;
}) {
  const [name, setName] = useState(initial);
  const [state, setState] = useState<"idle" | "saving" | "failed">("idle");

  async function save(e: FormEvent) {
    e.preventDefault();
    if (name.trim() === "") return;
    setState("saving");
    try {
      const res = await fetch("/api/me/name", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) throw new Error("save failed");
      const body = (await res.json()) as { name: string };
      setState("idle");
      onSaved(body.name);
    } catch {
      setState("failed");
    }
  }

  return (
    <form onSubmit={(e) => void save(e)} style={{ display: "grid", gap: 12 }}>
      <label className="field">
        Your name
        <input
          type="text"
          placeholder="What should we call you?"
          autoComplete="given-name"
          maxLength={40}
          required
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setState("idle");
          }}
        />
      </label>
      <button type="submit" className="btn solid" disabled={state === "saving" || name.trim() === ""}>
        {state === "saving" ? "Saving..." : submitLabel}
      </button>
      {state === "failed" && (
        <p role="alert" className="notice">
          We could not save that. Check your connection and try again.
        </p>
      )}
    </form>
  );
}
