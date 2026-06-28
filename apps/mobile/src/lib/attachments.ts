import { Alert } from "react-native";
import { openBase64File, saveBase64File } from "./exportData";

function extensionFor(mimeType: string) {
  if (mimeType.includes("pdf")) return "pdf";
  if (mimeType.includes("png")) return "png";
  if (mimeType.includes("webp")) return "webp";
  if (mimeType.includes("jpeg") || mimeType.includes("jpg")) return "jpg";
  return "bin";
}

function attachmentParts(name: string | null | undefined, dataUrl: string | null | undefined, mimeType: string | null | undefined) {
  if (!dataUrl) {
    Alert.alert("No attachment", "There is no file attached to this record.");
    return null;
  }
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) {
    Alert.alert("Cannot open file", "The saved attachment format is invalid.");
    return null;
  }
  const mime = mimeType || match[1];
  const filename = name && /\.[a-z0-9]+$/i.test(name) ? name : `${name || "attachment"}.${extensionFor(mime)}`;
  return { filename, base64: match[2], mime };
}

export async function openDataAttachment(name: string | null | undefined, dataUrl: string | null | undefined, mimeType: string | null | undefined) {
  const attachment = attachmentParts(name, dataUrl, mimeType);
  if (!attachment) return;
  await openBase64File(attachment.filename, attachment.base64, attachment.mime);
}

export async function downloadDataAttachment(name: string | null | undefined, dataUrl: string | null | undefined, mimeType: string | null | undefined) {
  const attachment = attachmentParts(name, dataUrl, mimeType);
  if (!attachment) return;
  await saveBase64File(attachment.filename, attachment.base64, attachment.mime);
}
