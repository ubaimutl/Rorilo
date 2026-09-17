import type { Metadata, Viewport } from "next";
import { Geist_Mono, Varela_Round, Quattrocento_Sans } from "next/font/google";
import "./globals.css";

const bodySans = Quattrocento_Sans({
  variable: "--font-body-sans",
  subsets: ["latin"],
  weight: ["400", "700"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});

const varelaRound = Varela_Round({
  variable: "--font-varela-round",
  subsets: ["latin"],
  weight: "400",
  display: "swap",
});

import { Sidebar } from "@/components/Sidebar";
import { I18nProvider } from "@/components/I18nProvider";
import { FirstRunSetupDialog } from "@/components/FirstRunSetupDialog";
import { AppNotifications } from "@/components/AppNotifications";
import { CommandPalette } from "@/components/CommandPalette";
import { ConfirmProvider } from "@/components/ConfirmDialog";

export const metadata: Metadata = {
  title: "Rorilo - Local-First AI Job Search & Application Assistant",
  description: "Automated job discovery, deterministic match scoring, and tailored application preparation with full user oversight.",
  manifest: "/favicons/site.webmanifest",
  icons: {
    icon: [
      { url: "/favicons/favicon.ico", sizes: "any" },
      { url: "/favicons/favicon.svg", type: "image/svg+xml" },
      { url: "/favicons/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicons/favicon-16x16.png", sizes: "16x16", type: "image/png" },
    ],
    apple: [{ url: "/favicons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f4f5f7" },
    { media: "(prefers-color-scheme: dark)", color: "#1e222e" },
  ],
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${bodySans.variable} ${geistMono.variable} ${varelaRound.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col md:flex-row bg-background text-foreground font-sans">
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-[100] focus:rounded-lg focus:bg-primary focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:text-primary-foreground"
        >
          Skip to main content
        </a>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              try {
                const theme = localStorage.getItem('rorilo-theme');
                if (theme === 'dark') document.documentElement.classList.add('dark');
              } catch {}
            `,
          }}
        />
        <I18nProvider>
          <ConfirmProvider>
          <Sidebar />
          <div id="main-content" className="flex-1 flex flex-col min-w-0 min-h-screen scroll-mt-16 pb-20 md:pb-0">
            <FirstRunSetupDialog />
            {children}
          </div>
          <CommandPalette />
          <AppNotifications />
          </ConfirmProvider>
        </I18nProvider>
      </body>
    </html>
  );
}
