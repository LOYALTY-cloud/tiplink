import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });

(async () => {
  try {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id,user_id,email,stripe_account_id,stripe_card_id')
      .not('stripe_account_id', 'is', null)
      .limit(1)
      .maybeSingle();

    if (!profiles) {
      console.error('No profile with stripe_account_id found.');
      process.exit(1);
    }

    const profile = profiles;
    console.log('Found profile:', { id: profile.id, user_id: profile.user_id, stripe_account_id: profile.stripe_account_id });

    // Simulate onboarding complete
    const onboardingUpdate = {
      stripe_charges_enabled: true,
      stripe_payouts_enabled: true,
      stripe_onboarding_complete: true,
    };

    const { error: updErr } = await supabase
      .from('profiles')
      .update(onboardingUpdate)
      .eq('id', profile.id);

    if (updErr) {
      console.error('Failed to mark onboarding complete:', updErr);
      process.exit(1);
    }

    // Simulate card creation by inserting test ids
    const fakeCardholder = 'ich_test_0001';
    const fakeCard = 'ic_test_0001';

    const { error: upsertErr } = await supabase.from('profiles').upsert({
      id: profile.id,
      stripe_cardholder_id: fakeCardholder,
      stripe_card_id: fakeCard,
    }, { onConflict: 'id' });

    if (upsertErr) {
      console.error('Failed to upsert profile with fake card ids:', upsertErr);
      process.exit(1);
    }

    // Upsert into cards table
    try {
      await supabase.from('cards').upsert({ user_id: profile.user_id, stripe_card_id: fakeCard, brand: 'VISA', last4: '0001', status: 'active' }, { onConflict: 'stripe_card_id' });
    } catch (e) {
      console.warn('cards table upsert may have failed (table missing?):', e.message || e);
    }

    console.log('Simulated account.updated and created card entries for profile.');
    process.exit(0);
  } catch (e) {
    console.error('Simulation failed:', e);
    process.exit(1);
  }
})();
