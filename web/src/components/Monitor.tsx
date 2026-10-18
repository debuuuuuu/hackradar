import type { CSSProperties } from "react";

export type MonitorMood =
  | "idle"
  | "sleep"
  | "wake"
  | "focus"
  | "happy"
  | "read"
  | "sad"
  | "google"
  | "email"
  | "password";

interface MonitorProps {
  mood?: MonitorMood;
  sleepy?: boolean;
  happy?: boolean;
  className?: string;
  style?: CSSProperties;
  size?: number | string;
}

export default function Monitor({
  mood = "idle",
  sleepy = false,
  happy = false,
  className = "",
  style,
  size,
}: MonitorProps) {
  const isFixed = mood !== "idle";
  const moodClass = isFixed ? ` fixed mood-${mood}` : "";
  const sleepyClass = sleepy || mood === "sleep" ? " sleepy" : "";
  const happyClass = happy || mood === "happy" ? " happy" : "";

  const sizeStyle: CSSProperties = size
    ? {
        width: typeof size === "number" ? `${size}px` : size,
        height: typeof size === "number" ? `${size}px` : size,
      }
    : {};

  return (
    <svg
      className={`pc${moodClass}${sleepyClass}${happyClass} ${className}`}
      viewBox="0 0 48 48"
      aria-hidden="true"
      style={{ ...sizeStyle, ...style }}
    >
      <path className="screen" d="M9.6 12.2h28.8l1.3 18.6H10.4z" />
      <path
        className="ln"
        d="M8 9.5c9.5-1.6 22.5-1.4 32.5-.2l1.6 21.6c.1 1.7-.9 2.7-2.6 2.7H8.8c-1.6 0-2.6-1-2.6-2.6L6.6 11.2c0-.9.5-1.5 1.4-1.7zM5.4 11.6l1.5 20.6M22 33.6l-1.2 6M26.6 33.6l1.2 6M15.5 42.2c5.6-1.8 12.2-1.8 17.6 0"
      />

      {/* Cycling or fixed faces */}
      <g className="face f-sleep">
        <path className="ln" d="M14.5 20.5h5M28.5 20.5h5M21.5 26.5h5" />
      </g>
      <g className="face f-wake">
        <path className="ln" d="M17 17.5v4M31 17.5v4M23 26.5h2" />
      </g>
      <g className="face f-focus">
        <path className="ln" d="M14.5 16.5l5 2.5M33.5 16.5l-5 2.5M17 20.5v2M31 20.5v2M22 26.5h4" />
      </g>
      <g className="face f-happy">
        <path className="ln" d="M17.5 16.5v4M30.5 16.5v4M16.5 23.5c3.6 4.6 11.4 4.6 15 0" />
      </g>
      <g className="face f-read">
        <path className="ln" d="M19 21.5h2.5M31 21.5h2.5M21.5 26.5c1.6 1.2 3.9 1.2 5.5 0" />
      </g>
      <g className="face f-sad">
        <path className="ln" d="M15.5 17l4 1.5M32.5 17l-4 1.5M17.5 20v2.5M30.5 20v2.5M18.5 28.5c3-3 8-3 11 0" />
      </g>

      {/* Hands covering eyes for password input */}
      <g className="hands">
        <path
          className="ln"
          d="M11 24c-.5-4 1-8 3.5-9.5 1.4-.8 2.4.6 2 1.8l1-3c.6-1.4 2.4-1.1 2.4.4l.4-1.6c.5-1.3 2.3-1 2.2.5l-.3 11.4zM37 24c.5-4-1-8-3.5-9.5-1.4-.8-2.4.6-2 1.8l-1-3c-.6-1.4-2.4-1.1-2.4.4l-.4-1.6c-.5-1.3-2.3-1-2.2.5l.3 11.4z"
        />
      </g>

      {/* Sleep z */}
      <text className="zz" x="40" y="8">
        z
      </text>
    </svg>
  );
}
