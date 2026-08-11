# Morden Roam CSS

A quiet, Linear-inspired Roam Research theme for writing, block navigation, and long-form work.

## Preview

The current design combines a shared workspace shell, compact left navigation, inset right-sidebar cards, and restrained Roam-native typography.

![Latest Morden Roam CSS interface](./assets/roam-help-linear-style.png)

## Install

Copy the contents of [`roam.css`](./roam.css) into a CSS code block on your `roam/css` page.

For accurate back/forward availability, also place [`roam-history-availability.js`](./roam-history-availability.js) in an enabled `{{[[roam/js]]}}` code block. It only marks an unavailable history direction so the stylesheet can dim and disable it.

The exported stylesheet preserves all 36 active modules in their original Roam order.

## Export again

With the official Roam CLI configured:

```bash
node scripts/export-theme.mjs \
  --graph YOUR_GRAPH \
  --uid YOUR_THEME_BLOCK_UID \
  --output roam.css
```

The exporter reads Roam only. It does not modify the graph.
