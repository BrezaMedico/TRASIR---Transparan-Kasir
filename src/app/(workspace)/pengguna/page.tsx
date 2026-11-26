"use client";

import React, { useEffect } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";

export default function TeamRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/pengaturan?tab=tim");
  }, [router]);

  return (
    <AppShell>
      {() => (
        <div className="bg-white rounded-2xl border border-[#202531]/15 p-8 text-center text-xs text-[#525866]">
          Mengalihkan ke Pengaturan Sistem (Tim &amp; Kolaborator)...
        </div>
      )}
    </AppShell>
  );
}
