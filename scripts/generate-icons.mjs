import { mkdirSync, statSync } from "node:fs";
import sharp from "sharp";

/**
 * Regenerates every icon from Favicon.png — `npm run icons`.
 *
 * The source is 1254×1254 and 1.35MB, which is far too heavy to ship for a tab
 * icon. Each target gets its own resize so nothing downloads more pixels than it
 * renders.
 *
 * Next.js picks up `app/icon.png` and `app/apple-icon.png` by convention and
 * emits the link tags itself. The 192 and 512 sizes are for the web app
 * manifest, which is what Android and the install prompt read.
 */

const SOURCE = "Favicon.png";

const TARGETS = [
  // Browser tab. 48 covers the retina case for a 24px slot.
  { out: "app/icon.png", size: 48 },
  // iOS "Add to Home Screen". 180 is the size iOS asks for, and it is the
  // apple-touch-icon — not the manifest — that iOS actually uses for the
  // home-screen tile.
  { out: "app/apple-icon.png", size: 180 },
  // Manifest icons.
  { out: "public/icon-192.png", size: 192 },
  { out: "public/icon-512.png", size: 512 },
];

mkdirSync("public", { recursive: true });

for (const { out, size } of TARGETS) {
  await sharp(SOURCE)
    .resize(size, size, { fit: "cover" })
    // The artwork is full-bleed black with no transparency, which is what iOS
    // wants: it applies its own rounded-corner mask, and a transparent icon
    // would be composited onto white.
    .png({ compressionLevel: 9, palette: false })
    .toFile(out);

  const { size: bytes } = statSync(out);
  console.log(`${out.padEnd(24)} ${size}×${size}  ${(bytes / 1024).toFixed(1)} KiB`);
}
