import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";

export type Section = "systems" | "patterns" | "comparisons" | "mental-models";
export type Document = {
  slug: string; href: string; section: Section; title: string;
  description: string; order: number; tags: string[]; body: string;
  minutes: number; source: string;
};
export const sections: { key: Section; label: string; description: string }[] = [
  { key: "systems", label: "System families", description: "Thirteen recurring problems. Learn what makes each one hard." },
  { key: "patterns", label: "Pattern library", description: "Learn a mechanism once. Recognize where it belongs." },
  { key: "comparisons", label: "Comparisons", description: "Make the trade-off explicit before choosing a tool." },
  { key: "mental-models", label: "Mental models", description: "A repeatable way to reason when the prompt is unfamiliar." },
];
function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(file) : entry.name.endsWith(".md") ? [file] : [];
  });
}
export function getDocuments(): Document[] {
  const root = path.join(process.cwd(), "content");
  return walk(root).map((file) => {
    const source = path.relative(root, file).replaceAll(path.sep, "/");
    const { data, content } = matter(fs.readFileSync(file, "utf8"));
    const slug = source.replace(/\/index\.md$|\.md$/g, "");
    return {
      slug, href: `/${slug}`, section: source.split("/")[0] as Section,
      title: String(data.title), description: String(data.description),
      order: Number(data.order || 0), tags: (data.tags || []) as string[],
      body: content, minutes: Math.max(1, Math.ceil(content.split(/\s+/).length / 190)), source,
    };
  }).sort((a, b) => a.order - b.order || a.slug.localeCompare(b.slug));
}
export function getDocument(slug: string) { return getDocuments().find((doc) => doc.slug === slug); }
export function resolveContentLink(href: string, source: string): string {
  if (/^(https?:|mailto:|#|\/)/.test(href) || !href.includes(".md")) return href;
  const [file, hash] = href.split("#");
  const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(source), file));
  return `/${resolved.replace(/\/index\.md$|\.md$/g, "")}${hash ? `#${hash}` : ""}`;
}
