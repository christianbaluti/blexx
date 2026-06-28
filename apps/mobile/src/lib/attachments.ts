import { Alert } from "react-native";
import { saveBase64File } from "./exportData";

function extensionFor(mimeType: string) {
  if (mimeType.includes("pdf")) return "pdf";
  if (mimeType.includes("png")) return "png";
  if (mimeType.includes("webp")) return "webp";
  if (mimeType.includes("jpeg") || mimeType.includes("jpg")) return "jpg";
  return "bin";
}

export async function openDataAttachment(name: string | null | undefined, dataUrl: string | null | undefined, mimeType: string | null | undefined) {
  if (!dataUrl) {
    Alert.alert("No attachment", "There is no file attached to this record.");
    return;
  }
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) {
    Alert.alert("Cannot open file", "The saved attachment format is invalid.");
    return;
  }
  const mime = mimeType || match[1];
  const filename = name && /\.[a-z0-9]+$/i.test(name) ? name : `${name || "attachment"}.${extensionFor(mime)}`;
  await saveBase64File(filename, match[2], mime);
}
