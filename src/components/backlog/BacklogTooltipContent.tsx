import { Calendar, CalendarClock, Hourglass, Play } from "lucide-react";
import { formatShortDate, getDaysUntil, getDaysSince, formatDurationLong } from "../../lib/dates";
import { parseGenres } from "../../lib/media-config";
import { cn } from "../../lib/utils_ui";
import { CoverImage } from "../CoverImage";
import { getTypeSolid } from "./backlog-visuals";
import type { BacklogItem } from "../../lib/db";

// The spine prints a title, a rank and an age; everything else about an item
// lives here. This is the one place that still needs a hover, and it exists for
// the long tail (full genre list, exact dates) rather than for the basics.
export function BacklogTooltipContent({ item }: { item: BacklogItem }) {
  const genres = parseGenres(item.genre);
  const daysUntilRelease = getDaysUntil(item.release_date);
  const daysWaiting = getDaysSince(item.added_date);
  const daysInProgress = getDaysSince(item.in_progress_since ?? null);

  return (
    <div className="space-y-2">
      {/* The cover at full size, which the shelf can only ever hint at. This is
          why a spine can stay 34px wide and still be identifiable. */}
      <div className="flex items-start gap-2.5">
        {item.image_url && (
          <CoverImage
            path={item.image_url}
            variant="small"
            alt=""
            sizes="52px"
            priority="low"
            containerClassName="h-[78px] w-[52px] shrink-0 rounded-[3px] ring-1 ring-white/10"
            imageClassName="h-full w-full object-cover"
          />
        )}

        <div className="min-w-0 space-y-1.5">
          <p className="text-sm font-semibold leading-tight text-text">{item.name}</p>

          <div className="flex flex-wrap items-center gap-1.5">
            <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-bold text-white", getTypeSolid(item.entry_type))}>
              {item.entry_type}
            </span>
            {item.status === "in_progress" && (
              <span className="rounded border border-amber-500/30 bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-bold text-amber-400">
                In Progress
              </span>
            )}
            {item.status === "unreleased" && (
              <span className="rounded border border-sky-500/30 bg-sky-500/20 px-1.5 py-0.5 text-[10px] font-bold text-sky-400">
                Unreleased
              </span>
            )}
          </div>
        </div>
      </div>

      {genres.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {genres.map((genre) => (
            <span key={genre} className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[9px] text-text">
              {genre}
            </span>
          ))}
        </div>
      )}

      <div className="space-y-1">
        <div className="flex items-center gap-1.5 text-[10px] text-text-muted">
          <Calendar size={10} />
          <span>
            Added {formatShortDate(item.added_date)}
            {item.status !== "unreleased" && daysWaiting !== null && daysWaiting > 0
              ? ` · ${formatDurationLong(daysWaiting)} ago`
              : ""}
          </span>
        </div>

        {item.status === "in_progress" && item.in_progress_since && (
          <div className="flex items-center gap-1.5 text-[10px] text-amber-400">
            <Play size={10} />
            <span>
              Started {formatShortDate(item.in_progress_since)}
              {daysInProgress !== null && daysInProgress > 0
                ? ` · ${formatDurationLong(daysInProgress)} in progress`
                : ""}
            </span>
          </div>
        )}

        {item.status === "unreleased" && item.release_date && (
          <>
            <div className="flex items-center gap-1.5 text-[10px] text-sky-400">
              <CalendarClock size={10} />
              <span>Releases {formatShortDate(item.release_date)}</span>
            </div>
            {daysUntilRelease !== null && daysUntilRelease >= 0 && (
              <div className="flex items-center gap-1.5 text-[10px] text-sky-400">
                <Hourglass size={10} />
                <span>
                  {daysUntilRelease === 0
                    ? "Releases today!"
                    : `${daysUntilRelease} ${daysUntilRelease === 1 ? "day" : "days"} until release`}
                </span>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
