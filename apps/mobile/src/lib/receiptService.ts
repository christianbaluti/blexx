import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { Alert } from "react-native";
import type { SaleLineInput } from "@blex/shared";
import { formatMwk } from "@blex/shared";

type ReceiptLine = SaleLineInput & { name?: string; sku?: string; total?: number };

export async function shareReceipt(input: { refNo: string; total: number; subtotal?: number; discount?: number; customerName?: string; payment?: string; lines: ReceiptLine[] }) {
  const html = `
    <html>
      <body style="color:#221e1a;font-family:Arial,Helvetica,sans-serif;padding:24px">
        <h1 style="margin:0 0 6px">POS &amp; Inventory +</h1>
        <p style="margin:0 0 18px;color:#6f665c">Receipt ${input.refNo}${input.customerName ? ` - ${input.customerName}` : ""}${input.payment ? ` - ${input.payment}` : ""}</p>
        <table style="width:100%;border-collapse:collapse">
          <thead>
            <tr style="background:#f4f1eb">
              <th align="left" style="padding:8px;border:1px solid #d8d0c5">Product</th>
              <th align="right" style="padding:8px;border:1px solid #d8d0c5">Qty</th>
              <th align="right" style="padding:8px;border:1px solid #d8d0c5">Price</th>
              <th align="right" style="padding:8px;border:1px solid #d8d0c5">Discount</th>
              <th align="right" style="padding:8px;border:1px solid #d8d0c5">Total</th>
            </tr>
          </thead>
          <tbody>
            ${input.lines.map((line) => `<tr>
              <td style="padding:8px;border:1px solid #d8d0c5">${line.name ?? line.productId}</td>
              <td align="right" style="padding:8px;border:1px solid #d8d0c5">${line.qty}</td>
              <td align="right" style="padding:8px;border:1px solid #d8d0c5">${formatMwk(line.price)}</td>
              <td align="right" style="padding:8px;border:1px solid #d8d0c5">${formatMwk(line.discount)}</td>
              <td align="right" style="padding:8px;border:1px solid #d8d0c5">${formatMwk(line.total ?? line.qty * line.price - line.discount)}</td>
            </tr>`).join("")}
          </tbody>
        </table>
        <div style="margin-left:auto;margin-top:18px;width:260px">
          <p style="display:flex;justify-content:space-between;margin:6px 0"><span>Subtotal</span><strong>${formatMwk(input.subtotal ?? input.total + (input.discount ?? 0))}</strong></p>
          <p style="display:flex;justify-content:space-between;margin:6px 0"><span>Discount</span><strong>${formatMwk(input.discount ?? 0)}</strong></p>
          <h2 style="display:flex;justify-content:space-between;margin:10px 0 0;border-top:2px solid #221e1a;padding-top:10px"><span>Total</span><span>${formatMwk(input.total)}</span></h2>
        </div>
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
