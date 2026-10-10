"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { Document } from "@/lib/content";
import { Icon } from "./icons";
type Card = Pick<Document, "href" | "title" | "description" | "order" | "tags" | "minutes" | "section">;
export function Library({ documents, filterable = true }: { documents: Card[]; filterable?: boolean }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("All families");
  const searchRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    function focusSearch(event: KeyboardEvent) {
      const target = event.target as HTMLElement;
      if (event.key === "/" && !event.metaKey && !event.ctrlKey && !event.altKey && !target.closest("input, textarea, [contenteditable=true]")) {
        event.preventDefault();
        searchRef.current?.focus();
      }
    }
    window.addEventListener("keydown", focusSearch);
    return () => window.removeEventListener("keydown", focusSearch);
  }, []);
  const filtered = documents.filter(d => `${d.title} ${d.description} ${d.tags.join(" ")}`.toLowerCase().includes(query.toLowerCase()) && (filter === "All families" || d.tags.includes(filter)));
  return <>
    <div className="library-tools"><div className="filter-tabs" aria-label="Filter system families">{(filterable ? ["All families", "Correctness", "Scale", "Real time"] : ["All guides"]).map(f => <button key={f} aria-pressed={filter === f || !filterable} onClick={() => setFilter(f === "All guides" ? "All families" : f)} className={filter === f || !filterable ? "selected" : ""}>{f}</button>)}</div><label className="search"><Icon name="search" size={17}/><input ref={searchRef} aria-label="Search study guides" placeholder="Find a topic…" value={query} onChange={e => setQuery(e.target.value)}/><kbd>/</kbd></label></div>
    <div className="card-grid">{filtered.map(d => <Link className="family-card" href={d.href} key={d.href}>
      <div className="card-top"><span className={`family-icon color-${(d.order - 1) % 5}`}><Icon name={d.tags.includes("Real time") ? "branch" : d.tags.includes("Correctness") ? "target" : "layers"}/></span><span className="chapter-number">{d.section === "systems" ? "CHAPTER" : "GUIDE"} {String(d.order).padStart(2, "0")}</span><Icon name="arrow" size={17}/></div>
      <h3>{d.title}</h3><p>{d.description}</p><div className="card-tags">{d.tags.slice(0, 2).map(t => <span key={t}>{t}</span>)}</div>
      <div className="card-bottom"><span><Icon name="clock" size={14}/>{d.minutes} min read</span><span>{d.section === "systems" ? "20 recall questions" : "Decision guide"}</span></div>
    </Link>)}</div>
    {!filtered.length && <div className="empty-state"><Icon name="search" size={30}/><h3>No matching guides</h3><p>Try a family, invariant, or pattern such as “ordering”.</p><button onClick={() => { setQuery(""); setFilter("All families"); }}>Clear filters</button></div>}
    <p className="result-count" aria-live="polite">{filtered.length} {filtered.length === 1 ? "guide" : "guides"} · Designed to be studied, questioned, and revisited.</p>
  </>;
}
