# animateTextWeight

Animate a headline, button or link between two weights of a variable font.
The text can span one line or several, but it works best on short text.
Body text animates fine in Chrome, but jitters in Firefox.

- The element keeps its default width, so no line moves and no line break changes.
- The default state keeps your letter-spacing. The animated state gets
  spacing matched per line, so every line ends where it started.

Everything you write lives in CSS, in your components. There is no
class needed on the elements you want to animate, because the script finds the
animated elements on its own. That also makes it work with any CMS: nothing is
pre-rendered, the browser measures at runtime.

## Use

Set the two weights on the element, then switch it on wherever you like:

```css
h1 { --animate-weight-from: 200; --animate-weight-to: 700; }
section:hover h1, section.active h1 { --animate-weight: true; }
```
