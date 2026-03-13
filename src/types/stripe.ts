import Stripe from "stripe";

export type StripeWebhookEvent =
  | (Stripe.Event & { type: "payment_intent.succeeded"; data: { object: Stripe.PaymentIntent } })
  | (Stripe.Event & { type: "payment_intent.payment_failed"; data: { object: Stripe.PaymentIntent } })
  | (Stripe.Event & { type: "charge.refunded"; data: { object: Stripe.Charge } })
  | (Stripe.Event & { type: "payout.paid"; data: { object: Stripe.Payout } })
  | (Stripe.Event & { type: "payout.failed"; data: { object: Stripe.Payout } })
  | (Stripe.Event & { type: "account.updated"; data: { object: Stripe.Account } })
  | (Stripe.Event & { type: "account.application.deauthorized"; data: { object: Stripe.Account } })
  | (Stripe.Event & { type: "issuing_authorization.request"; data: { object: Stripe.Issuing.Authorization } })
  | (Stripe.Event & { type: "issuing_authorization.created"; data: { object: Stripe.Issuing.Authorization } })
  | (Stripe.Event & { type: "issuing_authorization.updated"; data: { object: Stripe.Issuing.Authorization } })
  | (Stripe.Event & { type: "issuing_authorization.declined"; data: { object: Stripe.Issuing.Authorization } })
  | (Stripe.Event & { type: "issuing_transaction.created"; data: { object: Stripe.Issuing.Transaction } })
  | (Stripe.Event & { type: "issuing_transaction.updated"; data: { object: Stripe.Issuing.Transaction } })
  | (Stripe.Event & { type: "issuing_card.updated"; data: { object: Stripe.Issuing.Card } })
  | (Stripe.Event & { type: "issuing_cardholder.updated"; data: { object: Stripe.Issuing.Cardholder } })
  | (Stripe.Event & { type: "issuing_dispute.created"; data: { object: Stripe.Issuing.Dispute } })
  | (Stripe.Event & { type: "issuing_dispute.closed"; data: { object: Stripe.Issuing.Dispute } });

export default StripeWebhookEvent;
