import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Sicpic",
    short_name: "Sicpic",
    description: "Private Fotos für unsere Gruppe.",
    start_url: "/gruppe",
    scope: "/",
    display: "standalone",
    background_color: "#f3efe7",
    theme_color: "#f3efe7",
    lang: "de",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
