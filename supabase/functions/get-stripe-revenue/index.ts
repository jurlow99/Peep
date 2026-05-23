Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, content-type" },
    });
  }

  try {
    const { month } = await req.json(); // "YYYY-MM"
    if (!month?.match(/^\d{4}-\d{2}$/)) throw new Error("Invalid month format (expected YYYY-MM)");

    const [year, mo] = month.split("-").map(Number);
    const start = Math.floor(new Date(Date.UTC(year, mo - 1, 1)).getTime() / 1000);
    const end = Math.floor(new Date(Date.UTC(year, mo, 1)).getTime() / 1000);

    let total = 0;
    let hasMore = true;
    let startingAfter: string | null = null;

    while (hasMore) {
      const params = new URLSearchParams({
        "created[gte]": String(start),
        "created[lt]": String(end),
        limit: "100",
      });
      if (startingAfter) params.set("starting_after", startingAfter);

      const res = await fetch(`https://api.stripe.com/v1/charges?${params}`, {
        headers: { "Authorization": `Bearer ${Deno.env.get("STRIPE_SECRET_KEY")}` },
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error.message);

      for (const charge of data.data) {
        if (charge.status === "succeeded" && !charge.refunded) {
          total += charge.amount / 100;
        }
      }

      hasMore = data.has_more;
      if (hasMore && data.data.length > 0) {
        startingAfter = data.data[data.data.length - 1].id;
      } else {
        hasMore = false;
      }
    }

    return new Response(JSON.stringify({ revenue: +total.toFixed(2), month }), {
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    });
  }
});
