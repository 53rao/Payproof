import type { ReactNode } from "react";
import type { IconName } from "./types";

export function Icon({ name }: { name: IconName }) {
  const common = { fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, viewBox: "0 0 24 24", "aria-hidden": true as const };
  const shapes: Record<IconName, ReactNode> = {
    grid: <><rect x="3.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.5"/></>,
    chart: <><path d="M4 19.5h16"/><path d="M6 16V11m4 5V5m4 11v-7m4 7V8"/></>,
    shield: <><path d="M12 3 19 6v5c0 5-3 8-7 10-4-2-7-5-7-10V6l7-3Z"/><path d="m9 12 2 2 4-4"/></>,
    receipt: <><rect x="4" y="4" width="16" height="16" rx="2.5"/><path d="M8 9h8M8 13h5m-5 3h3"/></>,
    box: <><path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Z"/><path d="m4.5 7.8 7.5 4.4 7.5-4.4M12 12.2V21"/></>,
    chevron: <path d="m8 10 4 4 4-4"/>, search: <><circle cx="10.8" cy="10.8" r="6.3"/><path d="m16 16 4 4"/></>,
    refresh: <><path d="M20 7v5h-5"/><path d="M19 12a7.5 7.5 0 1 1-2-5"/></>, info: <><circle cx="12" cy="12" r="9"/><path d="M12 11v5m0-8h.01"/></>,
    alert: <><path d="M10.3 4.7 3.8 16a2 2 0 0 0 1.7 3h13a2 2 0 0 0 1.7-3L13.7 4.7a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4m0 3h.01"/></>,
    arrow: <><path d="M5 12h14m-6-6 6 6-6 6"/></>, filter: <><path d="M4 6h16M7 12h10m-7 6h4"/></>,
    check: <path d="m5 12 4 4L19 6"/>, minus: <path d="M5 12h14"/>, expand: <><path d="M14 4h6v6M20 4l-7 7M10 20H4v-6M4 20l7-7"/></>,
  };
  return <svg {...common}>{shapes[name]}</svg>;
}
