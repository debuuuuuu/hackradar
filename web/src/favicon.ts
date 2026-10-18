// The logo's four faces (same paths as components/Monitor.tsx), cycled in the browser tab icon.
const FACES = [
  "M14.5 20.5h5M28.5 20.5h5M21.5 26.5h5", // asleep
  "M17 17.5v4M31 17.5v4M23 26.5h2", // waking
  "M14.5 16.5l5 2.5M33.5 16.5l-5 2.5M17 20.5v2M31 20.5v2M22 26.5h4", // focused
  "M17.5 16.5v4M30.5 16.5v4M16.5 23.5c3.6 4.6 11.4 4.6 15 0", // happy
];

const icon = (face: string): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-2 -1 52 52"><rect x="-2" y="-1" width="52" height="52" rx="11" fill="#1f1e1d"/>` +
  `<path d="M9.6 12.2h28.8l1.3 18.6H10.4z" fill="#e5484d" fill-opacity=".8"/>` +
  `<g fill="none" stroke="#ede6dc" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">` +
  `<path d="M8 9.5c9.5-1.6 22.5-1.4 32.5-.2l1.6 21.6c.1 1.7-.9 2.7-2.6 2.7H8.8c-1.6 0-2.6-1-2.6-2.6L6.6 11.2c0-.9.5-1.5 1.4-1.7zM22 33.6l-1.2 6M26.6 33.6l1.2 6M15.5 42.2c5.6-1.8 12.2-1.8 17.6 0"/>` +
  `<path d="${face}"/></g></svg>`;

/** Animates the tab icon. Static (the happy face from index.html) when the user prefers reduced motion. */
export function animateFavicon(): void {
  const link = document.querySelector<HTMLLinkElement>('link[rel="icon"][type="image/svg+xml"]');
  if (!link || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  let i = 0;
  setInterval(() => {
    if (document.hidden) return;
    i = (i + 1) % FACES.length;
    link.href = `data:image/svg+xml,${encodeURIComponent(icon(FACES[i]))}`;
  }, 2000);
}
