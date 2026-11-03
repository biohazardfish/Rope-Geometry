export const operationalTopology = {
  id:'duchy-right-two-wrap-nonslipped', version:1,
  source:'references/video/01-TheDuchy-RightHanded.mp4', targetSeconds:148,
  materialOrder:'E0 → long-side loop → cuff → first passage → over root → under cuff → second passage → fold → reverse opposite limb → E1',
  operations:[
    {id:'double',interval:[8,24],relation:'one rope, paired limbs joined at fold',basis:'observed'},
    {id:'cuff',interval:[24,44],relation:'two turns of paired bundle around column',basis:'observed'},
    {id:'diagonal',interval:[60,70],relation:'working bight over four front cuff runs',basis:'observed'},
    {id:'loop',interval:[70,100],relation:'long-side bundle forms loop; first working-bight passage',basis:'observed procedure; individual contacts partly obscured'},
    {id:'under',interval:[100,116],relation:'whole working bight beneath entire cuff',basis:'observed procedure'},
    {id:'return',interval:[108,124],relation:'second passage through same loop, same working direction',basis:'procedure and continuity'},
    {id:'dress',interval:[124,148],relation:'tighten long side, preserve extended bight',basis:'observed'}
  ],
  routeFacts:[
    {id:'diagonalFront',relation:'working bundle crosses the front of the four cuff runs before the first passage',basis:'observed (Cursor frame review, 68–96 s); see docs/somerville-core-route-ledger.md'},
    {id:'underCuffDirection',relation:'under-cuff bundle travels -X to +X, hand side to arm side, between cuff and column',basis:'observed entry and exit (108 s, 118 s); hidden middle inferred'}
  ],
  derived:['Paired rear cuff continuation without an added exchange operation','E0/E1 are internal material labels, not identification of physical ends in the video','Second passage stays on the right of the core; the frames do not support swapping the two passages left/right'],
  geometryAssumptions:['Cylinder and circular rope cross sections','Metric dimensions and unobserved shapes are engineering parameters','Loose layout is an expanded operation realization, not the final source pose','route v1 predates the ledger and contradicts diagonalFront and underCuffDirection']
};
