import * as FileSystem from "expo-file-system/legacy";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { Alert, Platform } from "react-native";
import * as XLSX from "xlsx";

type ExportFormat = "csv" | "pdf" | "xlsx";

type BrowserGlobal = typeof globalThis & {
  document?: {
    createElement: (tag: "a") => {
      href: string;
      download: string;
      style: { display: string };
      click: () => void;
      remove: () => void;
    };
    body?: { appendChild: (node: unknown) => void };
  };
  URL?: { createObjectURL: (blob: Blob) => string; revokeObjectURL: (url: string) => void };
  atob?: (value: string) => string;
  open?: (url: string, target?: string) => unknown;
};

function safeFilename(title: string, extension: string) {
  const safeTitle = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "export";
  return `${safeTitle}-${new Date().toISOString().replace(/[:.]/g, "-")}.${extension}`;
}

function columnsFor(rows: Record<string, unknown>[]) {
  return Array.from(new Set(rows.flatMap((row) => Object.keys(row))));
}

function displayHeader(column: string) {
  return column
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function textValue(value: unknown) {
  if (value == null) return "";
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function escapeCell(value: unknown) {
  const text = textValue(value);
  return `"${text.replace(/"/g, '""')}"`;
}

function escapeHtml(value: unknown) {
  return textValue(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function rowsToCsv(rows: Record<string, unknown>[]) {
  const columns = columnsFor(rows);
  return [
    columns.map((column) => escapeCell(displayHeader(column))).join(","),
    ...rows.map((row) => columns.map((column) => escapeCell(row[column])).join(","))
  ].join("\n");
}

function rowsToXlsxBase64(title: string, rows: Record<string, unknown>[]) {
  const columns = columnsFor(rows);
  const worksheet = XLSX.utils.json_to_sheet(
    rows.map((row) => Object.fromEntries(columns.map((column) => [displayHeader(column), row[column] ?? ""]))),
    { header: columns.map(displayHeader) }
  );
  worksheet["!cols"] = columns.map((column) => ({
    wch: Math.max(displayHeader(column).length + 2, ...rows.map((row) => textValue(row[column]).length + 2), 12)
  }));
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, title.slice(0, 31) || "Export");
  return XLSX.write(workbook, { bookType: "xlsx", type: "base64" }) as string;
}

function rowsToHtml(title: string, rows: Record<string, unknown>[]) {
  const columns = columnsFor(rows);
  const header = columns.map((column) => `<th>${escapeHtml(displayHeader(column))}</th>`).join("");
  const body = rows
    .map((row) => `<tr>${columns.map((column) => `<td>${escapeHtml(row[column])}</td>`).join("")}</tr>`)
    .join("");
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    @page { size: A4 landscape; margin: 22px; }
    body { color: #221e1a; font-family: Arial, Helvetica, sans-serif; margin: 0; }
    h1 { font-size: 20px; margin: 0 0 6px; }
    .meta { color: #766d63; font-size: 10px; margin: 0 0 14px; }
    table { border-collapse: collapse; table-layout: fixed; width: 100%; }
    th { background: #f4f1eb; color: #5b5147; font-size: 9px; letter-spacing: .02em; text-align: left; text-transform: uppercase; }
    td, th { border: 1px solid #d8d0c5; overflow-wrap: anywhere; padding: 6px; vertical-align: top; }
    td { font-size: 9px; }
    tr:nth-child(even) td { background: #fbfaf7; }
  </style>
</head>
<body>
  <h1>${escapeHtml(title)}</h1>
  <p class="meta">Exported ${escapeHtml(new Date().toLocaleString())} - ${rows.length} row${rows.length === 1 ? "" : "s"}</p>
  <table><thead><tr>${header}</tr></thead><tbody>${body}</tbody></table>
</body>
</html>`;
}

function downloadInBrowser(filename: string, blob: Blob) {
  const browser = globalThis as BrowserGlobal;
  if (!browser.document || !browser.URL) return false;
  const url = browser.URL.createObjectURL(blob);
  const anchor = browser.document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = "none";
  browser.document.body?.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => browser.URL?.revokeObjectURL(url), 1000);
  return true;
}

function blobFromBase64(base64: string, mimeType: string) {
  const browser = globalThis as BrowserGlobal;
  if (!browser.atob) return null;
  const binary = browser.atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return new Blob([bytes], { type: mimeType });
}

export function openBlobInBrowser(blob: Blob) {
  const browser = globalThis as BrowserGlobal;
  if (!browser.URL || !browser.open) return false;
  const url = browser.URL.createObjectURL(blob);
  browser.open(url, "_blank");
  setTimeout(() => browser.URL?.revokeObjectURL(url), 60_000);
  return true;
}

async function shareFile(uri: string, mimeType: string, dialogTitle: string) {
  const canShare = await Sharing.isAvailableAsync();
  if (!canShare && mimeType === "application/pdf") {
    await Print.printAsync({ uri });
    return;
  }
  if (!canShare) {
    Alert.alert("File created", `The file was created at ${uri}`);
    return;
  }
  await Sharing.shareAsync(uri, { mimeType, dialogTitle });
}

export async function saveTextFile(filename: string, body: string, mimeType: string) {
  if (Platform.OS === "web" && downloadInBrowser(filename, new Blob([body], { type: mimeType }))) return;
  const uri = `${FileSystem.cacheDirectory}${filename}`;
  await FileSystem.writeAsStringAsync(uri, body);
  await shareFile(uri, mimeType, filename);
}

export async function saveBase64File(filename: string, base64: string, mimeType: string) {
  if (Platform.OS === "web") {
    const blob = blobFromBase64(base64, mimeType);
    if (blob && downloadInBrowser(filename, blob)) return;
  }
  const uri = `${FileSystem.cacheDirectory}${filename}`;
  await FileSystem.writeAsStringAsync(uri, base64, { encoding: FileSystem.EncodingType.Base64 });
  await shareFile(uri, mimeType, filename);
}

export async function openBase64File(filename: string, base64: string, mimeType: string) {
  if (Platform.OS === "web") {
    const blob = blobFromBase64(base64, mimeType);
    if (blob && openBlobInBrowser(blob)) return;
  }
  await saveBase64File(filename, base64, mimeType);
}

export async function exportRows(title: string, rows: Record<string, unknown>[], format: ExportFormat) {
  if (!rows.length) {
    Alert.alert("Nothing to export", "There are no rows in the current table.");
    return;
  }
  try {
    if (format === "pdf") {
      const file = await Print.printToFileAsync({ html: rowsToHtml(title, rows) });
      if (Platform.OS === "web") {
        const response = await fetch(file.uri);
        if (downloadInBrowser(safeFilename(title, "pdf"), await response.blob())) return;
      }
      await shareFile(file.uri, "application/pdf", `${title} PDF`);
      return;
    }

    if (format === "xlsx") {
      await saveBase64File(
        safeFilename(title, "xlsx"),
        rowsToXlsxBase64(title, rows),
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      );
      return;
    }

    await saveTextFile(safeFilename(title, "csv"), rowsToCsv(rows), "text/csv;charset=utf-8");
  } catch (error) {
    Alert.alert("Export failed", error instanceof Error ? error.message : "Please try again.");
  }
}
