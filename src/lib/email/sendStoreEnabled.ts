import { emailFooter } from "@/lib/email/footer";

type Args = {
  displayName?: string;
};

function esc(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function buildStoreEnabledEmail(args: Args): string {
  const name = args.displayName?.trim() || "there";

  return `
<div style="background:#060B18;padding:40px 20px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#e5e7eb;">
  <div style="max-width:480px;margin:0 auto;background:#0f172a;border-radius:20px;padding:28px 24px;border:1px solid rgba(255,255,255,0.08);box-shadow:0 10px 40px rgba(0,0,0,0.5);">

    <!-- Logo -->
    <div style="text-align:center;margin-bottom:24px;">
      <table width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td align="center" style="padding:0 0 12px 0;">
            <img src="https://raw.githubusercontent.com/LOYALTY-cloud/tiplink/main/public/1nelink-logo.png" alt="1neLink" width="130" style="display:block;width:130px;max-width:160px;height:auto;border-radius:12px;" />
          </td>
        </tr>
        <tr>
          <td style="height:2px;background:linear-gradient(to right,#22c55e,#16a34a);border-radius:2px;"></td>
        </tr>
      </table>
    </div>

    <!-- Icon + heading -->
    <div style="text-align:center;margin-bottom:8px;">
      <div style="display:inline-block;background:rgba(34,197,94,0.12);border-radius:50%;width:52px;height:52px;line-height:52px;font-size:24px;">✅</div>
    </div>
    <h2 style="text-align:center;margin:0 0 8px;font-size:20px;font-weight:700;color:#ffffff;">
      Your Store Is Back Online
    </h2>
    <p style="text-align:center;margin:0 0 28px;font-size:14px;color:#9ca3af;line-height:1.6;">
      Hi ${esc(name)}, great news — your 1neLink creator store has been re-enabled by our team. Everything is back to normal.
    </p>

    <!-- What's restored -->
    <div style="background:rgba(34,197,94,0.07);border:1px solid rgba(34,197,94,0.2);border-radius:14px;padding:18px 20px;margin-bottom:20px;">
      <div style="font-size:12px;font-weight:600;color:#4ade80;letter-spacing:0.5px;margin-bottom:12px;">WHAT'S RESTORED</div>
      <table cellpadding="0" cellspacing="0" border="0" width="100%">
        <tr>
          <td style="width:18px;vertical-align:top;padding-top:3px;color:#22c55e;font-size:13px;">✓</td>
          <td style="font-size:13px;color:#d1d5db;line-height:1.5;padding-bottom:8px;">Your store page is live and publicly visible</td>
        </tr>
        <tr>
          <td style="width:18px;vertical-align:top;padding-top:3px;color:#22c55e;font-size:13px;">✓</td>
          <td style="font-size:13px;color:#d1d5db;line-height:1.5;padding-bottom:8px;">Your themes are active in the marketplace</td>
        </tr>
        <tr>
          <td style="width:18px;vertical-align:top;padding-top:3px;color:#22c55e;font-size:13px;">✓</td>
          <td style="font-size:13px;color:#d1d5db;line-height:1.5;">Customers can discover and purchase your themes again</td>
        </tr>
      </table>
    </div>

    <!-- CTA -->
    <div style="text-align:center;margin-bottom:20px;">
      <a href="https://1nelink.app/dashboard/themebuilder" style="display:inline-block;padding:10px 24px;background:linear-gradient(135deg,#22c55e,#16a34a);color:#fff;font-size:13px;font-weight:600;border-radius:10px;text-decoration:none;">
        View Your Store →
      </a>
    </div>

    <!-- Support note -->
    <p style="text-align:center;font-size:12px;color:#6b7280;margin:0 0 20px;line-height:1.6;">
      Questions? Reach us at <a href="mailto:support@1nelink.com" style="color:#4ade80;text-decoration:none;">support@1nelink.com</a>
    </p>

    <!-- Trust badge -->
    <div style="text-align:center;">
      <div style="display:inline-block;padding:6px 14px;border-radius:999px;background:rgba(34,197,94,0.1);color:#4ade80;font-size:11px;font-weight:500;">
        Store live &#8226; Themes active &#8226; 1neLink
      </div>
    </div>

    ${emailFooter()}
  </div>
</div>`;
}
