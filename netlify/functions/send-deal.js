const crypto = require('crypto');
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
function safeEqual(a, b) {
  const left = Buffer.from(String(a || ''));
  const right = Buffer.from(String(b || ''));
  return left.length === right.length && left.length > 0 && crypto.timingSafeEqual(left, right);
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return reply(204, {});
  if (event.httpMethod !== 'POST') return reply(405, { success: false, error: 'Use POST to send a deal campaign.' });

  const adminSecret = process.env.JOLLY_DEALS_ADMIN_TOKEN;
  const suppliedSecret = String(event.headers.authorization || event.headers.Authorization || '').replace(/^Bearer\s+/i, '').trim();
  if (!adminSecret || !safeEqual(suppliedSecret, adminSecret)) {
    return reply(401, { success: false, error: 'Admin authorization failed.' });
  }

  let input;
  try { input = JSON.parse(event.body || '{}'); } catch { return reply(400, { success: false, error: 'Invalid request body.' }); }
  const subject = String(input.subject || '').trim().slice(0, 120);
  const previewText = String(input.previewText || '').trim().slice(0, 180);
  const headline = String(input.headline || '').trim().slice(0, 130);
  const message = String(input.message || '').trim().slice(0, 1800);
  const buttonText = String(input.buttonText || 'Shop the deals').trim().slice(0, 50);
  let buttonUrl = '';
  try {
    const parsedUrl = new URL(String(input.buttonUrl || '').trim());
    if (parsedUrl.protocol !== 'https:') throw new Error('HTTPS required');
    buttonUrl = parsedUrl.href;
  } catch {
    return reply(400, { success: false, error: 'Use a valid HTTPS link for the deal button.' });
  }
  if (subject.length < 4 || headline.length < 3 || message.length < 10) {
    return reply(400, { success: false, error: 'Add a subject, headline, and a message of at least 10 characters.' });
  }

  const apiKey = process.env.BREVO_API_KEY;
  const listId = Number(process.env.BREVO_LIST_ID);
  const senderEmail = process.env.BREVO_SENDER_EMAIL;
  const senderName = process.env.BREVO_SENDER_NAME || 'Jolly Delivery';
  if (!apiKey || !Number.isInteger(listId) || listId < 1 || !senderEmail) {
    return reply(503, { success: false, error: 'Email service is not configured. Set the Brevo environment variables in Netlify.' });
  }

  const safeMessage = escapeHtml(message).replace(/\r?\n/g, '<br>');
  const htmlContent = `<!doctype html><html><body style="margin:0;background:#f3f6fb;font-family:Arial,Helvetica,sans-serif;color:#182238"><div style="max-width:640px;margin:24px auto;background:#fff;border-radius:18px;overflow:hidden"><div style="background:#103b8f;padding:27px 30px;color:#fff"><div style="font-size:13px;letter-spacing:2px;font-weight:bold;text-transform:uppercase">Jolly Delivery · Deal drop</div><h1 style="font-size:30px;line-height:1.2;margin:15px 0 0">${escapeHtml(headline)}</h1></div><div style="padding:30px"><p style="font-size:16px;line-height:1.85;color:#536078">${safeMessage}</p><p style="margin:28px 0"><a href="${escapeHtml(buttonUrl)}" style="display:inline-block;background:#e5243b;color:#fff;padding:14px 22px;border-radius:10px;text-decoration:none;font-weight:bold">${escapeHtml(buttonText)}</a></p><div style="height:1px;background:#e3e8f1;margin:26px 0"></div><p style="font-size:12px;line-height:1.7;color:#738097">You're receiving this because you opted in to Jolly Delivery deal emails. Offers and availability can change. <a href="{{ unsubscribe }}" style="color:#1455cc">Unsubscribe</a> from promotional emails.</p><p style="font-size:11px;color:#8994a8;margin-top:16px">© ${new Date().getFullYear()} Jolly Delivery</p></div></div></body></html>`;

  const headers = { 'api-key': apiKey, 'Content-Type': 'application/json', 'Accept': 'application/json' };
  try {
    const campaignName = `Jolly Delivery deal - ${new Date().toISOString()} - ${crypto.randomBytes(3).toString('hex')}`;
    const campaignResponse = await fetch(`${BREVO_API}/emailCampaigns`, {
      method: 'POST', headers,
      body: JSON.stringify({
        name: campaignName,
        sender: { name: senderName, email: senderEmail },
        subject,
        previewText,
        htmlContent,
        recipients: { listIds: [listId] },
        replyTo: process.env.BREVO_REPLY_TO || senderEmail
      })
    });
    const campaignData = await campaignResponse.json().catch(() => ({}));
    if (!campaignResponse.ok || !campaignData.id) {
      console.error('Brevo campaign creation failed:', campaignResponse.status, JSON.stringify(campaignData).slice(0, 500));
      return reply(502, { success: false, error: 'Brevo could not create the email campaign. Check your sender, list, and API settings.' });
    }

    const sendResponse = await fetch(`${BREVO_API}/emailCampaigns/${encodeURIComponent(campaignData.id)}/sendNow`, { method: 'POST', headers });
    if (!sendResponse.ok) {
      const detail = await sendResponse.text();
      console.error('Brevo send campaign failed:', sendResponse.status, detail.slice(0, 500));
      return reply(502, { success: false, campaignId: campaignData.id, error: 'The campaign was created but Brevo did not schedule it to send. Check the campaign in Brevo.' });
    }
    return reply(200, { success: true, campaignId: campaignData.id, message: 'Campaign submitted to Brevo for delivery.' });
  } catch (error) {
    console.error('Deal campaign function error:', error && error.message ? error.message : 'unknown error');
    return reply(502, { success: false, error: 'The email service could not be reached. Please try again later.' });
  }
};
