const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[character]);

function artistUrl(origin, id) {
  try {
    if (typeof origin !== 'string' || /[\u0000-\u001f\u007f]/.test(origin)) throw Error();
    const base = new URL(origin);
    if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password || base.origin !== origin) throw Error();
    if (!Number.isSafeInteger(Number(id)) || Number(id) < 1) throw Error();
    return `${origin}/artists/${Number(id)}`;
  } catch {
    throw Error('Invalid artist comment URL');
  }
}

export function artistCommentMessage({ artist, comment, origin }) {
  const url = artistUrl(origin, artist?.id);
  const artistName = String(artist?.name ?? 'your artist profile');
  const authorName = String(comment?.author_name ?? 'A member');
  const content = String(comment?.content ?? '');
  const escapedUrl = escapeHtml(url);
  const html = `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>New artist profile comment</title></head>
<body style="margin:0;padding:0;width:100%;background-color:#111111;color:#e0e0e0;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#111111" style="width:100%;border-collapse:collapse;">
    <tr><td align="center" style="padding:32px 12px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#171717" style="width:100%;max-width:600px;table-layout:fixed;border-collapse:collapse;background-color:#171717;">
        <tr><td align="left" style="padding:28px 24px 24px;border-bottom:1px solid #333333;font-family:Arial,Helvetica,sans-serif;"><p style="margin:0;color:#ffffff;font-size:16px;line-height:24px;font-weight:bold;">Midnight Sound Syndicate</p></td></tr>
        <tr><td align="left" style="padding:32px 24px 0;font-family:Arial,Helvetica,sans-serif;">
          <p style="margin:0 0 12px;color:#bdbdbd;font-size:12px;line-height:18px;letter-spacing:2px;text-transform:uppercase;">Artist profile</p>
          <h1 style="margin:0 0 20px;color:#ffffff;font-size:32px;line-height:38px;font-weight:bold;">New comment<span aria-hidden="true" style="color:#90caf9;">.</span></h1>
          <p style="margin:0 0 20px;color:#e0e0e0;font-size:16px;line-height:26px;"><strong style="color:#ffffff;">${escapeHtml(authorName)}</strong> commented on <strong style="color:#ffffff;">${escapeHtml(artistName)}</strong>.</p>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;"><tr><td align="left" style="padding:18px;background-color:#202020;border-left:3px solid #90caf9;color:#e0e0e0;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:24px;white-space:pre-wrap;overflow-wrap:anywhere;">${escapeHtml(content)}</td></tr></table>
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:24px;border-collapse:separate;"><tr><td align="center" bgcolor="#90caf9" style="background-color:#90caf9;border-radius:4px;mso-padding-alt:16px 24px;"><a href="${escapedUrl}" style="display:inline-block;padding:16px 24px;border:1px solid #90caf9;border-radius:4px;color:#111111;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:20px;font-weight:bold;text-decoration:none;mso-padding-alt:0;">View artist profile</a></td></tr></table>
        </td></tr>
        <tr><td align="left" style="padding:24px;margin-top:28px;border-top:1px solid #333333;font-family:Arial,Helvetica,sans-serif;">
          <p style="margin:0 0 8px;color:#bdbdbd;font-size:14px;line-height:22px;">If the button does not work, copy and paste this link into your browser:</p>
          <p style="margin:0 0 24px;font-size:14px;line-height:22px;word-break:break-all;overflow-wrap:anywhere;word-wrap:break-word;"><a href="${escapedUrl}" style="color:#90caf9;text-decoration:underline;word-break:break-all;overflow-wrap:anywhere;word-wrap:break-word;">${escapedUrl}</a></p>
          <p style="margin:0;color:#bdbdbd;font-size:13px;line-height:21px;">Need help? <a href="mailto:support@midnightsoundsyndicate.com" style="color:#90caf9;text-decoration:underline;">support@midnightsoundsyndicate.com</a></p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
  return {
    subject: `New comment on ${artistName.replace(/[\r\n]+/g, ' ')}`,
    reply_to: 'support@midnightsoundsyndicate.com',
    html,
    text: `New comment on ${artistName}\n\n${authorName} wrote:\n\n${content}\n\nView artist profile: ${url}\n\nNeed help? support@midnightsoundsyndicate.com`,
  };
}
