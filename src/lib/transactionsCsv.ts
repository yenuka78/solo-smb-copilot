import type { TransactionType } from "@/lib/types";

export type TransactionCsvRow = {
  date: string;
  type: TransactionType;
  category: string;
  description: string;
  amount: number;
  receiptName?: string;
};

function escapeCsvCell(value: string | number): string {
  const normalized = String(value).replace(/\r?\n/g, " ");
  const escaped = normalized.replaceAll('"', '""');
  return `"${escaped}"`;
}

export function buildTransactionListCsv(rows: TransactionCsvRow[]): string {
  const headers = ["Date", "Type", "Category", "Description", "Amount", "Receipt"];

  const csvRows = rows.map((row) => [
    row.date,
    row.type,
    row.category,
    row.description,
    row.amount.toFixed(2),
    row.receiptName ?? "",
  ]);

  return [headers, ...csvRows].map((line) => line.map((cell) => escapeCsvCell(cell)).join(",")).join("\n");
}
