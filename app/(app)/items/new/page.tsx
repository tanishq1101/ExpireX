import { ScanHub } from "@/components/scan-hub";

export default function NewItemPage() {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold">Add item</h1>
        <p className="text-sm text-muted">Scan a barcode, a label, a receipt — or type it in.</p>
      </div>
      <div className="glass p-5">
        <ScanHub />
      </div>
    </div>
  );
}
