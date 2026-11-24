"use client";

import React, { useCallback, useEffect, useState } from "react";
import { AppShell, useToast } from "@/components/layout/AppShell";
import { fetchJsonCached, getCachedData } from "@/lib/client-cache";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { formatDateTimeJakarta, formatRupiah } from "@/lib/format";
import { ALL_MODULES, formatRoleLabel, type ModuleKey, type UserRole } from "@/lib/rbac-shared";
import {
  Users,
  ShieldCheck,
  Scales,
  Database,
  UserCircle,
  Plus,
  FloppyDisk,
  DownloadSimple,
  LockKey,
} from "@phosphor-icons/react";

interface StaffAccount {
  id: string;
  username: string;
  email: string;
  name: string;
  role: UserRole;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

interface PermMatrixRow {
  role: UserRole;
  module: ModuleKey;
  canView: boolean;
  canCreate: boolean;
  canEdit: boolean;
  canApprove: boolean;
}

export default function PengaturanPage() {
  const { showToast } = useToast();

  type SettingsApiPayload = {
    isOwner?: boolean;
    users?: StaffAccount[];
    rolePermissions?: PermMatrixRow[];
    units?: { id: string; name: string; label: string; group: string }[];
    categories?: { id: string; name: string; areaType: string; description: string | null }[];
    warehouses?: { id: string; name: string; location: string | null }[];
    settings?: {
      storeName?: string;
      storeAddress?: string;
      toleranceThresholdRp?: number;
      opnameSchedule?: string;
      openAreaPolicy?: string;
      closedAreaPolicy?: string;
      autoBackupInterval?: string;
      lastBackupAt?: string | null;
    };
  };

  const cachedSettings = getCachedData<SettingsApiPayload>("/api/settings");

  const [activeTab, setActiveTab] = useState<"rbac" | "audit_rules" | "masters" | "profile_backup">(
    cachedSettings && !cachedSettings.isOwner ? "profile_backup" : "rbac"
  );
  const [isOwner, setIsOwner] = useState(Boolean(cachedSettings?.isOwner));
  const [users, setUsers] = useState<StaffAccount[]>(cachedSettings?.users || []);
  const [permissions, setPermissions] = useState<PermMatrixRow[]>(
    cachedSettings?.rolePermissions || []
  );
  const [selectedMatrixRole, setSelectedMatrixRole] = useState<UserRole>("KASIR");
  const [units, setUnits] = useState<{ id: string; name: string; label: string; group: string }[]>(
    cachedSettings?.units || []
  );
  const [categories, setCategories] = useState<
    { id: string; name: string; areaType: string; description: string | null }[]
  >(cachedSettings?.categories || []);
  const [warehouses, setWarehouses] = useState<
    { id: string; name: string; location: string | null }[]
  >(cachedSettings?.warehouses || []);
  const [loading, setLoading] = useState(!cachedSettings);

  // Audit & Tolerance Settings
  const [storeName, setStoreName] = useState(
    cachedSettings?.settings?.storeName || "TRASIR Toko Utama"
  );
  const [storeAddress, setStoreAddress] = useState(
    cachedSettings?.settings?.storeAddress || "Indonesia"
  );
  const [toleranceThresholdRp, setToleranceThresholdRp] = useState(
    cachedSettings?.settings?.toleranceThresholdRp ?? 50000
  );
  const [opnameSchedule, setOpnameSchedule] = useState(
    cachedSettings?.settings?.opnameSchedule || "MINGGUAN"
  );
  const [openAreaPolicy, setOpenAreaPolicy] = useState(
    cachedSettings?.settings?.openAreaPolicy || ""
  );
  const [closedAreaPolicy, setClosedAreaPolicy] = useState(
    cachedSettings?.settings?.closedAreaPolicy || ""
  );
  const [autoBackupInterval, setAutoBackupInterval] = useState(
    cachedSettings?.settings?.autoBackupInterval || "HARIAN"
  );
  const [lastBackupAt, setLastBackupAt] = useState<string | null>(
    cachedSettings?.settings?.lastBackupAt || null
  );

  // Add Staff User Form
  const [newUserName, setNewUserName] = useState("");
  const [newUserUsername, setNewUserUsername] = useState("");
  const [newUserEmail, setNewUserEmail] = useState("");
  const [newUserPassword, setNewUserPassword] = useState("");
  const [newUserRole, setNewUserRole] = useState<UserRole>("KASIR");
  const [submittingUser, setSubmittingUser] = useState(false);

  // Master Data Forms
  const [newUnitName, setNewUnitName] = useState("");
  const [newUnitGroup, setNewUnitGroup] = useState("HITUNGAN");
  const [newCatName, setNewCatName] = useState("");
  const [newCatArea, setNewCatArea] = useState<"TERBUKA" | "TERTUTUP">("TERBUKA");
  const [newWhName, setNewWhName] = useState("");
  const [newWhLoc, setNewWhLoc] = useState("");

  // Own Profile & Password
  const [profileName, setProfileName] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [savingSettings, setSavingSettings] = useState(false);

  const loadSettings = useCallback(async () => {
    const hasCached = Boolean(getCachedData("/api/settings"));
    if (!hasCached) {
      setLoading(true);
    }
    try {
      const { ok, data } = await fetchJsonCached<SettingsApiPayload>("/api/settings", {
        force: true,
      });
      if (ok) {
        setIsOwner(Boolean(data.isOwner));
        if (!data.isOwner) {
          setActiveTab("profile_backup");
        }
        setUsers(data.users || []);
        setPermissions(data.rolePermissions || []);
        setUnits(data.units || []);
        setCategories(data.categories || []);
        setWarehouses(data.warehouses || []);
        if (data.settings) {
          setStoreName(data.settings.storeName || "TRASIR Toko Utama");
          setStoreAddress(data.settings.storeAddress || "Indonesia");
          setToleranceThresholdRp(data.settings.toleranceThresholdRp ?? 50000);
          setOpnameSchedule(data.settings.opnameSchedule || "MINGGUAN");
          setOpenAreaPolicy(data.settings.openAreaPolicy || "");
          setClosedAreaPolicy(data.settings.closedAreaPolicy || "");
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

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmittingUser(true);
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "CREATE_USER",
          name: newUserName,
          username: newUserUsername,
          email: newUserEmail,
          password: newUserPassword,
          role: newUserRole,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(data.error || "Gagal menambahkan akun pegawai.", "error");
        return;
      }

      showToast(`Akun pegawai ${data.user.name} (${data.user.role}) berhasil dibuat.`, "success");
      setNewUserName("");
      setNewUserUsername("");
      setNewUserEmail("");
      setNewUserPassword("");
      await loadSettings();
    } catch {
      showToast("Gagal menghubungi server.", "error");
    } finally {
      setSubmittingUser(false);
    }
  };

  const handleToggleUserStatus = async (u: StaffAccount) => {
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "UPDATE_USER",
          userId: u.id,
          isActive: !u.isActive,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(data.error || "Gagal memperbarui status akun.", "error");
        return;
      }
      showToast(`Status akun ${u.name} diperbarui.`, "info");
      await loadSettings();
    } catch {
      showToast("Gagal memperbarui akun.", "error");
    }
  };

  const handleTogglePermission = (
    role: UserRole,
    moduleKey: ModuleKey,
    field: "canView" | "canCreate" | "canEdit" | "canApprove"
  ) => {
    setPermissions((prev) => {
      const existing = prev.find((p) => p.role === role && p.module === moduleKey);
      if (existing) {
        return prev.map((p) =>
          p.role === role && p.module === moduleKey ? { ...p, [field]: !p[field] } : p
        );
      }
      return [
        ...prev,
        {
          role,
          module: moduleKey,
          canView: field === "canView",
          canCreate: field === "canCreate",
          canEdit: field === "canEdit",
          canApprove: field === "canApprove",
        },
      ];
    });
  };

  const handleSavePermissionMatrix = async (refreshSession: () => Promise<void>) => {
    setSavingSettings(true);
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "UPDATE_PERMISSIONS",
          permissions,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(data.error || "Gagal menyimpan matriks hak akses.", "error");
        return;
      }

      showToast(
        "Matriks Hak Akses (RBAC) berhasil disimpan dan langsung berlaku real-time untuk seluruh pengguna.",
        "success"
      );
      await loadSettings();
      await refreshSession();
    } catch {
      showToast("Gagal menghubungi server.", "error");
    } finally {
      setSavingSettings(false);
    }
  };

  const handleSaveAuditSettings = async (
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
          action: "UPDATE_AUDIT_SETTINGS",
          storeName,
          storeAddress,
          toleranceThresholdRp: Number(toleranceThresholdRp),
          opnameSchedule,
          openAreaPolicy,
          closedAreaPolicy,
          autoBackupInterval,
        }),
      });
      if (!res.ok) {
        showToast("Gagal menyimpan aturan audit.", "error");
        return;
      }
      showToast("Aturan Audit & Toleransi Selisih Stok berhasil diperbarui.", "success");
      await loadSettings();
      await refreshSession();
    } catch {
      showToast("Gagal menghubungi server.", "error");
    } finally {
      setSavingSettings(false);
    }
  };

  const handleAddUnit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUnitName.trim()) return;
    const res = await fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "CREATE_UNIT",
        name: newUnitName,
        label: newUnitName,
        group: newUnitGroup,
      }),
    });
    if (res.ok) {
      showToast(`Satuan "${newUnitName}" ditambahkan.`, "success");
      setNewUnitName("");
      await loadSettings();
    }
  };

  const handleAddCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCatName.trim()) return;
    const res = await fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "CREATE_CATEGORY",
        name: newCatName,
        areaType: newCatArea,
      }),
    });
    if (res.ok) {
      showToast(`Kategori "${newCatName}" (Area ${newCatArea}) ditambahkan.`, "success");
      setNewCatName("");
      await loadSettings();
    }
  };

  const handleAddWarehouse = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newWhName.trim()) return;
    const res = await fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "CREATE_WAREHOUSE",
        name: newWhName,
        location: newWhLoc,
      }),
    });
    if (res.ok) {
      showToast(`Lokasi gudang "${newWhName}" ditambahkan.`, "success");
      setNewWhName("");
      setNewWhLoc("");
      await loadSettings();
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
      const data = await res.json();
      if (!res.ok) {
        showToast(data.error || "Gagal memperbarui profil.", "error");
        return;
      }

      showToast("Profil & keamanan akun pribadi berhasil diperbarui.", "success");
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

  const handleManualBackup = async () => {
    try {
      const res = await fetch("/api/backup", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) {
        showToast(data.error || "Gagal mengunduh cadangan data.", "error");
        return;
      }

      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `TRASIR-Database-Backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      showToast("Cadangan database penuh (JSON) berhasil diunduh.", "success");
      await loadSettings();
    } catch {
      showToast("Gagal membuat cadangan data.", "error");
    }
  };

  return (
    <AppShell>
      {(session, refreshSession) => {
        return (
          <div className="space-y-6">
            {/* Header & 4 Clean Horizontal Tabs */}
            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4">
              <div>
                <h1 className="text-xl font-extrabold text-slate-900">
                  Pengaturan Sistem, RBAC & Aturan Audit
                </h1>
                <p className="text-xs text-slate-600 mt-1">
                  {isOwner
                    ? "Kendali penuh Pemilik atas akun pegawai, matriks hak akses granular (RBAC), batas toleransi selisih stok, master satuan/kategori/gudang, dan cadangan data"
                    : "Pengaturan profil akun pribadi dan keamanan kata sandi"}
                </p>
              </div>

              <div
                role="tablist"
                aria-label="Tab Pengaturan Sistem"
                className="flex flex-wrap gap-2 pt-2 border-t border-slate-200"
              >
                {isOwner && (
                  <>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={activeTab === "rbac"}
                      onClick={() => setActiveTab("rbac")}
                      className={`inline-flex items-center gap-2 px-4 py-2.5 min-h-[44px] rounded-xl text-xs font-bold transition-colors cursor-pointer ${
                        activeTab === "rbac"
                          ? "bg-[#334E6B] text-white"
                          : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                      }`}
                    >
                      <Users size={16} weight="bold" aria-hidden="true" />
                      <span>1. Pengguna & Hak Akses (RBAC)</span>
                    </button>

                    <button
                      type="button"
                      role="tab"
                      aria-selected={activeTab === "audit_rules"}
                      onClick={() => setActiveTab("audit_rules")}
                      className={`inline-flex items-center gap-2 px-4 py-2.5 min-h-[44px] rounded-xl text-xs font-bold transition-colors cursor-pointer ${
                        activeTab === "audit_rules"
                          ? "bg-[#334E6B] text-white"
                          : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                      }`}
                    >
                      <Scales size={16} weight="bold" aria-hidden="true" />
                      <span>2. Aturan Audit & Toleransi</span>
                    </button>

                    <button
                      type="button"
                      role="tab"
                      aria-selected={activeTab === "masters"}
                      onClick={() => setActiveTab("masters")}
                      className={`inline-flex items-center gap-2 px-4 py-2.5 min-h-[44px] rounded-xl text-xs font-bold transition-colors cursor-pointer ${
                        activeTab === "masters"
                          ? "bg-[#334E6B] text-white"
                          : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                      }`}
                    >
                      <Database size={16} weight="bold" aria-hidden="true" />
                      <span>3. Master Satuan, Kategori & Gudang</span>
                    </button>
                  </>
                )}

                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === "profile_backup"}
                  onClick={() => setActiveTab("profile_backup")}
                  className={`inline-flex items-center gap-2 px-4 py-2.5 min-h-[44px] rounded-xl text-xs font-bold transition-colors cursor-pointer ${
                    activeTab === "profile_backup"
                      ? "bg-[#334E6B] text-white"
                      : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                  }`}
                >
                  <UserCircle size={16} weight="bold" aria-hidden="true" />
                  <span>4. Profil, Keamanan & Cadangan Data</span>
                </button>
              </div>
            </div>

            {loading ? (
              <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center text-xs text-slate-600">
                Memuat pengaturan sistem...
              </div>
            ) : (
              <>
                {/* TAB 1: PENGGUNA & HAK AKSES (RBAC) */}
                {activeTab === "rbac" && isOwner && (
                  <div className="space-y-6">
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
                      {/* Form + Tambah Akun Pegawai */}
                      <form
                        onSubmit={handleCreateUser}
                        className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4"
                      >
                        <div>
                          <h2 className="text-base font-extrabold text-slate-900">
                            + Tambah Akun Pegawai Baru
                          </h2>
                          <p className="text-xs text-slate-600">
                            Setiap pegawai wajib memiliki akun individu sesuai jabatannya
                          </p>
                        </div>

                        <div>
                          <label
                            htmlFor="staff-name"
                            className="block text-xs font-bold text-slate-700 mb-1"
                          >
                            Nama Lengkap Pegawai
                          </label>
                          <input
                            id="staff-name"
                            type="text"
                            required
                            value={newUserName}
                            onChange={(e) => setNewUserName(e.target.value)}
                            placeholder="Nama lengkap"
                            className="w-full px-3.5 py-2.5 min-h-[44px] rounded-xl border border-slate-300 text-xs"
                          />
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label
                              htmlFor="staff-username"
                              className="block text-xs font-bold text-slate-700 mb-1"
                            >
                              Username Login
                            </label>
                            <input
                              id="staff-username"
                              type="text"
                              required
                              value={newUserUsername}
                              onChange={(e) => setNewUserUsername(e.target.value)}
                              placeholder="kasir01"
                              className="w-full px-3.5 py-2.5 min-h-[44px] rounded-xl border border-slate-300 text-xs"
                            />
                          </div>
                          <div>
                            <label
                              htmlFor="staff-role"
                              className="block text-xs font-bold text-slate-700 mb-1"
                            >
                              Jabatan
                            </label>
                            <select
                              id="staff-role"
                              value={newUserRole}
                              onChange={(e) => setNewUserRole(e.target.value as UserRole)}
                              className="w-full px-3 py-2.5 min-h-[44px] rounded-xl border border-slate-300 text-xs font-bold bg-white"
                            >
                              <option value="KASIR">Kasir</option>
                              <option value="GUDANG">Bagian Gudang</option>
                              <option value="KASIR_GUDANG">Kasir + Gudang</option>
                              <option value="MANAJER">Manajer</option>
                              {session.user.role === "PEMILIK" && (
                                <option value="PEMILIK">Pemilik</option>
                              )}
                            </select>
                          </div>
                        </div>

                        <div>
                          <label
                            htmlFor="staff-email"
                            className="block text-xs font-bold text-slate-700 mb-1"
                          >
                            Email Pegawai
                          </label>
                          <input
                            id="staff-email"
                            type="email"
                            required
                            value={newUserEmail}
                            onChange={(e) => setNewUserEmail(e.target.value)}
                            placeholder="pegawai@toko.id"
                            className="w-full px-3.5 py-2.5 min-h-[44px] rounded-xl border border-slate-300 text-xs"
                          />
                        </div>

                        <div>
                          <label
                            htmlFor="staff-password"
                            className="block text-xs font-bold text-slate-700 mb-1"
                          >
                            Kata Sandi Awal (Min. 6 Karakter)
                          </label>
                          <input
                            id="staff-password"
                            type="password"
                            required
                            minLength={6}
                            value={newUserPassword}
                            onChange={(e) => setNewUserPassword(e.target.value)}
                            placeholder="Minimal 6 karakter"
                            className="w-full px-3.5 py-2.5 min-h-[44px] rounded-xl border border-slate-300 text-xs"
                          />
                        </div>

                        <button
                          type="submit"
                          disabled={submittingUser}
                          className="w-full flex items-center justify-center gap-2 px-4 py-3 min-h-[44px] rounded-xl bg-[#334E6B] text-white text-xs font-extrabold hover:bg-[#24384E] cursor-pointer"
                        >
                          <Plus size={16} weight="bold" aria-hidden="true" />
                          <span>{submittingUser ? "Menyimpan..." : "Buat Akun Pegawai"}</span>
                        </button>
                      </form>

                      {/* Daftar Akun Pegawai */}
                      <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4">
                        <h2 className="text-base font-extrabold text-slate-900">
                          Daftar Akun Pengguna Terdaftar ({users.length})
                        </h2>

                        <div className="overflow-x-auto">
                          <table className="w-full text-left border-collapse text-xs">
                            <thead>
                              <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-bold uppercase text-slate-600">
                                <th className="py-3 px-4">Nama & Username</th>
                                <th className="py-3 px-4">Jabatan</th>
                                <th className="py-3 px-4">Login Terakhir</th>
                                <th className="py-3 px-4">Status</th>
                                <th className="py-3 px-4 text-right">Kontrol</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-200">
                              {users.map((u) => (
                                <tr key={u.id}>
                                  <td className="py-3 px-4">
                                    <p className="font-bold text-slate-900">{u.name}</p>
                                    <p className="text-[11px] text-slate-600">
                                      @{u.username} • {u.email}
                                    </p>
                                  </td>
                                  <td className="py-3 px-4">
                                    <span className="px-2.5 py-1 rounded-lg bg-[#E8EEF4] text-[#334E6B] font-extrabold">
                                      {formatRoleLabel(u.role)}
                                    </span>
                                  </td>
                                  <td className="py-3 px-4 text-slate-600">
                                    {formatDateTimeJakarta(u.lastLoginAt)}
                                  </td>
                                  <td className="py-3 px-4">
                                    <StatusBadge
                                      status={u.isActive ? "AMAN" : "DITOLAK"}
                                      customLabel={u.isActive ? "Aktif" : "Nonaktif"}
                                    />
                                  </td>
                                  <td className="py-3 px-4 text-right">
                                    {u.id !== session.user.id &&
                                      !(session.user.role === "MANAJER" && u.role === "PEMILIK") && (
                                        <button
                                          type="button"
                                          onClick={() => handleToggleUserStatus(u)}
                                          className="px-3 py-1.5 min-h-[34px] rounded-lg border border-slate-300 text-xs font-bold text-slate-700 hover:bg-slate-100 cursor-pointer"
                                        >
                                          {u.isActive ? "Nonaktifkan" : "Aktifkan"}
                                        </button>
                                      )}
                                    {session.user.role === "MANAJER" && u.role === "PEMILIK" && (
                                      <span className="text-[11px] font-semibold text-slate-400">
                                        Dilindungi
                                      </span>
                                    )}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>

                    {/* Matriks Centang Izin per Modul (RBAC Matrix) */}
                    <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <ShieldCheck
                              size={20}
                              weight="duotone"
                              className="text-[#334E6B]"
                              aria-hidden="true"
                            />
                            <h2 className="text-base font-extrabold text-slate-900">
                              Matriks Centang Izin per Modul (RBAC Granular)
                            </h2>
                          </div>
                          <p className="text-xs text-slate-600 mt-0.5">
                            Pemilik dan Manajer memiliki hak akses penuh yang setara. Matriks di bawah mengatur izin granular untuk Kasir dan Gudang.
                          </p>
                        </div>

                        <div className="flex items-center gap-2">
                          {(["KASIR", "GUDANG"] as UserRole[]).map((r) => (
                            <button
                              key={r}
                              type="button"
                              onClick={() => setSelectedMatrixRole(r)}
                              className={`px-3.5 py-2 min-h-[40px] rounded-xl text-xs font-bold cursor-pointer ${
                                selectedMatrixRole === r
                                  ? "bg-[#334E6B] text-white"
                                  : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                              }`}
                            >
                              Jabatan: {r}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse text-xs">
                          <thead>
                            <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-bold uppercase text-slate-600">
                              <th className="py-3 px-4">Modul Navigasi</th>
                              <th className="py-3 px-4 text-center">Lihat (View)</th>
                              <th className="py-3 px-4 text-center">Tambah (Create)</th>
                              <th className="py-3 px-4 text-center">Ubah (Edit)</th>
                              <th className="py-3 px-4 text-center">
                                Setujui / Tolak (Approve)
                              </th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-200">
                            {ALL_MODULES.map((mod) => {
                              const row = permissions.find(
                                (p) =>
                                  p.role === selectedMatrixRole && p.module === mod.key
                              ) || {
                                role: selectedMatrixRole,
                                module: mod.key,
                                canView: false,
                                canCreate: false,
                                canEdit: false,
                                canApprove: false,
                              };

                              return (
                                <tr key={mod.key} className="hover:bg-slate-50">
                                  <td className="py-3 px-4 font-bold text-slate-900">
                                    {mod.label}
                                  </td>
                                  {(
                                    ["canView", "canCreate", "canEdit", "canApprove"] as const
                                  ).map((field) => (
                                    <td key={field} className="py-3 px-4 text-center">
                                      <input
                                        type="checkbox"
                                        checked={Boolean(row[field])}
                                        onChange={() =>
                                          handleTogglePermission(
                                            selectedMatrixRole,
                                            mod.key,
                                            field
                                          )
                                        }
                                        aria-label={`${mod.label} ${field} untuk ${selectedMatrixRole}`}
                                        className="w-5 h-5 rounded text-[#334E6B] cursor-pointer"
                                      />
                                    </td>
                                  ))}
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>

                      <div className="flex justify-end pt-2">
                        <button
                          type="button"
                          disabled={savingSettings}
                          onClick={() => handleSavePermissionMatrix(refreshSession)}
                          className="inline-flex items-center gap-2 px-5 py-2.5 min-h-[44px] rounded-xl bg-[#334E6B] text-white text-xs font-extrabold hover:bg-[#24384E] cursor-pointer"
                        >
                          <FloppyDisk size={18} weight="bold" aria-hidden="true" />
                          <span>
                            {savingSettings
                              ? "Menyimpan Matriks..."
                              : "Simpan Matriks Hak Akses (RBAC)"}
                          </span>
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* TAB 2: ATURAN AUDIT & TOLERANSI */}
                {activeTab === "audit_rules" && isOwner && (
                  <form
                    onSubmit={(e) => handleSaveAuditSettings(e, refreshSession)}
                    className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-5 max-w-3xl"
                  >
                    <div>
                      <h2 className="text-base font-extrabold text-slate-900">
                        Pengaturan Batas Toleransi Audit & Standar Area Pengawasan
                      </h2>
                      <p className="text-xs text-slate-600 mt-0.5">
                        Perubahan batas toleransi langsung berlaku pada evaluasi Stok Opname di Halaman 7
                      </p>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label
                          htmlFor="set-storename"
                          className="block text-xs font-bold text-slate-700 mb-1"
                        >
                          Nama Toko / Usaha
                        </label>
                        <input
                          id="set-storename"
                          type="text"
                          value={storeName}
                          onChange={(e) => setStoreName(e.target.value)}
                          className="w-full px-3.5 py-2.5 min-h-[44px] rounded-xl border border-slate-300 text-xs font-bold"
                        />
                      </div>
                      <div>
                        <label
                          htmlFor="set-storeaddr"
                          className="block text-xs font-bold text-slate-700 mb-1"
                        >
                          Wilayah / Alamat Toko
                        </label>
                        <input
                          id="set-storeaddr"
                          type="text"
                          value={storeAddress}
                          onChange={(e) => setStoreAddress(e.target.value)}
                          className="w-full px-3.5 py-2.5 min-h-[44px] rounded-xl border border-slate-300 text-xs"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label
                          htmlFor="set-tolerance"
                          className="block text-xs font-bold text-slate-700 mb-1"
                        >
                          Batas Toleransi Selisih Stok dalam Rupiah (Rp)
                        </label>
                        <input
                          id="set-tolerance"
                          type="number"
                          min={0}
                          value={toleranceThresholdRp}
                          onChange={(e) => setToleranceThresholdRp(Number(e.target.value))}
                          className="w-full px-3.5 py-2.5 min-h-[44px] rounded-xl border border-slate-300 font-mono text-sm font-extrabold text-[#334E6B]"
                        />
                        <p className="text-[11px] text-slate-500 mt-1">
                           Saat ini: {formatRupiah(toleranceThresholdRp)}. Selisih melebihi angka ini wajib disertai penjelasan pegawai & bukti.
                        </p>
                      </div>

                      <div>
                        <label
                          htmlFor="set-schedule"
                          className="block text-xs font-bold text-slate-700 mb-1"
                        >
                          Jadwal Stok Opname Berkala
                        </label>
                        <select
                          id="set-schedule"
                          value={opnameSchedule}
                          onChange={(e) => setOpnameSchedule(e.target.value)}
                          className="w-full px-3.5 py-2.5 min-h-[44px] rounded-xl border border-slate-300 text-xs font-bold bg-white"
                        >
                          <option value="HARIAN">Harian (Setiap Akhir Hari)</option>
                          <option value="MINGGUAN">Mingguan (Setiap Pekan)</option>
                          <option value="BULANAN">Bulanan (Setiap Akhir Bulan)</option>
                        </select>
                      </div>
                    </div>

                    <div className="space-y-3 pt-2 border-t border-slate-200">
                      <div>
                        <label
                          htmlFor="set-open-policy"
                          className="block text-xs font-bold text-slate-700 mb-1"
                        >
                          Standar Perlakuan Area Terbuka (Akses Pelanggan Langsung)
                        </label>
                        <textarea
                          id="set-open-policy"
                          rows={2}
                          value={openAreaPolicy}
                          onChange={(e) => setOpenAreaPolicy(e.target.value)}
                          className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-xs"
                        />
                      </div>

                      <div>
                        <label
                          htmlFor="set-closed-policy"
                          className="block text-xs font-bold text-slate-700 mb-1"
                        >
                          Standar Perlakuan Area Tertutup (Khusus Akses Pegawai)
                        </label>
                        <textarea
                          id="set-closed-policy"
                          rows={2}
                          value={closedAreaPolicy}
                          onChange={(e) => setClosedAreaPolicy(e.target.value)}
                          className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-xs"
                        />
                      </div>
                    </div>

                    <button
                      type="submit"
                      disabled={savingSettings}
                      className="inline-flex items-center gap-2 px-5 py-3 min-h-[48px] rounded-xl bg-[#334E6B] text-white text-xs font-extrabold hover:bg-[#24384E] cursor-pointer"
                    >
                      <FloppyDisk size={18} weight="bold" aria-hidden="true" />
                      <span>Simpan Aturan Audit & Toleransi</span>
                    </button>
                  </form>
                )}

                {/* TAB 3: MASTER SATUAN, KATEGORI & GUDANG */}
                {activeTab === "masters" && isOwner && (
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
                    {/* Master Satuan */}
                    <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4">
                      <h2 className="text-base font-extrabold text-slate-900">
                        Master Satuan ({units.length})
                      </h2>
                      <form onSubmit={handleAddUnit} className="flex gap-2">
                        <input
                          type="text"
                          value={newUnitName}
                          onChange={(e) => setNewUnitName(e.target.value)}
                          placeholder="Nama satuan baru..."
                          aria-label="Nama satuan baru"
                          className="flex-1 px-3 py-2 min-h-[40px] rounded-xl border border-slate-300 text-xs"
                        />
                        <select
                          value={newUnitGroup}
                          onChange={(e) => setNewUnitGroup(e.target.value)}
                          aria-label="Kelompok satuan"
                          className="px-2.5 py-2 min-h-[40px] rounded-xl border border-slate-300 text-xs font-bold bg-white"
                        >
                          <option value="HITUNGAN">Hitungan</option>
                          <option value="BERAT">Berat</option>
                          <option value="VOLUME">Volume</option>
                          <option value="PANJANG">Panjang</option>
                        </select>
                        <button
                          type="submit"
                          className="px-3 py-2 min-h-[40px] rounded-xl bg-[#334E6B] text-white text-xs font-bold cursor-pointer"
                        >
                          +
                        </button>
                      </form>
                      <div className="flex flex-wrap gap-1.5 max-h-64 overflow-y-auto">
                        {units.map((u) => (
                          <span
                            key={u.id}
                            className="px-2.5 py-1 rounded-lg bg-slate-100 border border-slate-200 text-xs font-semibold text-slate-800"
                          >
                            {u.name} <span className="text-[10px] text-slate-500">({u.group})</span>
                          </span>
                        ))}
                      </div>
                    </div>

                    {/* Master Kategori & Mode Area */}
                    <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4">
                      <h2 className="text-base font-extrabold text-slate-900">
                        Master Kategori & Area ({categories.length})
                      </h2>
                      <form onSubmit={handleAddCategory} className="space-y-2">
                        <input
                          type="text"
                          value={newCatName}
                          onChange={(e) => setNewCatName(e.target.value)}
                          placeholder="Nama kategori barang..."
                          aria-label="Nama kategori barang"
                          className="w-full px-3 py-2 min-h-[40px] rounded-xl border border-slate-300 text-xs"
                        />
                        <div className="flex gap-2">
                          <select
                            value={newCatArea}
                            onChange={(e) =>
                              setNewCatArea(e.target.value as "TERBUKA" | "TERTUTUP")
                            }
                            aria-label="Mode area kategori"
                            className="flex-1 px-3 py-2 min-h-[40px] rounded-xl border border-slate-300 text-xs font-bold bg-white"
                          >
                            <option value="TERBUKA">Area Terbuka (Swalayan/Pelanggan)</option>
                            <option value="TERTUTUP">Area Tertutup (Gudang/Dapur)</option>
                          </select>
                          <button
                            type="submit"
                            className="px-4 py-2 min-h-[40px] rounded-xl bg-[#334E6B] text-white text-xs font-bold cursor-pointer"
                          >
                            Tambah
                          </button>
                        </div>
                      </form>
                      <div className="space-y-2 max-h-64 overflow-y-auto">
                        {categories.map((c) => (
                          <div
                            key={c.id}
                            className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between text-xs"
                          >
                            <span className="font-bold text-slate-900">{c.name}</span>
                            <StatusBadge status={c.areaType} />
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Master Lokasi Gudang */}
                    <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4">
                      <h2 className="text-base font-extrabold text-slate-900">
                        Master Lokasi Gudang ({warehouses.length})
                      </h2>
                      <form onSubmit={handleAddWarehouse} className="space-y-2">
                        <input
                          type="text"
                          value={newWhName}
                          onChange={(e) => setNewWhName(e.target.value)}
                          placeholder="Nama gudang / etalase..."
                          aria-label="Nama lokasi gudang"
                          className="w-full px-3 py-2 min-h-[40px] rounded-xl border border-slate-300 text-xs"
                        />
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={newWhLoc}
                            onChange={(e) => setNewWhLoc(e.target.value)}
                            placeholder="Lokasi / keterangan..."
                            aria-label="Keterangan lokasi gudang"
                            className="flex-1 px-3 py-2 min-h-[40px] rounded-xl border border-slate-300 text-xs"
                          />
                          <button
                            type="submit"
                            className="px-4 py-2 min-h-[40px] rounded-xl bg-[#334E6B] text-white text-xs font-bold cursor-pointer"
                          >
                            Tambah
                          </button>
                        </div>
                      </form>
                      <div className="space-y-2 max-h-64 overflow-y-auto">
                        {warehouses.map((w) => (
                          <div
                            key={w.id}
                            className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs"
                          >
                            <p className="font-bold text-slate-900">{w.name}</p>
                            {w.location && <p className="text-[11px] text-slate-600">{w.location}</p>}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* TAB 4: PROFIL, KEAMANAN & CADANGAN DATA */}
                {activeTab === "profile_backup" && (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
                    {/* Own Profile & Password Change */}
                    <form
                      onSubmit={(e) => handleUpdateOwnProfile(e, refreshSession)}
                      className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4"
                    >
                      <div className="flex items-center gap-2">
                        <LockKey size={20} weight="duotone" className="text-[#334E6B]" aria-hidden="true" />
                        <div>
                          <h2 className="text-base font-extrabold text-slate-900">
                            Profil Akun Pribadi & Ubah Kata Sandi
                          </h2>
                          <p className="text-xs text-slate-600">
                            Akun aktif: @{session.user.username} ({session.user.role})
                          </p>
                        </div>
                      </div>

                      <div>
                        <label
                          htmlFor="prof-name"
                          className="block text-xs font-bold text-slate-700 mb-1"
                        >
                          Nama Tampilan
                        </label>
                        <input
                          id="prof-name"
                          type="text"
                          value={profileName}
                          onChange={(e) => setProfileName(e.target.value)}
                          placeholder={session.user.name}
                          className="w-full px-3.5 py-2.5 min-h-[44px] rounded-xl border border-slate-300 text-xs"
                        />
                      </div>

                      <div>
                        <label
                          htmlFor="prof-curr-pass"
                          className="block text-xs font-bold text-slate-700 mb-1"
                        >
                          Kata Sandi Saat Ini (Isi jika ingin mengubah kata sandi)
                        </label>
                        <input
                          id="prof-curr-pass"
                          type="password"
                          value={currentPassword}
                          onChange={(e) => setCurrentPassword(e.target.value)}
                          className="w-full px-3.5 py-2.5 min-h-[44px] rounded-xl border border-slate-300 text-xs"
                        />
                      </div>

                      <div>
                        <label
                          htmlFor="prof-new-pass"
                          className="block text-xs font-bold text-slate-700 mb-1"
                        >
                          Kata Sandi Baru (Min. 6 Karakter)
                        </label>
                        <input
                          id="prof-new-pass"
                          type="password"
                          minLength={6}
                          value={newPassword}
                          onChange={(e) => setNewPassword(e.target.value)}
                          className="w-full px-3.5 py-2.5 min-h-[44px] rounded-xl border border-slate-300 text-xs"
                        />
                      </div>

                      <button
                        type="submit"
                        disabled={savingSettings}
                        className="inline-flex items-center gap-2 px-5 py-2.5 min-h-[44px] rounded-xl bg-[#334E6B] text-white text-xs font-extrabold hover:bg-[#24384E] cursor-pointer"
                      >
                        <FloppyDisk size={16} weight="bold" aria-hidden="true" />
                        <span>Simpan Perubahan Profil & Sandi</span>
                      </button>
                    </form>

                    {/* Manual & Scheduled Data Backup (Owner Only) */}
                    {isOwner && (
                      <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4">
                        <div className="flex items-center gap-2">
                          <Database
                            size={20}
                            weight="duotone"
                            className="text-[#0F766E]"
                            aria-hidden="true"
                          />
                          <div>
                            <h2 className="text-base font-extrabold text-slate-900">
                              Pencadangan Data (Manual & Jadwal Otomatis)
                            </h2>
                            <p className="text-xs text-slate-600">
                              Mengamankan seluruh data produk, transaksi, stok opname, dan riwayat audit trail
                            </p>
                          </div>
                        </div>

                        <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-1 text-xs">
                          <p className="text-slate-600">
                            Jadwal Pencadangan Otomatis: <strong>{autoBackupInterval}</strong>
                          </p>
                          <p className="text-slate-600">
                            Pencadangan Terakhir:{" "}
                            <strong>{formatDateTimeJakarta(lastBackupAt)}</strong>
                          </p>
                        </div>

                        <button
                          type="button"
                          onClick={handleManualBackup}
                          className="w-full flex items-center justify-center gap-2 px-5 py-3 min-h-[48px] rounded-xl bg-[#0F766E] text-white text-xs font-extrabold hover:opacity-95 cursor-pointer"
                        >
                          <DownloadSimple size={18} weight="bold" aria-hidden="true" />
                          <span>Cadangkan Data Sekarang (Manual Backup JSON)</span>
                        </button>
                      </div>
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

