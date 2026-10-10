import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import GithubSlugger from "github-slugger";
import { getDocuments, getDocument, sections } from "@/lib/content";
import { Markdown } from "@/components/markdown";
import { Library } from "@/components/library";
import { Icon } from "@/components/icons";
export const dynamicParams = false;
export function generateStaticParams() {
  return [...new Set([...getDocuments().map(d => d.slug), ...sections.map(s => s.key)])].map(s => ({ slug: s.split("/") }));
}
export async function generateMetadata({ params }: { params: Promise<{ slug: string[] }> }): Promise<Metadata> {
  const { slug } = await params;
  const doc = getDocument(slug.join("/"));
  return { title: doc?.title || sections.find(s => s.key === slug[0])?.label, description: doc?.description };
}
export default async function StudyPage({ params }: { params: Promise<{ slug: string[] }> }) {
  const { slug } = await params;
  const route = slug.join("/");
  const doc = getDocument(route);
  const section = sections.find(s => s.key === slug[0]);
  if (!section) notFound();
  if (!doc) {
    if (slug.length !== 1) notFound();
    const documents = getDocuments().filter(d => d.section === section.key);
    return <><div className="topbar"><Link href="/">Study book</Link><span>{section.label}</span></div><div className="collection-content"><div className="eyebrow">YOUR FIELD GUIDE</div><h1>{section.label}</h1><p className="collection-intro">{section.description}</p><Library documents={documents.map(({ body, source, slug, ...card }) => { void body; void source; void slug; return card; })} filterable={section.key === "systems"}/></div></>;
  }
  const siblings = getDocuments().filter(d => d.section === doc.section);
  const index = siblings.findIndex(d => d.slug === doc.slug);
  const slugger = new GithubSlugger();
  const headings = [...doc.body.matchAll(/^(#{2,3}) (.+)$/gm)].map(m => ({ level: m[1].length, text: m[2], id: slugger.slug(m[2]) }));
  const toc = headings.filter(h => h.level === 2);
  return <>
    <div className="topbar"><div className="breadcrumbs"><Link href="/">Study book</Link><span>/</span><Link href={`/${section.key}`}>{section.label}</Link><span>/</span><span>{String(doc.order).padStart(2, "0")}</span></div><span className="edition"><Icon name="clock" size={14}/>{doc.minutes} min read</span></div>
    <div className="reading-layout"><article className="study-article"><header className="article-header"><div className="eyebrow">{doc.section === "systems" ? "SYSTEM FAMILY" : section.label.toUpperCase()} / {String(doc.order).padStart(2, "0")}</div><h1>{doc.title}</h1><p>{doc.description}</p><div className="article-tags">{doc.tags.map(t => <span key={t}>{t}</span>)}</div></header>
    {doc.section === "systems" && <div className="chapter-roadmap">{["Invariants", "Naive failure", "Deep dives", "Patterns", "Study topics", "Quiz"].map((t, i) => <a key={t} href={`#${toc[i]?.id}`}><span>{String(i + 1).padStart(2, "0")}</span>{" "}{t}</a>)}</div>}
    <details className="mobile-toc"><summary>On this page</summary>{toc.map(h => <a key={h.id} href={`#${h.id}`}>{h.text}</a>)}</details>
    <Markdown body={doc.body} source={doc.source}/>
    <nav className="chapter-pagination" aria-label="Chapter navigation">{siblings[index - 1] ? <Link href={siblings[index - 1].href}><small>← PREVIOUS</small><strong>{siblings[index - 1].title}</strong></Link> : <Link href="/"><small>← BACK TO</small><strong>The study book</strong></Link>}{siblings[index + 1] && <Link href={siblings[index + 1].href}><small>NEXT CHAPTER →</small><strong>{siblings[index + 1].title}</strong></Link>}</nav><p className="source-note">Source: content/{doc.source} · Edit the Markdown to make this book your own.</p>
    </article><aside className="table-of-contents"><p>ON THIS PAGE</p>{toc.map(h => <a key={h.id} href={`#${h.id}`}>{h.text.replace(/^\d\. /, "")}</a>)}<div className="toc-note"><Icon name="target"/><strong>Practice the reasoning.</strong><span>Before revealing an answer, explain what breaks and why.</span></div></aside></div>
  </>;
}
