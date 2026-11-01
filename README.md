# ASRO Homepage Concept — Particle Experience

ASRO公式ホームページの次世代リニューアル試作。**本番サイトとは独立**したデモです。

## Demo

GitHub Pages: https://oimo0.github.io/HomePagetest/

## Experience

1. ページに入ると、ASROのシンボル＋ワードマークを無数の粒子が形成。
2. 少しずつ下へスクロールすると、粒子が左右の端へ分かれる。
3. 中央に「明日を、つくる。」が現れ、背景が暗色から明色に変化。
4. スクロールを戻すと、粒子が再びロゴの形へ戻る。
5. ASROの紹介・事業カード・ビジョンを表示。

## Technologies

- HTML, CSS, Vanilla JavaScript
- WebGL2: GLSL vertex/fragment shaders, GPU point particles
- Supplied ASRO logo converted to a minimal SVG vector mask. Particles are sampled from its non-transparent pixels.
- Scroll-scrubbed animation and mobile layout; no runtime framework dependencies.
- Reduced-motion preference and static-logo fallback for non-WebGL browsers.

## Local preview

```sh
python3 -m http.server 8080
# Open http://localhost:8080/
```

The demo loads the logo image dynamically, so use an HTTP server instead of `file://`.

## GitHub Pages

The workflow at `.github/workflows/pages.yml` deploys on pushes to `main`. If deployment is not yet active:

1. Open **Settings → Pages** in this repository.
2. Select **Build and deployment → Source: GitHub Actions**.
3. Open **Actions → Publish ASRO Homepage Concept**, and **Run workflow** (or push a new commit).
4. Check the deployment status before treating the public link as live.

No changes are made to the live `asro.jp` domain.

## Notes

This is a prototype, not a production redesign. Service explanations are conceptual. Confirm final copy, brand wording, pages, performance and accessibility before publishing on the main site.
