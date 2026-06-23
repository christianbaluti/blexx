import * as FileSystem from "expo-file-system/legacy";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";

type ExportFormat = "csv" | "pdf" | "xlsx";

function escapeCell(value: unknown) {
  const text = value == null ? "" : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

function rowsToCsv(rows: Record<string, unknown>[]) {
  const columns = Array.from(new Set(rows.flatMap((row) => Object.keys(row))));
  return [
    columns.map(escapeCell).join(","),
    ...rows.map((row) => columns.map((column) => escapeCell(row[column])).join(","))
  ].join("\n");
}

function rowsToHtml(title: string, rows: Record<string, unknown>[]) {
  const columns = Array.from(new Set(rows.flatMap((row) => Object.keys(row))));
  const header = columns.map((column) => `<th>${String(column)}</th>`).join("");
  const body = rows.map((row) => `<tr>${columns.map((column) => `<td>${String(row[column] ?? "")}</td>`).join("")}</tr>`).join("");
  return `<!doctype html><html><head><meta charset="utf-8"><style>body{font-family:-apple-system,BlinkMacSystemFont,sans-serif}table{border-collapse:collapse;width:100%}td,th{border:1px solid #ddd;padding:6px;font-size:11px}th{text-align:left;background:#f3f1eb}</style></head><body><h1>${title}</h1><table><thead><tr>${header}</tr></thead><tbody>${body}</tbody></table></body></html>`;
}

export async function exportRows(title: string, rows: Record<string, unknown>[], format: ExportFormat) {
  const safeTitle = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "export";
  if (format === "pdf") {
    const file = await Print.printToFileAsync({ html: rowsToHtml(title, rows) });
    await Sharing.shareAsync(file.uri, { mimeType: "application/pdf", dialogTitle: `${title} PDF` });
    return;
  }

  const csv = rowsToCsv(rows);
  const extension = format === "xlsx" ? "xlsx" : "csv";
  const mimeType = format === "xlsx" ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" : "text/csv";
  const uri = `${FileSystem.cacheDirectory}${safeTitle}-${Date.now()}.${extension}`;
  await FileSystem.writeAsStringAsync(uri, csv);
  await Sharing.shareAsync(uri, { mimeType, dialogTitle: `${title} ${extension.toUpperCase()}` });
}
