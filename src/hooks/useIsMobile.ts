import { useState, useEffect } from "react";

export function useIsMobile(breakpoint = 640): boolean {
  const [is, setIs] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth < breakpoint : false
  );
  useEffect(() => {
    const h = () => setIs(window.innerWidth < breakpoint);
    window.addEventListener("resize", h);
    return () => window.removeEventListener("resize", h);
  }, [breakpoint]);
  return is;
}
