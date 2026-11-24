# Splitting goals into facets

A facet is a part of a goal that needs its own evidence. Facets are nested bullets under the goal (see `goal-format.md`). A goal is covered when every facet has confirmed evidence, so the split decides what the user has to show.

- Read the explanation first: `<tracker> explain <goal id>`. Facets follow what the notes say counts.
- Split "does X, Y and Z" into X, Y and Z.
- Also split "and" lists of objects or audiences: "applies policies, processes and the handbook" becomes three facets, one per object.
- Don't split "or" lists ("work or processes"): either one is enough. Don't split examples in parentheses, or near-synonym pairs that one piece of evidence always shows together ("personality and energy").
- Don't split on qualifiers ("consistently", "high-quality", "actively"): they describe how well, not what.
- One behaviour or result: no facets. Evidence then links to the goal itself.
- Write facets in short, plain language, starting with a verb. Keep the organisation's own terms as they are.
- To drop a facet that evidence links to, add `#retired` before its block ID instead of deleting the bullet. Only delete facets without evidence.

Propose facets to the user before writing them, and let them correct the split. Afterwards, show the result as a short list, goal → facets, and run `<tracker> check`.
