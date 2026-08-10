// Rendering helpers. Everything the CLI prints goes through here so a global
// --json flag can switch the whole tool to machine-readable output.

export function printJson(data: unknown): void {
  process.stdout.write(JSON.stringify(data, null, 2) + '\n');
}

export interface Column<T> {
  header: string;
  value: (row: T) => string;
}

// A small fixed-width table - no dependency, no color. Columns are padded to the
// widest cell; the last column is left unpadded so long titles don't add
// trailing whitespace.
export function printTable<T>(rows: T[], columns: Column<T>[]): void {
  if (rows.length === 0) {
    process.stdout.write('No results.\n');
    return;
  }

  const cells = rows.map((row) => columns.map((c) => c.value(row) ?? ''));
  const widths = columns.map((c, i) =>
    Math.max(c.header.length, ...cells.map((r) => r[i].length)),
  );

  const line = (values: string[]) =>
    values
      .map((v, i) => (i === values.length - 1 ? v : v.padEnd(widths[i])))
      .join('  ')
      .trimEnd();

  process.stdout.write(line(columns.map((c) => c.header)) + '\n');
  process.stdout.write(
    widths.map((w) => '-'.repeat(w)).join('  ').trimEnd() + '\n',
  );
  for (const r of cells) process.stdout.write(line(r) + '\n');
}

// Compact one-letter badges for a blocker's state labels, e.g. "F·S···".
// L is for lapsing: the blocker will close itself unless someone confirms it.
export function statusFlags(b: { labels: string[] }): string {
  return (
    (b.labels.includes('flagged') ? 'F' : '·') +
    (b.labels.includes('snoozed') ? 'S' : '·') +
    (b.labels.includes('aging') ? 'A' : '·') +
    (b.labels.includes('delayed') ? 'D' : '·') +
    (b.labels.includes('decaying') ? 'L' : '·')
  );
}

// "lapses in 3d", or null when the blocker is not decaying. Days rather than an
// exact time: the CLI is glanced at, and the detail view carries the date.
export function lapsesInText(b: { lapsesAt?: string | null }): string | null {
  if (!b.lapsesAt) return null;
  const days = Math.max(
    0,
    Math.ceil((new Date(b.lapsesAt).getTime() - Date.now()) / 86_400_000),
  );
  return days <= 1 ? 'lapses within a day' : `lapses in ${days}d`;
}
