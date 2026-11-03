# Dressed core ledger — 2026-11-03

Status: source-reviewed engineering reconstruction specification; NOT a completed model or motion certificate.

## Sources actually inspected in this pass

- TheDuchy local video: extracted 118–149 s at 4 fps in `work/somerville/frames/dressed-duchy/`. Contact sheet inspected at 118, 120, 124, 126, 130, 136, 142, 148 s; enlarged 130, 136 and 148 s inspected separately, plus 130–135.5 s at 0.5 s intervals to inspect the visible loop before closure. Extracted frames are not all individually reviewed. File `frame-001.jpg` starts at 118 s; nominal time = 118 + (index−1)/4 s, within one source frame (30 fps). `-core` crops use source rectangle [300,480,850,1000], scaled 1.5×.
- Topologist local video: extracted 160–200 s at 1 fps; contact sheet inspected at 160,165,170,175,180,185,190,199 s. The cuff has a different wrap count and arm orientation; this supports the core procedure, not a coordinate template.
- Original local PDF: extracted single-column text pages 1–3; rendered pages 2–3 inspected. The text explicitly permits forming the long-side loop then passing the working end, instead of transferring the working-end wrap. It specifies over the root X, beneath the whole cuff, then same-direction return through the loop. No double-column material is used.
- Earlier `somerville-core-route-ledger.md` supplies 68–124 s observations; those are prior evidence, not newly reviewed frames in this pass.

## Observations, deductions and modelling choices

| Topic | Observation | Operation deduction | Modelling choice / remaining uncertainty |
| --- | --- | --- | --- |
| Dressing | 130 s still shows a large hanging lock-loop opening; at 136 s it has collapsed; 148 s has a compact core beneath four visible cuff strands. | Pulling the standing bundle closes the same loop around the two working passages. | Do not retain the 68 s diagonal as a final silhouette target. Preserve its material continuation through cuff-to-first, not an extra final winding. This mapping is not a certified continuous deformation. |
| Root X | PDF p2 explicitly shows the working bundle across the two standing-loop root branches. | Both limbs must go over both doubled root branches before under-cuff. | Root-neighbourhood size is a geometric definition, not source evidence; a tilted core requires its own local plane. |
| Passage direction | PDF p3 specifies the same direction; 118–130 s shows working bight emerging to the right. | First and second passages have the same signed direction in one oriented aperture. | Keep first left / second right as a labelled geometric convention until detailed strand tracing contradicts it. |
| Under-cuff | Cuff stays above the final core; the transverse route is largely covered. | Preserve the existing hand-side to arm-side underpass, beneath all four cuff runs. | Front-lower corridor is the initial choice; angle is adjustable, not a measured fact. |
| W1 / W2 | No selected frame reveals both hidden approaches continuously. | No extra exchange is introduced while a bundle moves together. | Start W1 farther behind / lower than W2; flag as a modelling choice, not an observed crossing. |
| Core plane | 148 s exposes front branches; depth of the back rim is hidden. | Must fit against the cylinder without changing aperture traversal. | Use a cylindrical centre and independently adjustable local-plane tilt. Neither a camera-facing plane nor surface-tangent plane is established from this view alone. |

## 148 s image measurements (1280×1280)

Manual visual estimates on the original-size extracted frame; uncertainty includes fuzzy hemp boundaries. Measurements are NOT obtained from a generated model.

| Feature | Source pixels | Approximate metric at 5000 px/m |
| --- | --- | --- |
| Four cuff centrelines at y≈500 | x≈424,452,482,508; each ±5 px | axial centre spacing ≈5–6 mm; not a prescribed 3D bundle spacing |
| Visible individual rope widths | cuff≈27–33 px; straight bight≈26–32 px; tail≈28–34 px | diameter model fixed at 6 mm |
| Core visible outer box | x≈392–561, y≈611–752; ±10 px | ≈34×28 mm |
| Core centre | ≈[477,682], ±10 px | a projected position, not a recovered 3D centre |
| Arm edges near core | upper≈410, lower≈715; ±10 px | projected thickness≈61 mm; cylinder diameter55 mm remains an engineering approximation |
| Bight upper exit | ≈[548,712], ±8 px; continues toward [1000,921] | downward-right |
| Bight lower exit | ≈[520,741], ±8 px; continues toward [955,1030] | downward-right, steeper |
| Tail exit | ≈[410,721], ±10 px, then down-left before nearly vertical | full free tails extend beyond image |

Freeze initial camera scale admissible range at 4250–5750 px/m, nominal 5000. This incorporates observed rope-width variation. Do not refit this range to a generated knot. Arm width is a consistency check only, not an independent measured physical diameter.

## Annotation and acceptance boundaries

Visible core contact observations near [431,667] and [437,700] show front oblique branches covering downward-going strands. Do not automatically assign individual material limbs from these coordinates: bind visible patches to model segments only after checking continuity in the enlarged sequence. A pixel contact without a reviewed material binding remains UNVERIFIED. Hands occlude the rear-left region; the entire locking-core box is NOT an occlusion mask.

The core's ≈0.6 m material budget is an unverified estimate. Compute all dressed section lengths and report the result without forcing that number. Total model length 7.138936637394829 m is inherited engineering bookkeeping, not measured source rope length. Static seed tail allocation carries no motion claim.

## Implementation decisions

1. Add a separate dressed generator and local aperture / underpass frames. Front is −Y. Core centre: [coreX, −(R+h)cos(theta), −(R+h)sin(theta)].
2. Retain two signed turns per cuff limb. Four visible front lanes are an additional check, not a replacement.
3. A bundle spacing of 6 mm is insufficient for 6 mm diameter plus 0.2 mm gap. Start ≥6.2 mm and calculate actual clearance.
4. Preserve E0-origin fixed material coordinates; tail extension constructs a static seed only. No v2→v3 lineage assertion.
5. Freeze loose-v3 ONLY after final-scope operation, actual tube and positive-gap checks pass. Until then save named candidates. No motion implementation before dressed static acceptance.

## Independently recomputed historical material budget

`reports/somerville-dressed-baseline.json` records the unchanged loose-v2 SHA-256 and actual segment sums. The six named connector/core roles total **4.236613520097489 m**. The complete cuff roles alone total **1.4500508889784516 m**. Therefore a compact seed must also redistribute excess cuff material, not only replace the six connectors. This is a diagnosis of the historical candidate, not a final source-length measurement.

## Final-sequence follow-up

Also inspected the 136–149 s one-second core contact sheet (`dressed-final-sequence.jpg`). 136 s has motion blur; 138–146 s repeatedly occlude the core while the demonstrator adjusts the rope. 147–148 s are the useful exposed final views. At 149 s the video cuts to the next slipped-variant title, so that frame must not be used as a geometry target. The selected interval does not resolve the hidden W1/W2 order or individual material bindings at the two annotated contacts.
