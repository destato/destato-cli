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

// Compact one-letter badges for a blocker's boolean sub-states, e.g. "F·S··".
export function statusFlags(b: {
  flagged: boolean;
  snoozedUntil: string | null;
  aging: boolean;
  delayed: boolean;
}): string {
  return (
    (b.flagged ? 'F' : '·') +
    (b.snoozedUntil ? 'S' : '·') +
    (b.aging ? 'A' : '·') +
    (b.delayed ? 'D' : '·')
  );
}
