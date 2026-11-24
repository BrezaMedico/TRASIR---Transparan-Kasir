"use client";

import React, { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, Loader2 } from "lucide-react";
import { HeroDiorama3D } from "./diorama/HeroDiorama3D";
import { getDefaultRedirectForRole, isStoreAdmin } from "@/lib/rbac-shared";

interface LandingPageProps {
  isAuthenticated?: boolean;
  navCtaHref?: string;
  navCtaLabel?: string;
  heroCtaHref?: string;
  heroCtaLabel?: string;
  finalCtaHref?: string;
  finalCtaLabel?: string;
}

interface AuthCtaState {
  isAuthenticated: boolean;
  navCtaHref: string;
  navCtaLabel: string;
  heroCtaHref: string;
  heroCtaLabel: string;
  finalCtaHref: string;
  finalCtaLabel: string;
}

const AUTH_CTA_STORAGE_KEY = "trasir_auth_cta_hint";

type StockMethodKey = "tetap" | "pecah" | "resep";

interface StockMethodSpec {
  id: StockMethodKey;
  label: string;
  summary: string;
  buyLabel: string;
  buyValue: string;
  sellLabel: string;
  sellValue: string;
  remainLabel: string;
  remainValue: string;
  example: string;
}

const STOCK_METHODS: StockMethodSpec[] = [
  {
    id: "tetap",
    label: "Satuan Tetap (1:1)",
    summary: "Cocok untuk barang ritel yang dibeli dan dijual dalam satuan yang sama.",
    buyLabel: "Beli dari Pemasok",
    buyValue: "10 pcs",
    sellLabel: "Terjual di Kasir",
    sellValue: "3 pcs",
    remainLabel: "Sisa Stok Sistem",
    remainValue: "7 pcs",
    example: "Contoh: Kursi lipat, botol tumbler, atau kemasan utuh dengan potongan 1 banding 1.",
  },
  {
    id: "pecah",
    label: "Pecah Satuan",
    summary: "Beli grosir dalam dus atau karung, lalu jual eceran per botol atau bungkus secara otomatis.",
    buyLabel: "Beli Grosir",
    buyValue: "1 dus (24 botol)",
    sellLabel: "Jual Eceran",
    sellValue: "5 botol",
    remainLabel: "Sisa Stok Sistem",
    remainValue: "19 botol",
    example: "Contoh: Air mineral 600 ml yang dibeli per dus isi 24 dan dijual satuan di kasir.",
  },
  {
    id: "resep",
    label: "Resep & Varian",
    summary: "Setiap menu F&B otomatis memotong takaran bahan baku sesuai ukuran varian yang dipesan.",
    buyLabel: "Stok Bahan Baku",
    buyValue: "1.000 ml susu",
    sellLabel: "Jual 2 Cup Large",
    sellValue: "-60 ml susu",
    remainLabel: "Sisa Bahan Sistem",
    remainValue: "940 ml",
    example: "Contoh: Es Kopi Susu Regular (20 ml) dan Large (30 ml) dengan HPP terhitung otomatis.",
  },
];

const WORKFLOW_STEPS = [
  {
    num: "01",
    title: "Foto Nota, AI Periksa Otomatis",
    copy: "Unggah foto nota belanja pemasok. Sistem mencocokkan rincian item dan menandai nota ganda sebelum stok disetujui.",
    previewLabel: "Nota #NP-108",
    previewDetail: "Total item cocok Rp 640.000",
    previewStatus: "Sesuai",
    previewStatusClass: "border-[#01DAD7] bg-[#01DAD7]/20 text-[#202531]",
  },
  {
    num: "02",
    title: "Kasir Cepat, Stok Langsung Terpotong",
    copy: "Setiap struk penjualan langsung mengurangi stok barang atau bahan baku secara tepat sesuai resep dan satuan jual.",
    previewLabel: "2x Es Kopi Large",
    previewDetail: "-60 ml susu, -16 g kopi",
    previewStatus: "Stok Terpotong",
    previewStatusClass: "border-[#202531] bg-[#202531] text-[#01DAD7]",
  },
  {
    num: "03",
    title: "Laporan Laba Jelas Setiap Hari",
    copy: "Pantau uang masuk, modal barang yang terpakai, dan keuntungan jualan secara otomatis tanpa rekap manual.",
    previewLabel: "Ringkasan Harian",
    previewDetail: "Masuk Rp 2.450.000 - Modal Rp 1.400.000",
    previewStatus: "Untung Rp 1.050.000",
    previewStatusClass: "border-[#01DAD7] bg-[#01DAD7]/20 text-[#202531]",
  },
];

export function LandingPage({
  isAuthenticated: initialAuthenticated = false,
  navCtaHref: initialNavCtaHref = "/login?redirect=/dashboard",
  navCtaLabel: initialNavCtaLabel = "Masuk",
  heroCtaHref: initialHeroCtaHref = "/login?redirect=/dashboard",
  heroCtaLabel: initialHeroCtaLabel = "Mulai Kelola Toko",
  finalCtaHref: initialFinalCtaHref = "/register?redirect=/dashboard",
  finalCtaLabel: initialFinalCtaLabel = "Buat Akun Gratis",
}: LandingPageProps) {
  const menuId = useId().replace(/:/g, "");
  const tabBaseId = useId().replace(/:/g, "");
  const headerRef = useRef<HTMLElement>(null);
  const headerInnerRef = useRef<HTMLDivElement>(null);
  const brandRef = useRef<HTMLAnchorElement>(null);
  const navRef = useRef<HTMLElement>(null);
  const ctaRef = useRef<HTMLAnchorElement>(null);
  const menuTriggerRef = useRef<HTMLButtonElement>(null);
  const siteMenuRef = useRef<HTMLUListElement>(null);
  const tabButtonRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const [ctaState, setCtaState] = useState<AuthCtaState>({
    isAuthenticated: initialAuthenticated,
    navCtaHref: initialNavCtaHref,
    navCtaLabel: initialNavCtaLabel,
    heroCtaHref: initialHeroCtaHref,
    heroCtaLabel: initialHeroCtaLabel,
    finalCtaHref: initialFinalCtaHref,
    finalCtaLabel: initialFinalCtaLabel,
  });

  const [navigatingTarget, setNavigatingTarget] = useState<string | null>(null);
  const navResetTimerRef = useRef<number | null>(null);
  const authAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      if (navResetTimerRef.current !== null) {
        window.clearTimeout(navResetTimerRef.current);
      }
      authAbortRef.current?.abort();
    };
  }, []);

  const handleCtaClick = (targetId: string) => {
    authAbortRef.current?.abort();
    setNavigatingTarget(targetId);
    if (navResetTimerRef.current !== null) {
      window.clearTimeout(navResetTimerRef.current);
    }
    navResetTimerRef.current = window.setTimeout(() => {
      setNavigatingTarget(null);
    }, 8000);
  };

  const {
    isAuthenticated,
    navCtaHref,
    navCtaLabel,
    heroCtaHref,
    heroCtaLabel,
    finalCtaHref,
    finalCtaLabel,
  } = ctaState;

  const [activeMethod, setActiveMethod] = useState<StockMethodKey>("tetap");
  const currentMethod =
    STOCK_METHODS.find((item) => item.id === activeMethod) ?? STOCK_METHODS[0];

  // Hydrasi Smart Auth CTA di latar belakang (non-blocking) agar halaman statis tampil instan 0ms
  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    authAbortRef.current = controller;

    try {
      const cached = window.sessionStorage.getItem(AUTH_CTA_STORAGE_KEY);
      if (cached) {
        const parsed = JSON.parse(cached) as AuthCtaState;
        if (parsed && typeof parsed.navCtaHref === "string") {
          setCtaState(parsed);
        }
      }
    } catch {
      // ignore storage error
    }

    fetch("/api/auth/me", { cache: "no-store", signal: controller.signal })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled || !data) return;
        let nextState: AuthCtaState = {
          isAuthenticated: false,
          navCtaHref: "/login?redirect=/dashboard",
          navCtaLabel: "Masuk",
          heroCtaHref: "/login?redirect=/dashboard",
          heroCtaLabel: "Mulai Kelola Toko",
          finalCtaHref: "/register?redirect=/dashboard",
          finalCtaLabel: "Buat Akun Gratis",
        };
        if (data.authenticated && data.user) {
          if (!data.user.isAssigned) {
            const waitingHref =
              isStoreAdmin(data.user.role) && data.needsInitialSetup
                ? "/setup"
                : "/menunggu-undangan";
            const waitingLabel =
              isStoreAdmin(data.user.role) && data.needsInitialSetup
                ? "Lanjutkan Setup"
                : "Cek Undangan";
            nextState = {
              isAuthenticated: true,
              navCtaHref: waitingHref,
              navCtaLabel: waitingLabel,
              heroCtaHref: waitingHref,
              heroCtaLabel: waitingLabel,
              finalCtaHref: waitingHref,
              finalCtaLabel: waitingLabel,
            };
          } else {
            const appHref = getDefaultRedirectForRole(data.user.role, true);
            nextState = {
              isAuthenticated: true,
              navCtaHref: appHref,
              navCtaLabel: "Buka Dashboard",
              heroCtaHref: appHref,
              heroCtaLabel: "Buka Dashboard",
              finalCtaHref: appHref,
              finalCtaLabel: "Masuk ke Dashboard",
            };
          }
        }
        setCtaState(nextState);
        try {
          window.sessionStorage.setItem(AUTH_CTA_STORAGE_KEY, JSON.stringify(nextState));
        } catch {
          // ignore
        }
      })
      .catch(() => {});

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    if (!Object.hasOwn(HTMLElement.prototype, "popover")) {
      const script = document.createElement("script");
      script.type = "module";
      script.src = "https://unpkg.com/@oddbird/popover-polyfill@latest/dist/popover.min.js";
      document.head.appendChild(script);
    }

    const header = headerRef.current;
    const headerInner = headerInnerRef.current;
    const brand = brandRef.current;
    const nav = navRef.current;
    const cta = ctaRef.current;
    const menuTrigger = menuTriggerRef.current;
    const siteMenu = siteMenuRef.current;
    if (!header || !headerInner || !brand || !nav || !cta || !menuTrigger || !siteMenu) return;

    let lastNarrowWidth = 0;

    const syncHeaderLayout = () => {
      const wasWide = header.classList.contains("is-wide");
      const currentWidth = header.clientWidth;

      if (!wasWide && currentWidth <= lastNarrowWidth) {
        return;
      }

      const wasOpen = !wasWide && siteMenu.matches(":popover-open, .\\:popover-open");
      header.classList.add("is-measuring", "is-wide");
      siteMenu.removeAttribute("popover");

      const brandRect = brand.getBoundingClientRect();
      const navRect = nav.getBoundingClientRect();
      const ctaRect = cta.getBoundingClientRect();

      const fitsInline =
        headerInner.scrollWidth <= headerInner.clientWidth &&
        brandRect.right + 20 <= navRect.left &&
        navRect.right + 20 <= ctaRect.left;

      if (fitsInline) {
        menuTrigger.setAttribute("aria-expanded", "false");
      } else {
        header.classList.remove("is-wide");
        siteMenu.setAttribute("popover", "auto");
        lastNarrowWidth = currentWidth;
        if (wasOpen && typeof siteMenu.showPopover === "function") {
          siteMenu.showPopover();
        }
      }

      requestAnimationFrame(() => {
        header.classList.remove("is-measuring");
      });
    };

    const observer = new ResizeObserver(syncHeaderLayout);
    observer.observe(header);
    observer.observe(siteMenu);

    const onToggle = (event: Event) => {
      const toggleEvent = event as ToggleEvent;
      menuTrigger.setAttribute("aria-expanded", String(toggleEvent.newState === "open"));
    };

    siteMenu.addEventListener("toggle", onToggle);
    syncHeaderLayout();

    return () => {
      observer.disconnect();
      siteMenu.removeEventListener("toggle", onToggle);
    };
  }, []);

  const closeNarrowMenu = () => {
    const header = headerRef.current;
    const siteMenu = siteMenuRef.current;
    if (
      header &&
      siteMenu &&
      !header.classList.contains("is-wide") &&
      typeof siteMenu.hidePopover === "function"
    ) {
      try {
        siteMenu.hidePopover();
      } catch {
        // Ignore if already closed
      }
    }
  };

  const handleTabKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    let nextIndex = index;
    if (event.key === "ArrowRight") {
      nextIndex = (index + 1) % STOCK_METHODS.length;
    } else if (event.key === "ArrowLeft") {
      nextIndex = (index - 1 + STOCK_METHODS.length) % STOCK_METHODS.length;
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = STOCK_METHODS.length - 1;
    } else {
      return;
    }
    event.preventDefault();
    setActiveMethod(STOCK_METHODS[nextIndex].id);
    tabButtonRefs.current[nextIndex]?.focus();
  };

  return (
    <div id="top" className="landing-root min-h-screen bg-white text-[#0F172A] selection:bg-[#01DAD7]/25 selection:text-[#0F172A]">
      <a href="#konten-utama" className="landing-skip-link">
        Lewati ke konten utama
      </a>

      {/* Section 1A: Sticky 3-Zone White Navbar */}
      <header
        ref={headerRef}
        className="landing-header sticky top-0 z-40 border-b border-slate-200/80 bg-white"
      >
        <div
          ref={headerInnerRef}
          className="landing-header-inner mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3.5 sm:px-6 lg:px-8 lg:py-4"
        >
          <a
            ref={brandRef}
            href="#top"
            className="landing-brand inline-flex min-h-[44px] items-center gap-3 rounded-lg pr-2 text-[#111827] cursor-pointer"
          >
            <span
              className="inline-flex h-10 w-10 items-center justify-center rounded-[13px] bg-[#202531] text-[#01DAD7]"
              aria-hidden="true"
            >
              <svg
                width="21"
                height="21"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M12 3.5 19 7.5 12 11.5 5 7.5 12 3.5Z" />
                <path d="M5 12 12 16 19 12" />
                <path d="M5 16.5 12 20.5 19 16.5" />
              </svg>
            </span>
            <span className="text-[1.35rem] font-semibold tracking-[-0.03em] text-[#111827]">
              TRASIR
            </span>
          </a>

          <nav ref={navRef} aria-label="Utama" className="landing-nav flex items-center">
            <button
              ref={menuTriggerRef}
              type="button"
              className="landing-menu-trigger inline-flex min-h-[44px] min-w-[44px] items-center justify-center gap-2 rounded-full border border-slate-200 bg-white px-4 text-sm font-medium text-[#111827] transition-colors duration-150 hover:border-[#202531] hover:text-[#202531] cursor-pointer"
              {...({
                popoverTarget: menuId,
                popoverTargetAction: "toggle",
              } as Record<string, string>)}
              aria-controls={menuId}
              aria-expanded="false"
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                aria-hidden="true"
              >
                <path d="M4 7h16" />
                <path d="M4 12h16" />
                <path d="M4 17h16" />
              </svg>
              <span>Menu</span>
            </button>

            <ul
              ref={siteMenuRef}
              id={menuId}
              className="landing-menu"
              {...({ popover: "auto" } as Record<string, string>)}
            >
              <li>
                <a
                  href="#cara-kerja"
                  onClick={closeNarrowMenu}
                  className="landing-nav-link flex min-h-[44px] items-center rounded-xl px-4 text-[15px] font-medium text-[#1E293B] transition-colors duration-150 hover:bg-slate-50 hover:text-[#202531] cursor-pointer whitespace-nowrap"
                >
                  Cara Kerja
                </a>
              </li>
              <li>
                <a
                  href="#metode-stok"
                  onClick={closeNarrowMenu}
                  className="landing-nav-link flex min-h-[44px] items-center rounded-xl px-4 text-[15px] font-medium text-[#1E293B] transition-colors duration-150 hover:bg-slate-50 hover:text-[#202531] cursor-pointer whitespace-nowrap"
                >
                  Metode Stok
                </a>
              </li>
              <li>
                <a
                  href="#audit-adil"
                  onClick={closeNarrowMenu}
                  className="landing-nav-link flex min-h-[44px] items-center rounded-xl px-4 text-[15px] font-medium text-[#1E293B] transition-colors duration-150 hover:bg-slate-50 hover:text-[#202531] cursor-pointer whitespace-nowrap"
                >
                  Audit Adil
                </a>
              </li>
              <li className="landing-menu-mobile-cta pt-2 border-t border-slate-100">
                <Link
                  href={navCtaHref}
                  onClick={() => {
                    closeNarrowMenu();
                    handleCtaClick("nav-mobile");
                  }}
                  className={`flex min-h-[44px] items-center justify-center gap-2 rounded-full bg-[#01DAD7] px-5 text-sm font-bold text-[#202531] transition-opacity duration-150 hover:opacity-90 active:scale-[0.98] ${
                    navigatingTarget === "nav-mobile" ? "opacity-90 pointer-events-none" : ""
                  }`}
                >
                  {navigatingTarget === "nav-mobile" ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                      <span>Membuka...</span>
                    </>
                  ) : (
                    navCtaLabel
                  )}
                </Link>
              </li>
            </ul>
          </nav>

          <Link
            ref={ctaRef}
            href={navCtaHref}
            onClick={() => handleCtaClick("nav-desktop")}
            className={`landing-header-cta min-h-[44px] items-center justify-center gap-2 rounded-full bg-[#01DAD7] px-6 text-[15px] font-bold text-[#202531] transition-opacity duration-150 hover:opacity-90 active:scale-[0.98] whitespace-nowrap ${
              navigatingTarget === "nav-desktop" ? "opacity-90 pointer-events-none" : ""
            }`}
          >
            {navigatingTarget === "nav-desktop" ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                <span>Membuka...</span>
              </>
            ) : (
              navCtaLabel
            )}
          </Link>
        </div>
      </header>

      <main id="konten-utama">
        {/* Section 1B: Hero (Above the Fold, Z-Pattern) */}
        <section className="overflow-x-clip border-b border-slate-200/80 bg-white">
          <div className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-8 px-4 py-10 sm:px-6 sm:py-14 lg:grid-cols-12 lg:gap-6 lg:px-8 lg:py-16">
            <div className="landing-enter-copy space-y-6 lg:col-span-5">

              <h1 className="landing-hero-title font-extrabold text-[#0F172A]">
                Awasi Setiap Transaksi, Kendalikan Bisnis Sepenuhnya.
              </h1>

              <p className="landing-pretty-copy max-w-xl text-base leading-relaxed text-[#475569] sm:text-lg">
                Sistem kasir dan inventaris web untuk ritel hingga F&amp;B. Setiap nota, transaksi, dan selisih stok tercatat rapi dengan bukti objektif.
              </p>

              <div className="flex flex-wrap items-center gap-4 pt-2">
                <Link
                  href={heroCtaHref}
                  onClick={() => handleCtaClick("hero")}
                  className={`inline-flex min-h-[48px] items-center justify-center gap-2 rounded-full bg-[#01DAD7] px-7 text-sm font-bold text-[#202531] transition-opacity duration-150 hover:opacity-90 active:scale-[0.98] sm:text-base ${
                    navigatingTarget === "hero" ? "opacity-90 pointer-events-none" : ""
                  }`}
                >
                  {navigatingTarget === "hero" ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                      <span>Membuka...</span>
                    </>
                  ) : (
                    <>
                      <span>{heroCtaLabel}</span>
                      <ArrowRight className="h-4 w-4" aria-hidden="true" />
                    </>
                  )}
                </Link>
                <a
                  href="#cara-kerja"
                  className="inline-flex min-h-[48px] items-center justify-center rounded-full px-4 text-sm font-semibold text-[#202531] transition-colors duration-150 hover:bg-slate-100 hover:text-[#0F172A] sm:text-base"
                >
                  Lihat cara kerjanya ↓
                </a>
              </div>
            </div>

            {/* 3D Miniatur Diorama Interaktif */}
            <div className="landing-enter-visual lg:col-span-7">
              <HeroDiorama3D paused={Boolean(navigatingTarget)} />
            </div>
          </div>
        </section>

        {/* Section 2: Ketegangan Emosional -> Bukti Data */}
        <section className="border-b border-slate-200/80 bg-[#EBEBEB]">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24 lg:px-8">
            <div className="max-w-2xl">
              <p className="text-xs font-bold uppercase tracking-wider text-[#202531]">
                Transparansi Dua Arah
              </p>
              <h2 className="landing-section-title mt-2 font-extrabold text-[#0F172A]">
                Bukan sekadar kasir. Ini sistem saling percaya berbasis data.
              </h2>
            </div>

            <div className="landing-surface-card mt-10 grid grid-cols-1 divide-y divide-slate-200 rounded-2xl border border-slate-200 bg-white md:grid-cols-2 md:divide-x md:divide-y-0">
              <div className="p-7 sm:p-10 space-y-3">
                <p className="text-xs font-bold uppercase tracking-wider text-[#202531]">
                  Sisi Pemilik &amp; Manajer
                </p>
                <h3 className="text-lg font-bold text-[#0F172A]">
                  Kendali penuh tanpa harus menunggu di toko.
                </h3>
                <p className="landing-pretty-copy text-sm leading-relaxed text-[#475569] sm:text-base">
                  Nota belanja diperiksa otomatis untuk mendeteksi selisih hitung atau foto ganda. Setiap perubahan transaksi dan penyesuaian stok melewati persetujuan yang tercatat rapi.
                </p>
              </div>

              <div className="p-7 sm:p-10 space-y-3">
                <p className="text-xs font-bold uppercase tracking-wider text-[#202531]">
                  Sisi Pegawai Jujur
                </p>
                <h3 className="text-lg font-bold text-[#0F172A]">
                  Kerja tenang dengan bukti kerja yang objektif.
                </h3>
                <p className="landing-pretty-copy text-sm leading-relaxed text-[#475569] sm:text-base">
                  Setiap shift kasir dan hitung stok tersimpan atas nama akun masing-masing. Saat terjadi selisih di area etalase pelanggan, pegawai terlindungi dari tuduhan tanpa bukti.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Section 3: Alur Operasional 3 Langkah */}
        <section id="cara-kerja" className="scroll-mt-24 border-b border-slate-200/80 bg-white">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24 lg:px-8">
            <div className="max-w-2xl">
              <p className="text-xs font-bold uppercase tracking-wider text-[#202531]">
                Alur Operasional Harian
              </p>
              <h2 className="landing-section-title mt-2 font-extrabold text-[#0F172A]">
                Tiga langkah untuk menutup celah selisih harian.
              </h2>
            </div>

            <ol className="mt-10 grid grid-cols-1 gap-6 md:grid-cols-3">
              {WORKFLOW_STEPS.map((step) => (
                <li
                  key={step.num}
                  className="landing-surface-card flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-6"
                >
                  <div>
                    <span className="font-mono text-3xl font-extrabold tracking-tight text-[#202531] tabular-nums">
                      {step.num}
                    </span>
                    <h3 className="mt-4 text-lg font-bold text-[#0F172A]">{step.title}</h3>
                    <p className="landing-pretty-copy mt-2 text-sm leading-relaxed text-[#475569]">
                      {step.copy}
                    </p>
                  </div>

                  <div className="mt-6 rounded-xl border border-slate-200 bg-[#EBEBEB] p-3.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-bold text-[#0F172A]">
                        {step.previewLabel}
                      </span>
                      <span
                        className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${step.previewStatusClass}`}
                      >
                        {step.previewStatus}
                      </span>
                    </div>
                    <p className="mt-1.5 font-mono text-xs text-[#475569] tabular-nums">
                      {step.previewDetail}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Section 4: Tiga Metode Stok (Accessible Interactive Tab Switcher) */}
        <section id="metode-stok" className="scroll-mt-24 border-b border-slate-200/80 bg-[#EBEBEB]">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24 lg:px-8">
            <div className="max-w-2xl">
              <p className="text-xs font-bold uppercase tracking-wider text-[#202531]">
                Fleksibel Untuk Ritel &amp; F&amp;B
              </p>
              <h2 className="landing-section-title mt-2 font-extrabold text-[#0F172A]">
                Satu sistem, cocok untuk semua cara jualan Anda.
              </h2>
            </div>

            <div className="mt-8">
              <div
                role="tablist"
                aria-label="Pilih metode pengurangan stok"
                className="inline-flex flex-wrap gap-2 rounded-2xl border border-slate-200 bg-white p-1.5"
              >
                {STOCK_METHODS.map((method, index) => {
                  const selected = method.id === activeMethod;
                  return (
                    <button
                      key={method.id}
                      ref={(el) => {
                        tabButtonRefs.current[index] = el;
                      }}
                      id={`${tabBaseId}-tab-${method.id}`}
                      type="button"
                      role="tab"
                      aria-selected={selected}
                      aria-controls={`${tabBaseId}-panel-${method.id}`}
                      tabIndex={selected ? 0 : -1}
                      onClick={() => setActiveMethod(method.id)}
                      onKeyDown={(e) => handleTabKeyDown(e, index)}
                      className={`min-h-[44px] rounded-xl px-4 py-2 text-sm font-semibold transition-colors duration-150 cursor-pointer ${
                        selected
                          ? "bg-[#202531] text-white shadow-sm"
                          : "text-[#475569] hover:bg-slate-100 hover:text-[#0F172A]"
                      }`}
                    >
                      {method.label}
                    </button>
                  );
                })}
              </div>

              <div
                id={`${tabBaseId}-panel-${currentMethod.id}`}
                role="tabpanel"
                aria-labelledby={`${tabBaseId}-tab-${currentMethod.id}`}
                tabIndex={0}
                className="landing-surface-card mt-5 rounded-2xl border border-slate-200 bg-white p-6 sm:p-8"
              >
                <p className="landing-pretty-copy max-w-2xl text-base font-medium text-[#0F172A]">
                  {currentMethod.summary}
                </p>

                <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div className="rounded-xl border border-slate-200 bg-[#EBEBEB] p-4">
                    <p className="text-xs font-semibold text-[#475569]">
                      1. {currentMethod.buyLabel}
                    </p>
                    <p className="mt-1 font-mono text-lg font-extrabold text-[#202531] tabular-nums">
                      {currentMethod.buyValue}
                    </p>
                  </div>

                  <div className="rounded-xl border border-slate-200 bg-[#EBEBEB] p-4">
                    <p className="text-xs font-semibold text-[#475569]">
                      2. {currentMethod.sellLabel}
                    </p>
                    <p className="mt-1 font-mono text-lg font-extrabold text-[#202531] tabular-nums">
                      {currentMethod.sellValue}
                    </p>
                  </div>

                  <div className="rounded-xl border border-[#01DAD7] bg-[#01DAD7]/15 p-4">
                    <p className="text-xs font-semibold text-[#202531]">
                      3. {currentMethod.remainLabel}
                    </p>
                    <p className="mt-1 font-mono text-lg font-extrabold text-[#202531] tabular-nums">
                      {currentMethod.remainValue}
                    </p>
                  </div>
                </div>

                <p className="mt-5 text-sm text-[#475569]">{currentMethod.example}</p>
              </div>
            </div>
          </div>
        </section>

        {/* Section 5: Audit Adil & Laba Kotor Nyata */}
        <section id="audit-adil" className="scroll-mt-24 border-b border-slate-200/80 bg-white">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24 lg:px-8">
            <div className="max-w-2xl">
              <p className="text-xs font-bold uppercase tracking-wider text-[#202531]">
                Keadilan Audit &amp; Kejelasan Laba
              </p>
              <h2 className="landing-section-title mt-2 font-extrabold text-[#0F172A]">
                Audit stok yang adil, laporan laba yang jujur.
              </h2>
            </div>

            <div className="mt-10 grid grid-cols-1 gap-6 lg:grid-cols-2">
              {/* Block A: Area Terbuka vs Area Tertutup + Tolerance */}
              <div className="landing-surface-card rounded-2xl border border-slate-200 bg-white p-6 sm:p-8 flex flex-col justify-between gap-6">
                <div className="space-y-2">
                  <h3 className="text-lg font-bold text-[#0F172A]">
                    Klasifikasi Area Opname &amp; Batas Toleransi
                  </h3>
                  <p className="landing-pretty-copy text-sm leading-relaxed text-[#475569]">
                    Selisih stok dipisahkan antara area akses pelanggan dan area khusus pegawai agar evaluasi tetap adil.
                  </p>
                </div>

                <div className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#FDE68A] bg-[#FFFBEB] px-4 py-3">
                    <span className="text-xs font-bold text-[#B45309]">Area Terbuka</span>
                    <span className="text-xs font-medium text-[#B45309]">
                      Etalase pelanggan, evaluasi risiko bersama
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#FECDD3] bg-[#FFF0F4] px-4 py-3">
                    <span className="text-xs font-bold text-[#D41448]">Area Tertutup</span>
                    <span className="text-xs font-medium text-[#D41448]">
                      Gudang &amp; dapur pegawai, audit internal langsung
                    </span>
                  </div>

                  <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-[#EBEBEB] px-4 py-3">
                    <span className="text-xs font-semibold text-[#475569]">
                      Batas Toleransi Default
                    </span>
                    <span className="font-mono text-sm font-extrabold text-[#202531] tabular-nums">
                      Rp 50.000
                    </span>
                  </div>
                </div>
              </div>

              {/* Block B: Laba Kotor Berbasis HPP */}
              <div className="landing-surface-card rounded-2xl border border-slate-200 bg-white p-6 sm:p-8 flex flex-col justify-between gap-6">
                <div className="space-y-2">
                  <h3 className="text-lg font-bold text-[#0F172A]">
                    Laba Kotor Otomatis Berbasis HPP
                  </h3>
                  <p className="landing-pretty-copy text-sm leading-relaxed text-[#475569]">
                    Lihat selisih penjualan dan modal pokok aktual setiap hari tanpa rekap manual di akhir bulan.
                  </p>
                </div>

                <div className="space-y-4 rounded-xl border border-slate-200 bg-[#EBEBEB] p-5">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-[#475569]">
                    Ilustrasi Perhitungan Harian
                  </p>

                  <div className="space-y-3">
                    <div>
                      <div className="mb-1 flex items-center justify-between text-xs font-semibold text-[#0F172A]">
                        <span>Penjualan Kotor</span>
                        <span className="font-mono tabular-nums">Rp 5.000.000</span>
                      </div>
                      <div className="h-2.5 w-full rounded-full bg-slate-200 overflow-hidden">
                        <div className="h-full w-full rounded-full bg-[#202531]" />
                      </div>
                    </div>

                    <div>
                      <div className="mb-1 flex items-center justify-between text-xs font-semibold text-[#475569]">
                        <span>HPP (Modal Pokok Terjual)</span>
                        <span className="font-mono tabular-nums">Rp 3.150.000</span>
                      </div>
                      <div className="h-2.5 w-full rounded-full bg-slate-200 overflow-hidden">
                        <div className="h-full w-[63%] rounded-full bg-slate-500" />
                      </div>
                    </div>

                    <div>
                      <div className="mb-1 flex items-center justify-between text-xs font-bold text-[#202531]">
                        <span>Laba Kotor Nyata</span>
                        <span className="font-mono tabular-nums">Rp 1.850.000</span>
                      </div>
                      <div className="h-2.5 w-full rounded-full bg-slate-200 overflow-hidden">
                        <div className="h-full w-[37%] rounded-full bg-[#01DAD7]" />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Section 6: Final CTA & Multi-Role Onboarding */}
        <section className="bg-[#EBEBEB]">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24 lg:px-8">
            <div className="landing-surface-card mx-auto max-w-3xl rounded-2xl border border-slate-200 bg-white px-6 py-12 text-center shadow-sm sm:px-12 sm:py-16">
              <h2 className="landing-section-title font-extrabold text-[#0F172A]">
                Siap jalankan toko yang transparan hari ini?
              </h2>
              <p className="landing-pretty-copy mx-auto mt-4 max-w-xl text-sm leading-relaxed text-[#475569] sm:text-base">
                Daftar sebagai Pemilik/Manajer untuk menyiapkan toko, atau sebagai Kasir/Gudang untuk bergabung lewat username.
              </p>

              <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row sm:gap-5">
                <Link
                  href={finalCtaHref}
                  onClick={() => handleCtaClick("final")}
                  className={`inline-flex min-h-[48px] items-center justify-center gap-2 rounded-full bg-[#01DAD7] px-8 text-sm font-bold text-[#202531] transition-opacity duration-150 hover:opacity-90 active:scale-[0.98] sm:text-base ${
                    navigatingTarget === "final" ? "opacity-90 pointer-events-none" : ""
                  }`}
                >
                  {navigatingTarget === "final" ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                      <span>Membuka...</span>
                    </>
                  ) : (
                    finalCtaLabel
                  )}
                </Link>

                {!isAuthenticated && (
                  <Link
                    href="/login?redirect=/dashboard"
                    onClick={() => handleCtaClick("final-login")}
                    className={`inline-flex min-h-[44px] items-center justify-center gap-2 px-3 text-sm font-semibold text-[#202531] transition-all duration-150 hover:text-[#202531] hover:underline active:scale-[0.98] ${
                      navigatingTarget === "final-login" ? "opacity-80 pointer-events-none" : ""
                    }`}
                  >
                    {navigatingTarget === "final-login" ? (
                      <>
                        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                        <span>Membuka halaman masuk...</span>
                      </>
                    ) : (
                      "Sudah punya akun? Masuk"
                    )}
                  </Link>
                )}
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Clean 1-Row Footer */}
      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 py-6 text-xs text-[#475569] sm:flex-row sm:px-6 lg:px-8">
          <div className="flex items-center gap-2 font-semibold text-[#0F172A]">
            <span>TRASIR</span>
            <span className="text-slate-300" aria-hidden="true">|</span>
            <span className="font-normal text-[#475569]">Transparan Kasir</span>
          </div>

          <nav aria-label="Footer" className="flex flex-wrap items-center justify-center gap-5">
            <a href="#cara-kerja" className="hover:text-[#202531] transition-colors">
              Cara Kerja
            </a>
            <a href="#metode-stok" className="hover:text-[#202531] transition-colors">
              Metode Stok
            </a>
            <a href="#audit-adil" className="hover:text-[#202531] transition-colors">
              Audit Adil
            </a>
            <Link
              href={navCtaHref}
              onClick={() => handleCtaClick("footer")}
              className={`inline-flex items-center gap-1.5 font-semibold text-[#202531] hover:text-[#202531] active:scale-[0.98] transition-all ${
                navigatingTarget === "footer" ? "opacity-80 pointer-events-none" : ""
              }`}
            >
              {navigatingTarget === "footer" ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                  <span>Membuka...</span>
                </>
              ) : (
                navCtaLabel
              )}
            </Link>
          </nav>

          <p>© 2026 TRASIR</p>
        </div>
      </footer>
    </div>
  );
}
