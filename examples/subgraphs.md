# Subgraph test cases

Open this file in the Extension Development Host (press F5 from the `extension/`
folder), then click the `◇ Open visual editor` CodeLens above each diagram.
Each section says, in one line, what to check.

## 1. Single subgraph — renders and moves as one

**Test:** the `Pipeline` box renders behind its three nodes; drag the box (grab
empty space or the title) and confirm all members move with it.

```mermaid
%% ceasg:{"id":"svnz8tsi"} %%
flowchart TB
    subgraph S1 [Pipeline]
        A[Ingest] --> B[Transform] --> C[Load]
    end
    C --> D[Report]
```

## 2. Two subgraphs — drag a node between them

**Test:** drag `Web App` out of `Frontend` and drop it inside the `Backend` box;
release to commit, then confirm it now belongs to `Backend`.

```mermaid
flowchart LR
    subgraph Frontend
        U["User"]
        W["Web App"]
    end
    subgraph Backend
        DB[("Database")]
        API["API"]
    end
    U --> W
    API --> DB
    W --> API
    %% ceasg:{"id":"a9777mpz"} %%
    %% mermaid-flow:pos U=128,218 W=265,212 DB=493,152 API=487,225
    %% mermaid-flow:gpos Frontend=68,152,266,108 Backend=409,76,153,192
```

## 3. Nested subgraphs — nesting renders and moves together

**Test:** confirm `Cluster` renders nested inside `Cloud`, then drag `Cloud` and
confirm the nested `Cluster` and both pods move with it.

```mermaid
flowchart TB
    subgraph Cloud
        subgraph Cluster
            P2["Pod 2"]
            P1["Pod 1"]
        end
        LB["Load Balancer"]
    end
    User["User"]
    P1 --> P2
    LB --> P1
    User --> LB
    %% ceasg:{"id":"4k2qlk9g"} %%
    %% mermaid-flow:pos P1=162,335 P2=162,414 LB=160,199 User=162,82
    %% mermaid-flow:gpos Cloud=75,134,186,342 Cluster=102,254,120,202
```

## 4. Create a subgraph from a selection

**Test:** marquee-select `Step B` and `Step C`, click the Group (`▢+`) toolbar
button, and confirm the two nodes get wrapped in a new subgraph.

```mermaid
flowchart TB
    subgraph sub1
        C["Step C"]
        B["Step B"]
    end
    subgraph sub2
        D["Step D"]
    end
    A["Step A"]
    A --> B
    B --> C
    C --> D
    %% ceasg:{"id":"zn0cbftn"} %%
    %% mermaid-flow:pos A=100,82 B=449,195 C=451,278 D=300,285
    %% mermaid-flow:gpos sub1=390,133,120,202 sub2=237,220,139,107
```

## 5. Rename, resize, and ungroup (has saved subgraph geometry)

**Test:** double-click the subgraph title to rename it; drag a corner handle to
resize the subgraph; then select the subgraph and press Delete to ungroup (the
nodes must stay).

```mermaid
flowchart TB
    subgraph G1 ["Test name etc and so on and so forth"]
        Y["Beta"]
        X["Alpha"]
    end
    X --> Y
    %% ceasg:{"id":"i9ek8m5k"} %%
    %% mermaid-flow:pos Y=290,178 X=155,201
    %% mermaid-flow:gpos G1=101,69,284,194
```

## 6. Round-trip check — nested + geometry survives a save

**Test:** in the visual editor, move a node and drag a subgraph; then close the
editor and look at this diagram's ` ```mermaid ` code in the Markdown file, and
confirm the nested `subgraph` blocks and an updated `%% mermaid-flow:gpos` line
were written back.

```mermaid
flowchart LR
    subgraph Outer ["Service Mesh"]
        subgraph Inner ["Namespace"]
            S1["svc-a"]
            S2["svc-b"]
        end
        GW["Gateway"]
    end
    Client["Client"]
    S1 --> S2
    GW --> S1
    Client --> GW
    %% ceasg:{"id":"6jsy464q"} %%
    %% mermaid-flow:pos S2=361,189 S1=226,210 GW=179,275 Client=40,200
    %% mermaid-flow:gpos Outer=99,115,320,240 Inner=168,147,240,90
```
