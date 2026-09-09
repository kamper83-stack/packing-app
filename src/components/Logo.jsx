import React from "react";
import { Luggage } from "lucide-react";

// Brand mark: a gradient badge with a luggage glyph plus the wordmark. Kept in
// one place so every surface (nav, auth pages) shows a consistent identity.
const SIZES = {
  sm: { box: "h-8 w-8 rounded-lg", icon: 16, text: "text-base" },
  md: { box: "h-9 w-9 rounded-xl", icon: 18, text: "text-lg" },
  lg: { box: "h-12 w-12 rounded-2xl", icon: 24, text: "text-2xl" },
};

export default function Logo({ size = "md", withText = true, className = "" }) {
  const s = SIZES[size] || SIZES.md;
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <span
        className={`grid place-items-center text-white bg-brand-gradient shadow-soft ${s.box}`}
        aria-hidden="true"
      >
        <Luggage size={s.icon} strokeWidth={2.2} />
      </span>
      {withText && (
        <span className={`font-display font-extrabold tracking-tight text-ink ${s.text}`}>
          Pack<span className="text-brand-600">Planner</span>
        </span>
      )}
    </span>
  );
}
