"use client";

import React, { useCallback, useEffect, useState } from "react";
import { AppShell, useToast } from "@/components/layout/AppShell";
import { fetchJsonCached, getCachedData } from "@/lib/client-cache";
import { formatDateTimeJakarta } from "@/lib/format";
import { getJakartaDateKey } from "@/lib/date-jakarta";
import { formatRoleLabel } from "@/lib/rbac-shared";
import { CounterManagementPanel } from "@/components/settings/CounterManagementPanel";
import { TeamCollaboratorPanel } from "@/components/settings/TeamCollaboratorPanel";
import {
  DEFAULT_UI_PREFERENCES,
  FONT_FAMILY_OPTIONS,
  FONT_SIZE_OPTIONS,
  readUiPreferences,
  resolveEffectiveColorScheme,
  saveAndApplyUiPreferences,
  subscribeUiPreferences,
  type ThemePreference,
  type UiPreferences,
} from "@/lib/ui-preferences";
import {
  Buildings,
  Desktop,
  DownloadSimple,
  EnvelopeSimple,
  FloppyDisk,
  GearSix,
  LockKey,
  Moon,
  ShieldCheck,
  Storefront,
  Sun,
  UsersThree,
} from "@phosphor-icons/react";

type SettingsTab = "umum" | "loket" | "tim" | "lanjutan";

function parseTabFromSearch(): SettingsTab {
  if (typeof window === "undefined") return "umum";
  const param = new URLSearchParams(window.location.search).get("tab");
  if (param === "loket" || param === "tim" || param === "lanjutan" || param === "umum") {
    return param;
  }
  return "umum";
}

export default function PengaturanPage() {
  const { showToast } = useToast();

  type SettingsApiPayload = {
    isOwner?: boolean;
    settings?: {
      storeName?: string;
      storeAddress?: string;
      autoBackupInterval?: string;
      lastBackupAt?: string | null;
    };
  };

  const cachedSettings = getCachedData<SettingsApiPayload>("/api/settings");

  const [activeTab, setActiveTab] = useState<SettingsTab>("umum");
  const [isOwner, setIsOwner] = useState(Boolean(cachedSettings?.isOwner));
  const [loading, setLoading] = useState(!cachedSettings);

  // Tampilan UI
  const [uiPrefs, setUiPrefs] = useState<UiPreferences>(DEFAULT_UI_PREFERENCES);
  const [systemSchemeNow, setSystemSchemeNow] = useState<"light" | "dark">("light");

  // Identitas Perusahaan & Backup
  const [storeName, setStoreName] = useState(
    cachedSettings?.settings?.storeName || "TRASIR Toko Utama"
  );
  const [storeAddress, setStoreAddress] = useState(
    cachedSettings?.settings?.storeAddress || "Indonesia"
  );
  const [autoBackupInterval, setAutoBackupInterval] = useState(
    cachedSettings?.settings?.autoBackupInterval || "HARIAN"
  );
  const [lastBackupAt, setLastBackupAt] = useState<string | null>(
    cachedSettings?.settings?.lastBackupAt || null
  );

  // Profil & Sandi
  const [profileName, setProfileName] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [savingSettings, setSavingSettings] = useState(false);

  // Ganti Email Terverifikasi
  const [nextEmailInput, setNextEmailInput] = useState("");
  const [emailPasswordInput, setEmailPasswordInput] = useState("");
  const [emailVerificationToken, setEmailVerificationToken] = useState<string | null>(null);
  const [pendingNewEmail, setPendingNewEmail] = useState<string | null>(null);
  const [emailOtpCode, setEmailOtpCode] = useState("");
  const [devEmailCodeHint, setDevEmailCodeHint] = useState<string | null>(null);
  const [emailSubmitting, setEmailSubmitting] = useState(false);

  useEffect(() => {
    setActiveTab(parseTabFromSearch());
    setUiPrefs(readUiPreferences());
    setSystemSchemeNow(resolveEffectiveColorScheme("system"));
    return subscribeUiPreferences((next) => {
      setUiPrefs(next);
      setSystemSchemeNow(resolveEffectiveColorScheme("system"));
    });
  }, []);

  const selectTab = (tab: SettingsTab) => {
    setActiveTab(tab);
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.set("tab", tab);
      window.history.replaceState({}, "", url.toString());
    }
  };

  const updateUiPref = (patch: Partial<UiPreferences>, label: string) => {
    const next = { ...uiPrefs, ...patch };
    setUiPrefs(next);
    saveAndApplyUiPreferences(next);
    showToast(`${label} diterapkan.`, "success");
  };

  const loadSettings = useCallback(async () => {
    const hasCached = Boolean(getCachedData("/api/settings"));
    if (!hasCached) setLoading(true);
    try {
      const { ok, data } = await fetchJsonCached<SettingsApiPayload>("/api/settings", {
        force: true,
      });
      if (ok) {
        setIsOwner(Boolean(data.isOwner));
        if (data.settings) {
          setStoreName(data.settings.storeName || "TRASIR Toko Utama");
          setStoreAddress(data.settings.storeAddress || "Indonesia");
          setAutoBackupInterval(data.settings.autoBackupInterval || "HARIAN");
          setLastBackupAt(data.settings.lastBackupAt || null);
        }
      }
    } catch {
      if (!hasCached) {
        showToast("Gagal memuat pengaturan sistem.", "error");
      }
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  const handleSaveCompanyIdentity = async (
    e: React.FormEvent,
    refreshSession: () => Promise<void>
  ) => {
    e.preventDefault();
    if (storeName.trim().length < 2) {
      showToast("Nama perusahaan minimal 2 karakter.", "error");
      return;
    }
    setSavingSettings(true);
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "UPDATE_AUDIT_SETTINGS",
          storeName: storeName.trim(),
          storeAddress: storeAddress.trim() || "Indonesia",
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast(json.error || "Gagal memperbarui nama perusahaan.", "error");
        return;
      }
      showToast("Nama perusahaan diperbarui.", "success");
      await loadSettings();
      await refreshSession();
    } catch {
      showToast("Gagal menghubungi server.", "error");
    } finally {
      setSavingSettings(false);
    }
  };

  const handleUpdateOwnProfile = async (
    e: React.FormEvent,
    refreshSession: () => Promise<void>
  ) => {
    e.preventDefault();
    setSavingSettings(true);
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "UPDATE_PROFILE",
          name: profileName || undefined,
          currentPassword: currentPassword || undefined,
          newPassword: newPassword || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast(data.error || "Gagal memperbarui profil.", "error");
        return;
      }

      showToast("Profil & kata sandi diperbarui.", "success");
      setCurrentPassword("");
      setNewPassword("");
      await refreshSession();
      await loadSettings();
    } catch {
      showToast("Gagal menghubungi server.", "error");
    } finally {
      setSavingSettings(false);
    }
  };

  const handleRequestEmailChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setEmailSubmitting(true);
    try {
      const res = await fetch("/api/account/change-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "REQUEST",
          newEmail: nextEmailInput.trim(),
          currentPassword: emailPasswordInput,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast(data.error || "Gagal mengirim kode verifikasi email.", "error");
        return;
      }
      setEmailVerificationToken(data.verificationToken);
      setPendingNewEmail(data.newEmail);
      setDevEmailCodeHint(data.devCode || null);
      setEmailOtpCode("");
      showToast(`Kode verifikasi dikirim ke ${data.newEmail}.`, "success");
    } catch {
      showToast("Gagal menghubungi server saat verifikasi email.", "error");
    } finally {
      setEmailSubmitting(false);
    }
  };

  const handleConfirmEmailChange = async (
    e: React.FormEvent,
    refreshSession: () => Promise<void>
  ) => {
    e.preventDefault();
    if (!emailVerificationToken) return;
    setEmailSubmitting(true);
    try {
      const res = await fetch("/api/account/change-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "CONFIRM",
          verificationToken: emailVerificationToken,
          code: emailOtpCode.trim(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast(data.error || "Kode verifikasi salah.", "error");
        return;
      }
      showToast(`Email akun berhasil diganti menjadi ${data.email}.`, "success");
      setEmailVerificationToken(null);
      setPendingNewEmail(null);
      setDevEmailCodeHint(null);
      setNextEmailInput("");
      setEmailPasswordInput("");
      setEmailOtpCode("");
      await refreshSession();
    } catch {
      showToast("Gagal memverifikasi kode email.", "error");
    } finally {
      setEmailSubmitting(false);
    }
  };

  const handleManualBackup = async () => {
    try {
      const res = await fetch("/api/backup", { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast(data.error || "Gagal mengunduh cadangan data.", "error");
        return;
      }

      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `TRASIR-Database-Backup-${getJakartaDateKey()}.json`;
      a.click();
      URL.revokeObjectURL(url);
      showToast("Cadangan database JSON berhasil diunduh.", "success");
      await loadSettings();
    } catch {
      showToast("Gagal membuat cadangan data.", "error");
    }
  };

  const themeOptions: { id: ThemePreference; label: string; icon: React.ReactNode }[] = [
    { id: "light", label: "Terang", icon: <Sun size={16} weight="bold" aria-hidden="true" /> },
    { id: "dark", label: "Gelap", icon: <Moon size={16} weight="bold" aria-hidden="true" /> },
    {
      id: "system",
      label: `Sistem (${systemSchemeNow === "dark" ? "Gelap" : "Terang"})`,
      icon: <Desktop size={16} weight="bold" aria-hidden="true" />,
    },
  ];

  return (
    <AppShell>
      {(session, refreshSession) => {
        const tabs: { id: SettingsTab; label: string; icon: React.ReactNode; show: boolean }[] = [
          {
            id: "umum",
            label: "Umum & Tampilan",
            icon: <GearSix size={16} weight="bold" aria-hidden="true" />,
            show: true,
          },
          {
            id: "loket",
            label: "Manajemen Loket",
            icon: <Storefront size={16} weight="bold" aria-hidden="true" />,
            show: isOwner,
          },
          {
            id: "tim",
            label: "Tim & Kolaborator",
            icon: <UsersThree size={16} weight="bold" aria-hidden="true" />,
            show: isOwner,
          },
          {
            id: "lanjutan",
            label: "Akun & Lanjutan",
            icon: <ShieldCheck size={16} weight="bold" aria-hidden="true" />,
            show: true,
          },
        ];

        return (
          <div className="space-y-6 pb-16">
            {/* Header & Minimal Underline Tabs */}
            <div className="space-y-3 border-b border-[#202531]/12 pb-1">
              <div>
                <h1 className="text-xl sm:text-2xl font-extrabold text-[#202531]">
                  Pengaturan Sistem
                </h1>
                <p className="text-xs text-[#525866] mt-0.5">
                  {isOwner
                    ? "Kelola identitas perusahaan, tema layar, loket kasir, dan tim."
                    : "Atur tema layar, ukuran huruf, dan keamanan akun Anda."}
                </p>
              </div>

              <div
                role="tablist"
                aria-label="Menu Pengaturan Sistem"
                className="settings-tablist"
              >
                {tabs
                  .filter((t) => t.show)
                  .map((t) => {
                    const selected = activeTab === t.id;
                    return (
                      <button
                        key={t.id}
                        type="button"
                        role="tab"
                        aria-selected={selected}
                        onClick={() => selectTab(t.id)}
                        className={`inline-flex items-center gap-2 px-3.5 py-2.5 min-h-[44px] text-xs font-extrabold transition-colors cursor-pointer whitespace-nowrap rounded-t-xl ${
                          selected
                            ? "text-[#202531] bg-white/75"
                            : "text-[#525866] hover:text-[#202531]"
                        }`}
                      >
                        {t.icon}
                        <span>{t.label}</span>
                      </button>
                    );
                  })}
              </div>
            </div>

            {loading ? (
              <div className="bg-white rounded-2xl border border-[#202531]/15 p-8 text-center text-xs text-[#525866]">
                Memuat pengaturan sistem...
              </div>
            ) : (
              <>
                {/* TAB 1: UMUM & TAMPILAN */}
                {activeTab === "umum" && (
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
                    {isOwner && (
                      <form
                        onSubmit={(e) => handleSaveCompanyIdentity(e, refreshSession)}
                        className="lg:col-span-5 bg-white rounded-2xl border border-[#202531]/15 p-5 sm:p-6 shadow-sm flex flex-col gap-5"
                      >
                        <div className="flex items-center gap-3 pb-4 border-b border-[#202531]/10">
                          <div className="w-9 h-9 rounded-xl bg-[#EBEBEB]/75 text-[#202531] flex items-center justify-center shrink-0">
                            <Buildings size={18} weight="duotone" aria-hidden="true" />
                          </div>
                          <div>
                            <h2 className="text-sm font-extrabold text-[#202531]">
                              Profil Perusahaan
                            </h2>
                            <p className="text-xs text-[#525866] mt-0.5">
                              Identitas toko pada header, struk, dan laporan.
                            </p>
                          </div>
                        </div>

                        <div className="space-y-4">
                          <div>
                            <label
                              htmlFor="company-name-input"
                              className="block text-xs font-bold text-[#202531] mb-1.5"
                            >
                              Nama Perusahaan
                            </label>
                            <input
                              id="company-name-input"
                              type="text"
                              required
                              minLength={2}
                              maxLength={120}
                              value={storeName}
                              onChange={(e) => setStoreName(e.target.value)}
                              className="w-full min-h-[44px] rounded-xl border border-[#202531]/20 px-3.5 text-sm font-bold text-[#202531] focus:border-[#006B69] focus:outline-none"
                            />
                          </div>
                          <div>
                            <label
                              htmlFor="company-address-input"
                              className="block text-xs font-bold text-[#202531] mb-1.5"
                            >
                              Lokasi Singkat
                            </label>
                            <input
                              id="company-address-input"
                              type="text"
                              maxLength={250}
                              value={storeAddress}
                              onChange={(e) => setStoreAddress(e.target.value)}
                              className="w-full min-h-[44px] rounded-xl border border-[#202531]/20 px-3.5 text-sm text-[#202531] focus:border-[#006B69] focus:outline-none"
                            />
                          </div>
                        </div>

                        <div className="mt-auto pt-4 border-t border-[#202531]/10 flex justify-end">
                          <button
                            type="submit"
                            disabled={savingSettings}
                            className="inline-flex items-center gap-2 px-5 min-h-[44px] rounded-xl bg-[#01DAD7] text-[#202531] text-xs font-extrabold hover:opacity-95 disabled:opacity-50 cursor-pointer"
                          >
                            <FloppyDisk size={15} weight="bold" aria-hidden="true" />
                            <span>{savingSettings ? "Menyimpan..." : "Simpan Nama"}</span>
                          </button>
                        </div>
                      </form>
                    )}

                    {/* Kartu Tampilan Sederhana (Tema + Ukuran + 5 Font) */}
                    <section
                      className={`${
                        isOwner ? "lg:col-span-7" : "lg:col-span-12"
                      } bg-white rounded-2xl border border-[#202531]/15 p-5 sm:p-6 shadow-sm flex flex-col gap-5`}
                    >
                      <div className="flex items-center gap-3 pb-4 border-b border-[#202531]/10">
                        <div className="w-9 h-9 rounded-xl bg-[#EBEBEB]/75 text-[#202531] flex items-center justify-center shrink-0">
                          <Desktop size={18} weight="duotone" aria-hidden="true" />
                        </div>
                        <div>
                          <h2 className="text-sm font-extrabold text-[#202531]">
                            Tampilan Layar
                          </h2>
                          <p className="text-xs text-[#525866] mt-0.5">
                            Tema warna, ukuran teks, dan jenis huruf perangkat ini.
                          </p>
                        </div>
                      </div>

                      {/* Tema */}
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                        <span className="text-xs font-bold text-[#525866]">Tema</span>
                        <div className="grid grid-cols-3 gap-1.5 p-1 rounded-xl bg-[#EBEBEB]/75 border border-[#202531]/10 sm:w-[340px] w-full">
                          {themeOptions.map((opt) => {
                            const selected = uiPrefs.theme === opt.id;
                            return (
                              <button
                                key={opt.id}
                                type="button"
                                aria-pressed={selected}
                                onClick={() => updateUiPref({ theme: opt.id }, `Tema ${opt.label}`)}
                                className={`inline-flex items-center justify-center gap-1.5 px-2.5 min-h-[40px] rounded-lg text-xs font-bold cursor-pointer transition-colors ${
                                  selected
                                    ? "bg-[#202531] text-white"
                                    : "text-[#525866] hover:text-[#202531]"
                                }`}
                              >
                                {opt.icon}
                                <span className="truncate">{opt.label}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* Ukuran Huruf */}
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pt-4 border-t border-[#202531]/10">
                        <span className="text-xs font-bold text-[#525866]">Ukuran Huruf</span>
                        <div className="grid grid-cols-3 gap-1.5 p-1 rounded-xl bg-[#EBEBEB]/75 border border-[#202531]/10 sm:w-[340px] w-full">
                          {FONT_SIZE_OPTIONS.map((opt) => {
                            const selected = uiPrefs.fontSize === opt.id;
                            return (
                              <button
                                key={opt.id}
                                type="button"
                                aria-pressed={selected}
                                onClick={() =>
                                  updateUiPref({ fontSize: opt.id }, `Huruf ${opt.label}`)
                                }
                                className={`inline-flex items-center justify-center px-3 min-h-[40px] rounded-lg text-xs font-bold cursor-pointer transition-colors ${
                                  selected
                                    ? "bg-[#202531] text-white"
                                    : "text-[#525866] hover:text-[#202531]"
                                }`}
                              >
                                {opt.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* Jenis Huruf (5 Font Bersih) */}
                      <div className="space-y-2.5 pt-4 border-t border-[#202531]/10">
                        <span className="block text-xs font-bold text-[#525866]">
                          Jenis Huruf
                        </span>
                        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-2.5">
                          {FONT_FAMILY_OPTIONS.map((font) => {
                            const selected = uiPrefs.fontFamily === font.id;
                            return (
                              <button
                                key={font.id}
                                type="button"
                                aria-pressed={selected}
                                onClick={() =>
                                  updateUiPref({ fontFamily: font.id }, `Font ${font.label}`)
                                }
                                style={{ fontFamily: `${font.cssVar}, system-ui, sans-serif` }}
                                className={`text-left px-3 py-2.5 min-h-[58px] rounded-xl border cursor-pointer transition-colors flex flex-col justify-between ${
                                  selected
                                    ? "border-[#006B69] bg-[#E6FBFB]/55 ring-1 ring-[#006B69]"
                                    : "border-[#202531]/15 bg-white hover:border-[#202531]/35"
                                }`}
                              >
                                <span className="text-xs font-extrabold text-[#202531] truncate">
                                  {font.label}
                                </span>
                                <span className="text-[11px] font-semibold text-[#525866] tabular-nums">
                                  Aa · Rp 125.000
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </section>
                  </div>
                )}

                {/* TAB 2: MANAJEMEN LOKET */}
                {activeTab === "loket" && isOwner && <CounterManagementPanel />}

                {/* TAB 3: TIM & KOLABORATOR */}
                {activeTab === "tim" && isOwner && (
                  <TeamCollaboratorPanel session={session} refreshSession={refreshSession} />
                )}

                {/* TAB 4: AKUN & LANJUTAN */}
                {activeTab === "lanjutan" && (
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
                    {/* Profil & Kata Sandi */}
                    <form
                      onSubmit={(e) => handleUpdateOwnProfile(e, refreshSession)}
                      className="lg:col-span-6 bg-white rounded-2xl border border-[#202531]/15 p-5 sm:p-6 shadow-sm flex flex-col gap-5"
                    >
                      <div className="flex items-center gap-3 pb-4 border-b border-[#202531]/10">
                        <div className="w-9 h-9 rounded-xl bg-[#EBEBEB]/75 text-[#202531] flex items-center justify-center shrink-0">
                          <LockKey size={18} weight="duotone" aria-hidden="true" />
                        </div>
                        <div>
                          <h2 className="text-sm font-extrabold text-[#202531]">
                            Profil &amp; Kata Sandi
                          </h2>
                          <p className="text-xs text-[#525866] mt-0.5">
                            @{session.user.username} · {formatRoleLabel(session.user.role)}
                          </p>
                        </div>
                      </div>

                      <div className="space-y-4">
                        <div>
                          <label htmlFor="prof-name" className="block text-xs font-bold text-[#202531] mb-1.5">
                            Nama Tampilan
                          </label>
                          <input
                            id="prof-name"
                            type="text"
                            value={profileName}
                            onChange={(e) => setProfileName(e.target.value)}
                            placeholder={session.user.name}
                            className="w-full px-3.5 min-h-[44px] rounded-xl border border-[#202531]/20 text-xs"
                          />
                        </div>

                        <div>
                          <label
                            htmlFor="prof-curr-pass"
                            className="block text-xs font-bold text-[#202531] mb-1.5"
                          >
                            Kata Sandi Saat Ini
                          </label>
                          <input
                            id="prof-curr-pass"
                            type="password"
                            value={currentPassword}
                            onChange={(e) => setCurrentPassword(e.target.value)}
                            className="w-full px-3.5 min-h-[44px] rounded-xl border border-[#202531]/20 text-xs"
                          />
                        </div>

                        <div>
                          <label
                            htmlFor="prof-new-pass"
                            className="block text-xs font-bold text-[#202531] mb-1.5"
                          >
                            Kata Sandi Baru (Min. 6 Karakter)
                          </label>
                          <input
                            id="prof-new-pass"
                            type="password"
                            minLength={6}
                            value={newPassword}
                            onChange={(e) => setNewPassword(e.target.value)}
                            className="w-full px-3.5 min-h-[44px] rounded-xl border border-[#202531]/20 text-xs"
                          />
                        </div>
                      </div>

                      <div className="mt-auto pt-4 border-t border-[#202531]/10 flex justify-end">
                        <button
                          type="submit"
                          disabled={savingSettings}
                          className="inline-flex items-center gap-2 px-5 min-h-[44px] rounded-xl bg-[#202531] text-white text-xs font-extrabold cursor-pointer disabled:opacity-50"
                        >
                          <FloppyDisk size={15} weight="bold" aria-hidden="true" />
                          <span>Simpan Profil &amp; Sandi</span>
                        </button>
                      </div>
                    </form>

                    {/* Ganti Email (Wajib Verifikasi Kode Email) */}
                    <section className="lg:col-span-6 bg-white rounded-2xl border border-[#202531]/15 p-5 sm:p-6 shadow-sm flex flex-col gap-5">
                      <div className="flex items-center gap-3 pb-4 border-b border-[#202531]/10">
                        <div className="w-9 h-9 rounded-xl bg-[#EBEBEB]/75 text-[#202531] flex items-center justify-center shrink-0">
                          <EnvelopeSimple size={18} weight="duotone" aria-hidden="true" />
                        </div>
                        <div>
                          <h2 className="text-sm font-extrabold text-[#202531]">
                            Ganti Email Akun
                          </h2>
                          <p className="text-xs text-[#525866] mt-0.5">
                            Saat ini: <strong>{session.user.email}</strong>
                          </p>
                        </div>
                      </div>

                      {!emailVerificationToken ? (
                        <form onSubmit={handleRequestEmailChange} className="flex-1 flex flex-col gap-4">
                          <div>
                            <label
                              htmlFor="next-email-input"
                              className="block text-xs font-bold text-[#202531] mb-1.5"
                            >
                              Alamat Email Baru
                            </label>
                            <input
                              id="next-email-input"
                              type="email"
                              required
                              value={nextEmailInput}
                              onChange={(e) => setNextEmailInput(e.target.value)}
                              placeholder="emailbaru@toko.id"
                              className="w-full px-3.5 min-h-[44px] rounded-xl border border-[#202531]/20 text-xs"
                            />
                          </div>

                          <div>
                            <label
                              htmlFor="email-pass-input"
                              className="block text-xs font-bold text-[#202531] mb-1.5"
                            >
                              Konfirmasi Kata Sandi Saat Ini
                            </label>
                            <input
                              id="email-pass-input"
                              type="password"
                              required
                              value={emailPasswordInput}
                              onChange={(e) => setEmailPasswordInput(e.target.value)}
                              className="w-full px-3.5 min-h-[44px] rounded-xl border border-[#202531]/20 text-xs"
                            />
                          </div>

                          <div className="mt-auto pt-4 border-t border-[#202531]/10 flex justify-end">
                            <button
                              type="submit"
                              disabled={emailSubmitting}
                              className="inline-flex items-center gap-2 px-5 min-h-[44px] rounded-xl bg-[#01DAD7] text-[#202531] text-xs font-extrabold hover:opacity-95 disabled:opacity-50 cursor-pointer"
                            >
                              <EnvelopeSimple size={15} weight="bold" aria-hidden="true" />
                              <span>
                                {emailSubmitting ? "Mengirim Kode..." : "Kirim Kode Verifikasi"}
                              </span>
                            </button>
                          </div>
                        </form>
                      ) : (
                        <form
                          onSubmit={(e) => handleConfirmEmailChange(e, refreshSession)}
                          className="flex-1 flex flex-col gap-4"
                        >
                          <p className="text-xs text-[#525866]">
                            Masukkan kode 6 digit yang dikirim ke{" "}
                            <strong className="text-[#202531]">{pendingNewEmail}</strong>.
                          </p>

                          {devEmailCodeHint && (
                            <p className="rounded-xl bg-[#E6FBFB]/55 border border-[#006B69]/25 px-3 py-2 text-xs font-bold text-[#006B69] font-mono">
                              Mode Dev (SMTP belum terpasang): Kode = {devEmailCodeHint}
                            </p>
                          )}

                          <div>
                            <label
                              htmlFor="email-otp-input"
                              className="block text-xs font-bold text-[#202531] mb-1.5"
                            >
                              Kode Verifikasi (6 Digit)
                            </label>
                            <input
                              id="email-otp-input"
                              type="text"
                              inputMode="numeric"
                              pattern="\d{6}"
                              maxLength={6}
                              required
                              value={emailOtpCode}
                              onChange={(e) =>
                                setEmailOtpCode(e.target.value.replace(/[^0-9]/g, ""))
                              }
                              placeholder="123456"
                              className="w-full px-3.5 min-h-[44px] rounded-xl border border-[#202531]/20 font-mono text-sm font-extrabold tracking-widest"
                            />
                          </div>

                          <div className="mt-auto pt-4 border-t border-[#202531]/10 flex flex-wrap items-center justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                setEmailVerificationToken(null);
                                setPendingNewEmail(null);
                                setDevEmailCodeHint(null);
                              }}
                              className="px-4 min-h-[44px] rounded-xl border border-[#202531]/20 text-xs font-bold text-[#202531] cursor-pointer"
                            >
                              Batal
                            </button>
                            <button
                              type="submit"
                              disabled={emailSubmitting}
                              className="inline-flex items-center gap-2 px-5 min-h-[44px] rounded-xl bg-[#01DAD7] text-[#202531] text-xs font-extrabold hover:opacity-95 disabled:opacity-50 cursor-pointer"
                            >
                              <span>
                                {emailSubmitting ? "Memverifikasi..." : "Verifikasi & Ganti Email"}
                              </span>
                            </button>
                          </div>
                        </form>
                      )}
                    </section>

                    {/* Cadangan Data JSON (Khusus Pemilik/Manajer) */}
                    {isOwner && (
                      <section className="lg:col-span-12 bg-white rounded-2xl border border-[#202531]/15 p-5 sm:p-6 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-xl bg-[#EBEBEB]/75 text-[#202531] flex items-center justify-center shrink-0">
                            <DownloadSimple size={18} weight="duotone" aria-hidden="true" />
                          </div>
                          <div>
                            <h2 className="text-sm font-extrabold text-[#202531]">
                              Cadangan Data Perusahaan (JSON)
                            </h2>
                            <p className="text-xs text-[#525866] mt-0.5">
                              Jadwal otomatis: <strong>{autoBackupInterval}</strong> · Terakhir:{" "}
                              <strong>{formatDateTimeJakarta(lastBackupAt)}</strong>
                            </p>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={handleManualBackup}
                          className="inline-flex items-center justify-center gap-2 px-5 min-h-[44px] rounded-xl bg-[#202531] text-white text-xs font-extrabold hover:opacity-95 cursor-pointer shrink-0"
                        >
                          <DownloadSimple size={16} weight="bold" aria-hidden="true" />
                          <span>Unduh Cadangan Data</span>
                        </button>
                      </section>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        );
      }}
    </AppShell>
  );
}
