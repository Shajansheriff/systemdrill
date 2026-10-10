import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import GithubSlugger from "github-slugger";
import { getDocuments, resolveContentLink } from "../lib/content";

const documents = getDocuments();
const docsBySlug = new Map(documents.map(d => [d.slug, d]));
const families = documents.filter(d => d.section === "systems");
assert.equal(families.length, 13, "Expected 13 system families");
assert.equal(documents.filter(d => d.section === "comparisons").length, 8);
assert.equal(new Set(documents.map(d => d.slug)).size, documents.length, "Duplicate routes");
const headings = [
  "1. Absolutely Important Invariants", "2. Why the Naive Design Fails",
  "3. Core Deep Dives", "4. Canonical Solution Patterns", "5. Study Topics", "6. Quiz",
  "End-to-End Request Walkthrough", "What If This Fails?", "What Should Trigger In My Head?",
];
function anchors(body: string) {
  const slugger = new GithubSlugger();
  return new Set([...body.replace(/```[\s\S]*?```/g, "").matchAll(/^#{1,6} (.+)$/gm)].map(m => slugger.slug(m[1])));
}
let links = 0;
for (const doc of documents) {
  assert.ok(doc.title && doc.title !== "undefined", `${doc.source}: missing title`);
  assert.ok(doc.description && doc.description !== "undefined", `${doc.source}: missing description`);
  assert.ok(Number.isFinite(doc.order) && doc.order > 0, `${doc.source}: invalid order`);
  assert.ok(Array.isArray(doc.tags) && doc.tags.length > 0, `${doc.source}: missing tags`);
  assert.equal((doc.body.match(/^```/gm) || []).length % 2, 0, `${doc.source}: unclosed code fence`);
  for (const match of doc.body.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
    const href = match[1];
    if (/^https?:|^mailto:/.test(href)) continue;
    const [target, hash] = resolveContentLink(href, doc.source).split("#");
    const destination = target ? docsBySlug.get(target.replace(/^\//, "")) : doc;
    assert.ok(destination, `${doc.source}: broken link ${href}`);
    if (hash) assert.ok(anchors(destination.body).has(hash), `${doc.source}: broken anchor ${href}`);
    if (href.includes(".md")) assert.ok(fs.existsSync(path.resolve("content", path.dirname(doc.source), href.split("#")[0])), `${doc.source}: GitHub link missing`);
    links++;
  }
  if (doc.section !== "systems") continue;
  const actual = [...doc.body.matchAll(/^## (.+)$/gm)].map(m => m[1]);
  assert.deepEqual(actual, headings, `${doc.source}: section order differs`);
  assert.ok(doc.body.includes("### Primary invariants") && doc.body.includes("### Supporting invariants"));
  const dives = doc.body.split("## 3. Core Deep Dives")[1].split("## 4.")[0];
  const diveCount = [...dives.matchAll(/^### /gm)].length;
  assert.ok(diveCount >= 3 && diveCount <= 5, `${doc.source}: expected 3–5 deep dives`);
  for (const field of ["**Problem:**", "**Naive approach and why it fails:**", "**Common solution:**", "**Trade-off:**", "**Failure to probe:**", "**Interviewer follow-up:**"]) {
    assert.equal(dives.split(field).length - 1, diveCount, `${doc.source}: incomplete deep dive ${field}`);
  }
  const topics = doc.body.split("## 5. Study Topics")[1].split("## 6.")[0];
  const topicCount = [...topics.matchAll(/^### /gm)].length;
  for (const field of ["What problem does it solve?", "How does it work?", "Example", "Failure scenario", "Trade-offs", "When would I use it?", "Interview questions around this topic"]) {
    assert.equal(topics.split(`#### ${field}\n`).length - 1, topicCount, `${doc.source}: incomplete topic ${field}`);
  }
  const quiz = doc.body.split("## 6. Quiz")[1].split("## End-to-End")[0];
  const questions = quiz.split("<details>")[0];
  assert.equal([...questions.matchAll(/^\d+\. /gm)].length, 20, `${doc.source}: expected 20 questions`);
  assert.equal([...questions.split("### Scenario questions")[0].matchAll(/^\d+\. /gm)].length, 10);
  assert.equal([...questions.split("### Scenario questions")[1].split("### Trade-off questions")[0].matchAll(/^\d+\. /gm)].length, 5);
  assert.equal([...questions.split("### Trade-off questions")[1].matchAll(/^\d+\. /gm)].length, 5);
  assert.ok(quiz.includes("<summary>") && quiz.includes("</details>"));
  assert.equal([...quiz.split("<details>")[1].matchAll(/^\*\*\d+\.\*\*/gm)].length, 20, `${doc.source}: expected 20 answers`);
}
console.log(`Content verified: ${documents.length} documents, 13 complete families, 260 questions/answers, ${links} internal links.`);
