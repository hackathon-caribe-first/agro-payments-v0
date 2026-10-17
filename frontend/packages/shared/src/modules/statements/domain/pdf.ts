// Dependency-free PDF 1.4 writer: A4, Helvetica / Helvetica-Bold with WinAnsi encoding, wrapped text, key/value rows, tables
// with fixed column widths (header repeated on every page), totals, and a header and footer with the page number.
// Pure: bytes in, bytes out. The caller decides what to do with them (see download-pdf.ts).

export interface PdfColumn {
  header: string;
  // Share of the table width (relative, any positive numbers).
  weight: number;
  align: "left" | "right";
}

export type PdfBlock =
  | { type: "heading"; text: string }
  | { type: "text"; text: string; muted?: boolean; bold?: boolean; size?: number }
  | { type: "keyValues"; rows: ReadonlyArray<readonly [string, string]> }
  | { type: "table"; columns: readonly PdfColumn[]; rows: ReadonlyArray<readonly string[]>; emptyText?: string }
  | { type: "totals"; rows: ReadonlyArray<{ label: string; value: string; strong?: boolean }> }
  | { type: "spacer"; height: number };

export interface PdfDoc {
  title: string;
  // Printed top-left on every page (the brand) and top-right (the document name).
  brand: string;
  runningTitle: string;
  footer: string;
  // ISO instant; goes to the metadata only.
  createdAt: string;
  blocks: readonly PdfBlock[];
}

// ---- metrics ---------------------------------------------------------------------------------------------------------

export const PAGE = { width: 595.28, height: 841.89, margin: 40, headerHeight: 34, footerHeight: 30 } as const;

// Helvetica advance widths (1/1000 em) for the printable ASCII range 32..126.
const REGULAR = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556, 1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722,
  778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584,
];
const BOLD = [
  278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 333, 333, 584, 584, 584, 611, 975, 722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611, 833, 722,
  778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 333, 278, 333, 584, 556, 333, 556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556, 278, 889, 611, 611, 611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500, 389, 280, 389, 584,
];

// cp1252 code points of 0x80..0x9F that are not in Latin-1.
const CP1252_EXTRA: Record<number, number> = {
  0x20ac: 0x80, 0x201a: 0x82, 0x0192: 0x83, 0x201e: 0x84, 0x2026: 0x85, 0x2020: 0x86, 0x2021: 0x87, 0x02c6: 0x88, 0x2030: 0x89, 0x0160: 0x8a,
  0x2039: 0x8b, 0x0152: 0x8c, 0x017d: 0x8e, 0x2018: 0x91, 0x2019: 0x92, 0x201c: 0x93, 0x201d: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97,
  0x02dc: 0x98, 0x2122: 0x99, 0x0161: 0x9a, 0x203a: 0x9b, 0x0153: 0x9c, 0x017e: 0x9e, 0x0178: 0x9f,
};

// Text -> WinAnsi byte values (one per output character). Anything outside WinAnsi becomes "?"; every kind of space becomes " ".
export function toWinAnsi(text: string): number[] {
  const out: number[] = [];
  for (const char of text.normalize("NFC")) {
    const cp = char.codePointAt(0) ?? 63;
    if (cp === 0x00a0 || cp === 0x202f || cp === 0x2009 || cp === 0x2007 || cp === 0x200a) out.push(32);
    else if (cp === 0x200b || cp === 0x00ad || cp < 32) continue;
    else if (cp < 127) out.push(cp);
    else if (cp >= 0xa0 && cp <= 0xff) out.push(cp);
    else out.push(CP1252_EXTRA[cp] ?? 63);
  }
  return out;
}

// Accented Latin-1 letters measure like their base letter.
const BASE_LETTER: Record<string, string> = {
  À: "A", Á: "A", Â: "A", Ã: "A", Ä: "A", Å: "A", Ç: "C", È: "E", É: "E", Ê: "E", Ë: "E", Ì: "I", Í: "I", Î: "I", Ï: "I", Ñ: "N",
  Ò: "O", Ó: "O", Ô: "O", Õ: "O", Ö: "O", Ù: "U", Ú: "U", Û: "U", Ü: "U", Ý: "Y", à: "a", á: "a", â: "a", ã: "a", ä: "a", å: "a",
  ç: "c", è: "e", é: "e", ê: "e", ë: "e", ì: "i", í: "i", î: "i", ï: "i", ñ: "n", ò: "o", ó: "o", ô: "o", õ: "o", ö: "o", ù: "u",
  ú: "u", û: "u", ü: "u", ý: "y", ÿ: "y",
};

function charWidth(byte: number, bold: boolean): number {
  const table = bold ? BOLD : REGULAR;
  if (byte >= 32 && byte <= 126) return table[byte - 32];
  const base = BASE_LETTER[String.fromCharCode(byte)];
  if (base) return table[base.charCodeAt(0) - 32];
  if (byte === 0xb7) return 278; // middle dot
  if (byte === 0x96) return 556; // en dash
  if (byte === 0x97) return 1000; // em dash
  return 556;
}

export function textWidth(text: string, size: number, bold = false): number {
  let units = 0;
  for (const byte of toWinAnsi(text)) units += charWidth(byte, bold);
  return (units * size) / 1000;
}

// Greedy word wrap; a token wider than the line (a long id) is cut where it overflows.
export function wrapText(text: string, size: number, bold: boolean, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split(/\r?\n/)) {
    let line = "";
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const candidate = line ? `${line} ${word}` : word;
      if (textWidth(candidate, size, bold) <= maxWidth) {
        line = candidate;
        continue;
      }
      if (line) lines.push(line);
      line = "";
      let rest = word;
      while (textWidth(rest, size, bold) > maxWidth && rest.length > 1) {
        let cut = rest.length - 1;
        while (cut > 1 && textWidth(rest.slice(0, cut), size, bold) > maxWidth) cut -= 1;
        lines.push(rest.slice(0, cut));
        rest = rest.slice(cut);
      }
      line = rest;
    }
    lines.push(line);
  }
  return lines;
}

// ---- page layout -----------------------------------------------------------------------------------------------------

const num = (n: number): string => (Math.round(n * 100) / 100).toString();
const esc = (text: string): string =>
  toWinAnsi(text)
    .map((b) => {
      const c = String.fromCharCode(b);
      return c === "\\" || c === "(" || c === ")" ? `\\${c}` : c;
    })
    .join("");

const GRAY_FILL = "0.94 g";
const INK = "0.09 g";
const MUTED = "0.42 g";
const RULE = "0.82 G";

interface Cursor {
  pages: string[][];
  y: number;
}

class Layout {
  readonly cursor: Cursor = { pages: [[]], y: PAGE.height - PAGE.margin - PAGE.headerHeight };
  private readonly left: number = PAGE.margin;
  readonly width = PAGE.width - PAGE.margin * 2;
  private readonly floor = PAGE.margin + PAGE.footerHeight;

  private get ops(): string[] {
    return this.cursor.pages[this.cursor.pages.length - 1];
  }

  private newPage() {
    this.cursor.pages.push([]);
    this.cursor.y = PAGE.height - PAGE.margin - PAGE.headerHeight;
  }

  // Starts a new page unless `height` still fits.
  private ensure(height: number, onNewPage?: () => void) {
    if (this.cursor.y - height >= this.floor) return;
    this.newPage();
    onNewPage?.();
  }

  private text(x: number, y: number, value: string, size: number, bold: boolean, color = INK) {
    this.ops.push(`BT ${color} /${bold ? "F2" : "F1"} ${num(size)} Tf ${num(x)} ${num(y)} Td (${esc(value)}) Tj ET`);
  }

  private rule(y: number, x1 = this.left, x2 = this.left + this.width) {
    this.ops.push(`${RULE} 0.5 w ${num(x1)} ${num(y)} m ${num(x2)} ${num(y)} l S`);
  }

  spacer(height: number) {
    this.cursor.y -= height;
  }

  // `keep`: height of what must stay on the same page as the heading (a totals box is never split from its title).
  heading(value: string, keep = 0) {
    this.ensure(40 + keep);
    this.cursor.y -= 12;
    this.text(this.left, this.cursor.y - 11, value, 12, true);
    this.cursor.y -= 18;
    this.rule(this.cursor.y);
    this.cursor.y -= 6;
  }

  paragraph(value: string, opts: { muted?: boolean; bold?: boolean; size?: number } = {}) {
    const size = opts.size ?? 9;
    for (const line of wrapText(value, size, opts.bold === true, this.width)) {
      this.ensure(size + 4);
      this.text(this.left, this.cursor.y - size, line, size, opts.bold === true, opts.muted ? MUTED : INK);
      this.cursor.y -= size + 4;
    }
  }

  keyValues(rows: ReadonlyArray<readonly [string, string]>) {
    const labelWidth = 110;
    for (const [label, value] of rows) {
      const lines = wrapText(value, 9, false, this.width - labelWidth);
      this.ensure(lines.length * 12 + 2);
      this.text(this.left, this.cursor.y - 9, label, 9, false, MUTED);
      for (const line of lines) {
        this.text(this.left + labelWidth, this.cursor.y - 9, line, 9, false);
        this.cursor.y -= 12;
      }
      this.cursor.y -= 2;
    }
  }

  table(columns: readonly PdfColumn[], rows: ReadonlyArray<readonly string[]>, emptyText?: string) {
    const pad = 4;
    const totalWeight = columns.reduce((t, c) => t + c.weight, 0);
    const widths = columns.map((c) => (c.weight / totalWeight) * this.width);
    const size = 8.5;
    const leading = 11;

    const header = () => {
      const lines = columns.map((c, i) => wrapText(c.header, size, true, widths[i] - pad * 2));
      const height = Math.max(...lines.map((l) => l.length)) * leading + 6;
      this.ops.push(`${GRAY_FILL} ${num(this.left)} ${num(this.cursor.y - height)} ${num(this.width)} ${num(height)} re f`);
      let x = this.left;
      columns.forEach((c, i) => {
        lines[i].forEach((line, k) => {
          const w = textWidth(line, size, true);
          const tx = c.align === "right" ? x + widths[i] - pad - w : x + pad;
          this.text(tx, this.cursor.y - 3 - size - k * leading, line, size, true);
        });
        x += widths[i];
      });
      this.cursor.y -= height;
    };

    this.ensure(60);
    header();
    if (rows.length === 0) {
      this.ensure(20);
      this.text(this.left + pad, this.cursor.y - 5 - size, emptyText ?? "Sin registros.", size, false, MUTED);
      this.cursor.y -= 20;
      this.rule(this.cursor.y);
      return;
    }
    for (const row of rows) {
      const cells = columns.map((c, i) => wrapText(row[i] ?? "", size, false, widths[i] - pad * 2));
      const height = Math.max(...cells.map((l) => l.length)) * leading + 6;
      this.ensure(height, header);
      let x = this.left;
      columns.forEach((c, i) => {
        cells[i].forEach((line, k) => {
          const w = textWidth(line, size, false);
          const tx = c.align === "right" ? x + widths[i] - pad - w : x + pad;
          this.text(tx, this.cursor.y - 3 - size - k * leading, line, size, false);
        });
        x += widths[i];
      });
      this.cursor.y -= height;
      this.rule(this.cursor.y);
    }
  }

  totals(rows: ReadonlyArray<{ label: string; value: string; strong?: boolean }>) {
    const boxWidth = Math.min(this.width, 330);
    const x = this.left + this.width - boxWidth;
    for (const row of rows) {
      const size = row.strong ? 10 : 9;
      const labelLines = wrapText(row.label, size, row.strong === true, boxWidth - 120);
      const height = labelLines.length * 13 + 4;
      this.ensure(height);
      labelLines.forEach((line, k) => this.text(x, this.cursor.y - 3 - size - k * 13, line, size, row.strong === true));
      const w = textWidth(row.value, size, true);
      this.text(this.left + this.width - w, this.cursor.y - 3 - size, row.value, size, true);
      this.cursor.y -= height;
      this.rule(this.cursor.y, x, this.left + this.width);
    }
  }
}

// Running header (brand + document name) and footer (note + "Página n de N") on every page.
function decorate(pages: string[][], doc: PdfDoc): string[] {
  return pages.map((ops, index) => {
    const top = PAGE.height - PAGE.margin;
    const header = [
      `BT ${INK} /F2 14 Tf ${num(PAGE.margin)} ${num(top - 14)} Td (${esc(doc.brand)}) Tj ET`,
      `BT ${MUTED} /F1 8.5 Tf ${num(PAGE.width - PAGE.margin - textWidth(doc.runningTitle, 8.5))} ${num(top - 12)} Td (${esc(doc.runningTitle)}) Tj ET`,
      `${RULE} 0.7 w ${num(PAGE.margin)} ${num(top - 22)} m ${num(PAGE.width - PAGE.margin)} ${num(top - 22)} l S`,
    ];
    const label = `Página ${index + 1} de ${pages.length}`;
    const foot = PAGE.margin + 4;
    const footer = [
      `${RULE} 0.7 w ${num(PAGE.margin)} ${num(foot + 12)} m ${num(PAGE.width - PAGE.margin)} ${num(foot + 12)} l S`,
      `BT ${MUTED} /F1 8 Tf ${num(PAGE.margin)} ${num(foot)} Td (${esc(doc.footer)}) Tj ET`,
      `BT ${MUTED} /F1 8 Tf ${num(PAGE.width - PAGE.margin - textWidth(label, 8))} ${num(foot)} Td (${esc(label)}) Tj ET`,
    ];
    return [...header, ...ops, ...footer].join("\n");
  });
}

// ---- file assembly ---------------------------------------------------------------------------------------------------

const pdfDate = (iso: string): string => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "D:20000101000000Z";
  const p = (n: number, w = 2) => String(n).padStart(w, "0");
  return `D:${p(d.getUTCFullYear(), 4)}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}Z`;
};

export function buildPdf(doc: PdfDoc): Uint8Array {
  const layout = new Layout();
  for (const [index, block] of doc.blocks.entries()) {
    switch (block.type) {
      case "heading": {
        const next = doc.blocks[index + 1];
        layout.heading(block.text, next?.type === "totals" ? next.rows.length * 18 : 0);
        break;
      }
      case "text":
        layout.paragraph(block.text, block);
        break;
      case "keyValues":
        layout.keyValues(block.rows);
        break;
      case "table":
        layout.table(block.columns, block.rows, block.emptyText);
        layout.spacer(8);
        break;
      case "totals":
        layout.totals(block.rows);
        layout.spacer(8);
        break;
      case "spacer":
        layout.spacer(block.height);
        break;
    }
  }
  const contents = decorate(layout.cursor.pages, doc);

  // Object numbers: 1 catalog, 2 pages, 3 Helvetica, 4 Helvetica-Bold, 5 info, then (page, content) pairs.
  const pageCount = contents.length;
  const objects: string[] = [];
  const pageRef = (i: number) => 6 + i * 2;
  objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objects[2] = `<< /Type /Pages /Count ${pageCount} /Kids [${contents.map((_, i) => `${pageRef(i)} 0 R`).join(" ")}] >>`;
  objects[3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>";
  objects[4] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>";
  objects[5] = `<< /Title (${esc(doc.title)}) /Producer (Surco) /Creator (Surco) /CreationDate (${pdfDate(doc.createdAt)}) >>`;
  contents.forEach((content, i) => {
    objects[pageRef(i)] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE.width} ${PAGE.height}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${pageRef(i) + 1} 0 R >>`;
    // Content streams are already WinAnsi "binary strings": string length equals byte length.
    objects[pageRef(i) + 1] = `<< /Length ${content.length} >>\nstream\n${content}\nendstream`;
  });

  // The whole file is a binary string (one char = one byte) so every offset is a plain string length.
  let file = "%PDF-1.4\n%âãÏÓ\n";
  const offsets: number[] = [];
  for (let n = 1; n < objects.length; n += 1) {
    offsets[n] = file.length;
    file += `${n} 0 obj\n${objects[n]}\nendobj\n`;
  }
  const xref = file.length;
  const size = objects.length;
  file += `xref\n0 ${size}\n0000000000 65535 f \n`;
  for (let n = 1; n < size; n += 1) file += `${String(offsets[n]).padStart(10, "0")} 00000 n \n`;
  file += `trailer\n<< /Size ${size} /Root 1 0 R /Info 5 0 R >>\nstartxref\n${xref}\n%%EOF\n`;

  const bytes = new Uint8Array(file.length);
  for (let i = 0; i < file.length; i += 1) bytes[i] = file.charCodeAt(i) & 0xff;
  return bytes;
}
