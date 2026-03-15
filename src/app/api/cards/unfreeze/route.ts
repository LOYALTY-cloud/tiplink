export async function POST() {
  return new Response(
    JSON.stringify({ error: "Card controls not implemented yet" }),
    { status: 501 }
  );
}
