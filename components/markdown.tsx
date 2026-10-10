import { isValidElement, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import rehypeSanitize from "rehype-sanitize";
import rehypeSlug from "rehype-slug";
import Link from "next/link";
import { Mermaid } from "./mermaid";
import { resolveContentLink } from "@/lib/content";
export function Markdown({ body, source }: { body: string; source: string }) {
  return <div className="prose"><ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw, rehypeSanitize, rehypeSlug]} components={{
    a: ({ href = "", children }) => { const target = resolveContentLink(href, source); return target.startsWith("/") ? <Link href={target}>{children}</Link> : <a href={target}>{children}</a>; },
    pre: ({ children }) => {
      if (isValidElement<{ className?: string; children?: ReactNode }>(children) && children.props.className === "language-mermaid") {
        return <Mermaid chart={String(children.props.children).trim()}/>;
      }
      return <div className="code-wrapper"><pre tabIndex={0} role="region" aria-label="Code example, scroll horizontally if needed">{children}</pre></div>;
    },
    table: ({ children }) => <div className="table-wrapper" tabIndex={0} role="region" aria-label="Study table, scroll horizontally if needed"><table>{children}</table></div>,
  }}>{body}</ReactMarkdown></div>;
}
