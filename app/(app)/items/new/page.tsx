import { AddItemTabs } from "@/components/add-item-tabs";

export default function NewItemPage() {
  return (
    <div className="space-y-5">
      <h1 className="text-xl font-semibold">Add item</h1>
      <AddItemTabs />
    </div>
  );
}
