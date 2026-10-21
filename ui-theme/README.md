# eSignet login UI — modern minimal theme

A restyle of every eSignet login screen (mode selection, login-ID entry, OTP, password, consent,
error pages) without rebuilding the OIDC UI image:

| Piece | What it does | How it is applied |
|---|---|---|
| `theme-modern.yaml` | Server-side design theme consumed by the ThunderID sign-in components: Inter type, 12/20 px radii, soft shadows, slate text, a single warm accent (#F0652A), neutral canvas; light and dark schemes. | Copied to `esignet-service/data/themes/` and selected with `MOSIP_ESIGNET_THEME_ID=theme-modern` in `.env` (restart eSignet). |
| `variables.css` | The UI's runtime stylesheet: CSS variables for the shell (header, footer, card, buttons, consent, OTP) plus targeted overrides for the SDK's BEM classes (`thunderid-button__outline`, `thunderid-text-field__input`, …) and a fix for the 420 px card on phones. | Bind-mounted over `/usr/share/nginx/html/theme/variables.css` in the `oidc-ui` container by `run-ui.sh`. |
| `run-ui.sh` | Starts the `mosipdev/oidc-ui:develop-go` container with the mount, the Inter font URL and the host-gateway mapping to eSignet. | `./run-ui.sh` |
| `esignet-data/` | An overlay copy of `esignet-service/data` with `themes/theme-modern.yaml` added and the login flow left at its normal captcha size (the compact widget renders worse with the test key); the stylesheet scales the 303 px widget to the input width on phones. | `DATA_DIR="<repo>/ui-theme/esignet-data"` in `esignet-service/.env` (quote the path), restart eSignet. |

Notes

- hCaptcha's test site key always paints a red "for testing only" notice inside its iframe; a real (free) hCaptcha site key removes it. Nothing outside the iframe can style it.
- Browsers cache `variables.css`; after editing it, hard-reload (or clear the site cache) to see changes.
- Fonts load from Google Fonts; offline demos fall back to the system sans-serif.
- Nothing here changes the upstream repositories: the default theme stays untouched and the theme file
  is excluded from the eSignet checkout's git status.
