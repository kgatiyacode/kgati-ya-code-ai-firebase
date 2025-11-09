const functions = require('firebase-functions');
const admin = require('firebase-admin');
const fetch = require('node-fetch');

admin.initializeApp();
const db = admin.firestore();

exports.generate = functions.https.onRequest(async (req, res) => {
  const apiKey = req.headers['x-api-key'];
  if (apiKey !== functions.config().auth.api_key) {
    return res.status(403).send({ error: 'forbidden' });
  }

  const prompt = req.body.prompt;
  const cacheKey = require('crypto').createHash('sha1').update(prompt).digest('hex');

  // Check cache
  const doc = await db.collection('ai_cache').doc(cacheKey).get();
  if (doc.exists) {
    return res.json({ cached: true, response: doc.data().response });
  }

  // Call OpenAI
  const aiRes = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${functions.config().ai.provider.key}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }]
    })
  });

  const payload = await aiRes.json();
  const response = payload?.choices?.[0]?.message?.content ?? 'Error';

  // Cache result
  await db.collection('ai_cache').doc(cacheKey).set({
    prompt, response, createdAt: admin.firestore.FieldValue.serverTimestamp()
  });

  res.json({ cached: false, response });
});