import { useEffect, useRef, useState } from "react";

// TODO(backend): replace with daily AI-generated lines from the morning LLM pipeline
const STATIC_QUIPS: readonly string[] = [
  "404: sleep not found.",
  "Pizza at 3 AM is a valid food group.",
  'git commit -m "final final FINAL"',
  "I check five sites so you don't have to.",
  "Your next big idea is one weekend away.",
  "Beep boop. Scanning for prizes.",
  "Teammates wanted. Snacks provided. Probably.",
  "I woke up at 4:47 AM for you.",
  "Ship it. Fix it. Ship it again.",
  "Is it a bug or a feature? Yes.",
  "Coffee status: dangerously low.",
  "Psst. Save the ones you like!",
  "Dates come from the source. I never guess.",
  "Have you had water today, builder?",
  "Mentors are friends you haven't met yet.",
  "Ctrl+S your code. And your weekend.",
  "Tip: give your team a silly name.",
  "One more feature, they said. 6 hours ago.",
  "Pikachu or Charmander? Think fast.",
  "Would you pet a Snorlax? Be honest.",
  "Is Bulbasaur underrated? (Yes.)",
  "Tabs or spaces? Choose wisely.",
  "Dark mode or light mode? I know mine.",
  "3 AM snack: pizza or biryani?",
  "Solo or team hackathons?",
  "Coffee or chai, builder?",
];

interface QuipProps {
  /** If provided, parent can trigger immediate quip on hover */
  triggerKey?: number;
  onTalkingChange?: (talking: boolean) => void;
  className?: string;
}

export function useQuip() {
  const [quipText, setQuipText] = useState("");
  const [quipOn, setQuipOn] = useState(false);
  const lastQuipRef = useRef<string>("");
  const timerRef = useRef<number | null>(null);
  const hideTimerRef = useRef<number | null>(null);

  const clearTimers = () => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (hideTimerRef.current !== null) {
      window.clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  };

  const showRandomQuip = () => {
    clearTimers();
    if (typeof document !== "undefined" && document.hidden) {
      // Paused while the tab is hidden; retry in 10s
      timerRef.current = window.setTimeout(showRandomQuip, 10000);
      return;
    }

    const pool = STATIC_QUIPS.filter((q) => q !== lastQuipRef.current);
    const next = pool[Math.floor(Math.random() * pool.length)] ?? STATIC_QUIPS[0];
    lastQuipRef.current = next;
    setQuipText(next);
    setQuipOn(true);

    // Shown for ~4.5 s
    hideTimerRef.current = window.setTimeout(() => {
      setQuipOn(false);
    }, 4500);

    // Random gap of 30-90 s on real site
    const nextGapMs = 30000 + Math.random() * 60000;
    timerRef.current = window.setTimeout(showRandomQuip, nextGapMs);
  };

  useEffect(() => {
    // Initial delay of 4s after mount
    timerRef.current = window.setTimeout(showRandomQuip, 4000);

    const onVisibilityChange = () => {
      if (!document.hidden && !quipOn) {
        // Tab became visible again
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      clearTimers();
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);

  return {
    quipText,
    quipOn,
    sayNow: showRandomQuip,
  };
}

export default function Quip({
  text,
  show,
  className = "",
}: {
  text: string;
  show: boolean;
  className?: string;
}) {
  // Markup requirement: the bubble element only exists while it is showing
  if (!show) return null;

  return (
    <div
      className={`quip show ${className}`}
      role="status"
      aria-label={text}
      aria-live="polite"
    >
      {text}
    </div>
  );
}
