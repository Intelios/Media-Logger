import type { ReactNode } from "react";
import { cn } from "../../../lib/utils_ui";
import { CoverImage } from "../../CoverImage";

/**
 * The cinematic frame every chapter sits in.
 *
 * The old presentation blurred the cover behind a Tailwind gradient, which is
 * why all ten slides looked identical. Here the cover is duotoned by layered
 * gradients instead: the art stays legible as art, and the theme colour tints
 * it rather than replacing it.
 */
export function ReelStage({
  backdrop,
  preload,
  reduceMotion,
  children,
  stageHandlers,
}: {
  backdrop: string | null;
  /** Upcoming backdrops, warmed off-screen so a cut never shows a blank frame. */
  preload: string[];
  reduceMotion: boolean;
  children: ReactNode;
  stageHandlers: {
    onPointerDown: (event: React.PointerEvent<HTMLElement>) => void;
    onPointerUp: (event: React.PointerEvent<HTMLElement>) => void;
    onPointerCancel: () => void;
    onLostPointerCapture: () => void;
  };
}) {
  return (
    <div className="absolute inset-0 select-none" {...stageHandlers}>
      <div className="absolute inset-0 overflow-hidden">
        {backdrop && (
          <CoverImage
            key={backdrop}
            path={backdrop}
            alt=""
            variant="hero"
            priority="high"
            sizes="110vw"
            containerClassName="absolute inset-[-8%] h-[116%] w-[116%]"
            imageClassName={cn(
              "h-full w-full max-w-none object-cover",
              !reduceMotion && "review-kenburns",
            )}
          />
        )}

        {/* Duotone: the theme hue washed over the art, then crushed to black
            at the edges so display type always has somewhere dark to land. */}
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(120% 90% at 78% 22%, color-mix(in srgb, var(--color-primary) 62%, transparent) 0%, color-mix(in srgb, var(--color-primary) 30%, transparent) 34%, rgba(8,8,10,0.55) 62%, #08080A 100%)",
            mixBlendMode: "hard-light",
          }}
        />
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(90deg, rgba(8,8,10,0.93) 0%, rgba(8,8,10,0.78) 38%, rgba(8,8,10,0.18) 74%, rgba(8,8,10,0.55) 100%)",
          }}
        />
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(180deg, rgba(8,8,10,0.72) 0%, rgba(8,8,10,0) 24%, rgba(8,8,10,0) 64%, rgba(8,8,10,0.85) 100%)",
          }}
        />
        <div className="review-grain absolute inset-0" />
      </div>

      {/* Viewfinder ticks */}
      <div className="pointer-events-none absolute left-7 top-7 h-[22px] w-[22px] border-l border-t border-white/[0.28]" />
      <div className="pointer-events-none absolute right-7 top-7 h-[22px] w-[22px] border-r border-t border-white/[0.28]" />
      <div className="pointer-events-none absolute bottom-7 left-7 h-[22px] w-[22px] border-b border-l border-white/[0.28]" />
      <div className="pointer-events-none absolute bottom-7 right-7 h-[22px] w-[22px] border-b border-r border-white/[0.28]" />

      {/* Next backdrops, warmed at 1px so the decode is done before the cut. */}
      {preload.map((path) => (
        <CoverImage
          key={`preload-${path}`}
          path={path}
          alt=""
          variant="hero"
          sizes="100vw"
          containerClassName="pointer-events-none absolute h-px w-px overflow-hidden opacity-0"
          imageClassName="h-px w-px object-cover"
        />
      ))}

      <div className="relative z-10 flex h-full items-center">{children}</div>
    </div>
  );
}
