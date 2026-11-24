import { LandingPage } from "@/components/landing/LandingPage";

// Halaman publik di-render statis (SSG) agar muat instan tanpa menunggu query database
export const dynamic = "force-static";

export default function HomePage() {
  return (
    <LandingPage
      isAuthenticated={false}
      navCtaHref="/login?redirect=/dashboard"
      navCtaLabel="Masuk"
      heroCtaHref="/login?redirect=/dashboard"
      heroCtaLabel="Mulai Kelola Toko"
      finalCtaHref="/register?redirect=/dashboard"
      finalCtaLabel="Buat Akun Gratis"
    />
  );
}
