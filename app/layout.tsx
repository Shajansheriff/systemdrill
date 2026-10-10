import type { Metadata } from "next";
import { Shell } from "@/components/shell";
import { getDocuments } from "@/lib/content";
import "./globals.css";
export const metadata: Metadata = { title: { default: "Systemdrill — A system design field guide", template: "%s · Systemdrill" }, description: "An invariant-first system design study book for senior and staff engineers. Thirteen problem families, reusable patterns, and active recall." };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const documents = getDocuments().map(({ href, title, section, order }) => ({ href, title, section, order }));
  return <html lang="en"><body><a className="skip-link" href="#main-content">Skip to content</a><Shell documents={documents}>{children}</Shell></body></html>;
}
