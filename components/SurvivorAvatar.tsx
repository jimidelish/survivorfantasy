"use client";

import { useState } from "react";

// Tracks load failure in React state (not by mutating the DOM node directly
// in onError), so once a photo fails to load, it reliably stays as the
// fallback avatar even when the page re-renders for unrelated reasons.
// referrerPolicy="no-referrer" works around Fandom/Wikia's hotlink
// protection, which 404s image requests that carry a cross-site Referer.
export default function SurvivorAvatar({
  name,
  photoUrl,
  className = "h-14 w-14",
}: {
  name: string;
  photoUrl: string | null;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);

  if (!photoUrl || failed) {
    return (
      <div
        className={`flex shrink-0 items-center justify-center rounded-full border border-surface2 bg-surface2 font-display text-lg text-muted ${className}`}
      >
        {name.charAt(0)}
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={photoUrl}
      alt={name}
      referrerPolicy="no-referrer"
      className={`shrink-0 rounded-full border border-surface2 object-cover ${className}`}
      onError={() => setFailed(true)}
    />
  );
}
