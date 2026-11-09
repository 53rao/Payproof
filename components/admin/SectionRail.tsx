"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { memo, useEffect, useState } from "react";
import type { IconName } from "./types";
import { Icon } from "./Icon";

export const SectionRail = memo(function SectionRail() {
  const pathname = usePathname();
  const isDashboard = pathname === "/admin";
  const [active, setActive] = useState("overview");

  useEffect(() => {
    if (!isDashboard) return;
    const sectionIds = ["events", "orders"];
    const update = () => {
      if (window.scrollY < 140) {
        setActive("overview");
        return;
      }
      let current = "overview";
      for (const id of sectionIds) {
        const section = document.getElementById(id);
        if (section && section.getBoundingClientRect().top <= 180) current = id;
      }
      setActive(current);
    };
    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [isDashboard]);

  const sectionHref = (id: string) => isDashboard ? `#${id}` : `/admin#${id}`;
  return <aside className="pp-rail" aria-label="Dashboard sections"><Link className="pp-mark" href="/" aria-label="PayProof storefront">p</Link><nav className="pp-rail-nav">
    <RailLink href={sectionHref("overview")} label="Overview" icon="grid" active={isDashboard && active === "overview"} onClick={() => setActive("overview")}/><RailLink href={sectionHref("events")} label="Payment events" icon="chart" active={isDashboard && active === "events"} onClick={() => setActive("events")}/><RailLink href={sectionHref("orders")} label="Orders" icon="receipt" active={isDashboard && active === "orders"} onClick={() => setActive("orders")}/>
  </nav><div className="pp-rail-bottom"><span className="pp-store-avatar" title="Little Things Supply">LT</span><span className="pp-live-dot" title="Simulated data"/></div></aside>;
});
function RailLink({ href, label, icon, active, onClick }: { href: string; label: string; icon: IconName; active: boolean; onClick: () => void }) { return <a href={href} aria-label={label} title={label} aria-current={active ? "location" : undefined} onClick={onClick} className={`pp-rail-link ${active ? "active" : ""}`}><Icon name={icon}/></a>; }
