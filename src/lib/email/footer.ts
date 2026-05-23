/**
 * Shared branded email footer for all 1neLink transactional emails.
 */
export function emailFooter(): string {
  return `
  <!-- 1neLink Email Footer -->
  <div style="margin-top:40px;padding-top:24px;border-top:1px solid #1f2937;font-family:sans-serif;color:#9ca3af;">

    <!-- Brand -->
    <div style="text-align:center;margin-bottom:16px;">
      <img src="https://raw.githubusercontent.com/LOYALTY-cloud/tiplink/main/public/1nelink-logo.png" alt="1neLink" width="120" style="display:block;margin:0 auto 8px;height:auto;border-radius:10px;" />
    </div>

    <!-- Fintech Badge -->
    <div style="text-align:center;margin-bottom:16px;">
      <div style="display:inline-block;padding:6px 12px;border-radius:999px;background:rgba(34,197,94,0.1);color:#22c55e;font-size:11px;font-weight:500;">
        Secure &#8226; Fast &#8226; Creator-first
      </div>
    </div>

    <!-- Social Icons -->
    <div style="text-align:center;margin-bottom:18px;">
      <a href="https://www.instagram.com/1nelink26?igsh=ZWRmcmhqYjdvaGo=" style="margin:0 6px;display:inline-block;">
        <img src="https://cdn-icons-png.flaticon.com/512/2111/2111463.png" width="20" alt="Instagram" style="opacity:0.8;" />
      </a>
      <a href="https://x.com/1neLink" style="margin:0 6px;display:inline-block;">
        <img src="https://cdn-icons-png.flaticon.com/512/5968/5968830.png" width="20" alt="X" style="opacity:0.8;" />
      </a>
      <a href="https://www.tiktok.com/@1nelink2?_r=1&_t=ZT-95QuzIkMZ5R" style="margin:0 6px;display:inline-block;">
        <img src="https://cdn-icons-png.flaticon.com/512/3046/3046121.png" width="20" alt="TikTok" style="opacity:0.8;" />
      </a>
    </div>

    <!-- Company Info -->
    <div style="text-align:center;font-size:12px;line-height:1.6;margin-bottom:12px;">
      1neLink &#8226; Creator Payment Platform<br/>
      Augusta, GA, United States<br/>
      <a href="https://1nelink.app" style="color:#9ca3af;text-decoration:underline;">www.1nelink.app</a>
    </div>

    <!-- Legal / Compliance -->
    <div style="text-align:center;font-size:11px;line-height:1.5;color:#6b7280;margin-bottom:12px;">
      1neLink is a payment facilitation platform, not a bank. Payment processing services are provided by third-party partners. Funds are held and transferred by licensed financial institutions.
    </div>

    <!-- Support -->
    <div style="text-align:center;font-size:12px;">
      Need help?
      <a href="mailto:support@1nelink.com" style="color:#22c55e;text-decoration:none;">
        support@1nelink.com
      </a>
    </div>

    <!-- Powered by -->
    <div style="text-align:center;font-size:11px;color:#6b7280;margin-top:18px;">
      Powered by
      <a href="https://1nelink.app" style="color:#22c55e;text-decoration:none;font-weight:500;">
        1neLink
      </a>
    </div>

    <!-- Security Note -->
    <div style="text-align:center;font-size:10px;color:#6b7280;margin-top:10px;">
      If you did not perform this action, contact support immediately.
    </div>

  </div>`;
}
