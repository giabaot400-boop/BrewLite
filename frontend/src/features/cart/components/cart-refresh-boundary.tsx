"use client";

import { useState, type ReactNode } from "react";

type Props = {
  ready: boolean;
  restoring: boolean;
  sessionVersion: number;
  children: ReactNode;
};

/** Retain layout only: cached content is invisible, inert and outside the accessibility tree. */
export function CartRefreshBoundary({ ready, restoring, sessionVersion, children }: Props) {
  const [cached, setCached] = useState<{ sessionVersion: number; content: ReactNode } | null>(null);
  if (ready && (!cached || cached.content !== children || cached.sessionVersion !== sessionVersion)) {
    setCached({ sessionVersion, content: children });
  } else if (cached && cached.sessionVersion !== sessionVersion) {
    setCached(null);
  }
  const retaining = restoring && cached !== null && cached.sessionVersion === sessionVersion;
  return (
    <div className="relative flow-root" aria-busy={restoring || undefined}>
      {restoring && <p role="status" className={`${retaining ? "absolute inset-x-0 top-0 z-10" : ""} rounded-xl bg-stone-100 p-4 text-sm text-stone-600`}>
        Đang kiểm tra lại phiên và giỏ. Vui lòng chờ trước khi thao tác.
      </p>}
      <div className={retaining ? "invisible" : undefined} aria-hidden={retaining || undefined} inert={retaining || undefined}>
        {retaining ? cached.content : children}
      </div>
    </div>
  );
}
