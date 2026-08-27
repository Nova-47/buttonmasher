// Click it twice: two identical POSTs at the same instant.
const URL = process.env.URL || `http://localhost:${process.env.PORT || 3000}`;
const body = JSON.stringify({ cartId: "cart_1" });
const post = () =>
  fetch(URL + "/api/checkout", { method: "POST", body }).then(async (r) => `${r.status} ${await r.text()}`);

(async () => {
  const t0 = Date.now();
  const [a, b] = await Promise.all([post(), post()]);
  console.log(`request 1 → ${a}`);
  console.log(`request 2 → ${b}`);
  const { orders, charges } = await fetch(URL + "/state").then((r) => r.json());
  const verdict = orders.length === 1 && charges.length === 1 ? "BORING" : "BROKE";
  console.log(`\n${verdict}   orders: ${orders.length}   charges: ${charges.length}   (${Date.now() - t0}ms)`);
  process.exitCode = verdict === "BROKE" ? 1 : 0;
})();
