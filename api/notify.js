// api/notify.js
const crypto = require('crypto');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    console.log('[Notify] Invalid method:', req.method);
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }
 
  try {
    // Get raw body
    const rawBodyBuffer = await getRawBody(req);
    const rawBody = rawBodyBuffer.toString('utf8');
 
    // Extract relevant headers (case-insensitive lookup)
    const signatureHeader = req.headers['signature'] || req.headers['Signature'];
    const clientId = req.headers['client-id'] || req.headers['Client-Id'];
    const requestTime = req.headers['request-time'] || req.headers['Request-Time'];
 
    // Log everything for debugging
    console.log('[Notify] FULL INCOMING HEADERS:', JSON.stringify(req.headers, null, 2));
    console.log('[Notify] Raw body (first 500 chars):', rawBody.slice(0, 500));
    console.log('[Notify] Extracted client-id:', clientId || '(missing)');
    console.log('[Notify] Extracted request-time:', requestTime || '(missing)');
    console.log('[Notify] Signature header:', signatureHeader || '(missing)');
 
    if (!signatureHeader) {
      console.warn('[Notify] No signature header received — cannot validate');
      return res.status(200).json({ success: false, message: 'No signature received from A+' });
    }
    if (!clientId || !requestTime) {
      console.warn('[Notify] Missing A+ mandatory headers for callback signature check');
      return res.status(200).json({ success: false, message: 'Missing headers: client-id/response-time' });
    }
 
    // build string to sign
    let stringToSign = `POST ${req.url}\n`;
    stringToSign += `${clientId}.${requestTime}.${rawBody}`;
 
    console.log('[Notify] String to sign:\n' + stringToSign);
 
    // Parse signature header
    const sigParts = signatureHeader.split(',');
    const sigMap = sigParts.reduce((accummulator, part) => {
      const [name, value] = part.split('=');
      accummulator[name.trim()] = value.trim();
      return accummulator;
    }, {});
 
    const algorithm = sigMap.algorithm;
    const signatureToValidate = sigMap.signature;
 
    if (algorithm !== 'RSA256' || !signatureToValidate) {
      console.warn('[Notify] Invalid signature format:', signatureHeader);
      return res.status(200).json({ success: false, message: 'Invalid signature format' });
    }
 
    const PUBLIC_KEY = process.env.VODAPAY_PUBLIC_KEY;
    if (!PUBLIC_KEY) {
      console.error('[Notify] Public key not configured');
      return res.status(200).json({ success: false, message: 'Server misconfigured — public key not provided' });
    }
 
    // Verify
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
 
    // Parse payload
    let payload;
    try {
      payload = JSON.parse(rawBody);
    } catch (err) {
      console.error('[Notify] Invalid JSON payload:', err);
      return res.status(200).json({ success: false, message: 'Invalid JSON' });
    }
 
    console.log('[Notify] Valid webhook payload received:', JSON.stringify(payload, null, 2));
 
    // Extract useful fields
    const paymentId = payload.paymentId;
    const paymentRequestId = payload.paymentRequestId;
 
    if (!paymentId || !paymentRequestId) {
      console.warn('[Notify] Incomplete payload');
      return res.status(200).json({ success: true, message: 'Incomplete payload' });
    }
 
    console.log(`[Notify] Processing payment ${paymentId} → Payment Request ID: ${paymentRequestId}`);
 
    // response to A+
    const responseTime = new Date().toISOString().replace('Z','+02:00');
    const CLIENT_ID = '2020122653946739963336';
    const NOTIFY_URL = '/api/notify';
    const METHOD = 'POST';
 
    const successResponseBody = {
      result: {
        resultCode: "SUCCESS",
        resultStatus: "S",
        resultMessage: "success"
      }
    }
 
    // Generate signature
    const signRes = await fetch(`https://vodapaystore.vercel.app/api/vodapay/sign`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        method: METHOD,
        path: NOTIFY_URL,
        headers: {
          'Client-Id': CLIENT_ID,
          'Response-Time': responseTime
        },
        body: successResponseBody
      })
    });
 
    const signPayload = await signRes.json();
 
    const signature = signPayload.signature;
 
    console.log('Whole signature payload:\n', JSON.stringify(signPayload));
 
    if(!signature){
      console.warn('[Notify] Failed to generate response signature: \n', JSON.stringify(signRes))
    }
 
    console.log('[Notify] Signature: \n', signature)
 
    console.log('[Notify] Sending success response back to A+');
 
    res.setHeader('content-type', 'application/json');
    res.setHeader('client-id', CLIENT_ID);
    res.setHeader('response-time', responseTime);
    res.setHeader('signature', signature);
 
    console.log('[Notify] OUTGOING HEADERS:', res.getHeaders());
 
    return res.status(200).json(successResponseBody);
 
  } catch (err) {
    console.error('[Notify] Webhook error:', err);
    return res.status(200).json({ success: false, message: 'Processing error' });
  }
}
 

function getRawBody(req) {
  return new Promise((resolve, reject) => {
    let chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}
 