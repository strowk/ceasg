# Edge styling test cases (FG#6)

Open this file in the Extension Development Host (press F5 from the `extension/`
folder), then click the `◇ Open visual editor` CodeLens above each diagram.
Each section says, in one line, what to check.

## 1. linkStyle color / width / dash renders on the canvas

**Test:** confirm on the visual canvas (not just the external preview) that the
first edge is red and thick, the second is blue and dashed, and the third is
green and dotted.

```mermaid
flowchart LR
    A["One"]
    B["Two"]
    C["Three"]
    D["Four"]
    E["Five"]
    F["Six"]
    A --> B
    C --> D
    E --> F
    linkStyle 0 stroke:#e11,stroke-width:4px
    linkStyle 1 stroke:#17e,stroke-width:2px,stroke-dasharray:6 4
    linkStyle 2 stroke:#2a2,stroke-width:2px,stroke-dasharray:2 4
    %% ceasg:{"id":"twztnwg6"} %%
    %% mermaid-flow:pos A=100,82 B=230,82 C=100,176 D=234,177 E=100,270 F=230,270
```

## 2. Styled label — font size and color render

**Test:** confirm the `deploy` edge label is large and orange on the canvas.

```mermaid
flowchart LR
    A["Build"]
    B["Prod"]
    A -->|"deploy"| B
    linkStyle 0 stroke:#888,color:#e80,font-size:22px
    %% ceasg:{"id":"9b0ici5i"} %%
    %% mermaid-flow:pos A=100,82 B=339,123
```

## 3. Edit styles from the properties panel

**Test:** select the edge, then use the new **Line width**, **Dash**, **Label
size**, and **Label color** controls in the properties panel; confirm each
change shows immediately on the canvas and survives a save (check the
`linkStyle` line written back to this code block).

```mermaid
flowchart LR
    A["Source"]
    B["Sink"]
    A -->|"flow"| B
    linkStyle 0 stroke:#d41111,stroke-width:2.5px,color:#a01c1c,font-size:21px
    %% ceasg:{"id":"22yygjtm"} %%
    %% mermaid-flow:pos A=100,82 B=381,139
```

## 4. Selection highlight still wins over a custom color

**Test:** click the red edge and confirm it turns the focus/selection color
while selected, then reverts to red when deselected.

```mermaid
flowchart LR
    A["Alpha"]
    B["Beta"]
    A --> B
    linkStyle 0 stroke:#e11,stroke-width:3px
    %% ceasg:{"id":"osll4awe"} %%
    %% mermaid-flow:pos A=108,197 B=360,218
```
