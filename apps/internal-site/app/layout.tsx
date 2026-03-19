import type { Metadata } from "next";
import { IBM_Plex_Sans, Noto_Serif_JP, Noto_Serif_SC } from "next/font/google";
import { MagicThemeProvider } from "@magic-compare/ui";
import "./globals.css";

const displayFontSc = Noto_Serif_SC({
  preload: false,
  variable: "--font-display-sc",
  weight: ["400", "500", "600", "700"],
});

const displayFontJp = Noto_Serif_JP({
  subsets: ["latin"],
  variable: "--font-display-jp",
  weight: ["400", "500", "600", "700"],
});

const bodyFont = IBM_Plex_Sans({
  subsets: ["latin"],
  variable: "--font-body",
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Magic Compare Internal",
  description: "Internal image compare workbench for encoding groups.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${displayFontSc.variable} ${displayFontJp.variable} ${bodyFont.variable}`}
    >
      <body>
        <MagicThemeProvider>{children}</MagicThemeProvider>
      </body>
    </html>
  );
}
