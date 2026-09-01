import type { MetadataRoute } from "next";
import { BASE_PATH } from "@/lib/auth";

/// The web app manifest, so adding the app to a home screen gives a standalone
/// window rather than a Safari tab.
///
/// Next does **not** rewrite paths inside a manifest for `basePath`, so every URL
/// here carries the prefix explicitly. Getting that wrong is silent: the manifest
/// still parses, the install still works, and the icons just never load.

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Gym + Nutrition Tracker",
    // What actually fits under an icon on a home screen.
    short_name: "Gym",
    description: "Training and nutrition tracker",
    start_url: BASE_PATH,
    scope: `${BASE_PATH}/`,
    display: "standalone",
    orientation: "portrait",
    // Matches the icon artwork, so the splash and any letterboxing blend into it
    // rather than flashing white.
    background_color: "#000000",
    theme_color: "#000000",
    icons: [
      {
        src: `${BASE_PATH}/icon-192.png`,
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: `${BASE_PATH}/icon-512.png`,
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
    ],
  };
}
