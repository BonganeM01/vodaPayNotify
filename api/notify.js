// api/notify.js
const crypto = require('crypto');
 
async function handler(req, res) {
  console.log('[Notify] === WEBHOOK RECEIVED ===');
  console.log('[Notify] Method:', req.method);
  console.log('[Notify] URL:', req.url);
  console.log('[Notify] Headers:', JSON.stringify(req.headers, null, 2));
 
  if (req.method !== 'POST') {
    console.log('[Notify] Wrong method - rejecting');
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }
 
  try {
    // Get raw body
    let rawBody = '';
    if (req.body) {
      rawBody = Buffer.isBuffer(req.body) ? req.body.toString() : req.body;
    }
 
    console.log('[Notify] Raw body length:', rawBody.length);
    console.log('[Notify] Raw body preview:', rawBody.slice(0, 400));
 
    const signatureHeader = req.headers['signature'] || req.headers['Signature'];
    const clientId = req.headers['client-id'] || req.headers['Client-Id'];
    const requestTime = req.headers['request-time'] || req.headers['Request-Time'];
 
    console.log('[Notify] Signature:', signatureHeader ? 'PRESENT' : 'MISSING');
    console.log('[Notify] Client-Id:', clientId || 'MISSING');
    console.log('[Notify] Request-Time:', requestTime || 'MISSING');
 
    if (!signatureHeader) {
      console.warn('[Notify] No signature header - cannot validate');
      return res.status(200).json({ success: false, message: 'No signature' });
    }
 
    const stringToSign = `POST ${req.url}\n${clientId || ''}.${requestTime || ''}.${rawBody}`;
 
    console.log('[Notify] String to sign preview:', stringToSign.substring(0, 300) + '...');
 
    // Parse signature
    const sigParts = signatureHeader.split(',');
    const sigMap = sigParts.reduce((acc, part) => {
      const [k, v] = part.split('=');
      acc[k.trim()] = v.trim();
      return acc;
    }, {});
 
    const algorithm = sigMap.algorithm;
    const signatureToValidate = sigMap.signature;
 
    if (algorithm !== 'RSA256' || !signatureToValidate) {
      console.warn('[Notify] Invalid signature format');
      return res.status(200).json({ success: false, message: 'Invalid signature format' });
    }
 
    const PUBLIC_KEY = process.env.VODAPAY_PUBLIC_KEY;
    if (!PUBLIC_KEY) {
      console.error('[Notify] Public key not configured');
      return res.status(200).json({ success: false, message: 'Server misconfigured' });
    }
 
    const publicKeyObj = crypto.createPublicKey(PUBLIC_KEY, 'utf8');
    const verifier = crypto.createVerify('RSA-SHA256');
    verifier.write(stringToSign);
    verifier.end();
    const isValid = verifier.verify(publicKeyObj, signatureToValidate, 'base64');
 
    if (!isValid) {
      console.warn('[Notify] Signature verification FAILED');
      return res.status(200).json({ success: false, message: 'Invalid signature' });
    }
 
    console.log('[Notify] Signature is VALID ✓');
 
    let payload;
    try {
      payload = JSON.parse(rawBody);
    } catch (e) {
      console.error('[Notify] Invalid JSON payload:', e);
      return res.status(200).json({ success: false, message: 'Invalid JSON' });
    }
 
    console.log('[Notify] Valid webhook payload received');
 
    const paymentId = payload.paymentId;
    const paymentRequestId = payload.paymentRequestId;
 
    console.log(`[Notify] Processing payment ${paymentId || 'unknown'} → Request ID: ${paymentRequestId || 'unknown'}`);
 
    // Send success response back to A+
    const responseTime = new Date().toISOString().replace('Z', '+02:00');
    const CLIENT_ID = '2020122653946739963336';
 
    const successResponseBody = {
      result: {
        resultCode: "SUCCESS",
        resultStatus: "S",
        resultMessage: "success"
      }
    };
 
    console.log('[Notify] Sending success response back to A+');
 
    return res.status(200).json(successResponseBody);
 
  } catch (err) {
    console.error('[Notify] CRITICAL ERROR:', err.message);
    console.error(err.stack);
    return res.status(200).json({ success: false, message: 'Server error' });
  }
}
 
module.exports = handler;