"use client";
import { useRef, useState } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
gsap.registerPlugin(useGSAP);
type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & { state?: "idle" | "loading" | "success" | "error"; children: React.ReactNode };
export function MotionButton({ state = "idle", children, className = "", onClick, disabled, ...props }: Props) {
  const scope = useRef<HTMLButtonElement>(null); const [ripples, setRipples] = useState<{ id: number; x: number; y: number }[]>([]);
  useGSAP(() => { const el = scope.current; if (!el) return; const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches; if (reduce) { gsap.to(el, { opacity: 0.86, duration: 0.15 }); return; }
    if (state === "success") gsap.fromTo(el, { scale: 0.94 }, { scale: 1, duration: 0.45, ease: "back.out(1.7)" });
    if (state === "error") gsap.fromTo(el, { x: -4 }, { x: 0, keyframes: [{ x: 4 }, { x: -3 }, { x: 0 }], duration: 0.32, ease: "power2.out" });
    gsap.to(el, { scale: state === "loading" ? 1 : 1, duration: 0.2 });
  }, { scope, dependencies: [state] });
  const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    const rect = event.currentTarget.getBoundingClientRect(); const id = Date.now(); setRipples((items) => [...items, { id, x: event.clientX - rect.left, y: event.clientY - rect.top }]);
    window.setTimeout(() => setRipples((items) => items.filter((item) => item.id !== id)), 650);
    if (!disabled) onClick?.(event);
  };
  return <button ref={scope} {...props} disabled={disabled || state === "loading"} onClick={handleClick} className={`motion-button ${className} ${state}`} aria-busy={state === "loading"}>
    <span className="button-label">{state === "loading" ? "Working…" : state === "success" ? "Done" : state === "error" ? "Try again" : children}</span>
    {state === "loading" && <span className="button-spinner" aria-hidden="true" />}{state === "success" && <span aria-hidden="true">✓</span>}
    {ripples.map((r) => <i key={r.id} className="ripple" style={{ left: r.x, top: r.y }} />)}
  </button>;
}
