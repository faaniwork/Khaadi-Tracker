"use client";

/**
 * A placeholder block for whatever real content hasn't arrived yet - shaped
 * and sized like the thing it stands in for, so the page's layout is
 * already right the instant real data lands instead of jumping around.
 *
 * Plain opacity-pulse rather than a sweeping shimmer: this app's own motion
 * language is already quiet and short (see the .rise/.card-hover notes in
 * globals.css), and a loud shimmer sweeping across five stat cells on every
 * load would read as much busier than the couple of seconds it is standing
 * in for actually deserves.
 */
export function Skeleton({ className = "" }) {
  return <div className={`animate-pulse rounded-md bg-muted ${className}`} />;
}
