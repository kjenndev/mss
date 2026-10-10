// Only validated stored fields enter this renderer; still escape every interpolation.
const escape = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
export function bookingMessage(booking, origin) {
  const url = `${origin}/admin/bookings/${booking.id}`;
  const values = [
    ["Reference", booking.reference],
    ["Venue", booking.venue_name],
    ["Contact", booking.contact_name],
    ["Phone", booking.phone],
    ["Email", booking.email],
    ["Event date", booking.event_date],
    ["Location", booking.location],
    ["Event type", booking.event_type],
    ["Estimated attendance", booking.estimated_attendance],
    ["Budget", booking.budget],
    [
      "Services",
      booking.services
        .map(
          (s) =>
            ({
              djs: "DJs",
              lasers: "JDS Lasers",
              streaming: "Live multiplatform streaming",
            })[s],
        )
        .join(", "),
    ],
    ["Message", booking.message],
  ];
  const text =
    values.map(([k, v]) => `${k}: ${v ?? "Not provided"}`).join("\n") +
    `\n\nReview request: ${url}`;
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;padding:24px;background:#111;color:#eee;font-family:Arial,Helvetica,sans-serif"><table role="presentation" style="width:100%;max-width:640px;margin:auto;background:#191919;border:1px solid #333;border-collapse:collapse"><tr><td style="padding:28px;border-bottom:3px solid #90caf9"><p style="color:#90caf9;letter-spacing:2px">MIDNIGHT SOUND SYNDICATE</p><h1 style="font-size:30px">New booking request</h1><p>DJs · JDS Lasers · Live multiplatform streaming</p></td></tr>${values.map(([k, v]) => `<tr><td style="padding:12px 28px;overflow-wrap:anywhere"><strong style="color:#90caf9">${escape(k)}</strong><div style="margin-top:6px;white-space:pre-wrap">${escape(v ?? "Not provided")}</div></td></tr>`).join("")}<tr><td style="padding:28px"><a href="${escape(url)}" style="display:inline-block;padding:14px 20px;background:#90caf9;color:#111;text-decoration:none;font-weight:bold">Review booking request</a><p style="font-size:12px;color:#aaa">Internal notification. Sign in with your administrator account. Contact details are supplied by the requester and are not verified.</p></td></tr></table></body></html>`;
  return {
    subject: "New Midnight Sound Syndicate booking request",
    reply_to: booking.email,
    html,
    text,
  };
}
