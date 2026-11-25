import React from "react";
import { ResetPasswordClient } from "@/components/auth/ResetPasswordClient";
import { validateResetTokenAgainstDb } from "@/lib/password-reset";

export const dynamic = "force-dynamic";

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const params = await searchParams;
  const token = typeof params.token === "string" ? params.token.trim() : "";

  let initialValid = false;
  let initialEmailMasked: string | null = null;
  let initialError: string | null = null;

  if (!token) {
    initialError = "Tautan reset kata sandi tidak lengkap atau tidak ditemukan.";
  } else {
    try {
      const check = await validateResetTokenAgainstDb(token);
      if (check.valid) {
        initialValid = true;
        initialEmailMasked = check.emailMasked;
      } else {
        initialError = check.error;
      }
    } catch {
      initialError = "Gagal memeriksa keabsahan tautan. Muat ulang halaman.";
    }
  }

  return (
    <ResetPasswordClient
      token={token}
      initialValid={initialValid}
      initialEmailMasked={initialEmailMasked}
      initialError={initialError}
    />
  );
}

