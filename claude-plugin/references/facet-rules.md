# Splitting statements into facets

A facet is a part of a statement that needs its own evidence. Facets are nested bullets under the statement in its dimension file; the importer gives them block IDs.

- Read the explanation first: `<tracker> explain <statement id>`. Facets follow what the explanation says counts.
- Split "does X, Y and Z" into X, Y and Z.
- Also split "and" lists of objects or audiences: "applies policies, processes and the handbook" becomes three facets, one per object.
- Don't split "or" lists ("work or processes"): either one is enough. Don't split examples in parentheses, or near-synonym pairs that one piece of evidence always shows together ("personality and energy").
- Don't split on qualifiers ("consistently", "high-quality", "actively"): they describe how well, not what.
- One behaviour: no facets. Evidence then links to the statement itself.
- Write facets in short, plain language, starting with a verb. Keep Luscii terms as they are (Holacracy, circle, tension).
- To drop a facet that evidence links to, add `#retired` before its block ID instead of deleting the bullet. Only delete facets without evidence.
- Never edit anything in a dimension file except the nested facet bullets: the importer overwrites the rest.

Write new facets without block IDs, then run the import again (`node "${CLAUDE_PLUGIN_ROOT}/scripts/import.mjs"`) so they get IDs. Show the result as a short list, statement → facets, and let the user correct it.
