# Map loading spinner

## Purpose

Display a spinner in the center of the map while layers are loading: pan, zoom, layer
toggled on in the legend, filter applied... Users know the map is still loading and
do not click again while waiting.

## How it works

* WMS `GetMap`, WMTS `GetTile` and tile requests (sent through `<img>`, `fetch` or
  `XMLHttpRequest`) are counted. The spinner is visible while at least one request is pending.
* The OpenLayers `loadend` map event, when available, resets the counter, so tiles
  cancelled during a pan cannot keep the spinner visible.
* The spinner appears after 150 ms only, to avoid flickering on fast loads, and a safety
  timeout of 20 s hides it if a request never completes.
* The `z-index` is `1040`, so the spinner stays below Bootstrap modals (`1050`).

## Configuration

At the top of the file:

| Constant            | Default                   | Description                       |
|---------------------|---------------------------|-----------------------------------|
| `SPINNER_SIZE`      | `56`                      | Diameter in pixels                |
| `SPINNER_THICKNESS` | `8`                       | Ring width in pixels              |
| `SPINNER_COLOR`     | `#0d3b66`                 | Color of the rotating arc         |
| `SPINNER_TRACK`     | `rgba(13, 59, 102, 0.25)` | Color of the background ring      |
| `SHOW_DELAY`        | `150`                     | Delay before showing it, in ms    |
| `SAFETY_TIMEOUT`    | `20000`                   | Forced hide after this time, in ms |
| `Z_INDEX`           | `1040`                    | CSS `z-index` of the spinner      |

## Debug

In the browser console:

* `lizSpinner.show()` / `lizSpinner.hide()` to check the display;
* `lizSpinner.status()` to see the number of pending requests.

## Compatibility

Tested with Lizmap Web Client 3.6.12.
