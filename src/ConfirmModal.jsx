import React from "react";
import "./ConfirmModal.css";

function ConfirmModal({ isOpen, itemName, onConfirm, onCancel }) {
    if (!isOpen) return null;

    return (
        <div className="modal-overlay" onClick={onCancel}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                <h3>Delete Item</h3>
                <p>Are you sure you want to remove <strong>"{itemName}"</strong> from your packing list?</p>

                <div className="modal-actions">
                    <button className="modal-btn cancel" onClick={onCancel}>
                        Cancel
                    </button>
                    <button className="modal-btn delete" onClick={onConfirm}>
                        Delete
                    </button>
                </div>
            </div>
        </div>
    );
}

export default ConfirmModal;
