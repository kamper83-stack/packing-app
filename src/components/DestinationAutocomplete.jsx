import React, { useEffect, useId, useMemo, useRef, useState } from "react";
import { api } from "../services/api";

// Type-ahead destination field (Issue #38). As the user types, a dropdown
// shows matching popular destinations fetched from the backend; the user can
// pick one or keep free text. The submitted value is always the raw string,
// so the POST /api/trips contract is unchanged. No extra dependency — plain
// React only.
export default function DestinationAutocomplete({
  value,
  onChange,
  required = false,
  placeholder = "e.g. Paris, London, Tokyo",
  className = "",
  inputId,
}) {
  const [destinations, setDestinations] = useState([]);
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(-1);
  const containerRef = useRef(null);
  const listboxId = useId();

  // Load the popular-destination list once. Autocomplete is a convenience:
  // if the request fails the field still works as a plain text input.
  useEffect(() => {
    let active = true;
    api
      .getDestinations()
      .then((data) => {
        if (active) {
          setDestinations(Array.isArray(data?.destinations) ? data.destinations : []);
        }
      })
      .catch(() => {
        if (active) setDestinations([]);
      });
    return () => {
      active = false;
    };
  }, []);

  // Case-insensitive substring match against the current input, ranked so
  // that prefix matches come before mid-word matches (Issue #66). Typing
  // "Lon" should surface "London" ahead of "Barcelona"; both match via
  // includes(), but the prefix hit is the more useful suggestion. Ordering is
  // otherwise stable, preserving the catalog order within each group.
  const matches = useMemo(() => {
    const query = (value || "").trim().toLowerCase();
    if (!query) return [];
    const prefix = [];
    const substring = [];
    for (const city of destinations) {
      const lower = city.toLowerCase();
      if (lower.startsWith(query)) {
        prefix.push(city);
      } else if (lower.includes(query)) {
        substring.push(city);
      }
    }
    return [...prefix, ...substring];
  }, [value, destinations]);

  // Close the dropdown when clicking outside the component.
  useEffect(() => {
    function onDocumentClick(event) {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocumentClick);
    return () => document.removeEventListener("mousedown", onDocumentClick);
  }, []);

  const showList = open && matches.length > 0;

  const select = (city) => {
    onChange(city);
    setOpen(false);
    setHighlight(-1);
  };

  const handleKeyDown = (event) => {
    if (!showList) {
      if (event.key === "ArrowDown" && matches.length > 0) {
        event.preventDefault();
        setOpen(true);
        setHighlight(0);
      }
      return;
    }

    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        setHighlight((h) => (h + 1) % matches.length);
        break;
      case "ArrowUp":
        event.preventDefault();
        setHighlight((h) => (h - 1 + matches.length) % matches.length);
        break;
      case "Enter":
        if (highlight >= 0 && highlight < matches.length) {
          event.preventDefault();
          select(matches[highlight]);
        }
        break;
      case "Escape":
        setOpen(false);
        setHighlight(-1);
        break;
      default:
        break;
    }
  };

  return (
    <div className="relative" ref={containerRef}>
      <input
        id={inputId}
        type="text"
        role="combobox"
        aria-expanded={showList}
        aria-controls={listboxId}
        aria-autocomplete="list"
        autoComplete="off"
        required={required}
        placeholder={placeholder}
        className={className}
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
          setOpen(true);
          setHighlight(-1);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKeyDown}
      />
      {showList && (
        <ul
          id={listboxId}
          role="listbox"
          className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-md shadow-lg max-h-60 overflow-auto"
        >
          {matches.map((city, index) => (
            <li
              key={city}
              role="option"
              aria-selected={index === highlight}
              className={`px-3 py-2 cursor-pointer text-sm ${
                index === highlight
                  ? "bg-indigo-100 text-indigo-900"
                  : "text-gray-700 hover:bg-gray-100"
              }`}
              // onMouseDown (before the input's blur) so the pick registers
              // before the list would otherwise close.
              onMouseDown={(event) => {
                event.preventDefault();
                select(city);
              }}
              onMouseEnter={() => setHighlight(index)}
            >
              {city}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
