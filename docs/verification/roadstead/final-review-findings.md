# Final whole-branch review findings — f1290de..f8ba565

Historical findings below; all five were addressed in `a0ff3cd` and accepted by the scoped re-review. See [the review record](REVIEW.md).

Reviewer america_final_review: no Critical or Important established for the scoped local foundation; five Minor findings. One consolidated fix wave, then one scoped re-review.

1. **Replay-conflict assertion passes for the wrong reason.** `road_life_sim.gd:159` follows restoration of `pre_store`, which predates `sim:take`. The request fails because stored scrap is absent, not because its payload conflicts with a receipt. Move the assertion before rewind, assert the receipt exists and error equals `receipt_conflict`, compare backpack/ledger before and after. Standalone ledger tests already cover conflicts; this is a runtime regression gap.
2. **Content rows do not fully control advertised behavior.** `road_life.gd:84` hardcodes first parcel ID/name/150 threshold; line88 hardcodes `last_light`, ignores `encounter`. Price edits give misleading guidance; disabling encounter does nothing. Read selected parcel's price/name and active job's encounter configuration; add row-variation checks.
3. **Photobooth success after failed PNG writes.** `roadstead_photobooth.gd:59` logs `save_png` errors, lines36-39 unconditionally announce five completed captures and exit0. Accumulate successful captures and return nonzero on any write/setup failure. Current inspected images had successful writes and remain valid.
4. **Porch collision narrower than visible deck.** `property_site.gd:25` gives8m width; `gen_homestead.py:315` visible decking~9.8m. Outer strips lack raised-floor support, feet can sink through visible deck walking sideways. Match collider to usable deck width and add real-input lateral traversal near BOTH edges. Center doorway tests don't cover this. Source-derived, not yet reproduced by reviewer.
5. **Stale status sentence.** `docs/AMERICA_FOUNDATION_STATUS.md:9` says runtime collision/traversal pending, later says verified. Refer to separate runtime proof.

Deferred disposition: Task2 plan bundled withassetcommit is provenance concern only, no historyrewrite; preservechronology. Six broaderfailures independentlyreproducedatf1290de; audio shutdownnoise remainsdisclosed; not newbranchregressions. ProductionMMO/fullrelease approval not given.

Recommendation: preserve tracked taskreport and useful logs under docs/verification before plan-scratchcleanup. Finish planned broad sweep; no globallygreenclaim frompartial38scenes.
