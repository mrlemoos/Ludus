# Skecher UI components

Ludus adapts these components from [Skecher UI](https://skecher-ui.com/), by CoDesign-Spa27:

- [Apple Mail Tabs](https://github.com/CoDesign-Spa27/skecher-ui/blob/main/components/ui-components/apple-mail-tabs.tsx). Retains spring-driven expansion and icon/label pills. Base UI supplies tab semantics, roving keyboard focus and panel associations. Labels stay visible so players can find their games. Colours and spacing match Ludus.
- [Sliding Panel](https://github.com/CoDesign-Spa27/skecher-ui/blob/main/components/ui-components/sliding-panel.tsx). Retains direction-aware, interruptible Motion transitions and reduced-motion support. Content determines panel height; outgoing panels cannot receive focus or pointer input.

Local files are `src/components/apple-mail-tabs.tsx` and `src/components/sliding-panel.tsx`. Motion is the only added dependency. Icons use existing chess glyphs rather than another icon package.

The homepage reuses Apple Mail Tabs for its 3D and 2D board previews, with scoped monochrome styling and a floating toolbar. Both views show the same Italian Game position. The 3D preview reuses the game renderer and camera controls with a closer presentation angle; pieces cannot be moved. Loading or unavailable WebGL falls back to the same position in 2D. No additional component dependency was added.

Source retrieved on 28 October 2026. The upstream README describes the registry as open source, but the repository root does not contain a licence file. No upstream licence has been inferred or added. Confirm redistribution terms before public release.
