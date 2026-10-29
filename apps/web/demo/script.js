// Enhancements only: without this file every page still works.

// Long narrations open and close by CSS. With a mouse they react on
// press, together with the button's own press colour, not on release.
// Touch waits for the tap, so a scroll that starts on the button never
// opens a card; the keyboard's click (detail 0) acts as usual.

let press = null; // the button a mouse press toggled, and where it began

for (const summary of document.querySelectorAll("li > div > details > summary")) {
  summary.addEventListener("pointerdown", (event) => {
    if (event.pointerType !== "mouse" || event.button !== 0) return;
    press = { summary, x: event.clientX, y: event.clientY };
    summary.parentElement.open = !summary.parentElement.open;
  });

  summary.addEventListener("click", (event) => {
    if (press && press.summary === summary && event.detail) event.preventDefault();
  });
}

// As with any button, a press is taken back when the mouse moves away
// before release. The distance decides, not what is under the mouse,
// because the button itself moves as the card grows. The press is
// forgotten after the click that follows it.

addEventListener("pointerup", (event) => {
  if (!press) return;
  const { summary, x, y } = press;
  if (Math.hypot(event.clientX - x, event.clientY - y) > 16) {
    summary.parentElement.open = !summary.parentElement.open;
  }
  setTimeout(() => { press = null; });
});

// To show a match inside a closed narration (Find in page, or a link to
// a quoted passage), the browser scrolls the clipped text instead of
// opening the card. Open it at once and move the page by the same
// distance, so the match stays in view.

for (const details of document.querySelectorAll("li > div > details")) {
  const quote = details.previousElementSibling;
  const card = details.parentElement;

  quote.addEventListener("scroll", () => {
    const offset = quote.scrollTop;
    if (details.open || !offset) return;
    card.style.transition = "none";
    details.open = true;
    card.offsetHeight; // lay out the open card before the page moves
    quote.scrollTop = 0;
    window.scrollBy(0, offset);
    card.style.removeProperty("transition");
  });
}

// The phone menu keeps keyboard focus in sight. Opening it moves focus
// from the menu button, which the drawer covers, to the close button in
// its place, and it closes when focus moves to the page behind it. It
// also closes when the window grows past the phone width, where an open
// drawer has no place.

const menu = document.getElementById("menu");

if (menu && menu.hidePopover) {
  const close = () => {
    if (menu.matches(":popover-open")) menu.hidePopover();
  };

  menu.addEventListener("toggle", (event) => {
    if (event.newState === "open" && !menu.contains(document.activeElement)) {
      menu.querySelector("button").focus();
    }
  });

  document.addEventListener("focusin", (event) => {
    if (!menu.contains(event.target)) close();
  });

  // Safari on iPhone before 18.3 does not close it on a tap outside.
  document.addEventListener("pointerup", (event) => {
    if (!menu.contains(event.target)) close();
  });

  // The same phone width as in style.css.
  matchMedia("(width < 40em)").addEventListener("change", (event) => {
    if (!event.matches) close();
  });
}
