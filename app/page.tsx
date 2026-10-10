import Link from "next/link";
import { getDocuments } from "@/lib/content";
import { Library } from "@/components/library";
import { Icon } from "@/components/icons";
export default function Home() {
  const families = getDocuments().filter(d => d.section === "systems");
  return <>
    <div className="topbar"><span>THE ENGINEER’S FIELD GUIDE</span><span className="edition"><span className="live-dot"/>Senior / Staff edition</span></div>
    <div className="home-content">
      <section className="hero"><div><div className="eyebrow"><span/>LESS MEMORIZATION. MORE REASONING.</div><h1>Learn the problem.<br/><em>Then design the system.</em></h1><p>Go beyond “design the next big app.” Understand the invariants,<br className="desktop-break"/> failure modes, and trade-offs that shape every good architecture.</p><Link className="primary-button" href="/systems/01-read-heavy">Open the study book<Icon name="arrow" size={17}/></Link><Link className="text-button" href="/mental-models/interview-framework">How to use this book <span>↗</span></Link></div>
      <div className="hero-diagram" aria-label="Reasoning flow: invariant, failure, pattern, trade-off"><div className="diagram-caption">THINK IN FIRST PRINCIPLES</div><div className="diagram-node invariant"><span className="node-symbol">◎</span><div><small>01 / PROTECT</small><strong>The invariant</strong></div><span className="tiny-dot"/></div><div className="diagram-connector">↓<span>what must remain true?</span></div><div className="diagram-node"><span className="node-symbol">ϟ</span><div><small>02 / CHALLENGE</small><strong>The failure</strong></div></div><div className="diagram-connector">↓<span>where does simple break?</span></div><div className="diagram-node"><span className="node-symbol">◇</span><div><small>03 / REASON</small><strong>The pattern <span>→ trade-off</span></strong></div></div></div>
      </section>
      <div className="stats-strip"><div><strong>13</strong><span>problem families</span></div><div><strong>260</strong><span>recall questions</span></div><div><strong>8</strong><span>comparison sheets</span></div><div className="stats-philosophy"><Icon name="branch"/><span>One principle: every component<br/>must earn its place.</span></div></div>
      <section className="library-section"><div className="section-heading"><div><div className="eyebrow">THE CORE CURRICULUM</div><h2>Same building blocks. Different hard problems.</h2><p>Pick a family. Find its invariant. Follow the reasoning.</p></div><span className="section-badge">01 — 13</span></div><Library documents={families.map(({ body, source, slug, ...card }) => { void body; void source; void slug; return card; })}/></section>
      <section className="bottom-guides"><Link href="/patterns"><Icon name="layers"/><div><h3>Connect the patterns</h3><p>See where the same mechanism solves a different problem.</p></div><Icon name="arrow"/></Link><Link href="/mental-models/decision-trees"><Icon name="branch"/><div><h3>Find your next question</h3><p>Decision trees for the moments when “it depends.”</p></div><Icon name="arrow"/></Link></section>
      <footer>systemdrill<span>.</span><p>Understand the constraint. Explain the choice.</p><span>A living, Markdown-first study book</span></footer>
    </div>
  </>;
}
