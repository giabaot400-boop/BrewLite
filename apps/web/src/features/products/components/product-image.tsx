"use client";

import Image from "next/image";
import { useState } from "react";

export function ProductImage({ src, name }: { src: string; name: string }) {
  const [failed, setFailed] = useState(false);
  return (
    <Image
      src={failed ? "/images/placeholder.svg" : src}
      alt={name}
      width={640}
      height={480}
      unoptimized
      className="aspect-4/3 w-full rounded-xl object-cover"
      onError={() => setFailed(true)}
    />
  );
}
