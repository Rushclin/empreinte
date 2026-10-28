import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { SiteHeader } from "@/components/site-header";
import { ThemeProvider } from "@/components/theme-provider";
import { GITHUB_URL } from "@/lib/config";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "Empreinte — find a username across the web", template: "%s · Empreinte" },
  description:
    'Empreinte (French for "footprint") finds where a username exists across hundreds of websites. Open-source and community-driven.',
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col font-sans">
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <SiteHeader />
          <div className="flex flex-1 flex-col">{children}</div>
          <footer className="border-t py-6 text-center text-xs text-muted-foreground">
            Open-source under the MIT License ·{" "}
            <a className="underline underline-offset-4" href={GITHUB_URL}>
              GitHub
            </a>{" "}
            · Inspired by{" "}
            <a
              className="underline underline-offset-4"
              href="https://github.com/sherlock-project/sherlock"
            >
              Sherlock
            </a>
          </footer>
        </ThemeProvider>
      </body>
    </html>
  );
}
