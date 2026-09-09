import React, { useEffect, useMemo, useState } from "react";
import { api } from "../services/api";

// Destination picker: the user first chooses a country, then a city that has a
// commercial airport within it. The country -> airport-cities data comes from
// the backend (GET /api/trips/locations). Because every listed city has an
// airport, the chosen destination always resolves for the downstream
// weather/flight lookups. Selecting a country resets the city so the two stay
// consistent.
export default function DestinationPicker({
  country,
  city,
  onChange,
  required = false,
  countrySelectId,
  citySelectId,
  selectClassName = "",
}) {
  const [citiesByCountry, setCitiesByCountry] = useState({});
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    let active = true;
    api
      .getLocations()
      .then((data) => {
        if (!active) return;
        const map = data && typeof data.citiesByCountry === "object" ? data.citiesByCountry : {};
        setCitiesByCountry(map || {});
      })
      .catch(() => {
        if (active) setLoadError(true);
      });
    return () => {
      active = false;
    };
  }, []);

  const countries = useMemo(
    () => Object.keys(citiesByCountry).sort((a, b) => a.localeCompare(b)),
    [citiesByCountry]
  );
  const cities = country && Array.isArray(citiesByCountry[country]) ? citiesByCountry[country] : [];

  return (
    <div>
      <div className="grid grid-cols-2 gap-2">
        <select
          id={countrySelectId}
          aria-label="Country"
          required={required}
          value={country}
          onChange={(event) => onChange({ country: event.target.value, city: "" })}
          className={selectClassName}
        >
          <option value="">Country…</option>
          {countries.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
        <select
          id={citySelectId}
          aria-label="City"
          required={required}
          value={city}
          disabled={!country}
          onChange={(event) => onChange({ country, city: event.target.value })}
          className={selectClassName}
        >
          <option value="">{country ? "City…" : "Select a country first"}</option>
          {cities.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      </div>
      {loadError && (
        <p role="alert" className="mt-2 text-xs text-accent-600">
          Couldn't load destinations. Please refresh and try again.
        </p>
      )}
    </div>
  );
}
