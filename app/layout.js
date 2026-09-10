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

// viewport-fit=cover is what makes env(safe-area-inset-*) resolve to a real
// number instead of 0 on an iPhone - without it the fixed bottom tab bar
// (see MobileNav in nav.jsx) would draw its safe-area padding as nothing and
// sit flush under the home indicator.
//
// maximumScale/userScalable pin the page at its own zoom level. This is a
// dashboard with its own layout, not a document someone pinches into to
// read small text, and a stray double-tap or two-finger brush while
// scrolling a phone was jerking the whole page in and out of a browser
// zoom it never needed - the "unstable" feeling that made this not feel
// like an app. Locking it is a real accessibility trade-off (someone who
// relies on pinch-zoom to read small text loses that here), accepted
// deliberately because every piece of text and every tap target in this
// UI is already sized for its own screen rather than assuming zoom is
// available to fix it after the fact.
export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
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
