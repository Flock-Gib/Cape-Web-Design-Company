const form = document.getElementById("estimate-form");
const result = document.getElementById("estimate-result");
const total = document.getElementById("estimate-total");
const description = document.getElementById("estimate-description");
const services = {
  cleanup: { label: "Seasonal cleanup", price: 180 },
  beds: { label: "Garden bed refresh", price: 320 },
  lawn: { label: "Lawn care visit", price: 65 }
};
const sizes = { small: 1, medium: 1.5, large: 2 };
const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2
});

document.getElementById("calculate").disabled = false;

form.addEventListener("submit", (event) => {
  event.preventDefault();
  const data = new FormData(form);
  const service = services[data.get("service")];
  const size = data.get("size");
  if (!service || !Object.hasOwn(sizes, size)) return;
  const haulAway = data.has("debris");
  result.hidden = false;
  total.textContent = currency.format(service.price * sizes[size] + (haulAway ? 60 : 0));
  description.textContent = `${service.label} · ${size} property${haulAway ? " · debris haul-away included" : ""}. Fictional example pricing.`;
});

form.addEventListener("change", () => {
  result.hidden = true;
  total.textContent = "";
});

form.addEventListener("reset", () => {
  result.hidden = true;
  total.textContent = "";
  description.textContent = "";
});
