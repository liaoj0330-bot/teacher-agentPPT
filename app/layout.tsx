import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI PPT Agent",
  description: "AI generated editable PPT workbench demo."
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
