import React from "react";
import styled from "styled-components";

const Item = styled.li`
  display: flex;
  background: white;
  margin: 10px 0;
  padding: 15px 20px;
  border-radius: 12px;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05);
  color: #251fc5;
  font-weight: 600;
  font-size: 1.1rem;
  transition: all 0.2s ease-in-out;
  border: 1px solid #e1e8ed;
  text-decoration: ${props => props.completed ? 'line-through' : 'none'};
  opacity: ${props => props.completed ? 0.6 : 1};
`;

const DeleteButton = styled.button`
  margin-left: auto;
  background: red;
  border: none;
  color: white;
  cursor: pointer;
  border-radius: 12px;
`;

const ItemLabel = styled.span`
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 1;
  word-break: break-all;
`;

const BagTypeBadge = styled.span`
  font-size: 0.85rem;
  background-color: #f0f0f0;
  padding: 4px 8px;
  border-radius: 6px;
  color: #555;
  white-space: nowrap;
`;

function PackageItem({ singleItem, onRemoveItem, handleCheck }) {
    return (
        <Item completed={singleItem.status}>
            <input
                onChange={() => handleCheck(singleItem.id)}
                checked={singleItem.status}
                type="checkbox"
            />
            <ItemLabel>
                {singleItem.bagType === "Suitcase" ? "🧳" : "🎒"}
                <BagTypeBadge>{singleItem.bagType || "Suitcase"}</BagTypeBadge>
                {singleItem.name}
            </ItemLabel>
            <DeleteButton onClick={() => onRemoveItem(singleItem.id)}>
                Remove
            </DeleteButton>
        </Item>
    );
}

export default PackageItem;
