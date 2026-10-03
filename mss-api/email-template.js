// Self-contained transactional email: no remote assets or client-side code.
export function renderVerificationEmail(url) {
  // Origin policy remains in email-settings.js. This renderer also rejects
  // active protocols and credentials when called directly with untrusted data.
  try {
    if (typeof url !== "string" || /[\u0000-\u001f\u007f]/.test(url)) throw Error();
    const parsed = new URL(url);
    if (!["https:", "http:"].includes(parsed.protocol) || parsed.username || parsed.password) throw Error();
  } catch {
    throw Error("Invalid verification URL");
  }
  // Escape the original string, not URL.href: preserve fragment tokens exactly.
  const escapedUrl = url.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]);
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Verify your Midnight Sound Syndicate email</title>
</head>
<body style="margin:0;padding:0;width:100%;background-color:#111111;color:#e0e0e0;font-family:Arial,Helvetica,sans-serif;">
  <div style="display:none;font-size:1px;line-height:1px;color:#111111;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">Continue securely with Midnight Sound Syndicate. Your verification link expires in 30 minutes.</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#111111" style="width:100%;border-collapse:collapse;">
    <tr><td align="center" style="padding:32px 12px;">
      <!--[if mso]><table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#171717" style="width:100%;max-width:600px;table-layout:fixed;border-collapse:collapse;background-color:#171717;">
        <tr><td align="left" style="padding:28px 24px 24px;border-bottom:1px solid #333333;font-family:Arial,Helvetica,sans-serif;">
          <p style="margin:0;color:#ffffff;font-size:16px;line-height:24px;font-weight:bold;">Midnight Sound Syndicate</p>
        </td></tr>
        <tr><td align="left" style="padding:32px 24px 0;font-family:Arial,Helvetica,sans-serif;">
          <p style="margin:0 0 12px;color:#bdbdbd;font-size:12px;line-height:18px;letter-spacing:2px;text-transform:uppercase;">Account access</p>
          <h1 style="margin:0 0 20px;color:#ffffff;font-size:32px;line-height:38px;font-weight:bold;">Verify your email<span aria-hidden="true" style="color:#90caf9;">.</span></h1>
          <p style="margin:0 0 24px;color:#e0e0e0;font-size:16px;line-height:26px;">Continue securely to finish your signup or confirm an email address change.</p>
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;">
            <tr><td align="center" bgcolor="#90caf9" style="background-color:#90caf9;border-radius:4px;mso-padding-alt:16px 24px;">
              <a href="${escapedUrl}" style="display:inline-block;padding:16px 24px;border:1px solid #90caf9;border-radius:4px;color:#111111;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:20px;font-weight:bold;text-decoration:none;mso-padding-alt:0;">Verify email address</a>
            </td></tr>
          </table>
          <p style="margin:16px 0 28px;color:#bdbdbd;font-size:14px;line-height:22px;">This link expires in <strong style="color:#ffffff;">30 minutes</strong>.</p>
          <p style="margin:0 0 16px;color:#e0e0e0;font-size:15px;line-height:24px;"><strong style="color:#ffffff;">Signing up?</strong> Choose your own username and password, review the terms, and confirm your choices on the secure page.</p>
          <p style="margin:0 0 28px;color:#e0e0e0;font-size:15px;line-height:24px;"><strong style="color:#ffffff;">Changing your email?</strong> Sign in to the matching account and confirm with your current password.</p>
        </td></tr>
        <tr><td align="left" style="padding:24px;border-top:1px solid #333333;font-family:Arial,Helvetica,sans-serif;">
          <p style="margin:0 0 8px;color:#bdbdbd;font-size:14px;line-height:22px;">If the button does not work, copy and paste this link into your browser:</p>
          <p style="margin:0 0 24px;font-size:14px;line-height:22px;word-break:break-all;overflow-wrap:anywhere;word-wrap:break-word;"><a href="${escapedUrl}" style="color:#90caf9;text-decoration:underline;word-break:break-all;overflow-wrap:anywhere;word-wrap:break-word;">${escapedUrl}</a></p>
          <p style="margin:0;color:#bdbdbd;font-size:14px;line-height:22px;">If you did not request this, ignore this email. Do not share this link with anyone.</p>
        </td></tr>
      </table>
      <!--[if mso]></td></tr></table><![endif]-->
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;table-layout:fixed;border-collapse:collapse;">
        <tr><td align="left" style="padding:24px;font-family:Arial,Helvetica,sans-serif;">
          <p style="margin:0 0 6px;color:#bdbdbd;font-size:13px;line-height:21px;">Need help? Contact Midnight Sound Syndicate.</p>
          <p style="margin:0;font-size:13px;line-height:21px;word-break:break-all;overflow-wrap:anywhere;"><a href="mailto:support@midnightsoundsyndicate.com" style="color:#90caf9;text-decoration:underline;">support@midnightsoundsyndicate.com</a></p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}
