import type { Metadata } from "next";
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

const RootLayout = ({ children }: LayoutProps<"/">) => (
  <html lang="en" className={dosFont.variable}>
    <body>{children}</body>
  </html>
);

export default RootLayout;
