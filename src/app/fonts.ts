import localFont from "next/font/local";

/**
 * ITC Avant Garde Gothic — the only brand typeface. Loaded locally from /public/fonts.
 * LICENSING: these files came from a free font site (Fontsgeek readme in the source folder).
 * Confirm a commercial ITC Avant Garde Gothic web licence (Monotype) before public deployment.
 */
export const avantGarde = localFont({
  src: [
    { path: "../../public/fonts/avantgarde-book.woff2", weight: "400", style: "normal" },
    { path: "../../public/fonts/avantgarde-book-oblique.woff2", weight: "400", style: "italic" },
    { path: "../../public/fonts/avantgarde-medium.woff2", weight: "500", style: "normal" },
    { path: "../../public/fonts/avantgarde-demi.woff2", weight: "600", style: "normal" },
    { path: "../../public/fonts/avantgarde-bold.woff2", weight: "700", style: "normal" },
  ],
  variable: "--font-avantgarde",
  display: "swap",
  fallback: ["system-ui", "sans-serif"],
});
