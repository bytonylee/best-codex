# Codex Vible Design Rules

## Purpose

Codex Vible should feel like a precise technical publication rather than a marketing site. Every page uses the same black, white, and signal-green interface tokens, the same reading width, and the same typographic hierarchy. Original figures remain documentary evidence and are never restyled to look decorative.

## Layout

- The desktop reader uses three zones: a 264-pixel book rail, a flexible article column, and a 224-pixel page outline.
- Prose stays within 760 pixels. Figures, tables, and technical blocks may use the full article width.
- At widths below 1180 pixels, the page outline is hidden. Below 900 pixels, both navigation rails move into accessible sheets.
- The sticky header is 56 pixels high. Controls have a minimum 40-pixel visual target and a 44-pixel touch target on mobile.

## Hierarchy

- The publication title identifies the product. It is never replaced by a slogan.
- A page title states the task or outcome as a complete sentence.
- Section headings describe the subject directly. Heading levels never skip for visual effect.
- Body copy uses natural explanatory sentences. Short labels are reserved for navigation, metadata, and code-language identifiers.

## Lists And Procedures

- Bulleted lists collect related facts or options that do not require an order.
- Numbered lists describe steps that must be completed in sequence.
- Each list item begins with a complete thought. Dense nested lists use a visible left rule rather than additional cards.

## Commands And Code

- Every block has a compact header that identifies it as an example and names the language.
- Code uses a dark neutral surface, horizontal scrolling, and a monospace typeface.
- A copy icon appears in the top-right corner on hover or keyboard focus. It remains visible on touch devices.
- Copy feedback changes both the icon and accessible text. Prompt symbols and decorative labels are not copied.
- Inline code is reserved for filenames, commands, identifiers, and literal values.

## Figures And Tables

- Existing figures keep their original aspect ratio and content. Captions explain what the reader should notice.
- Images use a one-pixel border and no decorative shadow.
- Tables keep column relationships visible. On narrow screens they scroll horizontally instead of shrinking text below a readable size.

## Color And Shape

- The palette uses neutral black and white with signal green for current or actionable states. Blue and red are reserved for semantic links and warnings.
- Surfaces use 4-pixel or 6-pixel corner radii. Sections are never placed inside decorative cards.
- Gradients, floating orbs, oversized pills, and nested cards are not part of this system.

## Content Review

- English and Korean use the human-reviewed source sets in `work/en_h` and `work/ko_h`.
- Interface descriptions are written as natural sentences. Navigation labels and technical metadata may remain concise fragments.
- Product facts that can change are paired with a review date and a reminder to consult current official documentation.
