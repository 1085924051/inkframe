import type { ProjectFormat, ScriptLength, NarrativePerspective, SourceCharacter, SourceChapter, SourceDigest } from "../types";

export const SOURCE_CHUNK_CHARS = 12000;

function compact(value: string) {
  return value.replace(/\r/g, "").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

function unique(values: string[], limit: number) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean))).slice(0, limit);
}

export function splitSource(text: string, maxChars = SOURCE_CHUNK_CHARS): string[] {
  const normalized = compact(text);
  if (!normalized) return [];
  const paragraphs = normalized.split(/\n{2,}/);
  const chunks: string[] = [];
  let current = "";
  for (const paragraph of paragraphs) {
    if (paragraph.length > maxChars) {
      if (current) chunks.push(current.trim());
      for (let offset = 0; offset < paragraph.length; offset += maxChars) chunks.push(paragraph.slice(offset, offset + maxChars).trim());
      current = "";
      continue;
    }
    if (current && current.length + paragraph.length + 2 > maxChars) {
      chunks.push(current.trim());
      current = paragraph;
    } else current = current ? `${current}\n\n${paragraph}` : paragraph;
  }
  if (current) chunks.push(current.trim());
  return chunks;
}

function chapterTitles(text: string): string[] {
  return unique(text.split("\n").map((line) => line.trim()).filter((line) => /^(第.{1,12}[章节回卷]|chapter\s+\d+|#{1,3}\s+)/i.test(line) && line.length < 120), 200);
}

function constraintLines(text: string): string[] {
  return unique(text.split("\n").map((line) => line.trim()).filter((line) => line.length >= 6 && line.length <= 240 && /(必须|不能|不得|禁止|规则|设定|始终|永远|只有|不可以|不可|\bmust\b|\bcannot\b|\bmust not\b|\brule\b|\balways\b)/i.test(line)), 80);
}

function inferFormat(sourceChars: number, chapterCount: number): ProjectFormat {
  return sourceChars >= 120000 || chapterCount >= 8 ? "series" : "single";
}

function inferEpisodeCount(sourceChars: number, chapterCount: number, format: ProjectFormat) {
  if (format === "single") return 1;
  return Math.max(2, Math.min(100, Math.ceil(Math.max(sourceChars / 18000, chapterCount / 3))));
}

export function buildStyleEvidence(text: string, chunks = splitSource(text)) {
  const selected = chunks.length <= 16 ? chunks : [chunks[0], chunks[1], ...chunks.filter((_, index) => index % Math.ceil(chunks.length / 12) === 0).slice(0, 12), chunks[chunks.length - 2], chunks[chunks.length - 1]];
  return unique(selected.map((chunk) => compact(chunk).slice(0, 1400)), 16).join("\n\n--- SOURCE EXCERPT ---\n\n").slice(0, 22000);
}

export function buildLocalSourceDigest(text: string): SourceDigest {
  const normalized = compact(text);
  const chunks = splitSource(normalized);
  const titles = chapterTitles(normalized);
  const constraints = constraintLines(normalized);
  const format = inferFormat(normalized.length, titles.length);
  const episodeCount = inferEpisodeCount(normalized.length, titles.length, format);
  const scriptLength: ScriptLength = format === "series" ? "series" : normalized.length >= 8000 ? "feature" : normalized.length >= 3000 ? "long" : normalized.length >= 1200 ? "medium" : "short";
  const wordsPerEpisode = format === "series" ? Math.max(1200, Math.min(100000, Math.round(normalized.length / episodeCount / 2 / 100) * 100)) : Math.max(500, Math.min(100000, Math.round(normalized.length / 2 / 100) * 100));
  const opening = chunks.slice(0, 2).join("\n").slice(0, 2400);
  const ending = chunks.slice(-2).join("\n").slice(-1800);
  const plotSummary = `Opening evidence:\n${opening}\n\nEnding evidence:\n${ending}`.slice(0, 4500);
  const storyBible = [
    `Format: ${format}; suggested episodes: ${episodeCount}; words per episode: ${wordsPerEpisode}.`,
    titles.length ? `Chapter structure: ${titles.slice(0, 30).join("; ")}` : "Chapter structure: model extraction required.",
    constraints.length ? `Constraint candidates:\n${constraints.join("\n")}` : "Constraint candidates: none detected; review before generation.",
  ].join("\n");
  return {
    version: 1, sourceChars: normalized.length, chunkCount: chunks.length, chapterCount: titles.length,
    plotSummary, storyBible, constraints, characters: [] as SourceCharacter[], chapterOutline: titles.map((title) => ({ title })) as SourceChapter[],
    format, episodeCount, wordsPerEpisode, scriptLength, narrativePerspective: "third-person" as NarrativePerspective, styleEvidence: buildStyleEvidence(normalized, chunks),
  };
}
