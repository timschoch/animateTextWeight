# animateTextWeight

Animate a headline, button or link between two weights of a variable font.
The text can span one line or several, but it works best on short text.
Body text animates fine in Chrome, but jitters in Firefox.

- The element keeps its default `from-weight` width, so no line moves and no line break changes.
- The `from` state keeps your letter-spacing. The `to` state gets
  spacing matched per line, so every line ends where it started.

Everything you write lives in CSS, in your components. There is no
class needed on the elements you want to animate, because the script finds the
animated elements on its own. That also makes it work with any CMS: nothing is
pre-rendered, the browser measures at runtime.

## Sandbox

Run `npm run demo` and open `http://localhost:3000/demo/`. Type any text,
set width, size and the two weights, hover the preview.

## Use

Import the stylesheet and start the script once per page:

```js
import "animate-text-weight/style.css";
import { init } from "animate-text-weight";
init();
```

Set the `to` weight on the element, then switch it on wherever you like.
The element's own `font-weight` is the `from` weight:

```css
h1 { font-weight: 200; --animate-weight-to: 700; }
section:hover h1, section.active h1 { --animate-weight: true; }
```

`--animate-weight` inherits, so you can set it on the section instead of
each heading. `--animate-weight-from` overrides the `from` weight when you
need it. Duration and easing: `--animate-weight-duration` and
`--animate-weight-easing` on `:root`.
