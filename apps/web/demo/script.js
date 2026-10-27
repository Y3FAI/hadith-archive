// Enhancements only: without this file every page still works.

// Long narrations open and close by CSS. With a mouse they react on
// press, together with the button's own press colour, not on release.
// Touch waits for the tap, so a scroll that starts on the button never
// opens a card; the keyboard's click (detail 0) acts as usual.

for (const summary of document.querySelectorAll("li > div > details > summary")) {
  let pressed = false;

  summary.addEventListener("pointerdown", (event) => {
    pressed = event.pointerType === "mouse" && event.button === 0;
    if (pressed) summary.parentElement.open = !summary.parentElement.open;
  });

  summary.addEventListener("click", (event) => {
    if (pressed && event.detail) event.preventDefault();
    pressed = false;
  });
}
