// Browser-only: hands the bytes of a PDF to the user as a file download. Returns false when there is no browser to do it.
export function downloadPdf(bytes: Uint8Array, fileName: string): boolean {
  if (typeof window === "undefined" || typeof document === "undefined") return false;
  const blob = new Blob([bytes as BlobPart], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Revoke after the browser has started the download.
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return true;
}
