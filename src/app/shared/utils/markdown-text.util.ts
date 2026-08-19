/**
 * Strips Markdown syntax down to readable prose.
 *
 * Search snippets are cut straight out of a message's raw Markdown `content`,
 * so without this the sidebar previews leak the source markers — results read
 * as `**Data analysis with pandas**` and `### Workbook` instead of plain text.
 *
 * This is deliberately a lightweight cleanup, not a parser: it only needs to
 * make a ~80 character preview legible.
 */
export function markdownToPlainText(input: string): string {
  if (!input) {
    return '';
  }

  return input
    // Fenced code blocks -> keep the code, drop the fences and language tag.
    .replace(/```[\w-]*\n?([\s\S]*?)```/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    // Images before links, so the alt text doesn't survive as a bare "!".
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    // Emphasis: bold, italic, strikethrough.
    .replace(/(\*\*\*|___)(.*?)\1/g, '$2')
    .replace(/(\*\*|__)(.*?)\1/g, '$2')
    .replace(/(\*|_)(.*?)\1/g, '$2')
    .replace(/~~(.*?)~~/g, '$1')
    // Block markers at the start of a line.
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/^\s{0,3}>\s?/gm, '')
    .replace(/^\s{0,3}([-*+]|\d+\.)\s+/gm, '')
    .replace(/^\s{0,3}([-*_]\s*){3,}$/gm, '')
    // Table pipes and separator rows.
    .replace(/^\s*\|?[\s:|-]{5,}\|?\s*$/gm, '')
    .replace(/\s*\|\s*/g, ' ')
    // Collapse the whitespace the removals leave behind.
    .replace(/\s+/g, ' ')
    .trim();
}
