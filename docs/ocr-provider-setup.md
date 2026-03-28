# OCR provider setup (production-prep scaffold)

This project uses an OCR provider abstraction with **safe defaults**:

- Default provider: `mock`
- External OCR dependencies: **not required** for local/dev usage
- Parse failures: handled gracefully (transaction can still be reviewed/corrected manually)

## Environment variables

```bash
# .env
OCR_PROVIDER=openai
OCR_API_KEY=sk-...
# Optional: override endpoint for OpenAI-compatible proxy
OCR_ENDPOINT=
```

`OCR_PROVIDER=openai` uses `OCR_API_KEY` first, then falls back to `OPENAI_API_KEY` if present.

Supported `OCR_PROVIDER` values in this scaffold:

- `mock`
- `openai` (active lightweight real OCR option)
- `gemini` (async queue stub)
- `google-document-ai` (placeholder)
- `aws-textract` (placeholder)
- `azure-document-intelligence` (placeholder)

Unknown values automatically fall back to `mock`.

## Runtime behavior

1. `getDocumentParser()` selects provider from env.
2. Provider output is normalized:
   - confidence values clamped to `[0, 1]`
   - `overall` confidence recomputed from weighted field scores
3. Parser errors are converted into reviewable OCR results instead of throwing:
   - `reviewNeeded=true`
   - `reviewReasons` includes provider error details

This avoids hard failures in upload flow while keeping operator visibility on OCR quality.

## Enabling a real provider later

Current non-mock providers are placeholders to keep this build dependency-free.

To enable a production OCR backend:

1. Implement a provider adapter in `src/lib/parser.ts` (or split providers into dedicated files).
2. Map the provider in `getProviderFromEnv()`.
3. Return `fields + confidence` in the raw provider format expected by the normalization layer.
4. Add tests for:
   - successful extraction
   - malformed provider payloads
   - provider/network errors
5. Set env values in deployment:
   - `OCR_PROVIDER=<your-provider>`
   - `OCR_API_KEY=...`
   - optionally `OCR_ENDPOINT=...`

Because normalization/error handling is centralized, new providers can be integrated without changing upload route behavior.
