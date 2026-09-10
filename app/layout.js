import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Providers from "@/components/providers";

// One family doing both jobs, headings included. Geist's own weights carry
// the hierarchy, which is why the reference dashboard reads as calm: nothing
// changes typeface halfway down a card.
const geist = Geist({
  variable: "--font-geist",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

// Kept for the numbers. Tabular figures stop a live-updating count from
// jittering as its digits change width.
const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export const metadata = {
  title: "Khaadi Production Board",
  description: "Khaadi x ImagineArt PDP shoot — every batch, tracked live.",
};

const THEME_INIT = `try{var t=localStorage.getItem('khaadi-theme');if(t==='light'||t==='dark'){document.documentElement.setAttribute('data-theme',t);}}catch(e){}`;

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT }} />
      </head>
      <body
        className={`${geist.variable} ${geistMono.variable} min-h-screen antialiased`}
      >
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
