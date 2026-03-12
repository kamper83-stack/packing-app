import React, { useEffect, useState } from "react";
import styled from "styled-components";
import AddItem from "./AddItem";
import PackageItem from "./PackageItem";
import FilterToolbar from "./FilterToolbar";
import ProgressBar from "./ProgressBar";
import ConfirmModal from "./ConfirmModal";

const ItemList = styled.ul`
  list-style: none;
  padding: 0;
  width: 100%;
  max-width: 400px;
  margin-top: 20px;
`;

function PackageList() {
  const [items, setItems] = useState(() => {
    const savedItems = localStorage.getItem("packing-items");
    if (savedItems) {
      return JSON.parse(savedItems);
    }
    return [];
  });
  const [item, setItem] = useState("");
  const [filterSelection, setFilterSelection] = useState("all");
  const [bagType, setBagType] = useState("Suitcase");
  const [itemToDelete, setItemToDelete] = useState(null);

  const onAddItem = () => {
    if (item.trim() === "") return;
    const newItem = {
      id: Date.now(),
      name: item.trim(),
      status: false,
      bagType: bagType,
    };
    setItems([...items, newItem]);
    // adding new item to the list withput spaces
    setItem(""); // clearing the input
  };
  const onRemoveItem = (item) => {
    setItemToDelete(item);
  };

  const confirmDelete = () => {
    if (itemToDelete) {
      setItems(items.filter((todo) => todo.id !== itemToDelete.id));
      setItemToDelete(null);
    }
  };

  const cancelDelete = () => {
    setItemToDelete(null);
  };

  useEffect(() => {
    localStorage.setItem("packing-items", JSON.stringify(items));
    console.log("Saved to local storage:", items);
  }, [items]);

  const handleCheck = (id) => {
    const newItems = items.map((item) => {
      if (item.id == id) {
        const newItem = { ...item, status: !item.status };
        return newItem;
      } else {
        return item;
      }
    });
    setItems(newItems);
  };
  useEffect(() => console.log(items), [items]);

  const filteredItems = items.filter((todo) => {
    if (filterSelection === "unpacked") return !todo.status;
    if (filterSelection === "packed") return todo.status;
    return true; // "all"
  });

  return (
    <>
      <ProgressBar items={items} />
      <br />
      <AddItem
        item={item}
        setItem={setItem}
        onAddItem={onAddItem}
        bagType={bagType}
        setBagType={setBagType}
      />
      <FilterToolbar currentSelection={filterSelection} setFilterSelection={setFilterSelection} />
      <ItemList>
        {filteredItems.map(singleItem => (<PackageItem key={singleItem.id} singleItem={singleItem} onRemoveItem={() => onRemoveItem(singleItem)} handleCheck={handleCheck} />))}
      </ItemList>
      <ConfirmModal
        isOpen={itemToDelete !== null}
        itemName={itemToDelete ? itemToDelete.name : ""}
        onConfirm={confirmDelete}
        onCancel={cancelDelete}
      />
    </>
  );
}

export default PackageList;
