"use client";

import React, { createContext, useContext, useState, useCallback, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  SquaresFour,
  Storefront,
  Receipt,
  FileText,
  Package,
  ClipboardText,
  ChartBar,
  BellRinging,
  GearSix,
  SignOut,
  List,
  X,
  CaretLeft,
  CaretRight,
  WifiHigh,
  WifiSlash,
  CheckCircle,
  WarningCircle,
  ShieldCheck,
} from "@phosphor-icons/react";
import type { ModuleKey, PermissionRow, UserRole } from "@/lib/rbac";

interface ToastMessage {
  id: string;
  title: string;
  type: "success" | "error" | "info";
}

interface ToastContextType {
  showToast: (title: string, type?: "success" | "error" | "info") => void;
}

const ToastContext = createContext<ToastContextType>({
  showToast: () => {},
});

export function useToast() {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const showToast = useCallback((title: string, type: "success" | "error" | "info" = "success") => {
    const id = `${Date.now()}-${Math.random()}`;
    setToasts((prev) => [...prev, { id, title, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div
        className="fixed bottom-20 md:bottom-6 right-4 z-[60] flex flex-col gap-2 max-w-sm w-full pointer-events-none"
        aria-live="polite"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-xl shadow-lg border text-sm font-semibold ${
              t.type === "error"
                ? "bg-[#FFF1F2] text-[#9F1239] border-[#FECDD3]"
                : t.type === "info"
                ? "bg-[#F0FDFA] text-[#0F766E] border-[#99F6E4]"
                : "bg-[#F0FDF4] text-[#166534] border-[#BBF7D0]"
            }`}
          >
            {t.type === "error" ? (
              <WarningCircle size={20} weight="fill" aria-hidden="true" />
            ) : (
              <CheckCircle size={20} weight="fill" aria-hidden="true" />
            )}
            <span className="flex-1">{t.title}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export interface SessionState {
  user: {
    id: string;
    username: string;
    email: string;
    name: string;
    role: UserRole;
  };
  permissions: Record<ModuleKey, PermissionRow>;
  unreadNotifications: number;
  storeName: string;
  toleranceThresholdRp: number;
}

const NAV_ITEMS: {
  key: ModuleKey;
  label: string;
  shortLabel: string;
  href: string;
  icon: React.ComponentType<{ size?: number; weight?: "regular" | "duotone" | "fill" | "bold" }>;
}[] = [
  { key: "dashboard", label: "Dashboard", shortLabel: "Dashboard", href: "/dashboard", icon: SquaresFour },
  { key: "kasir", label: "Kasir (POS)", shortLabel: "Kasir", href: "/kasir", icon: Storefront },
  { key: "penjualan", label: "Penjualan & Tutup Shift", shortLabel: "Penjualan", href: "/penjualan", icon: Receipt },
  { key: "pembelian", label: "Pembelian & Validasi Nota AI", shortLabel: "Pembelian", href: "/pembelian", icon: FileText },
  { key: "produk", label: "Produk & Resep", shortLabel: "Produk", href: "/produk", icon: Package },
  { key: "inventaris", label: "Inventaris & Audit Stok", shortLabel: "Inventaris", href: "/inventaris", icon: ClipboardText },
  { key: "laporan", label: "Laporan Keuangan", shortLabel: "Laporan", href: "/laporan", icon: ChartBar },
  { key: "aktivitas", label: "Notifikasi & Log Aktivitas", shortLabel: "Aktivitas", href: "/aktivitas", icon: BellRinging },
  { key: "pengaturan", label: "Pengaturan Sistem", shortLabel: "Pengaturan", href: "/pengaturan", icon: GearSix },
];

export function AppShell({
  children,
  defaultCollapsed = false,
}: {
  children: (session: SessionState, refreshSession: () => Promise<void>) => React.ReactNode;
  defaultCollapsed?: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { showToast } = useToast();

  const [session, setSession] = useState<SessionState | null>(null);
  const [loading, setLoading] = useState(true);
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isOnline, setIsOnline] = useState(true);

  const fetchSession = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/me", { cache: "no-store" });
      const data = await res.json();
      if (!data.authenticated) {
        router.replace("/login");
        return;
      }
      setSession({
        user: data.user,
        permissions: data.permissions,
        unreadNotifications: data.unreadNotifications ?? 0,
        storeName: data.storeName ?? "TRASIR Toko Utama",
        toleranceThresholdRp: data.toleranceThresholdRp ?? 50000,
      });
    } catch {
      setIsOnline(false);
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    fetchSession();
  }, [fetchSession]);

  useEffect(() => {
    if (pathname === "/kasir" || pathname?.startsWith("/pembelian/")) {
      setCollapsed(true);
    }
  }, [pathname]);

  useEffect(() => {
    setIsOnline(typeof navigator !== "undefined" ? navigator.onLine : true);
    const onOnline = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    showToast("Anda telah keluar dari sesi TRASIR.", "info");
    router.replace("/login");
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F5F5F5] flex items-center justify-center p-6">
        <div className="bg-white rounded-2xl border border-slate-200 p-8 max-w-sm w-full text-center space-y-3 shadow-sm">
          <div className="w-12 h-12 rounded-2xl bg-[#334E6B] text-white flex items-center justify-center mx-auto font-bold text-lg">
            TR
          </div>
          <p className="text-sm font-bold text-slate-900">Memuat Ruang Kerja TRASIR...</p>
          <p className="text-xs text-slate-600">Memverifikasi sesi dan matriks hak akses (RBAC)</p>
        </div>
      </div>
    );
  }

  if (!session) return null;

  const visibleNavItems = NAV_ITEMS.filter((item) => {
    const perm = session.permissions[item.key];
    return perm?.canView;
  });

  const roleBadgeLabel: Record<UserRole, string> = {
    PEMILIK: "Pemilik Toko",
    MANAJER: "Manajer / Pengawas",
    KASIR: "Kasir",
    GUDANG: "Bagian Gudang",
  };

  return (
    <div className="min-h-screen bg-[#F5F5F5] text-slate-900 flex flex-col">
      {!isOnline && (
        <div
          role="alert"
          className="bg-[#FFF1F2] border-b border-[#FECDD3] text-[#9F1239] px-4 py-2.5 text-xs font-semibold flex items-center justify-center gap-2"
        >
          <WifiSlash size={18} weight="bold" aria-hidden="true" />
          <span>
            Koneksi internet terputus. Sistem TRASIR berjalan secara real-time dan tidak mendukung pencatatan transaksi offline. Periksa jaringan Anda.
          </span>
        </div>
      )}

      <div className="flex-1 flex">
        {/* Desktop & Tablet Collapsible Sidebar */}
        <aside
          aria-label="Navigasi Utama"
          className={`hidden md:flex flex-col bg-white border-r border-slate-200 transition-all duration-200 shrink-0 sticky top-0 h-screen ${
            collapsed ? "w-20" : "w-64"
          }`}
        >
          <div className="h-16 px-4 border-b border-slate-200 flex items-center justify-between">
            <Link
              href={visibleNavItems[0]?.href || "/dashboard"}
              className="flex items-center gap-3 overflow-hidden"
            >
              <div className="w-10 h-10 rounded-xl bg-[#334E6B] text-white flex items-center justify-center shrink-0 font-extrabold text-sm tracking-tight shadow-sm">
                <ShieldCheck size={22} weight="duotone" aria-hidden="true" />
              </div>
              {!collapsed && (
                <div className="truncate">
                  <span className="block text-base font-extrabold tracking-tight text-[#334E6B] leading-none">
                    TRASIR
                  </span>
                  <span className="block text-[11px] font-medium text-slate-600 truncate mt-1">
                    {session.storeName}
                  </span>
                </div>
              )}
            </Link>

            <button
              type="button"
              onClick={() => setCollapsed((c) => !c)}
              aria-expanded={!collapsed}
              aria-label={collapsed ? "Perluas sidebar navigasi" : "Ciutkan sidebar navigasi"}
              className="min-w-[36px] min-h-[36px] flex items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 hover:text-slate-900 cursor-pointer"
            >
              {collapsed ? (
                <CaretRight size={18} weight="bold" aria-hidden="true" />
              ) : (
                <CaretLeft size={18} weight="bold" aria-hidden="true" />
              )}
            </button>
          </div>

          <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-1">
            {!collapsed && (
              <p className="px-3 pb-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                Modul Operasional
              </p>
            )}
            {visibleNavItems.map((item) => {
              const Icon = item.icon;
              const isActive =
                pathname === item.href ||
                (item.href !== "/dashboard" && pathname?.startsWith(item.href));

              return (
                <Link
                  key={item.key}
                  href={item.href}
                  title={collapsed ? item.label : undefined}
                  aria-current={isActive ? "page" : undefined}
                  className={`relative flex items-center gap-3 px-3 py-2.5 min-h-[44px] rounded-xl text-sm font-semibold transition-colors ${
                    isActive
                      ? "bg-[#334E6B] text-white shadow-sm"
                      : "text-slate-700 hover:bg-slate-100 hover:text-slate-900"
                  } ${collapsed ? "justify-center" : ""}`}
                >
                  <Icon
                    size={20}
                    weight={isActive ? "fill" : "duotone"}
                  />
                  {!collapsed && <span className="truncate flex-1">{item.label}</span>}
                  {item.key === "aktivitas" && session.unreadNotifications > 0 && (
                    <span
                      className={`px-1.5 py-0.5 text-[11px] font-bold rounded-full ${
                        isActive
                          ? "bg-[#3DC2CA] text-slate-950"
                          : "bg-[#FC5086] text-white"
                      }`}
                    >
                      {session.unreadNotifications}
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>

          <div className="p-3 border-t border-slate-200 space-y-2">
            {!collapsed && (
              <div className="px-3 py-2 rounded-xl bg-slate-50 border border-slate-200">
                <p className="text-xs font-bold text-slate-900 truncate">{session.user.name}</p>
                <p className="text-[11px] font-semibold text-[#334E6B] mt-0.5">
                  {roleBadgeLabel[session.user.role]}
                </p>
              </div>
            )}
            <button
              type="button"
              onClick={handleLogout}
              title={collapsed ? "Keluar (Logout)" : undefined}
              className={`w-full flex items-center gap-3 px-3 py-2.5 min-h-[44px] rounded-xl text-sm font-semibold text-[#9F1239] hover:bg-[#FFF1F2] transition-colors cursor-pointer ${
                collapsed ? "justify-center" : ""
              }`}
            >
              <SignOut size={20} weight="bold" aria-hidden="true" />
              {!collapsed && <span>Keluar Sesi</span>}
            </button>
          </div>
        </aside>

        {/* Main Content Column */}
        <div className="flex-1 flex flex-col min-w-0 pb-20 md:pb-0">
          {/* Top Header */}
          <header className="h-16 bg-white border-b border-slate-200 px-4 md:px-6 flex items-center justify-between sticky top-0 z-30">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setMobileMenuOpen(true)}
                aria-label="Buka menu navigasi"
                className="md:hidden min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-100 cursor-pointer"
              >
                <List size={22} weight="bold" aria-hidden="true" />
              </button>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-extrabold text-[#334E6B] md:hidden">TRASIR</span>
                  <span className="text-xs font-semibold text-slate-600 hidden sm:inline">
                    {session.storeName}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2.5 md:gap-3">
              {/* Real-Time Online Connection Indicator */}
              <div
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border ${
                  isOnline
                    ? "bg-[#F0FDF4] text-[#166534] border-[#BBF7D0]"
                    : "bg-[#FFF1F2] text-[#9F1239] border-[#FECDD3]"
                }`}
              >
                {isOnline ? (
                  <>
                    <WifiHigh size={15} weight="bold" aria-hidden="true" />
                    <span className="hidden sm:inline">Online Real-Time</span>
                  </>
                ) : (
                  <>
                    <WifiSlash size={15} weight="bold" aria-hidden="true" />
                    <span>Offline</span>
                  </>
                )}
              </div>

              {/* Notification Bell */}
              <Link
                href="/aktivitas"
                aria-label={`Notifikasi (${session.unreadNotifications} belum dibaca)`}
                className="relative min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-100 transition-colors"
              >
                <BellRinging size={20} weight="duotone" aria-hidden="true" />
                {session.unreadNotifications > 0 && (
                  <span className="absolute -top-1 -right-1 px-1.5 py-0.5 text-[10px] font-extrabold rounded-full bg-[#FC5086] text-white">
                    {session.unreadNotifications}
                  </span>
                )}
              </Link>

              {/* Active User Profile Badge */}
              <Link
                href="/pengaturan"
                className="flex items-center gap-2.5 pl-2 pr-3 py-1.5 min-h-[44px] rounded-xl border border-slate-200 hover:bg-slate-50 transition-colors"
              >
                <div className="w-8 h-8 rounded-lg bg-[#334E6B] text-white flex items-center justify-center text-xs font-bold">
                  {session.user.name.slice(0, 2).toUpperCase()}
                </div>
                <div className="hidden sm:block text-left">
                  <p className="text-xs font-bold text-slate-900 leading-none">
                    {session.user.name}
                  </p>
                  <p className="text-[11px] font-semibold text-[#334E6B] mt-0.5">
                    {roleBadgeLabel[session.user.role]}
                  </p>
                </div>
              </Link>
            </div>
          </header>

          {/* Main Workspace Area */}
          <main className="flex-1 p-4 md:p-6 max-w-[1600px] w-full mx-auto">
            {children(session, fetchSession)}
          </main>
        </div>
      </div>

      {/* Mobile Drawer Menu */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 z-50 md:hidden flex bg-slate-900/60"
          role="dialog"
          aria-modal="true"
          aria-label="Menu Navigasi Mobile"
        >
          <div className="relative w-72 max-w-[85vw] bg-white h-full flex flex-col shadow-2xl">
            <div className="h-16 px-4 border-b border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-[#334E6B] text-white flex items-center justify-center font-bold">
                  TR
                </div>
                <div>
                  <p className="text-sm font-extrabold text-[#334E6B]">TRASIR</p>
                  <p className="text-xs text-slate-600">{roleBadgeLabel[session.user.role]}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                aria-label="Tutup menu"
                className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl text-slate-600 hover:bg-slate-100 cursor-pointer"
              >
                <X size={20} weight="bold" aria-hidden="true" />
              </button>
            </div>
            <nav className="flex-1 overflow-y-auto p-3 space-y-1">
              {visibleNavItems.map((item) => {
                const Icon = item.icon;
                const isActive = pathname === item.href;
                return (
                  <Link
                    key={item.key}
                    href={item.href}
                    onClick={() => setMobileMenuOpen(false)}
                    className={`flex items-center gap-3 px-3.5 py-3 min-h-[44px] rounded-xl text-sm font-semibold ${
                      isActive
                        ? "bg-[#334E6B] text-white"
                        : "text-slate-700 hover:bg-slate-100"
                    }`}
                  >
                    <Icon size={20} weight={isActive ? "fill" : "duotone"} />
                    <span className="flex-1">{item.label}</span>
                  </Link>
                );
              })}
            </nav>
            <div className="p-3 border-t border-slate-200">
              <button
                type="button"
                onClick={handleLogout}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 min-h-[44px] rounded-xl bg-[#FFF1F2] text-[#9F1239] text-sm font-bold cursor-pointer"
              >
                <SignOut size={18} weight="bold" aria-hidden="true" />
                <span>Keluar Sesi</span>
              </button>
            </div>
          </div>
          <div className="flex-1" onClick={() => setMobileMenuOpen(false)} aria-hidden="true" />
        </div>
      )}

      {/* Mobile Bottom Navigation Bar */}
      <nav
        aria-label="Navigasi Bawah Mobile"
        className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-white border-t border-slate-200 px-2 py-1 flex items-center justify-around"
      >
        {visibleNavItems.slice(0, 5).map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.key}
              href={item.href}
              className={`flex flex-col items-center justify-center min-w-[56px] min-h-[48px] px-2 py-1 rounded-xl text-[11px] font-semibold ${
                isActive ? "text-[#334E6B] font-bold" : "text-slate-600"
              }`}
            >
              <Icon size={20} weight={isActive ? "fill" : "duotone"} />
              <span className="truncate max-w-[68px] mt-0.5">{item.shortLabel}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

