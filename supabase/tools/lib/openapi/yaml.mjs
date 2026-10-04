// A small, dependency-free YAML emitter for JSON-compatible values (what the OpenAPI document is). Output is stable: object keys keep insertion
// order, strings are quoted only when YAML would misread them, multi-line strings use block scalars. Verified by round-tripping through
// PyYAML in the generator's --verify mode (see gen-openapi.mjs).

const RESERVED = new Set(['', 'null', 'Null', 'NULL', '~', 'true', 'True', 'TRUE', 'false', 'False', 'FALSE', 'yes', 'Yes', 'YES', 'no', 'No', 'NO', 'on', 'On', 'ON', 'off', 'Off', 'OFF', 'y', 'Y', 'n', 'N']);

function needsQuotes(s) {
  if (RESERVED.has(s)) return true;
  if (/^[-+]?(\d[\d_]*)(\.\d*)?([eE][-+]?\d+)?$/.test(s)) return true; // looks like a number
  if (/^0[xob][0-9a-fA-F]+$/.test(s)) return true;
  if (/^[-+]?[0-9][0-9_]*(:[0-5]?[0-9])+(\.[0-9_]*)?$/.test(s)) return true; // YAML 1.1 sexagesimal numbers: 9:16. reads as 556.0
  if (/^[-+]?\.(inf|Inf|INF)$|^\.(nan|NaN|NAN)$/.test(s)) return true;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return true; // looks like a timestamp
  if (/^[\s]|[\s]$/.test(s)) return true;
  if (/^[-?:,\[\]{}#&*!|>'"%@`]/.test(s)) return true;
  if (/: |:$| #|^#/.test(s)) return true;
  if (/[\x00-\x08\x0b-\x1f\x7f]/.test(s)) return true;
  return false;
}

function scalar(v, indent) {
  if (v === null) return 'null';
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) throw new Error('non-finite number in OpenAPI document');
    return String(v);
  }
  const s = String(v);
  if (s.includes('\n') && !/[\x00-\x08\x0b-\x1f\x7f]/.test(s) && !/(^|\n)[ \t]+\n|[ \t]+\n/.test(s)) {
    const pad = ' '.repeat(indent + 2);
    const chomp = s.endsWith('\n') ? (s.endsWith('\n\n') ? '+' : '') : '-';
    const body = (s.endsWith('\n') ? s.slice(0, -1) : s).split('\n').map((l) => (l === '' ? '' : pad + l)).join('\n');
    return `|${chomp}\n${body}`;
  }
  if (needsQuotes(s)) return JSON.stringify(s);
  return s;
}

function key(k) {
  return needsQuotes(k) || /[\s]/.test(k) ? JSON.stringify(k) : k;
}

function isScalar(v) {
  return v === null || typeof v !== 'object';
}

/** Emit `value` as YAML at the given indent (spaces). */
export function toYaml(value, indent = 0) {
  const pad = ' '.repeat(indent);
  if (isScalar(value)) return pad + scalar(value, indent) + '\n';
  if (Array.isArray(value)) {
    if (value.length === 0) return pad + '[]\n';
    let out = '';
    for (const item of value) {
      if (isScalar(item)) {
        out += `${pad}- ${scalar(item, indent + 2)}\n`;
      } else if (Array.isArray(item) ? item.length === 0 : Object.keys(item).length === 0) {
        out += `${pad}- ${Array.isArray(item) ? '[]' : '{}'}\n`;
      } else {
        const inner = toYaml(item, indent + 2);
        out += `${pad}- ${inner.slice(indent + 2)}`;
      }
    }
    return out;
  }
  const keys = Object.keys(value).filter((k) => value[k] !== undefined);
  if (keys.length === 0) return pad + '{}\n';
  let out = '';
  for (const k of keys) {
    const v = value[k];
    if (isScalar(v)) {
      out += `${pad}${key(k)}: ${scalar(v, indent)}\n`;
    } else if (Array.isArray(v) ? v.length === 0 : Object.keys(v).filter((x) => v[x] !== undefined).length === 0) {
      out += `${pad}${key(k)}: ${Array.isArray(v) ? '[]' : '{}'}\n`;
    } else if (Array.isArray(v)) {
      out += `${pad}${key(k)}:\n${toYaml(v, indent + 2)}`;
    } else {
      out += `${pad}${key(k)}:\n${toYaml(v, indent + 2)}`;
    }
  }
  return out;
}
