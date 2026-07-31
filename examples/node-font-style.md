# Node font / stroke style test cases (FG#7)

Open this file in the Extension Development Host (press F5 from the `extension/`
folder), then click the `◇ Open visual editor` CodeLens above each diagram.
Each section says, in one line, what to check.

## 1. Inline `style` font-size / font-family / stroke-width / stroke-dasharray

**Test:** confirm on the visual canvas (not just the external preview) that `A`
has large monospace text with a thick dashed border, `B` has small serif text,
and `C` is a plain node for comparison.

```mermaid
flowchart LR
    A["Styled"] --> B["Small serif"]
    B --> C["Plain"]
    style A font-size:24px,font-family:monospace,stroke-width:3px,stroke-dasharray:5 5
    style B font-size:10px,font-family:serif
```

## 2. Boxes grow to fit the text

**Test:** confirm each node's box is big enough for its label — the text must
sit fully inside the shape at every size, with no spill past the border.

```mermaid
flowchart TB
    S["Twelve pixels"] --> M["Twenty pixels"]
    M --> L["Thirty-two pixels"]
    style S font-size:12px
    style M font-size:20px
    style L font-size:32px
```

## 3. Non-rectangular shapes at a large font

**Test:** confirm the diamond, circle and hexagon all grew with their text — in
particular the diamond should be visibly taller than a default one.

```mermaid
flowchart LR
    D{"Decide?"} --> R((Round))
    R --> H{{Hexagon}}
    style D font-size:26px
    style R font-size:26px
    style H font-size:26px
```

## 4. Multi-line label spacing follows the font size

**Test:** confirm the two lines are spaced apart proportionally to the font —
not cramped together — and both fit inside the box.

```mermaid
flowchart LR
    A["First line<br>Second line"] --> B["Normal<br>size"]
    style A font-size:28px
```

## 5. `classDef`-inherited font renders and sizes the box

**Test:** confirm `A` and `B` both pick up the large italic-serif style from the
`big` class, and that their boxes grew to match — this is inherited style, not
an inline `style` line.

```mermaid
flowchart LR
    A["From classDef"] --> B["Also big"]
    B --> C["Untouched"]
    classDef big font-size:26px,font-family:serif,stroke-width:2px
    class A,B big
```

## 6. Node style beats the class it inherits from

**Test:** confirm `A` renders at 30px (its own `style` line) even though the
`base` class asks for 12px, while its dashed border still comes from the class.

```mermaid
flowchart LR
    A["Override"] --> B["Class only"]
    classDef base font-size:12px,stroke-dasharray:4 3
    class A,B base
    style A font-size:30px
```

## 7. Edit the new properties from the panel

**Test:** select a node, then use the new **Font size**, **Font**, **Border
width** and **Border dash** controls in the properties panel; confirm each
change shows immediately on the canvas, that the box resizes as the font grows,
and that it survives a save (check the `style` line written back to this block).

```mermaid
flowchart LR
    A["Edit me"] --> B["And me"]
    %% ceasg:{"id":"fgstyle7"} %%
```

## 8. Multi-select applies to every selected node

**Test:** rubber-band select all three nodes, then change **Font size** and
**Border dash** in the properties panel; confirm all three update together.

```mermaid
flowchart LR
    A["One"] --> B["Two"]
    B --> C["Three"]
```

## 9. Hand-written values are not clobbered by opening the panel

**Test:** select `A` and confirm the **Font** picker shows `Georgia` and
**Border dash** shows `7 3` (values we have no preset for, listed as their own
option). Select `B`, then re-select `A` — confirm `A` still says
`font-family:Georgia,stroke-dasharray:7 3` after a save.

```mermaid
flowchart LR
    A["Custom"] --> B["Other"]
    style A font-family:Georgia,stroke-dasharray:7 3,font-size:20px
```

## 10. Unstyled diagrams are unchanged

**Test:** confirm this looks exactly as it did before the feature — node boxes
should not have shifted or resized, since no font properties are set.

```mermaid
flowchart TD
    A[Start] --> B{Choice}
    B -->|yes| C[Do it]
    B -->|no| D[Skip]
    C --> E([Done])
    D --> E
```
