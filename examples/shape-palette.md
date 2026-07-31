# Shape palette sidebar — manual checks

## 1. Empty canvas — add by click and by drag

Open the visual editor. The palette sidebar should be visible on the left with a
"Basic" group. Click a few shapes, then drag a few onto the canvas.

- Clicking adds near the canvas centre and the new node is selected (properties
  panel on the right shows it).
- Dragging drops the node exactly under the cursor.
- Collapsing "Basic" hides the grid; the toolbar `◧` button hides the sidebar.

```mermaid
flowchart TB
    A[Start]
```

## 2. Dense diagram — repeated clicks must cascade, not stack

Click the same shape five times in a row. Each new node must land down-right of
the previous one, not on top of it.

```mermaid
flowchart LR
    A[Alpha] --> B[Bravo]
    B --> C[Charlie]
    C --> D[Delta]
    A --> E[Echo]
    E --> F[Foxtrot]
    F --> D
    B --> G[Golf]
    G --> H[Hotel]
    H --> D
```

## 3. Wide diagram — resize must not distort

Toggle the sidebar with `◧`, then drag the VS Code pane divider left and right.

- The diagram must not stretch, squash, or letterbox.
- After each resize, clicking a node must select **that** node (not a neighbour),
  and double-clicking must open the rename box over the right node.

```mermaid
flowchart LR
    N1[One] --> N2[Two] --> N3[Three] --> N4[Four] --> N5[Five]
    N5 --> N6[Six] --> N7[Seven] --> N8[Eight] --> N9[Nine]
```
