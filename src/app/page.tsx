import { getCurrentSessionUser } from "@/lib/auth";
import { getDefaultRedirectForRole } from "@/lib/rbac";
import { LandingPage } from "@/components/landing/LandingPage";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  let user = null;
  try {
    user = await getCurrentSessionUser();
  } catch {
    user = null;
  }

  const ctaHref = user ? getDefaultRedirectForRole(user.role) : "/login";
  const ctaLabel = user ? "Buka Workspace" : "Masuk Sistem";
  const closingCtaLabel = user ? "Buka Workspace TRASIR" : "Masuk ke Aplikasi TRASIR";

  return (
    <LandingPage
      ctaHref={ctaHref}
      ctaLabel={ctaLabel}
      closingCtaLabel={closingCtaLabel}
    />
  );
}
