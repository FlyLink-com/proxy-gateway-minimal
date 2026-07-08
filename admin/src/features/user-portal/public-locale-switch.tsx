import { useCallback, useEffect, useState } from "react";
import {
  applyPublicLocale,
  detectPublicLocale,
  PUBLIC_LOCALE_LABELS,
  savePublicLocale,
  type PublicLocale
} from "../../app/public-locale";

const publicLocaleOptions: PublicLocale[] = ["zh", "en"];

export function usePublicLocalePreference(defaultLocale: PublicLocale = "zh") {
  const [locale, setLocale] = useState<PublicLocale>(() => (
    detectPublicLocale({ defaultLocale, useBrowserLanguage: false })
  ));

  useEffect(() => {
    applyPublicLocale(locale);
  }, [locale]);

  const changeLocale = useCallback((nextLocale: PublicLocale) => {
    setLocale(nextLocale);
    savePublicLocale(nextLocale);
  }, []);

  return { locale, setLocale: changeLocale };
}

export function PublicLocaleSwitch({
  ariaLabel,
  locale,
  onLocaleChange
}: {
  ariaLabel: string;
  locale: PublicLocale;
  onLocaleChange: (locale: PublicLocale) => void;
}) {
  return (
    <div className="portal-locale-switch" role="group" aria-label={ariaLabel}>
      {publicLocaleOptions.map((option) => (
        <button
          type="button"
          key={option}
          aria-pressed={locale === option}
          title={PUBLIC_LOCALE_LABELS[option].name}
          onClick={() => onLocaleChange(option)}
        >
          {PUBLIC_LOCALE_LABELS[option].short}
        </button>
      ))}
    </div>
  );
}
