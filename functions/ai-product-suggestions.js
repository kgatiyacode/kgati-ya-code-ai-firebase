const functions = require('firebase-functions');
const { GoogleAuth } = require('google-auth-library');
const axios = require('axios');

// Initialize Google Auth for Vision API
const auth = new GoogleAuth({
  scopes: ['https://www.googleapis.com/auth/cloud-platform']
});

exports.generateProductSuggestions = functions.https.onCall(async (data, context) => {
  try {
    const { imageUrl } = data;
    
    if (!imageUrl) {
      throw new functions.https.HttpsError('invalid-argument', 'Image URL is required');
    }

    // Get access token for Vision API
    const client = await auth.getClient();
    const accessToken = await client.getAccessToken();

    // Call Vision API for label detection
    const visionResponse = await axios.post(
      'https://vision.googleapis.com/v1/images:annotate',
      {
        requests: [{
          image: { source: { imageUri: imageUrl } },
          features: [
            { type: 'LABEL_DETECTION', maxResults: 10 },
            { type: 'OBJECT_LOCALIZATION', maxResults: 5 }
          ]
        }]
      },
      {
        headers: {
          'Authorization': `Bearer ${accessToken.token}`,
          'Content-Type': 'application/json'
        }
      }
    );

    const labels = visionResponse.data.responses[0].labelAnnotations || [];
    const objects = visionResponse.data.responses[0].localizedObjectAnnotations || [];
    
    // Extract relevant information
    const detectedItems = [
      ...labels.map(l => l.description),
      ...objects.map(o => o.name)
    ].slice(0, 5);

    // Generate suggestions using a simple rule-based approach
    // In production, you'd use OpenAI or another LLM here
    const suggestions = generateSuggestions(detectedItems);

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

function generateSuggestions(items) {
  const primaryItem = items[0] || 'Product';
  
  // Simple rule-based suggestions (replace with LLM in production)
  const suggestions = {
    name: `Premium ${primaryItem}`,
    description: `High-quality ${primaryItem.toLowerCase()} perfect for everyday use. ${items.slice(1, 3).join(', ')} features included.`,
    category: categorizeItem(primaryItem),
    tags: items.slice(0, 4),
    priceRange: estimatePrice(primaryItem)
  };

  return suggestions;
}

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