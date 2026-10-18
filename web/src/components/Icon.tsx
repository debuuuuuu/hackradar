import type { CSSProperties } from "react";

export type IconName =
  | "pin"
  | "bulb"
  | "code"
  | "sparkle"
  | "clock"
  | "wifi"
  | "heart"
  | "cup"
  | "rocket"
  | "trophy"
  | "people"
  | "ticket"
  | "phone"
  | "calendar"
  | "plane"
  | "check"
  | "search"
  | "discord"
  | "email"
  | "whatsapp";

export const TEXT_FACES = {
  happy: "[^‿^]",
  neutral: "[o_o]",
  excited: "[^o^]",
  sleepy: "[-_-]zz",
} as const;

interface IconProps {
  name: IconName;
  className?: string;
  style?: CSSProperties;
  size?: number | string;
  variant?: "coral" | "ink" | "cream";
}

const PATHS: Record<IconName, string> = {
  // pin / near
  pin: "M12 21s-6-6-6-11a6 6 0 0 1 12 0c0 5-6 11-6 11zM10 10a2 2 0 1 0 4 0a2 2 0 1 0-4 0",
  // bulb / topic
  bulb: "M8.5 13.5a5.5 5.5 0 1 1 7 0c-.9.8-1.2 1.8-1.2 3h-4.6c0-1.2-.3-2.2-1.2-3zM9.8 19h4.4M10.5 21.5h3",
  // code
  code: "M8 7l-5 5 5 5M16 7l5 5-5 5M14 4l-4 16",
  // sparkle / star / multi-site
  sparkle: "M12 3l1.8 5.4L19 10l-5.2 1.6L12 17l-1.8-5.4L5 10l5.2-1.6z",
  // clock / closing soon
  clock: "M12 21a9 9 0 1 0 0-18a9 9 0 1 0 0 18zM12 7v5l3 2",
  // wifi / online
  wifi: "M3 9c5-5 13-5 18 0M6 12.5c3.5-3 8.5-3 12 0M9 16c1.8-1.4 4.2-1.4 6 0M12 19.5v.5",
  // heart
  heart: "M12 20s-7-4.5-7-9.5A3.8 3.8 0 0 1 12 8a3.8 3.8 0 0 1 7 2.5c0 5-7 9.5-7 9.5z",
  // cup
  cup: "M5 9h11v5a5 5 0 0 1-5 5h-1a5 5 0 0 1-5-5zM16 10.5h2a2 2 0 0 1 0 4h-2M8.5 3.5c-1 1.2 1 2 0 3.5M12 3.5c-1 1.2 1 2 0 3.5",
  // rocket
  rocket: "M12 3c4 3.5 5.3 8 4 13.5H8C6.7 11 8 6.5 12 3zM10.5 9.5a1.5 1.5 0 1 0 3 0a1.5 1.5 0 1 0-3 0M8 14l-3 4 4-.5M16 14l3 4-4-.5",
  // trophy / prize
  trophy: "M8 4h8v5a4 4 0 0 1-8 0zM8 6H5a2.5 2.5 0 0 0 3 3.5M16 6h3a2.5 2.5 0 0 1-3 3.5M12 13v4M9 20h6M10 17h4",
  // people / team
  people: "M6 9a2.5 2.5 0 1 0 5 0a2.5 2.5 0 1 0-5 0M13 9a2.5 2.5 0 1 0 5 0a2.5 2.5 0 1 0-5 0M3.5 19c.5-3 2.5-5 5-5s4.5 2 5 5M11 19c.5-3 2.5-5 5-5s4.5 2 5 5",
  // ticket / fee
  ticket: "M4 8h16v3a2 2 0 0 0 0 4v3H4v-3a2 2 0 0 0 0-4zM14 8v10",
  // phone / whatsapp
  phone: "M8 4h8a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zM11 17h2",
  // calendar
  calendar: "M5 5h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2zM4 9h16M8 3v3M16 3v3",
  // plane / submit
  plane: "M3 11l18-8-6 18-3-7zM12 14l9-11",
  // check
  check: "M3 8.5l3 3 7-7",
  // search
  search: "M10.5 18a7.5 7.5 0 1 0 0-15 7.5 7.5 0 0 0 0 15zM16 16l5 5",
  // discord
  discord: "M7 8c2.5-1.5 5.5-1.5 8 0l1.5 7.5c-1.5 1.5-3.5 1.5-5.5 0l-1-1.5-1 1.5c-2 1.5-4 1.5-5.5 0zM8.5 12a1 1 0 1 0 2 0 1 1 0 0 0-2 0M13.5 12a1 1 0 1 0 2 0 1 1 0 0 0-2 0",
  // email
  email: "M4 6h16v12H4zM4 7l8 6 8-6",
  // whatsapp
  whatsapp: "M12 3a9 9 0 0 0-7.8 13.5L3 21l4.7-1.2A9 9 0 1 0 12 3zM9.5 8.5c0 3.5 2.5 6 6 6l1.2-1.2-2.4-1.2-1.2 1.2c-1.2-.6-1.8-1.2-2.4-2.4l1.2-1.2-1.2-2.4z",
};

export default function Icon({ name, className = "", style, size, variant }: IconProps) {
  const d = PATHS[name] ?? PATHS.sparkle;
  const variantClass = variant ? ` mo-${variant}` : "";
  const sizeStyle: CSSProperties = size
    ? { width: typeof size === "number" ? `${size}px` : size, height: typeof size === "number" ? `${size}px` : size }
    : {};

  return (
    <svg
      className={`mo${variantClass} ${className}`}
      viewBox="0 0 24 24"
      aria-hidden="true"
      style={{ ...sizeStyle, ...style }}
    >
      <path className="ln" d={d} />
    </svg>
  );
}
