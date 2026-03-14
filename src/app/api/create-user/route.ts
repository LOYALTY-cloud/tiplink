import createUserWithCard from '@/lib/createUser';

export async function POST(req: Request) {
  try {
    const { userId, email } = await req.json();
    if (!userId || !email) {
      return new Response(JSON.stringify({ error: 'userId and email required' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    // Run server-side only: create issuing card and persist wallet/card records
    await createUserWithCard(userId, email).catch(() => {});

    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({ error: 'server error' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}
