import React from "react";
import "./AddItem.css";

function AddItem({ item, setItem, onAddItem, bagType, setBagType }) {
  const handleKeyDown = (e) => {
    if (e.key === "Enter") {
      onAddItem();
    }
  };

  return (
    <div className="input-group">
      <input
        className="input"
        value={item}
        onChange={(e) => setItem(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Enter Item"
      />
      <select
        className="bag-select"
        value={bagType}
        onChange={(e) => setBagType(e.target.value)}
      >
        <option value="Suitcase">🧳 Suitcase</option>
        <option value="Backpack">🎒 Backpack</option>
      </select>
      <button className="button" onClick={onAddItem}>
        Add Item
      </button>
    </div>
  );
}

export default AddItem;
