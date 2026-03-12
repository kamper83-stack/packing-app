import React from "react";
import "./ProgressBar.css";

function ProgressBar({ items }) {
    const totalItems = items.length;
    const packedItems = items.filter((item) => item.status === true).length;

    let percentage = 0;
    if (totalItems > 0) {
        percentage = Math.round((packedItems / totalItems) * 100);
    }

    return (
        <div className="progress-container">
            <div className="progress-text">
                {totalItems === 0
                    ? "Add some items to start packing!"
                    : `Packed: ${packedItems} / ${totalItems} (${percentage}%)`}
            </div>
            <div className="progress-bar-bg">
                <div
                    className="progress-bar-fill"
                    style={{ width: `${percentage}%` }}
                ></div>
            </div>
        </div>
    );
}

export default ProgressBar;
