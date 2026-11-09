import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";

const dosFont = localFont({
  src: "./fonts/MorePerfectDOSVGA.ttf",
  variable: "--font-dos",
  display: "block",
  adjustFontFallback: false,
});

export const metadata: Metadata = {
  title: "ODD/OS",
  description: "THE FUTURE IS ALREADY INSTALLED.",
};

// The display is a fixed grid already scaled to fit, so the page does not
// zoom, and it reaches under a phone's notch and home indicator.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

const RootLayout = ({ children }: LayoutProps<"/">) => (
  <html lang="en" className={dosFont.variable}>
    <body>{children}</body>
  </html>
);

export default RootLayout;
