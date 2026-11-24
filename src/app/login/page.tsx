import React from "react";
import { redirect } from "next/navigation";
import { getServerSessionSnapshot } from "@/lib/server-session";
import {
  getDefaultRedirectForRole,
  isStoreAdmin,
  sanitizeInternalRedirect,
} from "@/lib/rbac";
import { LoginClient } from "@/components/auth/LoginClient";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect?: string }>;
}) {
  const [params, snapshot] = await Promise.all([
    searchParams,
    getServerSessionSnapshot(),
  ]);

  const rawRedirect = typeof params.redirect === "string" ? params.redirect : null;
  const safeRedirect = sanitizeInternalRedirect(rawRedirect, "/dashboard");

  if (snapshot.authenticated && snapshot.user) {
    if (!snapshot.user.isAssigned) {
      if (isStoreAdmin(snapshot.user.role) && snapshot.needsInitialSetup) {
        redirect("/setup");
      }
      redirect("/menunggu-undangan");
    }
    const destination =
      rawRedirect && isStoreAdmin(snapshot.user.role)
        ? safeRedirect
        : getDefaultRedirectForRole(snapshot.user.role, true);
    redirect(destination);
  }

  return (
    <LoginClient
      initialShowInitialSetup={Boolean(snapshot.needsInitialSetup && !snapshot.hasAnyUser)}
      rawRedirect={rawRedirect}
    />
  );
}
