import type { Metadata } from "next";
import { SiteNav } from "@/components/site-nav";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Ozmozr", template: "%s · Ozmozr" },
  description: "A social feed reader: subscribe, tag, share, and let your people filter the web for you.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="flex min-h-full flex-col">
        <SiteNav />
        <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">{children}</main>
        <footer className="border-t border-line py-4 text-center text-xs text-muted">
          Ozmozr — a rebuild of the 2006 social RSS aggregator from COSL.
        </footer>
      </body>
    </html>
  );
}
