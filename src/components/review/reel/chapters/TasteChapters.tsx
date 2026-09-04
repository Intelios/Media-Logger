import { useEffect, useMemo, useRef, useState } from "react";
import { forceCollide, forceManyBody, forceSimulation, forceX, forceY } from "d3-force";
import { scaleLinear } from "d3-scale";
import { useHoverTooltip, TooltipDetail, TooltipTitle } from "../../../HoverTooltip";
import type {
  ConstellationData,
  TopFranchiseData,
  TopGenreData,
} from "../../../../lib/review/chapters";
import {
  ChapterBody,
  ChapterChip,
  ChapterLead,
  ChapterStat,
  ChapterStatRow,
  ChapterSubtitle,
  ChapterTitle,
  StatDivider,
} from "./layout";

export function TopGenreChapter({ data }: { data: TopGenreData }) {
  return (
    <ChapterBody>
      <ChapterLead eyebrow="Genre of choice" width={840}>
        <ChapterTitle size={116}>{data.top.name}</ChapterTitle>
        <ChapterSubtitle>
          {data.top.count} {data.top.count === 1 ? "entry" : "entries"}
          {data.top.avgScore != null
            ? `, averaging ${data.top.avgScore.toFixed(1)} — you know what you like.`
            : "."}
        </ChapterSubtitle>

        {data.runnersUp.length > 0 && (
          <div className="mt-10 flex max-w-[760px] flex-wrap gap-3">
            {data.runnersUp.map((genre) => (
              <ChapterChip key={genre.name}>
                {genre.name}
                <span className="text-white/50">{genre.count}</span>
              </ChapterChip>
            ))}
          </div>
        )}
      </ChapterLead>
    </ChapterBody>
  );
}

export function TopFranchiseChapter({ data }: { data: TopFranchiseData }) {
  return (
    <ChapterBody>
      <ChapterLead eyebrow="Obsession of the year" width={840}>
        <ChapterTitle size={104}>{data.top.name}</ChapterTitle>
        <ChapterSubtitle>
          {data.top.count} entries deep
          {data.top.avgScore != null
            ? `, and an average of ${data.top.avgScore.toFixed(1)}. You are not objective about this, and that is fine.`
            : ". You kept going back."}
        </ChapterSubtitle>

        <ChapterStatRow>
          <ChapterStat value={data.top.count} label="Entries" />
          {data.top.avgScore != null && (
            <>
              <StatDivider />
              <ChapterStat value={data.top.avgScore.toFixed(1)} label="Average" color="#fbbf24" />
            </>
          )}
          {(data.top.perfectCount ?? 0) > 0 && (
            <>
              <StatDivider />
              <ChapterStat value={data.top.perfectCount ?? 0} label="Perfect" color="#fbbf24" />
            </>
          )}
        </ChapterStatRow>

        {data.others.length > 0 && (
          <div className="mt-10 flex flex-wrap gap-3">
            {data.others.map((franchise) => (
              <ChapterChip key={franchise.name}>
                {franchise.name}
                <span className="text-white/50">{franchise.count}</span>
              </ChapterChip>
            ))}
          </div>
        )}
      </ChapterLead>
    </ChapterBody>
  );
}

interface StarNode {
  x: number;
  y: number;
  r: number;
  name: string;
  count: number;
  avgScore?: number;
  rank: number;
  labelled: boolean;
  fontSize: number;
}

/** How many of the brightest genres carry a visible label. */
const LABEL_LIMIT = 12;

/**
 * The genre cloud, redrawn as a star map.
 *
 * Two things changed from the old cloud. It is measured rather than drawn into
 * a fixed viewBox — an SVG scaled with preserveAspectRatio would centre itself
 * inside the flex cell while the HTML labels positioned against the cell,
 * drifting apart. And the simulation is pre-ticked to rest and stopped: the old
 * one ran a live tick loop that restarted on every mouse move, which is JS
 * animation the app's energy saver cannot touch, burning frames behind an
 * auto-advancing chapter nobody is hovering.
 */
export function ConstellationChapter({ data }: { data: ConstellationData }) {
  const { bindTooltip } = useHoverTooltip();
  const stageRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [nodes, setNodes] = useState<StarNode[]>([]);

  const genres = data.genres;

  useEffect(() => {
    const element = stageRef.current;
    if (!element) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setSize({ width: entry.contentRect.width, height: entry.contentRect.height });
      }
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (genres.length === 0 || size.width < 80 || size.height < 80) return;

    const maxCount = genres[0].count;
    const minCount = genres[genres.length - 1].count;
    const radius = scaleLinear().domain([minCount, maxCount]).range([4, 24]).clamp(true);
    const type = scaleLinear().domain([minCount, maxCount]).range([11, 19]).clamp(true);

    const centreX = size.width / 2;
    const centreY = size.height / 2;

    // Seeded off the index rather than Math.random, so a given run always
    // draws the same sky — a keepsake that reshuffles every visit is noise.
    const seeded: StarNode[] = genres.map((genre, index) => {
      const angle = index * 2.399963;
      const spread = 34 + 48 * Math.sqrt(index);
      const labelled = index < LABEL_LIMIT;
      const fontSize = type(genre.count);
      return {
        x: centreX + Math.cos(angle) * spread * 1.3,
        y: centreY + Math.sin(angle) * spread * 0.8,
        r: radius(genre.count),
        name: genre.name,
        count: genre.count,
        avgScore: genre.avgScore,
        rank: index,
        labelled,
        fontSize,
      };
    });

    // Labelled stars need room for their text, so their collision radius grows
    // with the label rather than with the dot.
    const keepOut = (node: StarNode) =>
      node.r + (node.labelled ? 22 + node.name.length * node.fontSize * 0.26 : 14);

    const simulation = forceSimulation(seeded as never[])
      .force("charge", forceManyBody().strength(-90))
      .force(
        "collide",
        forceCollide()
          .radius((node) => keepOut(node as unknown as StarNode))
          .strength(0.95)
          .iterations(4),
      )
      .force("x", forceX(centreX).strength(0.028))
      .force("y", forceY(centreY).strength(0.062))
      .stop();

    simulation.tick(260);

    // Keep every star (and its label) inside the stage.
    const clamped = seeded.map((node) => {
      const margin = keepOut(node);
      return {
        ...node,
        x: Math.min(Math.max(node.x, margin), size.width - margin),
        y: Math.min(Math.max(node.y, node.r + 12), size.height - node.r - 12),
      };
    });

    setNodes(clamped);
  }, [genres, size.width, size.height]);

  const links = useMemo(() => {
    const bright = nodes.filter((node) => node.rank < LABEL_LIMIT);
    const drawn: Array<{ x1: number; y1: number; x2: number; y2: number; opacity: number }> = [];
    const threshold = 260;
    for (let i = 0; i < bright.length; i += 1) {
      let nearest: StarNode | null = null;
      let nearestDistance = Infinity;
      for (let j = 0; j < bright.length; j += 1) {
        if (i === j) continue;
        const distance = Math.hypot(bright[i].x - bright[j].x, bright[i].y - bright[j].y);
        if (distance < nearestDistance) {
          nearestDistance = distance;
          nearest = bright[j];
        }
      }
      if (nearest && nearestDistance < threshold) {
        drawn.push({
          x1: bright[i].x,
          y1: bright[i].y,
          x2: nearest.x,
          y2: nearest.y,
          opacity: 0.26 * (1 - nearestDistance / threshold),
        });
      }
    }
    return drawn;
  }, [nodes]);

  return (
    <ChapterBody>
      <ChapterLead eyebrow="Your genres, as a sky" width={380}>
        <ChapterTitle size={78}>Constellation</ChapterTitle>
        <ChapterSubtitle>
          {genres.length} {genres.length === 1 ? "genre" : "genres"} this run.
          {genres[0] ? ` ${genres[0].name} burns brightest.` : ""}
        </ChapterSubtitle>
      </ChapterLead>

      <div ref={stageRef} className="relative min-w-0 flex-1" style={{ height: 560 }}>
        <svg
          width={size.width}
          height={size.height}
          className="absolute inset-0"
          aria-hidden
        >
          {links.map((link, index) => (
            <line
              key={index}
              x1={link.x1}
              y1={link.y1}
              x2={link.x2}
              y2={link.y2}
              stroke="#ffffff"
              strokeWidth="0.8"
              opacity={link.opacity}
            />
          ))}
          {nodes.map((node) => (
            <circle
              key={node.name}
              cx={node.x}
              cy={node.y}
              r={node.r}
              fill={node.rank < 3 ? "#fbbf24" : "#c4b5fd"}
              opacity={node.rank < 3 ? 0.95 : Math.max(0.35, 0.9 - node.rank * 0.02)}
            />
          ))}
        </svg>

        {/* Hit targets and labels sit above the svg so hovering can use the
            app's shared tooltip rather than a hand-rolled bubble. */}
        {nodes.map((node) => (
          <div
            key={`label-${node.name}`}
            className="absolute flex -translate-y-1/2 items-center gap-2"
            style={{ left: node.x, top: node.y, transform: "translate(-50%, -50%)" }}
          >
            <span
              className="block shrink-0 cursor-default rounded-full"
              style={{ width: Math.max(node.r * 2, 24), height: Math.max(node.r * 2, 24) }}
              {...bindTooltip(
                <>
                  <TooltipTitle>{node.name}</TooltipTitle>
                  <TooltipDetail>
                    {node.count} {node.count === 1 ? "entry" : "entries"}
                    {node.avgScore != null ? ` · ${node.avgScore.toFixed(1)} avg` : ""}
                  </TooltipDetail>
                </>,
              )}
            />
            {node.labelled && (
              <span
                className="pointer-events-none whitespace-nowrap font-semibold"
                style={{
                  fontSize: node.fontSize,
                  color: node.rank < 3 ? "#ffffff" : "rgba(255,255,255,0.72)",
                  textShadow: "0 2px 10px rgba(0,0,0,0.85)",
                }}
              >
                {node.name}
              </span>
            )}
          </div>
        ))}
      </div>
    </ChapterBody>
  );
}
