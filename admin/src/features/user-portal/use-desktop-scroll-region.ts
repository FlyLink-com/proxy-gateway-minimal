import { useEffect, useState } from "react";

const DESKTOP_SCROLL_QUERY = "(min-width: 721px)";

function desktopScrollRegionMatches() {
  if (typeof window === "undefined") return false;
  if (typeof window.matchMedia === "function") {
    return window.matchMedia(DESKTOP_SCROLL_QUERY).matches;
  }
  return window.innerWidth >= 721;
}

export function useDesktopScrollRegion() {
  const [enabled, setEnabled] = useState(desktopScrollRegionMatches);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    if (typeof window.matchMedia !== "function") {
      const update = () => setEnabled(desktopScrollRegionMatches());
      window.addEventListener("resize", update);
      return () => window.removeEventListener("resize", update);
    }

    const media = window.matchMedia(DESKTOP_SCROLL_QUERY);
    const update = () => setEnabled(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  return enabled;
}
