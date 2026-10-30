"use client";

import Image from "next/image";
import { useEffect, useState, useSyncExternalStore } from "react";
import { CAROUSEL_INTERVAL_MS, loginSlides, nextCarouselIndex } from "@/lib/login-carousel";

function subscribeReducedMotion(onChange: () => void) {
  const media = window.matchMedia("(prefers-reduced-motion: reduce)");
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function LoginCarousel() {
  const reducedMotion = useSyncExternalStore(subscribeReducedMotion, prefersReducedMotion, () => false);
  const [active, setActive] = useState(0);

  useEffect(() => {
    if (reducedMotion) return;
    const timer = window.setInterval(() => {
      setActive((current) => nextCarouselIndex(current));
    }, CAROUSEL_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [reducedMotion]);

  return (
    <div className="absolute inset-0" aria-hidden="true">
      {loginSlides.map((slide, index) => (
        <Image
          key={slide.src}
          src={slide.src}
          alt=""
          fill
          priority={index === 0}
          sizes="100vw"
          className={`object-cover motion-reduce:transition-none ${
            index === active ? "z-10 opacity-100" : "z-0 opacity-0"
          } transition-opacity duration-1000 ease-in-out`}
        />
      ))}
    </div>
  );
}
