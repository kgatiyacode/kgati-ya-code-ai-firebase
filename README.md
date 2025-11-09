# Code ya Kgati - AI Firebase Functions

AI microservice for the Code ya Kgati e-commerce platform.

## Setup

1. Install Firebase CLI:
```bash
npm install -g firebase-tools
```

2. Login to Firebase:
```bash
firebase login
```

3. Initialize project:
```bash
firebase init
```

4. Install dependencies:
```bash
cd functions
npm install
```

5. Set configuration:
```bash
firebase functions:config:set auth.api_key="your_secret_key"
firebase functions:config:set ai.provider.key="your_openai_key"
```

6. Deploy:
```bash
firebase deploy --only functions
```

## Endpoints

- `POST /generate` - AI text generation with caching

## Environment Variables

- `auth.api_key` - Secret key for API authentication
- `ai.provider.key` - OpenAI API key