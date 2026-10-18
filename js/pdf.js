// A small PDF writer for the doctor summary. Printing from a home screen web
// app is unreliable on iPhone, so the summary is built as a PDF here and handed
// to the share sheet, which can print it, save it to Files, or mail it.
//
// Text only, in the two built-in Helvetica fonts, on US Letter pages.

// Advance widths (per 1000 units) for characters 32-126, from the standard
// Helvetica and Helvetica-Bold font metrics.
const WIDTHS = {
  F1: [
    278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556,
    556, 556, 278, 278, 584, 584, 584, 556, 1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778,
    667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556,
    556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584,
  ],
  F2: [
    278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556,
    556, 556, 333, 333, 584, 584, 584, 611, 975, 722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611, 833, 722, 778,
    667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 333, 278, 333, 584, 556, 333, 556, 611, 556, 611, 556, 333, 611,
    611, 278, 278, 556, 278, 889, 611, 611, 611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500, 389, 280, 389, 584,
  ],
};

const STYLES = {
  title: { font: 'F2', size: 18, lead: 24, before: 0 },
  sub: { font: 'F1', size: 10, lead: 14, before: 0, gray: true },
  h: { font: 'F2', size: 13, lead: 17, before: 12 },
  p: { font: 'F1', size: 10.5, lead: 14, before: 2 },
  li: { font: 'F1', size: 10.5, lead: 14, before: 1, indent: 12 },
  note: { font: 'F1', size: 9, lead: 12, before: 6, gray: true },
};

const PAGE_W = 612;
const PAGE_H = 792;
const MARGIN = 54;

// The built-in fonts only cover plain Latin text: fold accents and curly
// punctuation to ASCII and replace anything else.
export function toAscii(text) {
  return String(text)
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/…/g, '...')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\x20-\x7e]/g, '?');
}

export function textWidth(text, font, size) {
  let w = 0;
  for (const ch of text) w += WIDTHS[font][ch.charCodeAt(0) - 32] ?? 556;
  return (w * size) / 1000;
}

export function wrap(text, font, size, width) {
  const lines = [];
  let line = '';
  for (const word of text.split(' ')) {
    const next = line ? `${line} ${word}` : word;
    if (line && textWidth(next, font, size) > width) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  lines.push(line);
  return lines;
}

const pdfString = (s) => `(${s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)')})`;

// blocks: [{ kind: 'title' | 'sub' | 'h' | 'p' | 'li' | 'note', text }]
export function makePdf(blocks, { title = 'Migraine Diary', footer = '' } = {}) {
  const width = PAGE_W - 2 * MARGIN;
  const pages = [[]];
  let y = PAGE_H - MARGIN;
  for (const block of blocks) {
    const st = STYLES[block.kind] || STYLES.p;
    const indent = st.indent || 0;
    const lines = wrap(toAscii(block.text), st.font, st.size, width - indent);
    // Keep a heading on the same page as the line after it.
    const need = st.before + st.lead * (block.kind === 'h' ? 2 : 1);
    if (y - need < MARGIN && pages[pages.length - 1].length) {
      pages.push([]);
      y = PAGE_H - MARGIN;
    } else {
      y -= st.before;
    }
    lines.forEach((line, i) => {
      if (y - st.lead < MARGIN) {
        pages.push([]);
        y = PAGE_H - MARGIN;
      }
      y -= st.lead;
      const x = MARGIN + indent;
      const ops = [];
      if (block.kind === 'li' && i === 0) ops.push(`BT /F1 ${st.size} Tf 1 0 0 1 ${MARGIN + 2} ${y.toFixed(2)} Tm (-) Tj ET`);
      ops.push(`BT /${st.font} ${st.size} Tf 1 0 0 1 ${x} ${y.toFixed(2)} Tm ${pdfString(line)} Tj ET`);
      pages[pages.length - 1].push((st.gray ? '0.35 g ' : '0 g ') + ops.join(' '));
    });
  }

  const objects = [];
  const add = (body) => {
    objects.push(body);
    return objects.length;
  };
  const catalog = add('');
  const pagesObj = add('');
  const f1 = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
  const f2 = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
  const kids = [];
  pages.forEach((ops, i) => {
    const foot = toAscii(`${footer ? footer + '   ' : ''}Page ${i + 1} of ${pages.length}`);
    const footOps = `0.45 g BT /F1 8 Tf 1 0 0 1 ${MARGIN} ${MARGIN - 24} Tm ${pdfString(foot)} Tj ET`;
    const stream = [...ops, footOps].join('\n');
    const content = add(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
    kids.push(
      add(
        `<< /Type /Page /Parent ${pagesObj} 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Resources << /Font << /F1 ${f1} 0 R /F2 ${f2} 0 R >> >> /Contents ${content} 0 R >>`,
      ),
    );
  });
  objects[catalog - 1] = `<< /Type /Catalog /Pages ${pagesObj} 0 R >>`;
  objects[pagesObj - 1] = `<< /Type /Pages /Kids [${kids.map((k) => `${k} 0 R`).join(' ')}] /Count ${kids.length} >>`;
  const info = add(`<< /Title ${pdfString(toAscii(title))} >>`);

  let out = '%PDF-1.4\n';
  const offsets = [];
  objects.forEach((body, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) out += `${String(off).padStart(10, '0')} 00000 n \n`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root ${catalog} 0 R /Info ${info} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  // Everything above is ASCII, so each character is one byte.
  return Uint8Array.from(out, (c) => c.charCodeAt(0));
}
