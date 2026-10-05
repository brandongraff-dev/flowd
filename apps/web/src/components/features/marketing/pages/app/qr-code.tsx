import { cn } from "@/lib/utils";
import { encodeQr, type Ecc } from "./qr";

export interface QrCodeProps {
  /** What the code opens. Encoded as UTF-8 text. */
  value: string;
  /** Error-correction level: M (default) survives about 15% damage. */
  level?: Ecc;
  /** Accessible name. Default: what the code opens. */
  label?: string;
  className?: string;
}

/**
 * A real, scannable QR code, drawn as one SVG path. It sits on a light tile with a four-module quiet zone in both themes (a QR needs dark on
 * light to scan), using the brand's ink and ice ramps. Generated on the server by `./qr`; no image, no dependency.
 */
export function QrCode({ value, level = "M", label, className }: QrCodeProps) {
  const qr = encodeQr(value, level);
  const quiet = 4;
  const total = qr.size + quiet * 2;
  let path = "";
  for (let y = 0; y < qr.size; y += 1) {
    const row = qr.modules[y] ?? [];
    let x = 0;
    while (x < qr.size) {
      if (!row[x]) {
        x += 1;
        continue;
      }
      let run = 1;
      while (x + run < qr.size && row[x + run]) run += 1;
      path += `M${x + quiet} ${y + quiet}h${run}v1h-${run}z`;
      x += run;
    }
  }
  return (
    <div className={cn("inline-block rounded-[22px] bg-(--fd-abyss-50) p-2 text-(--fd-abyss-950) shadow-[0_10px_30px_-12px_rgb(1_4_20/0.5)]", className)}>
      <svg viewBox={`0 0 ${total} ${total}`} role="img" aria-label={label ?? `QR code that opens ${value}`} shapeRendering="crispEdges" className="block size-full">
        <path d={path} fill="currentColor" />
      </svg>
    </div>
  );
}
