# Somerville core route ledger (68–124 s)

Source frames in `references/phase4b/`, from `01-TheDuchy-RightHanded.mp4`. Camera looks from −Y toward +Y; the arm extends to +X, so the hand side of the cuff is −X. This ledger separates what a frame shows from what is inferred and from what is only a modelling choice. It is not a crossing-by-crossing isotopy certificate. Codex can veto the route before the tightened model is treated as delivered.

## Route facts used by `route:'video'`

| Fact | Class | Why |
| --- | --- | --- |
| After the two cuff wraps, the working bundle lies diagonally across the **front** of the four cuff runs (smaller Y than those runs), then reaches the lock loop. | observation at 68 s, still visible at 78 s and 96 s | `duchy-video-068.jpg`: diagonal from the upper-left of the band to a bight tip on the lower-right, in front of four runs. The v1 generator instead sends `cuff-to-first` behind the column (`+Y`). |
| The whole bundle then passes between the cuff and the column from the hand side to the arm side (−X → +X). | observation of the entry and exit; the hidden middle is inference | 108 s: the bundle is drawn to the hand side (−X). 118 s: the bight is on the right of the core (+X). 110–116 s are covered by hands, so the four under-crossings are not each seen. v1 runs this section +X → −X and detours far to both sides. |
| The second passage uses the same loop and the same direction as the first: from behind the loop toward the camera, and the bight leaves on the right. | observation of the result; direction during the pull is inference | 118 s shows the bight on the right, still at the loop. 124 s shows it forward and held down-right. Hands hide the moment of the pull (116 s). This does **not** support swapping the two passages left/right. |

## Frame notes

| Frame | Observation | Inference | Not claimed |
| --- | --- | --- | --- |
| 68 s `duchy-video-068.jpg` | Four front cuff runs. One doubled bundle crosses them diagonally, tip to the right, two long ends hanging on the left. | The diagonal is the working bundle that will make the lock, continuous with the cuff wraps. | Which physical rope end is E0. Rear cuff order. |
| 78 s `duchy-lock-78.jpg` | A loop sits to the right of the cuff. The diagonal bundle is still in front of the cuff. Long ends on the left. | The loop is the long-side bundle, not a new rope. | Strand-level contacts inside the loop. |
| 84 s `duchy-lock-84.jpg` | Loop still open on the right. A bundle crosses the front of the cuff into the loop area. | First passage is being prepared. | That every crossing of the diagonal is already at its final depth. |
| 90 s `duchy-lock-90.jpg` | Hands cover the loop. A bundle is being pushed at the loop. | First passage happens here, from the back of the loop toward the camera, matching the spoken procedure. | Any specific over/under inside the occluded pinch. |
| 96 s `duchy-lock-96.jpg` | Loop is open on the right. Diagonal still visible. Two long ends hang. | First passage is complete or nearly complete; the loop has not yet been collapsed. | The exact exit point of the first passage. |
| 102 s `duchy-lock-102.jpg` | Both hands cover the core. Loop and a through-bundle are partly visible. | Dressing of the first passage. | Strand identity. |
| 108 s `duchy-lock-108.jpg` | A doubled bundle is pulled out to the hand side (−X), below the cuff. Loop remains on the right. | This is the entry to the under-cuff pass, not a new wrap. | The bundle's depth relative to every cuff run. |
| 110 s `duchy-lock-110.jpg` | Hands cover the core. | Continuity of the same bundle. | Route. |
| 114 s `duchy-lock-114.jpg` | Hands cover the core. Cuff and a tightened core are visible; the working bundle is not. | The under pass is in progress between the cuff and the column. | Direction, from this frame alone. |
| 116 s `duchy-lock-116.jpg` | Hands cover the return. | The bundle is being brought back to the loop. | Passage direction. |
| 118 s `duchy-lock-118.jpg` | Bight is on the right of the core (+X), held clear of the long ends. A loop is still open below it. | The under pass has exited on the arm side, and the second passage has not yet been dressed. | That the bight did not travel around the far left. |
| 124 s `duchy-video-124.jpg` | Bight comes forward and is held down-right. Long ends remain on the left. Core is under the cuff. | Second passage is complete, same direction as the first (behind the loop toward the camera). | Individual crossings inside the dressed core. |

## Modelling assumptions (not in the frames)

- Column radius 27.5 mm, rope diameter 6 mm, and the loose spacing are engineering scales.
- E0/E1 stay internal labels. The fold is the working bight that is passed through the loop.
- The hidden part of the under pass is a single −X → +X corridor between the cuff and the column, with no extra wrap and no rear exchange.
- The two passages are offset inside one loop (first toward −X, second toward +X). The frames show both on the right side of the cuff, not which side of the loop opening each one uses.
- Rear cuff continuation stays paired, with no added exchange. That is unchanged from v1 and still not visible in these frames.

## What v1 got wrong, and what this ledger does not change

v1's far-right `outside-cuff` loop and far-left `return-approach` are not in these frames. They are the red and yellow detours in `work/somerville/diag/overlay-v6.png`. Replacing them is the reason for `route:'video'`.

Still unresolved, and still not claimed here: the full over/under word of the dressed core, which physical end is E0, and the rear-cuff permutation. `data/somerville-pose148.json` still has no crossing targets, so crossing-position error against the 148 s frame stays unverified until those targets exist.
