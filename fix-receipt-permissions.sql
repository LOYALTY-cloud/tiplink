-- Grant execute permission to anon and authenticated users on get_tip_receipt
-- This allows the public receipt page to work

grant execute on function public.get_tip_receipt(text) to anon, authenticated;

-- Also ensure the function is security definer so it can read data
-- This may already be set but we're ensuring it's correct
alter function public.get_tip_receipt(text) security definer;
