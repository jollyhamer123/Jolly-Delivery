const BREVO_API = 'https://api.brevo.com/v3';

function reply(statusCode, body) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
    body: JSON.stringify(body)
  };
}
function escapeHtml(value) {
  return String(value || '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return reply(204, {});
  if (event.httpMethod !== 'POST') return reply(405, { success: false, error: 'Use POST for newsletter signup.' });

  let input;
  try { input = JSON.parse(event.body || '{}'); } catch { return reply(400, { success: false, error: 'Please enter a valid email address.' }); }

  // Quietly accept the honeypot, but never add it to the list or send mail.
  if (String(input.company || '').trim()) return reply(200, { success: true, welcomeSent: true });

  const email = String(input.email || '').trim().toLowerCase();
  const consent = input.consent === true;
  const firstName = String(input.firstName || '').trim().slice(0, 70);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    return reply(400, { success: false, error: 'Please enter a valid email address.' });
  }
  if (!consent) return reply(400, { success: false, error: 'Please confirm you want to receive deal emails.' });

  const apiKey = process.env.BREVO_API_KEY;
  const listId = Number(process.env.BREVO_LIST_ID);
  const senderEmail = process.env.BREVO_SENDER_EMAIL;
  const senderName = process.env.BREVO_SENDER_NAME || 'Jolly Delivery';
  const siteUrl = process.env.SITE_URL || process.env.URL || '';
  if (!apiKey || !Number.isInteger(listId) || listId < 1 || !senderEmail) {
    return reply(503, { success: false, error: 'Email service is not configured. Set the Brevo environment variables in Netlify.' });
  }

  const headers = { 'api-key': apiKey, 'Content-Type': 'application/json', 'Accept': 'application/json' };
  try {
    // Avoid sending repeated welcome messages to someone already on this list.
    const existingResponse = await fetch(`${BREVO_API}/contacts/${encodeURIComponent(email)}`, { headers });
    if (existingResponse.ok) {
      const existing = await existingResponse.json();
      if (Array.isArray(existing.listIds) && existing.listIds.includes(listId)) {
        return reply(200, { success: true, alreadySubscribed: true, welcomeSent: false });
      }
    }

    const contact = { email, listIds: [listId], updateEnabled: true };
    if (firstName) contact.attributes = { FNAME: firstName };
    const contactResponse = await fetch(`${BREVO_API}/contacts`, {
      method: 'POST', headers, body: JSON.stringify(contact)
    });
    if (!contactResponse.ok) {
      const detail = await contactResponse.text();
      console.error('Brevo contact subscription failed:', contactResponse.status, detail.slice(0, 500));
      return reply(502, { success: false, error: 'We could not add you to the email list. Please try again later.' });
    }

    const greeting = firstName ? `Hi, ${escapeHtml(firstName)}` : 'Hi there';
    const safeSiteUrl = /^https:\/\//i.test(siteUrl) ? siteUrl : '';
    const button = safeSiteUrl
      ? `<p style="margin:28px 0"><a href="${escapeHtml(safeSiteUrl)}" style="display:inline-block;background:#e5243b;color:#fff;padding:14px 21px;border-radius:10px;text-decoration:none;font-weight:bold">Explore Jolly Delivery</a></p>`
      : '';
    const htmlContent = `<!doctype html><html><body style="margin:0;background:#f3f6fb;font-family:Arial,Helvetica,sans-serif;color:#182238"><div style="max-width:620px;margin:24px auto;background:#fff;border-radius:18px;overflow:hidden"><div style="background:#103b8f;padding:28px 30px;color:#fff"><div style="font-size:13px;letter-spacing:2px;font-weight:bold;text-transform:uppercase">Jolly Delivery</div><h1 style="font-size:30px;line-height:1.2;margin:15px 0 0">You're part of the community 🎉</h1></div><div style="padding:30px"><p style="font-size:17px;line-height:1.6">${greeting},</p><p style="font-size:16px;line-height:1.7">Thanks for joining the Jolly Delivery community. We're happy you're here.</p><p style="font-size:15px;line-height:1.8;color:#536078">Look out for carefully picked deals, new finds, and occasional exclusive offers from our team. We'll keep our emails useful, upbeat, and easy to browse.</p><div style="background:#fff0f2;border-left:4px solid #e5243b;padding:15px 17px;border-radius:8px;line-height:1.6"><strong>Your first stop:</strong> discover something useful, fun, or a little unexpected at a Jolly price.</div>${button}<p style="font-size:12px;line-height:1.7;color:#738097;border-top:1px solid #e3e8f1;padding-top:18px;margin-top:25px">You're receiving this welcome email because you signed up for Jolly Delivery deals. Promotional emails include an unsubscribe option. If you didn't sign up, you can ignore this message.</p></div></div></body></html>`;

    const mailResponse = await fetch(`${BREVO_API}/smtp/email`, {
      method: 'POST', headers,
      body: JSON.stringify({
        sender: { name: senderName, email: senderEmail },
        to: [{ email, ...(firstName ? { name: firstName } : {}) }],
        subject: "Welcome to the Jolly Delivery community 🎉",
        htmlContent
      })
    });
    if (!mailResponse.ok) {
      const detail = await mailResponse.text();
      console.error('Brevo welcome email failed:', mailResponse.status, detail.slice(0, 500));
      return reply(200, { success: true, welcomeSent: false, message: 'Your subscription was saved, but the welcome email could not be sent yet.' });
    }
    return reply(200, { success: true, welcomeSent: true });
  } catch (error) {
    console.error('Newsletter function error:', error && error.message ? error.message : 'unknown error');
    return reply(502, { success: false, error: 'The email service could not be reached. Please try again later.' });
  }
};
