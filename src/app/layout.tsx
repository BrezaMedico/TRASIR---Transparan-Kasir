import type { Metadata } from "next";
import {
  DM_Sans,
  IBM_Plex_Sans,
  Inter,
  JetBrains_Mono,
  Nunito_Sans,
  Plus_Jakarta_Sans,
} from "next/font/google";
import "./globals.css";
import { ToastProvider } from "@/components/layout/AppShell";
import { NavigationProgress } from "@/components/ui/NavigationProgress";

const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-jakarta",
  display: "swap",
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-dm-sans",
  display: "swap",
});

const nunito = Nunito_Sans({
  subsets: ["latin"],
  variable: "--font-nunito",
  display: "swap",
});

const ibmPlex = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-ibm-plex",
  display: "swap",
});

const jetbrains = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "TRASIR: Sistem Pengawasan Operasional, Kasir (POS), Validasi Nota AI & Keuangan Toko",
  description:
    "Aplikasi manajemen keuangan, kasir (POS), validasi nota berbasis AI, inventaris multi-satuan/resep, serta audit selisih stok transparan.",
};

const FOUC_PREVENT_SCRIPT = `(function(){try{var t=localStorage.getItem("trasir-theme")||"light";var s=localStorage.getItem("trasir-font-size")||"medium";var f=localStorage.getItem("trasir-font-family")||"jakarta";var m=document.querySelector('meta[name="color-scheme"]');if(m){m.content=(t==="dark"||t==="light")?t:"light dark";}var r=document.documentElement;r.dataset.theme=(t==="dark"||t==="light"||t==="system")?t:"light";var resolved=t==="dark"?"dark":t==="light"?"light":(window.matchMedia&&window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light");r.dataset.resolvedTheme=resolved;r.dataset.fontSize=(s==="small"||s==="medium"||s==="large")?s:"medium";r.dataset.fontFamily=f;}catch(e){}})();`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="id"
      suppressHydrationWarning
      className={`${jakarta.variable} ${inter.variable} ${dmSans.variable} ${nunito.variable} ${ibmPlex.variable} ${jetbrains.variable}`}
    >
      <head>
        <meta name="color-scheme" content="light dark" />
        <script dangerouslySetInnerHTML={{ __html: FOUC_PREVENT_SCRIPT }} />
      </head>
      <body className="trasir-theme-root font-sans antialiased min-h-screen">
        <ToastProvider>
          <NavigationProgress />
          {children}
        </ToastProvider>
      </body>
    </html>
  );
}
