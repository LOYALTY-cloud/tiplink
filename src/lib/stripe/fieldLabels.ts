/** Maps raw Stripe requirement field paths to plain-English admin labels. */
const FIELD_LABELS: Record<string, string> = {
  // Identity
  "individual.id_number":                         "Government ID Number (SSN/ITIN)",
  "individual.ssn_last_4":                        "SSN — Last 4 Digits",
  "individual.first_name":                        "Legal First Name",
  "individual.last_name":                         "Legal Last Name",
  "individual.dob.day":                           "Date of Birth — Day",
  "individual.dob.month":                         "Date of Birth — Month",
  "individual.dob.year":                          "Date of Birth — Year",
  "individual.phone":                             "Phone Number",
  "individual.email":                             "Email Address",

  // Address
  "individual.address.line1":                     "Home Address — Street",
  "individual.address.line2":                     "Home Address — Apt/Suite",
  "individual.address.city":                      "Home Address — City",
  "individual.address.state":                     "Home Address — State",
  "individual.address.postal_code":               "Home Address — ZIP Code",
  "individual.address.country":                   "Home Address — Country",

  // Verification documents
  "individual.verification.document":             "Photo ID Upload Required",
  "individual.verification.additional_document":  "Additional ID Document Required",

  // Terms of service
  "tos_acceptance.date":                          "Terms of Service — Must Be Re-Accepted",
  "tos_acceptance.ip":                            "Terms of Service — IP Address Missing",

  // Business profile
  "business_profile.url":                         "Business Website URL",
  "business_profile.mcc":                         "Business Category",
  "business_profile.product_description":         "Business Description",

  // Company
  "company.name":                                 "Legal Business Name",
  "company.tax_id":                               "Business Tax ID (EIN)",
  "company.phone":                                "Business Phone Number",
  "company.address.line1":                        "Business Address — Street",
  "company.address.city":                         "Business Address — City",
  "company.address.state":                        "Business Address — State",
  "company.address.postal_code":                  "Business Address — ZIP Code",
  "company.address.country":                      "Business Address — Country",
  "company.directors_provided":                   "Company Directors — Info Required",
  "company.owners_provided":                      "Company Owners — Info Required",
  "company.executives_provided":                  "Company Executives — Info Required",
  "company.verification.document":                "Business Registration Document",

  // Banking
  "external_account":                             "Bank Account or Debit Card",
  "bank_account.account_number":                  "Bank Account Number",
  "bank_account.routing_number":                  "Bank Routing Number",
};

/**
 * Returns a plain-English label for a Stripe requirement field path.
 * Falls back to title-casing the raw field name if no mapping exists.
 */
export function stripeFieldLabel(field: string): string {
  return (
    FIELD_LABELS[field] ??
    field.replace(/[_.]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
  );
}
