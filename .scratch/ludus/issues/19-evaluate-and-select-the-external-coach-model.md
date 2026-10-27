# 19: Evaluate and select the external coach model

**What to build:** Select a coach model using reproducible chess, language and cost evidence.

**Blocked by:** 18: Confirm teaching profiles and review accounting.

**Status:** ready-for-agent

- [ ] Compare candidates against known positions and all four teaching profiles in en-GB, es-ES and fr-FR.
- [ ] Measure factual explanations, suggested move legality, appropriate uncertainty, misleading prompts and instructions embedded in supplied content.
- [ ] Measure token/request costs and latency against approved budgets; select one model and document evidence and limitations.
- [ ] Keep model service independent of gameplay. No automatic paid fallback provider; fine-tuning remains deferred unless profile evaluations fail.
