const functions = require('firebase-functions');
const admin = require('firebase-admin');
const fetch = require('node-fetch');
const { GoogleAuth } = require('google-auth-library');

admin.initializeApp();
const db = admin.firestore();
const auth = new GoogleAuth({
  scopes: ['https://www.googleapis.com/auth/cloud-platform']
});

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

exports.generateProductSuggestions = functions.https.onCall(async (data, context) => {
  try {
    const { imageUrl } = data;
    
    if (!imageUrl) {
      throw new functions.https.HttpsError('invalid-argument', 'Image URL is required');
    }

    const client = await auth.getClient();
    const accessToken = await client.getAccessToken();

    const visionResponse = await fetch(
      'https://vision.googleapis.com/v1/images:annotate',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken.token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          requests: [{
            image: { source: { imageUri: imageUrl } },
            features: [
              { type: 'LABEL_DETECTION', maxResults: 10 },
              { type: 'OBJECT_LOCALIZATION', maxResults: 5 }
            ]
          }]
        })
      }
    );

    const visionData = await visionResponse.json();
    const labels = visionData.responses[0].labelAnnotations || [];
    const objects = visionData.responses[0].localizedObjectAnnotations || [];
    
    const detectedItems = [
      ...labels.map(l => l.description),
      ...objects.map(o => o.name)
    ].slice(0, 5);

    const primaryItem = detectedItems[0] || 'Product';
    
    const suggestions = {
      name: `Premium ${primaryItem}`,
      description: `High-quality ${primaryItem.toLowerCase()} perfect for everyday use. Features: ${detectedItems.slice(1, 3).join(', ')}.`,
      category: categorizeItem(primaryItem),
      tags: detectedItems.slice(0, 4),
      priceRange: estimatePrice(primaryItem)
    };

    return {
      success: true,
      detectedItems,
      suggestions
    };

  } catch (error) {
    console.error('AI suggestion error:', error);
    throw new functions.https.HttpsError('internal', 'Failed to generate suggestions');
  }
});

function categorizeItem(item) {
  const categories = {
    'Clothing': ['shirt', 'dress', 'pants', 'jacket', 'shoes'],
    'Electronics': ['phone', 'computer', 'camera', 'headphones'],
    'Home & Garden': ['furniture', 'plant', 'decoration', 'kitchen'],
    'Sports': ['ball', 'equipment', 'fitness', 'outdoor'],
    'Beauty': ['cosmetics', 'skincare', 'perfume', 'makeup']
  };

  for (const [category, keywords] of Object.entries(categories)) {
    if (keywords.some(keyword => item.toLowerCase().includes(keyword))) {
      return category;
    }
  }
  return 'General';
}

function estimatePrice(item) {
  const priceRanges = {
    'clothing': { min: 25, max: 150 },
    'electronics': { min: 50, max: 500 },
    'furniture': { min: 100, max: 800 },
    'beauty': { min: 15, max: 80 },
    'sports': { min: 30, max: 200 }
  };

  const itemLower = item.toLowerCase();
  for (const [category, range] of Object.entries(priceRanges)) {
    if (itemLower.includes(category)) {
      return range;
    }
  }
  return { min: 20, max: 100 };
}