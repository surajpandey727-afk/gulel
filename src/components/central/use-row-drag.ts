"use client";
import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Pointer-driven row reordering for a vertical list inside a scroll container.
 *
 * The dragged row follows the cursor as one unit; the rows it passes slide out of the way while you drag (not after),
 * a line marks the exact slot it will land in, and the container scrolls when you hold near its top or bottom edge.
 * Nothing is written until release. Esc cancels. Rows are found by `data-row-id` inside the container.
 */
export interface DropTarget { id: string; afterId: string | null; beforeId: string | null; from: number; to: number }

interface Live {
  id: string; ids: string[]; from: number; to: number;
  startY: number; startScroll: number; startWin: number; lastY: number;
  tops: number[]; heights: number[]; started: boolean; pointerId: number; handle: HTMLElement;
}

const THRESHOLD = 4;
const EDGE = 56;

export function useRowDrag({ containerRef, onDrop, enabled }: {
  containerRef: React.RefObject<HTMLElement | null>;
  onDrop: (t: DropTarget) => void;
  enabled: boolean;
}) {
  const live = useRef<Live | null>(null);
  const [state, setState] = useState<{ id: string; dy: number; from: number; to: number; ids: string[]; heights: number[]; tops: number[] } | null>(null);
  const raf = useRef<number | null>(null);
  const onDropRef = useRef(onDrop);
  useEffect(() => { onDropRef.current = onDrop; }, [onDrop]);

  const contentY = (clientY: number) => {
    const el = containerRef.current!;
    return clientY - el.getBoundingClientRect().top + el.scrollTop;
  };

  const compute = useCallback(() => {
    const l = live.current, el = containerRef.current;
    if (!l || !el || !l.started) return;
    const dy = l.lastY - l.startY + (el.scrollTop - l.startScroll) + (window.scrollY - l.startWin);
    const centre = l.tops[l.from] + l.heights[l.from] / 2 + dy;
    let to = 0;
    for (let j = 0; j < l.ids.length; j++) {
      if (j === l.from) continue;
      if (l.tops[j] + l.heights[j] / 2 < centre) to++;
    }
    l.to = to;
    setState({ id: l.id, dy, from: l.from, to, ids: l.ids, heights: l.heights, tops: l.tops });
  }, [containerRef]);

  const stopLoop = () => { if (raf.current != null) cancelAnimationFrame(raf.current); raf.current = null; };
  const loop = useCallback(() => {
    const l = live.current, el = containerRef.current;
    if (!l || !el) return stopLoop();
    if (l.started) {
      // Scroll the container when it scrolls; otherwise the page.
      const own = el.scrollHeight > el.clientHeight + 1;
      const r = own ? el.getBoundingClientRect() : { top: 0, bottom: window.innerHeight };
      const up = l.lastY - r.top, down = r.bottom - l.lastY;
      const speed = up < EDGE ? -Math.ceil((EDGE - up) / 4) : down < EDGE ? Math.ceil((EDGE - down) / 4) : 0;
      if (speed) { if (own) el.scrollTop += speed; else window.scrollBy(0, speed); compute(); }
    }
    raf.current = requestAnimationFrame(loop);
  }, [containerRef, compute]);

  const end = useCallback((commit: boolean) => {
    const l = live.current;
    stopLoop();
    live.current = null;
    if (l) { try { l.handle.releasePointerCapture(l.pointerId); } catch { /* already released */ } }
    document.body.style.removeProperty("user-select");
    document.body.style.removeProperty("cursor");
    // Clear the drag and apply the new order in the same render, so rows land without a jump.
    setState(null);
    if (commit && l?.started && l.to !== l.from) {
      const rest = l.ids.filter((x) => x !== l.id);
      onDropRef.current({ id: l.id, afterId: rest[l.to - 1] ?? null, beforeId: rest[l.to] ?? null, from: l.from, to: l.to });
    }
  }, []);

  useEffect(() => {
    if (!state) return;
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") { e.preventDefault(); end(false); } };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [state, end]);
  useEffect(() => () => stopLoop(), []);

  /** Props for the grip. `ids` is the visible order of the list (or group) the row belongs to. */
  const handleProps = (id: string, ids: string[]) => ({
    onPointerDown: (e: React.PointerEvent<HTMLElement>) => {
      if (!enabled || e.button !== 0 || !containerRef.current) return;
      e.preventDefault();
      e.stopPropagation();
      const el = containerRef.current;
      const tops: number[] = [], heights: number[] = [];
      for (const x of ids) {
        const node = el.querySelector<HTMLElement>(`[data-row-id="${CSS.escape(x)}"]`);
        const r = node?.getBoundingClientRect();
        tops.push(r ? contentY(r.top) : 0);
        heights.push(r ? r.height : 36);
      }
      const from = ids.indexOf(id);
      if (from < 0) return;
      try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* pointer already gone */ }
      live.current = { id, ids, from, to: from, startY: e.clientY, lastY: e.clientY, startScroll: el.scrollTop, startWin: window.scrollY, tops, heights, started: false, pointerId: e.pointerId, handle: e.currentTarget };
    },
    onPointerMove: (e: React.PointerEvent<HTMLElement>) => {
      const l = live.current;
      if (!l || e.pointerId !== l.pointerId) return;
      l.lastY = e.clientY;
      if (!l.started) {
        if (Math.abs(e.clientY - l.startY) < THRESHOLD) return;
        l.started = true;
        document.body.style.userSelect = "none";
        document.body.style.cursor = "grabbing";
        raf.current = requestAnimationFrame(loop);
      }
      compute();
    },
    onPointerUp: (e: React.PointerEvent<HTMLElement>) => { if (live.current && e.pointerId === live.current.pointerId) end(true); },
    onPointerCancel: () => end(false),
    onLostPointerCapture: () => { if (live.current) end(true); },
    onKeyDown: (e: React.KeyboardEvent<HTMLElement>) => {
      if (!enabled || (e.key !== "ArrowUp" && e.key !== "ArrowDown")) return;
      e.preventDefault();
      e.stopPropagation();
      const from = ids.indexOf(id);
      const to = e.key === "ArrowUp" ? from - 1 : from + 1;
      if (from < 0 || to < 0 || to >= ids.length) return;
      const rest = ids.filter((x) => x !== id);
      onDropRef.current({ id, afterId: rest[to - 1] ?? null, beforeId: rest[to] ?? null, from, to });
    },
  });

  /** Inline style for a row: the dragged row follows the pointer, rows it passes slide by its height. */
  const rowStyle = (id: string): React.CSSProperties | undefined => {
    if (!state) return undefined;
    const j = state.ids.indexOf(id);
    if (j < 0) return undefined;
    if (id === state.id) return { transform: `translateY(${state.dy}px)`, position: "relative", zIndex: 30, filter: "drop-shadow(0 8px 18px rgba(40, 30, 20, 0.22))", cursor: "grabbing" };
    const h = state.heights[state.from];
    let shift = 0;
    if (state.from < state.to && j > state.from && j <= state.to) shift = -h;
    else if (state.from > state.to && j >= state.to && j < state.from) shift = h;
    return { transform: shift ? `translateY(${shift}px)` : undefined, transition: "transform 160ms cubic-bezier(0.2, 0, 0, 1)" };
  };

  /** Where the landing line goes, in the container's content coordinates (null when not dragging). */
  const indicatorTop = (() => {
    if (!state) return null;
    const { from, to, tops, heights } = state;
    if (to === from) return tops[from];
    return to < from ? tops[to] : tops[to] + heights[to] - heights[from];
  })();

  return { dragging: state?.id ?? null, landing: state ? state.to : null, handleProps, rowStyle, indicatorTop };
}
