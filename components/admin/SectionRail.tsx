"use client";
import Link from "next/link";
import { memo, useEffect, useState } from "react";
import type { IconName } from "./types";
import type { DemoState } from "./types";
import { Icon } from "./Icon";

export const SectionRail = memo(function SectionRail({ data }: { data: DemoState | null }) {
  const [active, setActive] = useState("overview");
  useEffect(() => {
    const sections = Array.from(document.querySelectorAll<HTMLElement>(".pp-screen[id]"));
    if (!sections.length) return;
    const observer = new IntersectionObserver((entries) => {
      const visible = entries.filter((entry) => entry.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (visible?.target.id) setActive(visible.target.id);
    }, { rootMargin: "-72px 0px -38% 0px", threshold: [0.12, 0.3, 0.55] });
    sections.forEach((section) => observer.observe(section)); return () => observer.disconnect();
  }, []);
  return <aside className="pp-rail" aria-label="Dashboard sections"><Link className="pp-mark" href="/" aria-label="PayProof storefront">p</Link><nav className="pp-rail-nav">
    <RailLink href="#overview" label="Overview" icon="grid" active={active === "overview"} onClick={() => setActive("overview")}/><RailLink href="#events" label="Payment events" icon="chart" active={active === "events"} onClick={() => setActive("events")}/><RailLink href="#orders" label="Orders" icon="receipt" active={active === "orders"} onClick={() => setActive("orders")}/><RailLink href="/owner/cases" label="Cases" icon="shield" count={data?.counters.openCases} active={false} onClick={() => {}}/><RailLink href="#inventory" label="Inventory" icon="box" active={active === "inventory"} onClick={() => setActive("inventory")}/>
  </nav><div className="pp-rail-bottom"><span className="pp-store-avatar" title="Little Things Supply">LT</span><span className="pp-live-dot" title="Simulated data"/></div></aside>;
});
function RailLink({ href, label, icon, active, count, onClick }: { href: string; label: string; icon: IconName; active: boolean; count?: number; onClick: () => void }) { return <a href={href} aria-label={label} title={label} aria-current={active ? "location" : undefined} onClick={onClick} className={`pp-rail-link ${active ? "active" : ""}`}><Icon name={icon}/>{Boolean(count) && <span>{count}</span>}</a>; }
