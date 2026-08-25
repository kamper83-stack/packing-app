// Passenger composition helpers shared by the trip-creation form and the
// trip views. The canonical shape (see backend Issue #22) is a JSON object
// with exactly these four non-negative integer counts:
//   { infants, children, women, men }

// Canonical categories, in the order they should appear in the UI.
export const PASSENGER_CATEGORIES = [
  { key: "infants", label: "תינוקות", emoji: "👶" },
  { key: "children", label: "ילדים", emoji: "🧒" },
  { key: "women", label: "נשים", emoji: "👩" },
  { key: "men", label: "גברים", emoji: "👨" },
];

// An empty composition with all four canonical keys set to zero.
export const emptyComposition = () => ({ infants: 0, children: 0, women: 0, men: 0 });

// Coerce a raw form value (string or number) to a non-negative integer.
export const toCount = (value) => {
  const n = parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
};

// Whether a raw form value is an acceptable passenger count: a blank field
// (treated as zero) or a non-negative whole number. Fractional, negative or
// otherwise non-numeric values are rejected here instead of being silently
// truncated by parseInt (e.g. "1.5" -> 1). See Issue #35.
export const isValidCount = (value) => {
  if (value === "" || value === null || value === undefined) return true;
  return /^\d+$/.test(String(value).trim());
};

// Display labels of any passenger categories whose raw value is not a valid
// non-negative integer, so the form can surface a specific validation message.
export const invalidPassengerCategories = (form) =>
  PASSENGER_CATEGORIES.filter((c) => !isValidCount(form ? form[c.key] : undefined)).map(
    (c) => c.label
  );

// Total number of passengers across the four categories.
export const totalPassengers = (composition) => {
  if (!composition) return 0;
  return PASSENGER_CATEGORIES.reduce((sum, c) => sum + toCount(composition[c.key]), 0);
};

// Build the exact passengerComposition payload (four canonical keys) from
// the raw form state.
export const buildComposition = (form) => ({
  infants: toCount(form.infants),
  children: toCount(form.children),
  women: toCount(form.women),
  men: toCount(form.men),
});

// Human-readable summary of the non-zero categories, e.g. "👶 1 · 👩 2".
// Returns null when there is no usable composition so callers can fall back
// to the legacy numPeople total for older trips.
export const summarizePassengers = (composition) => {
  if (!composition || totalPassengers(composition) === 0) return null;
  return PASSENGER_CATEGORIES.filter((c) => toCount(composition[c.key]) > 0)
    .map((c) => `${c.emoji} ${toCount(composition[c.key])} ${c.label}`)
    .join(" · ");
};
