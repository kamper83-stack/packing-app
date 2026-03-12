import React from "react";
import "./FilterToolbar.css";

function FilterToolbar({ currentSelection, setFilterSelection }) {
    return (
        <div className="filter-toolbar">
            <button
                className={`filter-btn all ${currentSelection === "all" ? "active" : ""}`}
                onClick={() => setFilterSelection("all")}
            >
                All
            </button>
            <button
                className={`filter-btn unpacked-btn ${currentSelection === "unpacked" ? "active" : ""}`}
                onClick={() => setFilterSelection("unpacked")}
            >
                Unpacked
            </button>
            <button
                className={`filter-btn packed-btn ${currentSelection === "packed" ? "active" : ""}`}
                onClick={() => setFilterSelection("packed")}
            >
                Packed
            </button>
        </div>
    );
}

export default FilterToolbar;
