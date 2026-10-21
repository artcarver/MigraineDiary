// Handing files and text to the iPhone share sheet, with a download as the
// fallback elsewhere.

import { toast } from './ui.js';

// Returns false only when the person closed the share sheet.
export async function shareFiles(files, title) {
  try {
    if (navigator.canShare && navigator.canShare({ files })) {
      await navigator.share({ files, title });
      return true;
    }
  } catch (err) {
    if (err && err.name === 'AbortError') return false;
  }
  for (const f of files) {
    const url = URL.createObjectURL(f);
    const a = document.createElement('a');
    a.href = url;
    a.download = f.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }
  return true;
}

export async function shareText(text, title) {
  try {
    if (navigator.share) {
      await navigator.share({ title, text });
      return;
    }
  } catch (err) {
    if (err && err.name === 'AbortError') return;
  }
  try {
    await navigator.clipboard.writeText(text);
    toast('Copied. Paste it into a message or email.');
  } catch {
    toast('Sharing is not available here.');
  }
}
