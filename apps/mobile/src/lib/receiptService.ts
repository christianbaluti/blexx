import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { Alert } from "react-native";
import type { SaleLineInput } from "@blex/shared";
import { formatMwk } from "@blex/shared";

export async function shareReceipt(input: { refNo: string; total: number; lines: SaleLineInput[] }) {
  const html = `
    <html>
      <body style="font-family: Arial; padding: 24px">
        <h1>POS &amp; Inventory +</h1>
        <h2>Receipt ${input.refNo}</h2>
        <table style="width:100%; border-collapse: collapse">
          <thead><tr><th align="left">Product</th><th align="right">Qty</th><th align="right">Price</th></tr></thead>
          <tbody>
            ${input.lines.map((line) => `<tr><td>${line.productId}</td><td align="right">${line.qty}</td><td align="right">${formatMwk(line.price)}</td></tr>`).join("")}
          </tbody>
        </table>
        <h2>Total: ${formatMwk(input.total)}</h2>
      </body>
    </html>
  `;
  try {
    const file = await Print.printToFileAsync({ html });
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(file.uri, { mimeType: "application/pdf", UTI: "com.adobe.pdf", dialogTitle: `Receipt ${input.refNo}` });
    } else {
      await Print.printAsync({ uri: file.uri });
    }
    return file.uri;
  } catch (error) {
    Alert.alert("Could not share receipt", error instanceof Error ? error.message : "Please try again.");
    throw error;
  }
}
