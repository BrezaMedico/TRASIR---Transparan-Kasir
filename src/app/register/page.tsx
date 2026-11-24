import React from "react";
import { redirect } from "next/navigation";
import { getServerSessionSnapshot } from "@/lib/server-session";
import {
  getDefaultRedirectForRole,
  isStoreAdmin,
  sanitizeInternalRedirect,
} from "@/lib/rbac";
import { RegisterClient } from "@/components/auth/RegisterClient";

export const dynamic = "force-dynamic";

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect?: string; invite?: string }>;
}) {
  const [params, snapshot] = await Promise.all([
    searchParams,
    getServerSessionSnapshot(),
  ]);

  const rawRedirect = typeof params.redirect === "string" ? params.redirect : null;
  const initialInviteCode = typeof params.invite === "string" ? params.invite.trim() : null;
  const safeRedirect = sanitizeInternalRedirect(rawRedirect, "/dashboard");

  if (snapshot.authenticated && snapshot.user) {
    if (!snapshot.user.isAssigned || !snapshot.user.roomId) {
      redirect(
        initialInviteCode
          ? `/menunggu-undangan?invite=${encodeURIComponent(initialInviteCode)}`
          : "/menunggu-undangan"
      );
    }
    const destination =
      rawRedirect && isStoreAdmin(snapshot.user.role)
        ? safeRedirect
        : getDefaultRedirectForRole(snapshot.user.role, true);
    redirect(destination);
  }

  return (
    <RegisterClient
      initialInviteCode={initialInviteCode}
      rawRedirect={rawRedirect}
    />
  );
}
