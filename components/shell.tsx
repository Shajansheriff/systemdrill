"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Icon } from "./icons";
import type { Document } from "@/lib/content";
type NavDoc = Pick<Document, "href" | "title" | "section" | "order">;
const groups = [ ["systems", "System families", "grid"], ["patterns", "Pattern library", "layers"], ["comparisons", "Comparisons", "compare"], ["mental-models", "Mental models", "branch"] ];
export function Shell({ documents, children }: { documents: NavDoc[]; children: React.ReactNode }) {
  const pathname = usePathname().replace(/\/$/, "") || "/";
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const dismiss = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", dismiss);
    return () => window.removeEventListener("keydown", dismiss);
  }, [open]);
  return <div className="app-shell">
    <header className="mobile-header"><Link href="/" className="brand"><span className="brand-mark"><Icon name="book"/></span>systemdrill<span className="brand-dot">.</span></Link><button className="icon-button" onClick={() => setOpen(!open)} aria-label={open ? "Close navigation" : "Open navigation"} aria-expanded={open} aria-controls="book-navigation"><Icon name={open ? "close" : "menu"}/></button></header>
    {open && <button className="nav-backdrop" aria-label="Close navigation" onClick={() => setOpen(false)}/>}
    <aside id="book-navigation" className={`sidebar ${open ? "is-open" : ""}`}>
      <Link href="/" className="brand" onClick={() => setOpen(false)}><span className="brand-mark"><Icon name="book"/></span>systemdrill<span className="brand-dot">.</span></Link>
      <p className="sidebar-subtitle">THE SYSTEM DESIGN STUDY BOOK</p>
      <nav aria-label="Main navigation" onClick={() => setOpen(false)}>
        <Link href="/" className={`nav-link ${pathname === "/" ? "active" : ""}`}><Icon name="book"/>Overview</Link>
        <p className="nav-label">YOUR FIELD GUIDE</p>
        {groups.map(([key, label, icon]) => <div key={key}>
          <Link href={`/${key}`} className={`nav-link ${pathname === `/${key}` ? "active" : ""}`}><Icon name={icon}/>{label}{key === "systems" && <span className="nav-count">13</span>}</Link>
          {key === "systems" && <div className="chapter-nav">{documents.filter(d => d.section === "systems").map(d => <Link href={d.href} key={d.href} className={pathname === d.href ? "current" : ""} aria-current={pathname === d.href ? "page" : undefined}><span>{String(d.order).padStart(2, "0")}</span>{d.title}</Link>)}</div>}
        </div>)}
      </nav>
      <div className="sidebar-note"><span className="live-dot"/>Built for deeper understanding<p>Start with the invariant.<br/>Let the architecture follow.</p></div>
    </aside>
    <main id="main-content" className="main">{children}</main>
  </div>;
}
