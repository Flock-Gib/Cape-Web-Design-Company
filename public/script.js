document.querySelectorAll("[data-quote-link]").forEach((link) => {
  link.addEventListener("click", (event) => {
    if (link.getAttribute("href") !== "[Quote Form URL]") return;
    event.preventDefault();
    const status = document.getElementById("quote-status");
    status.textContent = "The quote form isn’t connected yet. Replace [Quote Form URL] and [Business Email] before publishing this site.";
    document.getElementById("quote").scrollIntoView();
    status.focus({ preventScroll: true });
  });
});
