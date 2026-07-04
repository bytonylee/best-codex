#!/usr/bin/env python3
"""Validate loop-animation quality for a fixed-cell sprite atlas.

This is the loop-aware QA gate. `validate_sheet.py` and `audit_sprite_motion.py`
prove geometry and per-frame motion; this script proves that each row is a clean
*seamless cycle* and that the pixel character never enters a broken state across
the loop.

It flags four failure families, mapped to the SKILL.md Loop Animation alerts:

1. Seam pop / hitch   -> the wrap from the last frame back to the first jumps far
                         more than a normal adjacent step (loop "stutters").
2. Broken / garbled   -> a frame's silhouette mass or bounding box deviates wildly
   / dropped frame       from the row median, or a frame is empty.
3. Identity drift     -> the quantized palette of a frame diverges from the row,
                         i.e. the character changes color/identity mid-loop.
4. Jitter / teleport  -> the alpha centroid jumps between neighbouring (or seam)
                         frames, so the sprite snaps instead of flowing.

Output is JSON in the same shape family as the other validators
(`ok`, `errors`, `warnings`, `rows`) so it slots into the existing run QA.
"""

from __future__ import annotations

import argparse
import json
import math
from pathlib import Path
from statistics import median

from PIL import Image, ImageChops


def parse_hex_color(value: str) -> tuple[int, int, int]:
    raw = value.strip().lstrip("#")
    if len(raw) != 6:
        raise argparse.ArgumentTypeError("expected #RRGGBB")
    return tuple(int(raw[i : i + 2], 16) for i in (0, 2, 4))


def frame_diff(a: Image.Image, b: Image.Image) -> float:
    """Mean normalized per-channel difference between two RGBA frames (0..1)."""
    diff = ImageChops.difference(a.convert("RGBA"), b.convert("RGBA"))
    hist = diff.histogram()
    total = sum(value * (index % 256) for index, value in enumerate(hist))
    return total / (a.width * a.height * 4 * 255)


def alpha_mass(image: Image.Image) -> int:
    return sum(image.getchannel("A").histogram()[1:])


def alpha_centroid(image: Image.Image) -> tuple[float, float] | None:
    """Alpha-weighted centroid in pixel coordinates, or None for an empty frame."""
    alpha = image.getchannel("A")
    px = alpha.load()
    w, h = alpha.size
    sx = sy = total = 0
    for y in range(h):
        for x in range(w):
            a = px[x, y]
            if a:
                sx += x * a
                sy += y * a
                total += a
    if total == 0:
        return None
    return (sx / total, sy / total)


def quantized_palette(image: Image.Image, bits: int = 3, min_pixels: int = 4) -> set[tuple[int, int, int]]:
    """Set of opaque colors quantized to `8 - bits` bits per channel.

    Quantization tolerates minor anti-aliasing/dithering so the palette signature
    reflects the character's real color identity rather than edge noise. Colors
    that appear on fewer than `min_pixels` pixels are ignored as stray specks.
    """
    shift = bits
    palette: dict[tuple[int, int, int], int] = {}
    for count, color in image.getcolors(maxcolors=1000000) or []:
        r, g, b, a = color
        if a == 0:
            continue
        key = (r >> shift, g >> shift, b >> shift)
        palette[key] = palette.get(key, 0) + count
    return {key for key, count in palette.items() if count >= min_pixels}


def jaccard(a: set, b: set) -> float:
    if not a and not b:
        return 1.0
    union = a | b
    if not union:
        return 1.0
    return len(a & b) / len(union)


def extract_row(atlas: Image.Image, row: int, columns: int, cell: int) -> list[Image.Image]:
    frames = []
    for col in range(columns):
        box = (col * cell, row * cell, (col + 1) * cell, (row + 1) * cell)
        frames.append(atlas.crop(box).convert("RGBA"))
    return frames


def analyze_row(
    frames: list[Image.Image],
    row_name: str,
    cell: int,
    args: argparse.Namespace,
) -> tuple[dict, list[str], list[str]]:
    warnings: list[str] = []
    errors: list[str] = []
    n = len(frames)

    masses = [alpha_mass(f) for f in frames]
    bboxes = [f.getbbox() for f in frames]
    centroids = [alpha_centroid(f) for f in frames]
    palettes = [quantized_palette(f) for f in frames]

    # --- Empty / dropped frame (broken state) ---
    for i, mass in enumerate(masses):
        if mass == 0:
            errors.append(f"row {row_name} frame {i}: empty frame (dropped/broken)")

    nonzero_masses = [m for m in masses if m > 0]
    med_mass = median(nonzero_masses) if nonzero_masses else 0

    # --- Broken / garbled frame: silhouette mass spike or collapse ---
    for i, mass in enumerate(masses):
        if med_mass and mass > 0:
            ratio = mass / med_mass
            if ratio < args.mass_drop or ratio > args.mass_spike:
                warnings.append(
                    f"row {row_name} frame {i}: silhouette mass {mass} is {ratio:.2f}x "
                    f"the row median {med_mass} (possible broken/garbled frame)"
                )

    # --- Broken bbox: bounding-box area instability ---
    areas = []
    for box in bboxes:
        if box is None:
            areas.append(0)
        else:
            areas.append((box[2] - box[0]) * (box[3] - box[1]))
    nonzero_areas = [a for a in areas if a > 0]
    med_area = median(nonzero_areas) if nonzero_areas else 0
    for i, area in enumerate(areas):
        if med_area and area > 0:
            ratio = area / med_area
            if ratio < args.bbox_drop or ratio > args.bbox_spike:
                warnings.append(
                    f"row {row_name} frame {i}: bbox area {ratio:.2f}x row median "
                    f"(silhouette size unstable across loop)"
                )

    # --- Identity drift: palette divergence from the row consensus ---
    union_palette: set[tuple[int, int, int]] = set()
    for p in palettes:
        union_palette |= p
    palette_sims = []
    for i, p in enumerate(palettes):
        sim = jaccard(p, union_palette)
        palette_sims.append(round(sim, 3))
        if sim < args.palette_min:
            warnings.append(
                f"row {row_name} frame {i}: palette overlap {sim:.2f} with the row "
                f"(possible identity drift / character changed mid-loop)"
            )

    # --- Adjacent + seam continuity (the loop test) ---
    adjacent_diffs = [frame_diff(frames[i - 1], frames[i]) for i in range(1, n)]
    seam_diff = frame_diff(frames[-1], frames[0]) if n > 1 else 0.0
    med_adj = median(adjacent_diffs) if adjacent_diffs else 0.0
    max_adj = max(adjacent_diffs) if adjacent_diffs else 0.0

    seam_ratio_vs_median = (seam_diff / med_adj) if med_adj > 0 else 0.0
    if n > 1:
        if seam_diff > args.seam_floor and seam_diff > args.seam_factor * med_adj:
            warnings.append(
                f"row {row_name}: loop seam pop -- last->first diff {seam_diff:.4f} is "
                f"{seam_ratio_vs_median:.2f}x the median step {med_adj:.4f} "
                f"(loop will stutter; rework the wrap pose)"
            )
        elif seam_diff > args.seam_floor and seam_diff > max_adj * args.seam_max_factor:
            warnings.append(
                f"row {row_name}: loop seam diff {seam_diff:.4f} exceeds the largest "
                f"in-cycle step {max_adj:.4f} (visible hitch on wrap)"
            )

    # --- Jitter / teleport: centroid jumps (adjacent + seam) ---
    def centroid_jump(p: tuple[float, float] | None, q: tuple[float, float] | None) -> float | None:
        if p is None or q is None:
            return None
        return math.hypot(p[0] - q[0], p[1] - q[1])

    centroid_jumps = []
    for i in range(1, n):
        jump = centroid_jump(centroids[i - 1], centroids[i])
        if jump is not None:
            centroid_jumps.append(jump)
            if jump > args.centroid_jump:
                warnings.append(
                    f"row {row_name} frames {i-1}->{i}: centroid jump {jump:.1f}px "
                    f"(> {args.centroid_jump}px; sprite snaps instead of flowing)"
                )
    seam_centroid_jump = centroid_jump(centroids[-1], centroids[0]) if n > 1 else None
    if seam_centroid_jump is not None and seam_centroid_jump > args.centroid_jump:
        warnings.append(
            f"row {row_name}: seam centroid jump {seam_centroid_jump:.1f}px on wrap "
            f"(> {args.centroid_jump}px; character teleports when the loop repeats)"
        )

    report = {
        "row_name": row_name,
        "frames": n,
        "alpha_mass": masses,
        "mass_median": med_mass,
        "bbox_area": areas,
        "palette_overlap": palette_sims,
        "adjacent_diffs": [round(v, 5) for v in adjacent_diffs],
        "median_adjacent_diff": round(med_adj, 5),
        "max_adjacent_diff": round(max_adj, 5),
        "seam_diff": round(seam_diff, 5),
        "seam_ratio_vs_median": round(seam_ratio_vs_median, 3),
        "centroid_jumps": [round(v, 2) for v in centroid_jumps],
        "seam_centroid_jump": round(seam_centroid_jump, 2) if seam_centroid_jump is not None else None,
    }
    return report, warnings, errors


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--input", required=True, help="cleaned sprite atlas to audit")
    parser.add_argument("--rows", type=int, required=True)
    parser.add_argument("--columns", type=int, required=True)
    parser.add_argument("--cell", type=int, default=64)
    parser.add_argument("--row-names", default="", help="comma-separated row/direction names")
    parser.add_argument("--json-out", required=True)
    parser.add_argument("--fail-on-warnings", action="store_true")

    # Seam continuity tuning.
    parser.add_argument("--seam-factor", type=float, default=2.0,
                        help="seam diff is flagged when it exceeds this * median adjacent diff")
    parser.add_argument("--seam-max-factor", type=float, default=1.15,
                        help="secondary flag when seam diff exceeds this * largest in-cycle step")
    parser.add_argument("--seam-floor", type=float, default=0.01,
                        help="absolute seam-diff floor below which a loop is always considered seamless")

    # Broken-frame tuning.
    parser.add_argument("--mass-drop", type=float, default=0.5,
                        help="warn when frame silhouette mass < this * row median")
    parser.add_argument("--mass-spike", type=float, default=1.8,
                        help="warn when frame silhouette mass > this * row median")
    parser.add_argument("--bbox-drop", type=float, default=0.45,
                        help="warn when frame bbox area < this * row median")
    parser.add_argument("--bbox-spike", type=float, default=2.2,
                        help="warn when frame bbox area > this * row median")

    # Identity tuning.
    parser.add_argument("--palette-min", type=float, default=0.45,
                        help="warn when a frame's palette overlap with the row drops below this")

    # Jitter tuning.
    parser.add_argument("--centroid-jump", type=float, default=0.0,
                        help="max allowed centroid jump in px; 0 = auto (cell/4)")

    args = parser.parse_args()
    if args.centroid_jump <= 0:
        args.centroid_jump = args.cell / 4.0

    source = Path(args.input).expanduser().resolve()
    with Image.open(source) as opened:
        atlas = opened.convert("RGBA")

    expected = (args.columns * args.cell, args.rows * args.cell)
    errors: list[str] = []
    warnings: list[str] = []
    rows = []
    if atlas.size != expected:
        errors.append(f"atlas is {atlas.width}x{atlas.height}; expected {expected[0]}x{expected[1]}")

    row_names = [name.strip() for name in args.row_names.split(",") if name.strip()]
    for row in range(args.rows):
        row_name = row_names[row] if row < len(row_names) else str(row)
        frames = extract_row(atlas, row, args.columns, args.cell)
        report, row_warnings, row_errors = analyze_row(frames, row_name, args.cell, args)
        warnings.extend(row_warnings)
        errors.extend(row_errors)
        rows.append(report)

    if args.fail_on_warnings and warnings:
        errors.extend(warnings)

    result = {
        "ok": not errors,
        "file": str(source),
        "width": atlas.width,
        "height": atlas.height,
        "errors": errors,
        "warnings": warnings,
        "rows": rows,
    }
    target = Path(args.json_out).expanduser().resolve()
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(result, indent=2), encoding="utf-8")
    print(json.dumps({"ok": result["ok"], "errors": errors, "warnings": len(warnings)}, indent=2))
    if errors:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
