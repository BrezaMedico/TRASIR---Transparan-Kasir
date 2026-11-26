export type ThemePreference = "light" | "dark" | "system";
export type FontSizePreference = "small" | "medium" | "large";
export type FontFamilyPreference =
  | "jakarta"
  | "inter"
  | "dm-sans"
  | "nunito"
  | "ibm-plex";

export interface UiPreferences {
  theme: ThemePreference;
  fontSize: FontSizePreference;
  fontFamily: FontFamilyPreference;
}

export const DEFAULT_UI_PREFERENCES: UiPreferences = {
  theme: "light",
  fontSize: "medium",
  fontFamily: "jakarta",
};

export const THEME_STORAGE_KEY = "trasir-theme";
export const FONT_SIZE_STORAGE_KEY = "trasir-font-size";
export const FONT_FAMILY_STORAGE_KEY = "trasir-font-family";

export const FONT_SIZE_OPTIONS: {
  id: FontSizePreference;
  label: string;
  pxLabel: string;
  description: string;
}[] = [
  {
    id: "small",
    label: "Kecil",
    pxLabel: "14 px",
    description: "Ringkas untuk layar penuh informasi",
  },
  {
    id: "medium",
    label: "Sedang",
    pxLabel: "16 px",
    description: "Standar nyaman dibaca seharian",
  },
  {
    id: "large",
    label: "Besar",
    pxLabel: "18 px",
    description: "Huruf ekstra jelas dan ramah mata",
  },
];

export const FONT_FAMILY_OPTIONS: {
  id: FontFamilyPreference;
  label: string;
  cssVar: string;
  description: string;
}[] = [
  {
    id: "jakarta",
    label: "Plus Jakarta Sans",
    cssVar: "var(--font-jakarta)",
    description: "Bawaan TRASIR, modern & tegas",
  },
  {
    id: "inter",
    label: "Inter",
    cssVar: "var(--font-inter)",
    description: "Sangat jernih untuk angka & tabel kasir",
  },
  {
    id: "dm-sans",
    label: "DM Sans",
    cssVar: "var(--font-dm-sans)",
    description: "Geometris bersih, rapi & ringan",
  },
  {
    id: "nunito",
    label: "Nunito Sans",
    cssVar: "var(--font-nunito)",
    description: "Membulat ramah, santai untuk mata",
  },
  {
    id: "ibm-plex",
    label: "IBM Plex Sans",
    cssVar: "var(--font-ibm-plex)",
    description: "Presisi tinggi & mudah dibedakan",
  },
];

export function isValidTheme(v: unknown): v is ThemePreference {
  return v === "light" || v === "dark" || v === "system";
}

export function isValidFontSize(v: unknown): v is FontSizePreference {
  return v === "small" || v === "medium" || v === "large";
}

export function isValidFontFamily(v: unknown): v is FontFamilyPreference {
  return (
    v === "jakarta" ||
    v === "inter" ||
    v === "dm-sans" ||
    v === "nunito" ||
    v === "ibm-plex"
  );
}

export function readUiPreferences(): UiPreferences {
  if (typeof window === "undefined") {
    return DEFAULT_UI_PREFERENCES;
  }
  try {
    const rawTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
    const rawSize = window.localStorage.getItem(FONT_SIZE_STORAGE_KEY);
    const rawFamily = window.localStorage.getItem(FONT_FAMILY_STORAGE_KEY);

    return {
      theme: isValidTheme(rawTheme) ? rawTheme : DEFAULT_UI_PREFERENCES.theme,
      fontSize: isValidFontSize(rawSize) ? rawSize : DEFAULT_UI_PREFERENCES.fontSize,
      fontFamily: isValidFontFamily(rawFamily)
        ? rawFamily
        : DEFAULT_UI_PREFERENCES.fontFamily,
    };
  } catch {
    return DEFAULT_UI_PREFERENCES;
  }
}

export function resolveEffectiveColorScheme(theme: ThemePreference): "light" | "dark" {
  if (theme === "dark" || theme === "light") return theme;
  if (typeof window !== "undefined" && typeof window.matchMedia === "function") {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  return "light";
}

export function applyUiPreferencesToDom(prefs: UiPreferences): void {
  if (typeof document === "undefined") return;

  const metaContent = prefs.theme === "system" ? "light dark" : prefs.theme;
  let meta = document.querySelector<HTMLMetaElement>('meta[name="color-scheme"]');
  if (!meta) {
    meta = document.createElement("meta");
    meta.name = "color-scheme";
    document.head.appendChild(meta);
  }
  meta.content = metaContent;

  const root = document.documentElement;
  root.dataset.theme = prefs.theme;
  root.dataset.resolvedTheme = resolveEffectiveColorScheme(prefs.theme);
  root.dataset.fontSize = prefs.fontSize;
  root.dataset.fontFamily = prefs.fontFamily;
}

export function saveAndApplyUiPreferences(next: UiPreferences): void {
  applyUiPreferencesToDom(next);
  if (typeof window === "undefined") return;
  try {
    if (next.theme === "system") {
      window.localStorage.removeItem(THEME_STORAGE_KEY);
    } else {
      window.localStorage.setItem(THEME_STORAGE_KEY, next.theme);
    }
    window.localStorage.setItem(FONT_SIZE_STORAGE_KEY, next.fontSize);
    window.localStorage.setItem(FONT_FAMILY_STORAGE_KEY, next.fontFamily);
  } catch {
    // Abaikan jika browser memblokir storage
  }
}

export function subscribeUiPreferences(onChange: (prefs: UiPreferences) => void): () => void {
  if (typeof window === "undefined") {
    return () => {};
  }

  const handleStorage = (e: StorageEvent) => {
    if (
      e.key === null ||
      e.key === THEME_STORAGE_KEY ||
      e.key === FONT_SIZE_STORAGE_KEY ||
      e.key === FONT_FAMILY_STORAGE_KEY
    ) {
      const updated = readUiPreferences();
      applyUiPreferencesToDom(updated);
      onChange(updated);
    }
  };

  window.addEventListener("storage", handleStorage);

  const mq =
    typeof window.matchMedia === "function"
      ? window.matchMedia("(prefers-color-scheme: dark)")
      : null;

  const handleMediaChange = () => {
    const current = readUiPreferences();
    if (current.theme === "system") {
      applyUiPreferencesToDom(current);
      onChange(current);
    }
  };

  if (mq && typeof mq.addEventListener === "function") {
    mq.addEventListener("change", handleMediaChange);
  }

  return () => {
    window.removeEventListener("storage", handleStorage);
    if (mq && typeof mq.removeEventListener === "function") {
      mq.removeEventListener("change", handleMediaChange);
    }
  };
}

