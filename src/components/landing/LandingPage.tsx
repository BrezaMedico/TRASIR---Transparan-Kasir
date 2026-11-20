"use client";

import React, { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";

interface LandingPageProps {
  ctaHref: string;
  ctaLabel: string;
  closingCtaLabel: string;
}

type ScenarioKey = "valid" | "anomaly";

interface ScenarioSpec {
  title: string;
  badgeText: string;
  badgeClasses: string;
  dotClasses: string;
  pos: string;
  receipt: string;
  iconWrapClasses: string;
  findingHeading: string;
  findingCopy: string;
}

const SCENARIOS: Record<ScenarioKey, ScenarioSpec> = {
  valid: {
    title: "Nota #NP-108 Terverifikasi",
    badgeText: "Sesuai Sistem",
    badgeClasses: "border-[#99F6E4] bg-[#F0FDFA] text-[#0F766E]",
    dotClasses: "bg-[#0F766E]",
    pos: "Rp 4.820.000",
    receipt: "Rp 640.000",
    iconWrapClasses: "bg-[#F0FDFA] text-[#0F766E]",
    findingHeading: "Stok Masuk & Rincian Cocok",
    findingCopy: "Nominal struk sama dengan penjumlahan item dan stok bertambah 24 unit.",
  },
  anomaly: {
    title: "Nota #NP-112 Terindikasi Selisih",
    badgeText: "Perlu Audit Pemilik",
    badgeClasses: "border-[#FBCFE8] bg-[#FDF2F8] text-[#9D174D]",
    dotClasses: "bg-[#FC5086]",
    pos: "Rp 4.820.000",
    receipt: "Rp 515.000",
    iconWrapClasses: "bg-[#FDF2F8] text-[#9D174D]",
    findingHeading: "Selisih Rp 50.000 & Foto Berulang",
    findingCopy: "Total struk tidak cocok dengan jumlah item Rp 465.000 dan terindikasi nota ganda.",
  },
};

export function LandingPage({ ctaHref, ctaLabel, closingCtaLabel }: LandingPageProps) {
  const menuId = useId().replace(/:/g, "");
  const headerRef = useRef<HTMLElement>(null);
  const headerInnerRef = useRef<HTMLDivElement>(null);
  const brandRef = useRef<HTMLAnchorElement>(null);
  const navRef = useRef<HTMLElement>(null);
  const ctaRef = useRef<HTMLAnchorElement>(null);
  const menuTriggerRef = useRef<HTMLButtonElement>(null);
  const siteMenuRef = useRef<HTMLUListElement>(null);

  const [scenario, setScenario] = useState<ScenarioKey>("valid");

  const currentScenario = SCENARIOS[scenario];

  useEffect(() => {
    if (typeof window === "undefined") return;

    // Muat polyfill popover hanya jika dukungan native browser belum tersedia
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
    if (header && siteMenu && !header.classList.contains("is-wide") && typeof siteMenu.hidePopover === "function") {
      try {
        siteMenu.hidePopover();
      } catch {
        // Ignore if popover already closed
      }
    }
  };

  return (
    <div className="landing-root min-h-screen bg-[#F8FAFC] text-[#0F172A] selection:bg-[#38BDF8]/30 selection:text-[#0F172A]">
      <a href="#konten-utama" className="landing-skip-link">
        Lewati ke konten utama
      </a>

      {/* Centered 3-Zone Reference Navbar */}
      <header
        ref={headerRef}
        className="landing-header sticky top-0 z-40 border-b border-slate-200/75 bg-white"
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
              className="inline-flex h-10 w-10 items-center justify-center rounded-[13px] bg-[#2563EB] text-white shadow-[0_8px_18px_-8px_rgba(37,99,235,0.55)]"
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
              className="landing-menu-trigger inline-flex min-h-[44px] min-w-[44px] items-center justify-center gap-2 rounded-full border border-slate-200 bg-white px-4 text-sm font-medium text-[#111827] transition-colors duration-150 hover:border-[#2563EB] hover:text-[#2563EB] cursor-pointer"
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
                  href="#fitur"
                  onClick={closeNarrowMenu}
                  className="landing-nav-link flex min-h-[44px] items-center rounded-xl px-4 text-[15px] font-medium text-[#1E293B] transition-colors duration-150 hover:bg-slate-50 hover:text-[#2563EB] cursor-pointer whitespace-nowrap"
                >
                  Fitur Utama
                </a>
              </li>
              <li>
                <a
                  href="#simulasi"
                  onClick={closeNarrowMenu}
                  className="landing-nav-link flex min-h-[44px] items-center rounded-xl px-4 text-[15px] font-medium text-[#1E293B] transition-colors duration-150 hover:bg-slate-50 hover:text-[#2563EB] cursor-pointer whitespace-nowrap"
                >
                  Simulasi Audit
                </a>
              </li>
              <li>
                <a
                  href="#mulai"
                  onClick={closeNarrowMenu}
                  className="landing-nav-link flex min-h-[44px] items-center rounded-xl px-4 text-[15px] font-medium text-[#1E293B] transition-colors duration-150 hover:bg-slate-50 hover:text-[#2563EB] cursor-pointer whitespace-nowrap"
                >
                  Akses Sistem
                </a>
              </li>
              <li className="landing-menu-mobile-cta pt-1.5">
                <Link
                  href={ctaHref}
                  onClick={closeNarrowMenu}
                  className="inline-flex min-h-[44px] w-full items-center justify-center rounded-full bg-[#2563EB] px-6 text-[15px] font-medium text-white shadow-[0_8px_20px_-8px_rgba(37,99,235,0.5)] transition duration-150 hover:bg-[#1D4ED8] active:scale-[0.985] cursor-pointer"
                >
                  {ctaLabel}
                </Link>
              </li>
            </ul>
          </nav>

          <Link
            ref={ctaRef}
            href={ctaHref}
            className="landing-header-cta min-h-[44px] items-center justify-center rounded-full bg-[#2563EB] px-7 py-2.5 text-[15px] font-medium text-white shadow-[0_8px_20px_-8px_rgba(37,99,235,0.5)] transition duration-150 hover:-translate-y-[1px] hover:bg-[#1D4ED8] active:scale-[0.985] cursor-pointer whitespace-nowrap"
          >
            {ctaLabel}
          </Link>
        </div>
      </header>

      <main id="top">
        {/* Hero Section with Architectural Blueprint Grid & Layered Translucent Glass Depth */}
        <section className="relative overflow-hidden pb-16 pt-10 sm:pb-24 sm:pt-14 lg:flex lg:min-h-[min(calc(100svh-4.6rem),52rem)] lg:items-center lg:py-20">
          <div className="landing-arch-grid pointer-events-none absolute inset-0 [mask-image:radial-gradient(ellipse_90%_85%_at_50%_35%,#000_50%,transparent_100%)]" aria-hidden="true" />
          <div className="landing-hero-glow pointer-events-none absolute inset-0" aria-hidden="true" />

          <div className="relative mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8">
            <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-12 lg:gap-8">
              {/* Hero Copy Left */}
              <div className="landing-enter-copy lg:col-span-5">
                <p className="mb-4 text-xs font-bold uppercase tracking-[0.14em] text-[#475569]">
                  Sistem Transparansi Operasional Toko
                </p>

                <h1 id="konten-utama" tabIndex={-1} className="landing-hero-title font-extrabold text-[#0F172A]">
                  Pantau Kasir, Stok,{" "}
                  <span className="font-bold text-[#64748B]">dan Nota </span>
                  <span className="text-[#2563EB]">Tanpa Celah</span>
                </h1>

                <p className="landing-pretty-copy mt-5 max-w-[46ch] text-base text-[#475569] sm:text-lg">
                  TRASIR menghubungkan kasir harian, validasi nota AI, dan stok gudang dalam satu catatan audit transparan.
                </p>

                <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3.5">
                  <Link
                    href={ctaHref}
                    className="inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-[#2563EB] px-6 py-3 text-sm font-semibold text-white shadow-[0_12px_28px_-10px_rgba(37,99,235,0.55)] transition duration-150 hover:-translate-y-[1px] hover:bg-[#1D4ED8] active:scale-[0.985] cursor-pointer sm:w-auto sm:text-base"
                  >
                    <span>Mulai Audit Toko</span>
                    <svg
                      width="17"
                      height="17"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M5 12h14" />
                      <path d="m13 5 7 7-7 7" />
                    </svg>
                  </Link>

                  <a
                    href="#simulasi"
                    className="inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white/95 px-5 py-3 text-sm font-semibold text-[#0F172A] shadow-sm transition duration-150 hover:-translate-y-[1px] hover:border-slate-300 hover:bg-white active:scale-[0.985] cursor-pointer sm:w-auto sm:text-base"
                  >
                    <svg
                      width="17"
                      height="17"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="#2563EB"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <circle cx="12" cy="12" r="9" />
                      <polygon points="10 8.5 16 12 10 15.5 10 8.5" fill="#2563EB" stroke="none" />
                    </svg>
                    <span>Lihat Simulasi</span>
                  </a>
                </div>

                {/* Honest factual capability row replacing generic social proof avatars */}
                <div className="mt-10 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-slate-200/80 pt-5 text-xs font-medium text-[#475569]">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-[#2563EB]" aria-hidden="true" />
                    Akun Individu &amp; RBAC
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-[#3DC2CA]" aria-hidden="true" />
                    Audit Tanpa Hapus
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-[#0F766E]" aria-hidden="true" />
                    Validasi Nota AI
                  </span>
                </div>
              </div>

              {/* Center Editorial Micro-Callout from Reference */}
              <div className="hidden xl:col-span-1 xl:flex xl:flex-col xl:items-start xl:self-start xl:pt-20" aria-hidden="true">
                <div className="border-l border-slate-300/80 pl-3 text-[11px] font-medium leading-relaxed text-[#475569]">
                  <p className="whitespace-nowrap">Kasir POS</p>
                  <p className="whitespace-nowrap">Nota AI</p>
                  <p className="whitespace-nowrap">Stok Toko</p>
                </div>
                <div className="mt-2 h-px w-8 bg-slate-300/80" />
              </div>

              {/* Hero Right Focal Visual: Layered Translucent Glass Depth + Live TRASIR Audit Card */}
              <div id="simulasi" className="landing-enter-visual relative scroll-mt-24 lg:col-span-7 xl:col-span-6">
                <div className="relative sm:pr-10 sm:pt-10">
                  {/* Layered Frosted Translucent Glass Planes echoing the reference visual stack */}
                  <div
                    className="pointer-events-none absolute right-0 top-0 hidden h-[calc(100%-2.75rem)] w-[calc(100%-2.75rem)] rounded-3xl border border-white/85 bg-gradient-to-br from-[#7DD3FC]/45 via-[#3B82F6]/25 to-[#E0F2FE]/60 shadow-[0_20px_48px_-22px_rgba(37,99,235,0.35)] sm:block"
                    aria-hidden="true"
                  >
                    <div className="landing-dot-matrix h-full w-full rounded-3xl opacity-80" />
                  </div>
                  <div
                    className="pointer-events-none absolute right-5 top-5 hidden h-[calc(100%-2.75rem)] w-[calc(100%-2.75rem)] rounded-3xl border border-white/90 bg-gradient-to-br from-white/85 via-[#EFF6FF]/70 to-[#DBEAFE]/50 backdrop-blur-md shadow-[0_20px_46px_-22px_rgba(37,99,235,0.28)] sm:block"
                    aria-hidden="true"
                  />

                  {/* Crisp Foreground Interactive TRASIR Shift Audit Card */}
                  <div className="landing-surface-card relative z-10 overflow-hidden rounded-2xl border border-white/95 bg-white/95 backdrop-blur-xl shadow-[0_28px_64px_-22px_rgba(37,99,235,0.26),0_4px_16px_-4px_rgba(15,23,42,0.06)]">
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200/80 bg-slate-50/85 px-5 py-4">
                      <div className="flex items-center gap-2.5">
                        <span className="inline-block h-2.5 w-2.5 rounded-full bg-[#3DC2CA]" aria-hidden="true" />
                        <span className="text-sm font-bold text-[#0F172A]">Pemeriksaan Shift #S-042</span>
                      </div>

                      <div
                        className="inline-flex rounded-xl border border-slate-200 bg-white p-1"
                        role="group"
                        aria-label="Simulasi status audit nota"
                      >
                        <button
                          type="button"
                          data-scenario="valid"
                          aria-pressed={scenario === "valid"}
                          onClick={() => setScenario("valid")}
                          className={
                            scenario === "valid"
                              ? "min-h-[44px] rounded-lg px-3.5 text-xs font-semibold transition-colors duration-150 cursor-pointer bg-[#2563EB] text-white"
                              : "min-h-[44px] rounded-lg px-3.5 text-xs font-semibold transition-colors duration-150 cursor-pointer text-[#475569] hover:text-[#0F172A]"
                          }
                        >
                          Data Sesuai
                        </button>
                        <button
                          type="button"
                          data-scenario="anomaly"
                          aria-pressed={scenario === "anomaly"}
                          onClick={() => setScenario("anomaly")}
                          className={
                            scenario === "anomaly"
                              ? "min-h-[44px] rounded-lg px-3.5 text-xs font-semibold transition-colors duration-150 cursor-pointer bg-[#2563EB] text-white"
                              : "min-h-[44px] rounded-lg px-3.5 text-xs font-semibold transition-colors duration-150 cursor-pointer text-[#475569] hover:text-[#0F172A]"
                          }
                        >
                          Anomali Nota
                        </button>
                      </div>
                    </div>

                    <div className="space-y-5 p-6" aria-live="polite">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-wider text-[#475569]">Ringkasan Kas &amp; Stok</p>
                          <p className="mt-1 text-lg font-bold text-[#0F172A]">{currentScenario.title}</p>
                        </div>
                        <span
                          className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold ${currentScenario.badgeClasses}`}
                        >
                          <span className={`h-2 w-2 rounded-full ${currentScenario.dotClasses}`} aria-hidden="true" />
                          <span>{currentScenario.badgeText}</span>
                        </span>
                      </div>

                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <div className="rounded-xl border border-slate-200/80 bg-[#F8FAFC] p-4">
                          <p className="text-xs font-medium text-[#475569]">Omzet Kasir POS</p>
                          <p className="tabular-nums mt-1 text-xl font-extrabold text-[#0F172A]">{currentScenario.pos}</p>
                        </div>
                        <div className="rounded-xl border border-slate-200/80 bg-[#F8FAFC] p-4">
                          <p className="text-xs font-medium text-[#475569]">Total Nota Supplier</p>
                          <p className="tabular-nums mt-1 text-xl font-extrabold text-[#0F172A]">{currentScenario.receipt}</p>
                        </div>
                      </div>

                      <div className="rounded-xl border border-slate-200/80 bg-white p-4">
                        <div className="flex items-start gap-3">
                          <span
                            className={`mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${currentScenario.iconWrapClasses}`}
                            aria-hidden="true"
                          >
                            {scenario === "valid" ? (
                              <svg
                                width="16"
                                height="16"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2.25"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              >
                                <path d="M20 6 9 17l-5-5" />
                              </svg>
                            ) : (
                              <svg
                                width="16"
                                height="16"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="#FC5086"
                                strokeWidth="2.25"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              >
                                <circle cx="12" cy="12" r="9" />
                                <path d="M12 8v4" />
                                <path d="M12 16h.01" />
                              </svg>
                            )}
                          </span>
                          <div>
                            <p className="text-sm font-bold text-[#0F172A]">{currentScenario.findingHeading}</p>
                            <p className="landing-pretty-copy mt-1 text-sm text-[#475569]">
                              {currentScenario.findingCopy}
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Subtle Reference-style Side Note on Desktop */}
                <div className="mt-4 hidden justify-end pr-1 lg:flex" aria-hidden="true">
                  <div className="border-l border-slate-300/80 pl-3 text-[11px] font-medium leading-relaxed text-[#475569]">
                    <p>Dari transaksi</p>
                    <p>ke bukti audit.</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Key Highlights / Fitur Utama */}
        <section id="fitur" className="scroll-mt-20 border-t border-slate-200/80 bg-white py-20 md:py-28">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
            <div className="max-w-2xl">
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#2563EB]">Fitur Utama</p>
              <h2 className="landing-section-title mt-3 font-extrabold text-[#0F172A]">
                Satu Arsitektur Data <span className="text-[#64748B]">untuk Pengawasan Nyata</span>
              </h2>
              <p className="landing-pretty-copy mt-4 max-w-[56ch] text-base text-[#475569]">
                Setiap transaksi langsung terhubung ke stok dan catatan audit agar pemilik melihat fakta operasional tanpa celah.
              </p>
            </div>

            <div className="mt-12 grid grid-cols-1 gap-6 md:grid-cols-2 lg:gap-8">
              <article className="landing-surface-card rounded-2xl border border-slate-200/90 bg-[#F8FAFC]/80 p-7 transition duration-150 hover:-translate-y-0.5 hover:border-[#93C5FD] hover:bg-white hover:shadow-[0_20px_44px_-24px_rgba(37,99,235,0.22)]">
                <div className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 text-[#2563EB] ring-1 ring-blue-100" aria-hidden="true">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z" />
                    <path d="M8 7h8" />
                    <path d="M8 11h8" />
                    <path d="M8 15h4" />
                  </svg>
                </div>
                <h3 className="mt-5 text-lg font-bold text-[#0F172A]">Kasir Tanpa Hapus</h3>
                <p className="landing-pretty-copy mt-2.5 max-w-[46ch] text-sm text-[#475569]">
                  Penjualan dan pembatalan tercatat atas akun kasir bertugas. Riwayat kas tersimpan permanen tanpa opsi hapus.
                </p>
              </article>

              <article className="landing-surface-card rounded-2xl border border-slate-200/90 bg-[#F8FAFC]/80 p-7 transition duration-150 hover:-translate-y-0.5 hover:border-[#93C5FD] hover:bg-white hover:shadow-[0_20px_44px_-24px_rgba(37,99,235,0.22)]">
                <div className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-[#FDF2F8] text-[#9D174D] ring-1 ring-pink-100" aria-hidden="true">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#FC5086" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 7V5a2 2 0 0 1 2-2h2" />
                    <path d="M17 3h2a2 2 0 0 1 2 2v2" />
                    <path d="M21 17v2a2 2 0 0 1-2 2h-2" />
                    <path d="M7 21H5a2 2 0 0 1-2-2v-2" />
                    <path d="M7 12h10" />
                  </svg>
                </div>
                <h3 className="mt-5 text-lg font-bold text-[#0F172A]">Validasi Nota AI</h3>
                <p className="landing-pretty-copy mt-2.5 max-w-[46ch] text-sm text-[#475569]">
                  AI mencocokkan foto struk dengan rincian item dan riwayat lama. Selisih atau nota ganda langsung ditandai.
                </p>
              </article>

              <article className="landing-surface-card rounded-2xl border border-slate-200/90 bg-[#F8FAFC]/80 p-7 transition duration-150 hover:-translate-y-0.5 hover:border-[#93C5FD] hover:bg-white hover:shadow-[0_20px_44px_-24px_rgba(37,99,235,0.22)]">
                <div className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-[#F0FDFA] text-[#0D747A] ring-1 ring-teal-100" aria-hidden="true">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
                    <path d="m3.3 7 8.7 5 8.7-5" />
                    <path d="M12 22V12" />
                  </svg>
                </div>
                <h3 className="mt-5 text-lg font-bold text-[#0F172A]">Stok Sinkron Otomatis</h3>
                <p className="landing-pretty-copy mt-2.5 max-w-[46ch] text-sm text-[#475569]">
                  Pembelian dan transaksi kasir langsung memperbarui saldo gudang. Selisih opname terlihat sebelum tutup shift.
                </p>
              </article>

              <article className="landing-surface-card rounded-2xl border border-slate-200/90 bg-[#F8FAFC]/80 p-7 transition duration-150 hover:-translate-y-0.5 hover:border-[#93C5FD] hover:bg-white hover:shadow-[0_20px_44px_-24px_rgba(37,99,235,0.22)]">
                <div className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-slate-100 text-[#334E6B] ring-1 ring-slate-200" aria-hidden="true">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10" />
                    <path d="m9 12 2 2 4-4" />
                  </svg>
                </div>
                <h3 className="mt-5 text-lg font-bold text-[#0F172A]">Hak Akses Terpisah</h3>
                <p className="landing-pretty-copy mt-2.5 max-w-[46ch] text-sm text-[#475569]">
                  Menu dan aksi menyesuaikan peran tiap akun pengguna. Persetujuan selisih dan audit penuh dipegang pemilik.
                </p>
              </article>
            </div>
          </div>
        </section>

        {/* Focused Closing CTA */}
        <section id="mulai" className="scroll-mt-24 bg-white pb-20 pt-4 md:pb-28">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
            <div className="relative overflow-hidden rounded-3xl bg-[#0F172A] px-6 py-12 text-center shadow-[0_28px_60px_-24px_rgba(15,23,42,0.4)] sm:px-12 md:py-16">
              <div className="landing-closing-glow pointer-events-none absolute inset-0" aria-hidden="true" />
              <div className="relative z-10">
                <h2 className="landing-section-title mx-auto max-w-2xl font-extrabold text-white">
                  Tutup Shift Harian dengan Catatan yang Jelas
                </h2>
                <p className="landing-pretty-copy mx-auto mt-4 max-w-[50ch] text-base text-slate-200">
                  Satukan transaksi kasir, pemeriksaan nota pembelian, dan saldo stok toko dalam satu sistem yang mudah diaudit.
                </p>
                <div className="mt-8 flex justify-center">
                  <Link
                    href={ctaHref}
                    className="landing-on-dark inline-flex min-h-[48px] items-center justify-center gap-2 rounded-xl bg-[#2563EB] px-7 py-3 text-base font-semibold text-white shadow-[0_12px_28px_-10px_rgba(37,99,235,0.65)] transition duration-150 hover:-translate-y-[1px] hover:bg-[#1D4ED8] active:scale-[0.985] cursor-pointer"
                  >
                    <span>{closingCtaLabel}</span>
                    <svg
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M5 12h14" />
                      <path d="m13 5 7 7-7 7" />
                    </svg>
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Clean Footer */}
      <footer className="border-t border-slate-200/80 bg-[#F8FAFC]">
        <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-6 px-4 py-8 sm:flex-row sm:items-center sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <span
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-[#60A5FA]/20 to-[#2563EB]/15 ring-1 ring-[#2563EB]/20"
              aria-hidden="true"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <rect x="3.5" y="3.5" width="7.5" height="7.5" rx="2" fill="#60A5FA" />
                <rect x="13" y="3.5" width="7.5" height="7.5" rx="2" fill="#2563EB" />
                <rect x="3.5" y="13" width="7.5" height="7.5" rx="2" fill="#2563EB" />
                <rect x="13" y="13" width="7.5" height="7.5" rx="2" fill="#3DC2CA" />
              </svg>
            </span>
            <div>
              <span className="text-base font-extrabold tracking-tight text-[#0F172A]">TRASIR</span>
              <p className="mt-0.5 text-sm text-[#475569]">Pengawasan kasir, validasi nota AI, dan inventaris toko.</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-6 text-sm text-[#475569]">
            <a href="#fitur" className="inline-flex min-h-[44px] items-center hover:text-[#0F172A] cursor-pointer">
              Fitur
            </a>
            <a href="#simulasi" className="inline-flex min-h-[44px] items-center hover:text-[#0F172A] cursor-pointer">
              Simulasi
            </a>
            <Link href={ctaHref} className="inline-flex min-h-[44px] items-center hover:text-[#0F172A] cursor-pointer">
              Masuk
            </Link>
            <span className="text-xs text-[#475569]">&copy; 2026 TRASIR</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
