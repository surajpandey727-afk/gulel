# Implementation Notes

- Single Design Component: `Nishaan Dashboard Redesign.dc.html`. All styling inline; tokens in `<helmet>` `:root` + `[data-theme="dark"]`.
- **Theme**: `data-theme` on the root wrapper; dark overrides CSS vars only. Wrapper carries `color:var(--ink)` so inherited text themes correctly.
- **Charts** use CSS vars via inline `style` on SVG (not presentation attributes) so they re-theme. Heatmap encodes value as `opacity` over `--chart-1`.
- **Routing/state** in the logic class (`route`, `theme`, `agentOpen`, `quickOrgId`, `recipId`, `pickerOpen`, `attachments`). No backend; sample data only.
- **Semantic status** always pairs colour with icon + label (accessibility).
- Data marked sample vs real: all records here are representative sample data — wire to Taftish/Chanakya/Doot/Chitragupta services in production.
- Fonts load locally from `assets/fonts/`; brand marks from `assets/icons/`.
