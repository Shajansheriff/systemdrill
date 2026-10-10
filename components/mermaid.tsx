"use client";
import { useEffect, useId, useState } from "react";
export function Mermaid({ chart }: { chart: string }) {
  const id = `diagram-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const [svg, setSvg] = useState("");
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let cancelled = false;
    import("mermaid").then(async ({ default: mermaid }) => {
      mermaid.initialize({ startOnLoad: false, securityLevel: "strict", theme: "base", themeVariables: { primaryColor: "#edf4ef", primaryTextColor: "#29463b", primaryBorderColor: "#91b29e", lineColor: "#638373", fontFamily: "system-ui" } });
      const result = await mermaid.render(id, chart);
      if (!cancelled) setSvg(result.svg);
    }).catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [chart, id]);
  return <figure className="diagram">{svg ? <div role="img" aria-label="Architecture diagram" dangerouslySetInnerHTML={{ __html: svg }}/> : <pre>{chart}</pre>}<details><summary>{failed ? "Diagram unavailable — view source" : "View diagram source"}</summary><pre>{chart}</pre></details></figure>;
}
