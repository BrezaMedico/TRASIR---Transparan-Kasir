"use client";

import React, { createContext, useContext, useState, useCallback, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  SquaresFour,
  Storefront,
  Receipt,
  Package,
  ChartBar,
  BellRinging,
  SignOut,
  List,
  X,
  CaretLeft,
  CaretRight,
  WifiSlash,
  CheckCircle,
  WarningCircle,
  ShieldCheck,
  UsersThree,
} from "@phosphor-icons/react";
import { isStoreAdmin, type ModuleKey, type PermissionRow, type UserRole } from "@/lib/rbac-shared";
import { clearAllClientCache } from "@/lib/client-cache";

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
                ? "bg-[#FFF0F4] text-[#D41448] border-[#FF2A63]/35"
                : t.type === "info"
                ? "bg-white text-[#202531] border-[#202531]/20"
                : "bg-[#202531] text-white border-[#202531]"
            }`}
          >
            {t.type === "error" ? (
              <WarningCircle size={20} weight="fill" aria-hidden="true" />
            ) : (
              <CheckCircle
                size={20}
                weight="fill"
                className={t.type === "success" ? "text-[#01DAD7]" : "text-[#202531]"}
                aria-hidden="true"
              />
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
    isAssigned: boolean;
    roomId?: string | null;
  };
  permissions: Record<ModuleKey, PermissionRow>;
  unreadNotifications: number;
  storeName: string;
  toleranceThresholdRp: number;
}

interface WorkspaceContextValue {
  session: SessionState;
  refreshSession: () => Promise<void>;
}

const WorkspaceSessionContext = createContext<WorkspaceContextValue | null>(null);

export function useWorkspaceSession() {
  return useContext(WorkspaceSessionContext);
}

interface NavEntry {
  key: ModuleKey | "pengguna";
  label: string;
  shortLabel: string;
  href: string;
  adminOnly?: boolean;
  icon: React.ComponentType<{ size?: number; weight?: "regular" | "duotone" | "fill" | "bold" }>;
}

const NAV_ITEMS: NavEntry[] = [
  { key: "dashboard", label: "Ringkasan", shortLabel: "Ringkasan", href: "/dashboard", icon: SquaresFour },
  { key: "kasir", label: "Kasir", shortLabel: "Kasir", href: "/kasir", icon: Storefront },
  { key: "produk", label: "Produk & Bahan", shortLabel: "Produk", href: "/produk", icon: Package },
  { key: "penjualan", label: "Riwayat Transaksi", shortLabel: "Transaksi", href: "/penjualan", icon: Receipt },
  { key: "laporan", label: "Laporan", shortLabel: "Laporan", href: "/laporan", icon: ChartBar },
  { key: "pengguna", label: "Tim", shortLabel: "Tim", href: "/pengguna", adminOnly: true, icon: UsersThree },
  { key: "aktivitas", label: "Aktivitas", shortLabel: "Aktivitas", href: "/aktivitas", icon: BellRinging },
];

const ROLE_BADGE_LABEL: Record<UserRole, string> = {
  PEMILIK: "Pemilik Ruangan",
  MANAJER: "Manajer",
  KASIR: "Kasir",
  GUDANG: "Bagian Gudang",
  KASIR_GUDANG: "Kasir + Gudang",
};

function ShellFrame({
  session,
  collapsed,
  setCollapsed,
  mobileMenuOpen,
  setMobileMenuOpen,
  isOnline,
  handleLogout,
  children,
}: {
  session: SessionState;
  collapsed: boolean;
  setCollapsed: React.Dispatch<React.SetStateAction<boolean>>;
  mobileMenuOpen: boolean;
  setMobileMenuOpen: React.Dispatch<React.SetStateAction<boolean>>;
  isOnline: boolean;
  handleLogout: () => Promise<void>;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    setPendingHref(null);
  }, [pathname]);

  const onLogoutClick = async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      await handleLogout();
    } finally {
      setLoggingOut(false);
    }
  };

  const handleNavClick = (href: string) => {
    if (href && href !== pathname) {
      setPendingHref(href);
    }
  };

  const visibleNavItems = NAV_ITEMS.filter((item) => {
    if (item.adminOnly) {
      return isStoreAdmin(session.user.role);
    }
    const perm = session.permissions[item.key as ModuleKey];
    return perm?.canView;
  });

  return (
    <div className="min-h-screen bg-[#EBEBEB] text-[#202531] flex flex-col">
      {!isOnline && (
        <div
          role="alert"
          className="bg-[#FFF0F4] border-b border-[#FF2A63]/35 text-[#D41448] px-4 py-2.5 text-xs font-semibold flex items-center justify-center gap-2"
        >
          <WifiSlash size={18} weight="bold" aria-hidden="true" />
          <span>
            Koneksi internet terputus. Periksa jaringan Anda untuk mencatat transaksi.
          </span>
        </div>
      )}

      <div className="flex-1 flex">
        {/* Desktop & Tablet Collapsible Sidebar */}
        <aside
          aria-label="Navigasi Utama"
          className={`hidden md:flex flex-col bg-white border-r border-[#202531]/10 transition-all duration-200 shrink-0 sticky top-0 h-screen ${
            collapsed ? "w-20" : "w-64"
          }`}
        >
          <div
            className={`h-16 border-b border-[#202531]/10 flex items-center ${
              collapsed ? "justify-center px-2" : "justify-between px-4"
            }`}
          >
            {!collapsed && (
              <Link
                href={visibleNavItems[0]?.href || "/dashboard"}
                prefetch={false}
                onClick={() => handleNavClick(visibleNavItems[0]?.href || "/dashboard")}
                className="flex items-center gap-3 overflow-hidden"
              >
                <div className="w-10 h-10 rounded-xl bg-[#202531] text-[#01DAD7] flex items-center justify-center shrink-0 font-extrabold text-sm tracking-tight">
                  <ShieldCheck size={22} weight="duotone" aria-hidden="true" />
                </div>
                <div className="truncate">
                  <span className="block text-base font-extrabold tracking-tight text-[#202531] leading-none">
                    TRASIR
                  </span>
                  <span className="block text-[11px] font-medium text-[#525866] truncate mt-1">
                    {session.storeName}
                  </span>
                </div>
              </Link>
            )}

            <button
              type="button"
              onClick={() => setCollapsed((c) => !c)}
              aria-expanded={!collapsed}
              aria-label={collapsed ? "Perluas sidebar navigasi" : "Ciutkan sidebar navigasi"}
              title={collapsed ? "Buka menu lengkap" : "Ciutkan menu"}
              className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl text-[#202531] hover:bg-[#EBEBEB] transition-colors cursor-pointer"
            >
              {collapsed ? (
                <CaretRight size={20} weight="bold" aria-hidden="true" />
              ) : (
                <CaretLeft size={18} weight="bold" aria-hidden="true" />
              )}
            </button>
          </div>

          <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-1">
            {!collapsed && (
              <p className="px-3 pb-1.5 text-[11px] font-bold uppercase tracking-wider text-[#525866]">
                Menu
              </p>
            )}
            {visibleNavItems.map((item) => {
              const Icon = item.icon;
              const isActive =
                pathname === item.href ||
                (item.href !== "/dashboard" && pathname?.startsWith(item.href));
              const isPending = pendingHref === item.href && !isActive;

              return (
                <Link
                  key={item.key}
                  href={item.href}
                  prefetch={false}
                  onClick={() => handleNavClick(item.href)}
                  title={collapsed ? item.label : undefined}
                  aria-current={isActive ? "page" : undefined}
                  className={`relative flex items-center gap-3 px-3 py-2.5 min-h-[44px] rounded-xl text-sm font-semibold transition-colors duration-150 active:scale-[0.98] ${
                    isActive
                      ? "bg-[#202531] text-white"
                      : isPending
                      ? "bg-[#EBEBEB] text-[#202531]"
                      : "text-[#525866] hover:bg-[#EBEBEB]/70 hover:text-[#202531]"
                  } ${collapsed ? "justify-center" : ""}`}
                >
                  <span className={isActive ? "text-[#01DAD7]" : ""} aria-hidden="true">
                    <Icon size={20} weight={isActive ? "fill" : "duotone"} />
                  </span>
                  {!collapsed && <span className="truncate flex-1">{item.label}</span>}
                  {isPending && (
                    <span
                      className="inline-block h-3.5 w-3.5 shrink-0 rounded-full border-2 border-[#202531]/25 border-t-[#01DAD7] animate-spin"
                      aria-hidden="true"
                    />
                  )}
                  {!isPending && item.key === "aktivitas" && session.unreadNotifications > 0 && (
                    <span
                      className={`${
                        collapsed
                          ? "absolute top-1.5 right-2 px-1 py-0.2 text-[10px] leading-tight"
                          : "px-1.5 py-0.5 text-[11px]"
                      } font-extrabold rounded-md ${
                        isActive
                          ? "bg-[#01DAD7] text-[#202531]"
                          : "bg-[#FF2A63] text-white"
                      }`}
                    >
                      {session.unreadNotifications}
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>

          <div className="p-3 border-t border-[#202531]/10 space-y-2">
            {!collapsed && (
              <div className="px-3 py-2 rounded-xl bg-[#EBEBEB]/60 border border-[#202531]/10">
                <p className="text-xs font-bold text-[#202531] truncate">{session.user.name}</p>
                <p className="text-[11px] font-semibold text-[#525866] mt-0.5">
                  {ROLE_BADGE_LABEL[session.user.role]}
                </p>
              </div>
            )}
            <button
              type="button"
              onClick={onLogoutClick}
              disabled={loggingOut}
              title={collapsed ? "Keluar" : undefined}
              className={`w-full flex items-center gap-3 px-3 py-2.5 min-h-[44px] rounded-xl text-sm font-semibold text-[#D41448] hover:bg-[#FFF0F4] disabled:opacity-60 transition-colors cursor-pointer ${
                collapsed ? "justify-center" : ""
              }`}
            >
              {loggingOut ? (
                <span
                  className="inline-block h-4 w-4 rounded-full border-2 border-[#D41448]/25 border-t-[#D41448] animate-spin"
                  aria-hidden="true"
                />
              ) : (
                <SignOut size={20} weight="bold" aria-hidden="true" />
              )}
              {!collapsed && <span>{loggingOut ? "Keluar..." : "Keluar"}</span>}
            </button>
          </div>
        </aside>

        {/* Main Content Column */}
        <div className="flex-1 flex flex-col min-w-0 pb-20 md:pb-0">
          {/* Top Header */}
          <header className="h-16 bg-white border-b border-[#202531]/10 px-4 md:px-6 flex items-center justify-between sticky top-0 z-30">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setMobileMenuOpen(true)}
                aria-label="Buka menu navigasi"
                className="md:hidden min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl border border-[#202531]/15 text-[#202531] hover:bg-[#EBEBEB] cursor-pointer"
              >
                <List size={22} weight="bold" aria-hidden="true" />
              </button>
              <div className="flex items-center gap-2">
                <span className="text-sm font-extrabold text-[#202531] md:hidden">TRASIR</span>
                <span className="text-xs font-bold text-[#525866] hidden sm:inline">
                  {session.storeName}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2.5 md:gap-3">
              <Link
                href="/aktivitas"
                prefetch={false}
                aria-label={`Aktivitas dan notifikasi (${session.unreadNotifications} baru)`}
                className="relative min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl border border-[#202531]/15 text-[#202531] hover:bg-[#EBEBEB] transition-colors"
              >
                <BellRinging size={20} weight="duotone" aria-hidden="true" />
                {session.unreadNotifications > 0 && (
                  <span className="absolute -top-1 -right-1 px-1.5 py-0.5 text-[10px] font-extrabold rounded-md bg-[#FF2A63] text-white">
                    {session.unreadNotifications}
                  </span>
                )}
              </Link>

              <Link
                href="/pengaturan"
                prefetch={false}
                className="flex items-center gap-2.5 pl-2 pr-3 py-1.5 min-h-[44px] rounded-xl border border-[#202531]/15 hover:bg-[#EBEBEB]/60 transition-colors"
              >
                <div className="w-8 h-8 rounded-lg bg-[#202531] text-[#01DAD7] flex items-center justify-center text-xs font-extrabold">
                  {session.user.name.slice(0, 2).toUpperCase()}
                </div>
                <div className="hidden sm:block text-left">
                  <p className="text-xs font-bold text-[#202531] leading-none">
                    {session.user.name}
                  </p>
                  <p className="text-[11px] font-semibold text-[#525866] mt-0.5">
                    {ROLE_BADGE_LABEL[session.user.role]}
                  </p>
                </div>
              </Link>
            </div>
          </header>

          {/* Main Workspace Area */}
          <main className="flex-1 p-4 md:p-6 max-w-[1440px] w-full mx-auto">
            {children}
          </main>
        </div>
      </div>

      {/* Mobile Drawer Menu */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 z-50 md:hidden flex bg-[#202531]/60"
          role="dialog"
          aria-modal="true"
          aria-label="Menu Navigasi Mobile"
        >
          <div className="relative w-72 max-w-[85vw] bg-white h-full flex flex-col shadow-2xl">
            <div className="h-16 px-4 border-b border-[#202531]/10 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-[#202531] text-[#01DAD7] flex items-center justify-center font-extrabold text-xs">
                  TR
                </div>
                <div>
                  <p className="text-sm font-extrabold text-[#202531]">TRASIR</p>
                  <p className="text-xs text-[#525866]">{ROLE_BADGE_LABEL[session.user.role]}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                aria-label="Tutup menu"
                className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl text-[#525866] hover:bg-[#EBEBEB] cursor-pointer"
              >
                <X size={20} weight="bold" aria-hidden="true" />
              </button>
            </div>
            <nav className="flex-1 overflow-y-auto p-3 space-y-1">
              {visibleNavItems.map((item) => {
                const Icon = item.icon;
                const isActive = pathname === item.href;
                const isPending = pendingHref === item.href && !isActive;
                return (
                  <Link
                    key={item.key}
                    href={item.href}
                    prefetch={false}
                    onClick={() => {
                      handleNavClick(item.href);
                      setMobileMenuOpen(false);
                    }}
                    className={`flex items-center gap-3 px-3.5 py-3 min-h-[44px] rounded-xl text-sm font-semibold transition-colors active:scale-[0.98] ${
                      isActive
                        ? "bg-[#202531] text-white"
                        : isPending
                        ? "bg-[#EBEBEB] text-[#202531]"
                        : "text-[#525866] hover:bg-[#EBEBEB]/70"
                    }`}
                  >
                    <span className={isActive ? "text-[#01DAD7]" : ""} aria-hidden="true">
                      <Icon size={20} weight={isActive ? "fill" : "duotone"} />
                    </span>
                    <span className="flex-1">{item.label}</span>
                    {isPending && (
                      <span
                        className="inline-block h-3.5 w-3.5 shrink-0 rounded-full border-2 border-[#202531]/25 border-t-[#01DAD7] animate-spin"
                        aria-hidden="true"
                      />
                    )}
                  </Link>
                );
              })}
            </nav>
            <div className="p-3 border-t border-[#202531]/10">
              <button
                type="button"
                onClick={onLogoutClick}
                disabled={loggingOut}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 min-h-[44px] rounded-xl bg-[#FFF0F4] text-[#D41448] text-sm font-bold disabled:opacity-60 cursor-pointer"
              >
                {loggingOut ? (
                  <span
                    className="inline-block h-4 w-4 rounded-full border-2 border-[#D41448]/25 border-t-[#D41448] animate-spin"
                    aria-hidden="true"
                  />
                ) : (
                  <SignOut size={18} weight="bold" aria-hidden="true" />
                )}
                <span>{loggingOut ? "Keluar..." : "Keluar"}</span>
              </button>
            </div>
          </div>
          <div className="flex-1" onClick={() => setMobileMenuOpen(false)} aria-hidden="true" />
        </div>
      )}

      {/* Mobile Bottom Navigation Bar */}
      <nav
        aria-label="Navigasi Bawah Mobile"
        className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-white border-t border-[#202531]/10 px-2 py-1 flex items-center justify-around"
      >
        {visibleNavItems.slice(0, 5).map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href;
          const isPending = pendingHref === item.href && !isActive;
          return (
            <Link
              key={item.key}
              href={item.href}
              prefetch={false}
              onClick={() => handleNavClick(item.href)}
              className={`flex flex-col items-center justify-center min-w-[56px] min-h-[48px] px-2 py-1 rounded-xl text-[11px] font-semibold transition-colors active:scale-95 ${
                isActive
                  ? "text-[#202531] font-bold bg-[#01DAD7]/25"
                  : isPending
                  ? "text-[#202531] bg-[#EBEBEB]"
                  : "text-[#525866]"
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

/**
 * Shell persisten untuk seluruh rute di dalam (workspace)/layout.tsx.
 * Menerima sesi langsung dari SSR (0ms loading saat refresh) dan tetap hidup saat berpindah halaman.
 */
export function WorkspaceChrome({
  initialSession,
  children,
}: {
  initialSession: SessionState;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { showToast } = useToast();

  const [session, setSession] = useState<SessionState>(initialSession);
  const [collapsed, setCollapsed] = useState<boolean>(
    pathname === "/kasir" || Boolean(pathname?.startsWith("/pembelian/"))
  );
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    setSession(initialSession);
  }, [initialSession]);

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

  const refreshSession = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/me", { cache: "no-store" });
      const data = await res.json();
      if (!data.authenticated) {
        clearAllClientCache();
        router.replace(`/login?redirect=${encodeURIComponent(pathname || "/dashboard")}`);
        return;
      }
      if (data.user && data.user.isAssigned === false) {
        clearAllClientCache();
        if (isStoreAdmin(data.user.role) && data.needsInitialSetup) {
          router.replace("/setup");
        } else {
          router.replace("/menunggu-undangan");
        }
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
    }
  }, [router, pathname]);

  const handleLogout = useCallback(async () => {
    clearAllClientCache();
    await fetch("/api/auth/logout", { method: "POST" });
    showToast("Anda telah keluar dari sesi TRASIR.", "info");
    router.replace("/login");
  }, [router, showToast]);

  return (
    <WorkspaceSessionContext.Provider value={{ session, refreshSession }}>
      <ShellFrame
        session={session}
        collapsed={collapsed}
        setCollapsed={setCollapsed}
        mobileMenuOpen={mobileMenuOpen}
        setMobileMenuOpen={setMobileMenuOpen}
        isOnline={isOnline}
        handleLogout={handleLogout}
      >
        {children}
      </ShellFrame>
    </WorkspaceSessionContext.Provider>
  );
}

/**
 * Wrapper kompatibel untuk halaman operasional.
 * Saat berada di dalam WorkspaceChrome (layout SSR), langsung merender isi halaman 0ms tanpa loading screen.
 */
export function AppShell({
  children,
  defaultCollapsed = false,
}: {
  children: (session: SessionState, refreshSession: () => Promise<void>) => React.ReactNode;
  defaultCollapsed?: boolean;
}) {
  const workspaceCtx = useContext(WorkspaceSessionContext);
  if (workspaceCtx) {
    return <>{children(workspaceCtx.session, workspaceCtx.refreshSession)}</>;
  }

  return <StandaloneAppShell defaultCollapsed={defaultCollapsed}>{children}</StandaloneAppShell>;
}

function StandaloneAppShell({
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
        router.replace(`/login?redirect=${encodeURIComponent(pathname || "/dashboard")}`);
        return;
      }
      if (data.user && data.user.isAssigned === false) {
        if (isStoreAdmin(data.user.role) && data.needsInitialSetup) {
          router.replace("/setup");
        } else {
          router.replace("/menunggu-undangan");
        }
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
  }, [router, pathname]);

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
    clearAllClientCache();
    await fetch("/api/auth/logout", { method: "POST" });
    showToast("Anda telah keluar dari sesi TRASIR.", "info");
    router.replace("/login");
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#EBEBEB] flex items-center justify-center p-6">
        <div className="bg-white rounded-2xl border border-[#202531]/10 p-8 max-w-sm w-full text-center space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-[#202531] text-[#01DAD7] flex items-center justify-center mx-auto font-extrabold text-lg">
            TR
          </div>
          <p className="text-sm font-bold text-[#202531]">Memuat Ruang Kerja TRASIR...</p>
          <p className="text-xs text-[#525866]">Menyiapkan sesi dan data toko Anda</p>
        </div>
      </div>
    );
  }

  if (!session) return null;

  return (
    <ShellFrame
      session={session}
      collapsed={collapsed}
      setCollapsed={setCollapsed}
      mobileMenuOpen={mobileMenuOpen}
      setMobileMenuOpen={setMobileMenuOpen}
      isOnline={isOnline}
      handleLogout={handleLogout}
    >
      {children(session, fetchSession)}
    </ShellFrame>
  );
}
