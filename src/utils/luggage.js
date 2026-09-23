// Luggage-related constants shared by the trip-creation and trip-edit forms.
//
// The backend demands a non-empty `airline` on every POST/PUT (see
// backend/routes/trips.js and the backend regression test that locks this
// behaviour) — it feeds airlines.json's baggage allowance into the packing
// prompt. After the "remove airline selection from the UI" decision the user
// no longer picks an airline; the client always sends this fixed default
// rather than a chosen field, so the backend contract stays satisfied without
// any backend change.

// Fixed airline always sent by the frontend when creating/updating a trip.
export const DEFAULT_AIRLINE = "EL AL";

// Upper bound for the trolley/checked-suitcase count field. Mirrors the
// backend's MAX_TROLLEY_COUNT in backend/routes/trips.js; 0 (backpacks-only
// trip) is a valid choice.
export const MAX_TROLLEY_COUNT = 10;