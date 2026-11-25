import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "LC — Leadership Council Cloud",
  description: "Общее облачное хранилище Совета лидеров",
};

export const viewport: Viewport = {
  themeColor: "#7a1f2e",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ru" className="h-full antialiased">
      <body className="min-h-full">{children}</body>
    </html>
  );
}
