# React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Babel](https://babeljs.io/) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/) for Fast Refresh

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default tseslint.config([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...

      // Remove tseslint.configs.recommended and replace with this
      ...tseslint.configs.recommendedTypeChecked,
      // Alternatively, use this for stricter rules
      ...tseslint.configs.strictTypeChecked,
      // Optionally, add this for stylistic rules
      ...tseslint.configs.stylisticTypeChecked,

      // Other configs...
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```

You can also install [eslint-plugin-react-x](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from 'eslint-plugin-react-x'
import reactDom from 'eslint-plugin-react-dom'

export default tseslint.config([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...
      // Enable lint rules for React
      reactX.configs['recommended-typescript'],
      // Enable lint rules for React DOM
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```

## Stripe billing setup

Paid plans in the onboarding flow now redirect to a secure Stripe Checkout session. To enable this:

1. Install the backend dependency: `pip install stripe`.
2. Add the following environment variables (see `.env` for examples):
   - `STRIPE_SECRET_KEY` &mdash; your live or test secret key.
   - `STRIPE_PRICE_PRO` &mdash; the recurring price ID for the Pro subscription.
- `STRIPE_WEBHOOK_SECRET` &mdash; (optional) the signing secret from the Stripe CLI/dashboard for webhook verification.
- `STRIPE_SUCCESS_URL` / `STRIPE_CANCEL_URL` &mdash; fallback URLs used if the client does not send overrides.
- `STRIPE_PORTAL_RETURN_URL` &mdash; where users land after visiting the Stripe Billing Portal.
3. Run the latest database migration so workspaces have billing columns:
   ```bash
   cd backend
   alembic upgrade head
   ```
4. Point Stripe webhooks to the FastAPI endpoint (local example):
   ```bash
   stripe listen --forward-to http://localhost:8000/billing/webhook
   ```

Once configured, selecting the Pro plan during onboarding creates a checkout session via `POST /billing/checkout` and updates the workspace status when the webhook confirms the subscription.

## Workspace invite emails

Workspace admins can now trigger transactional invite emails directly from the Members panel. Invites are sent via [Resend](https://resend.com) and require the following backend environment variables:

- `RESEND_API_KEY` — your Resend API key (test or production).
- `INVITE_EMAIL_SENDER` — the verified sender email address Resend will use (for example `PM Assist <team@example.com>`).
- `WORKSPACE_APP_URL` (optional) — base URL for links included in the email. Defaults to `http://localhost:5175`.
- `INVITE_ACCEPT_URL` (optional) — override the entire link template. Must include a `{token}` placeholder, e.g. `https://app.example.com/accept?token={token}`.

When an invite is created, the API writes the invitation row, calls Resend, and only keeps the record if the email is successfully queued. Any configuration or delivery error returns an HTTP 5xx so the UI can prompt the admin to fix the issue instead of silently failing.
