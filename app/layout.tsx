import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ODD/OS",
  description: "THE FUTURE IS ALREADY INSTALLED.",
};

const RootLayout = ({ children }: LayoutProps<"/">) => (
  <html lang="en">
    <body>{children}</body>
  </html>
);

export default RootLayout;
