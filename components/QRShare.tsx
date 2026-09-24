"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";

export default function QRShare({ joinUrl }: { joinUrl: string }) {
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [canShareFiles, setCanShareFiles] = useState(false);

  useEffect(() => {
    QRCode.toDataURL(joinUrl, {
      width: 480,
      margin: 2,
      color: { dark: "#0b0b12", light: "#f4f3f7" },
    }).then(setQrDataUrl);
  }, [joinUrl]);

  useEffect(() => {
    setCanShareFiles(
      typeof navigator !== "undefined" &&
        "share" in navigator &&
        "canShare" in navigator &&
        navigator.canShare?.({ files: [new File([], "qr.png", { type: "image/png" })] }) === true
    );
  }, []);

  const handleShareImage = async () => {
    if (!qrDataUrl) return;
    try {
      const res = await fetch(qrDataUrl);
      const blob = await res.blob();
      const file = new File([blob], "watch-tonight-invite.png", { type: "image/png" });
      await navigator.share({
        files: [file],
        title: "What should we watch tonight?",
        text: "Scan this to set your preferences — let's find something we'll both like.",
      });
    } catch {
      // user cancelled share sheet — no-op
    }
  };

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(joinUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard unavailable — link is still visible below to copy manually
    }
  };

  return (
    <div className="w-full max-w-xs mx-auto flex flex-col items-center gap-4">
      <div className="card-shell rounded-3xl p-4">
        {qrDataUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={qrDataUrl} alt="Scan to join" className="w-56 h-56 rounded-xl" />
        ) : (
          <div className="w-56 h-56 rounded-xl shimmer" />
        )}
      </div>

      <p className="text-sm text-[var(--text-dim)] text-center">
        Have your partner scan this, or send them the link below
      </p>

      <div className="flex flex-col gap-2 w-full">
        {canShareFiles && (
          <button onClick={handleShareImage} className="btn-primary rounded-full py-3 text-sm">
            Share QR code
          </button>
        )}
        <button onClick={handleCopyLink} className="btn-secondary rounded-full py-3 text-sm">
          {copied ? "Link copied ✓" : "Copy invite link"}
        </button>
      </div>
    </div>
  );
}
