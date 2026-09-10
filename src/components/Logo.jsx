import React from "react";
import { Luggage } from "lucide-react";

// Brand mark: a terracotta badge with a luggage glyph plus the Caprasimo
// wordmark. Kept in one place so every surface (nav, auth pages) shows a
// consistent identity in the "Organic" design system.
const SIZES = {
  sm: { box: "h-9 w-9 rounded-2xl", icon: 17, text: "text-lg" },
  md: { box: "h-10 w-10 rounded-2xl", icon: 19, text: "text-xl" },
  lg: { box: "h-14 w-14 rounded-[20px]", icon: 26, text: "text-3xl" },
};

export default function Logo({ size = "md", withText = true, className = "" }) {
  const s = SIZES[size] || SIZES.md;
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <span
        className={`grid place-items-center text-white bg-brand-500 shadow-soft ${s.box}`}
        aria-hidden="true"
      >
        <Luggage size={s.icon} strokeWidth={2.75} />
      </span>
      {withText && (
        <span className={`font-display tracking-tight text-ink leading-none ${s.text}`}>
          Pack<span className="text-brand-600">Planner</span>
        </span>
      )}
    </span>
  );
}
