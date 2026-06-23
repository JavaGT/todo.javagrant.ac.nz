# todo.javagrant.ac.nz

A simple, non-interactive todo list served as a static site via GitHub Pages.

## Structure

- `index.html` — the entire site. One file, no build step, no JavaScript.
- `.nojekyll` — tells GitHub Pages to serve the file as-is (skip Jekyll).

## Deploy (GitHub Pages)

1. Create a repo named `todo.javagrant.ac.nz` on GitHub (or push this folder to an existing one).
2. Push these files to the `main` branch:
   ```sh
   git init
   git add .
   git commit -m "Simple static todo list"
   git branch -M main
   git remote add origin git@github.com:<you>/todo.javagrant.ac.nz.git
   git push -u origin main
   ```
3. In the repo: **Settings → Pages → Build and deployment → Source: Deploy from a branch**, branch `main`, folder `/root`.
4. Wait a minute. The site will be live at `https://<you>.github.io/todo.javagrant.ac.nz/`.

## Point the subdomain `todo.javagrant.ac.nz` at it

Assuming `javagrant.ac.nz` is managed in Cloudflare (or your DNS provider):

1. Add a **CNAME** record:
   - Name: `todo`
   - Target: `<you>.github.io`
   - Proxy: DNS-only (grey cloud) — or proxied if you want Cloudflare TLS.
2. In the GitHub repo: **Settings → Pages → Custom domain**, enter `todo.javagrant.ac.nz`, and **Save**. Tick **Enforce HTTPS**.
3. GitHub will issue a certificate and serve the site at `https://todo.javagrant.ac.nz`.

For the `tools.javagrant.ac.nz` pattern you already run, mirror whatever DNS/CNAME setup that uses — just swap the subdomain to `todo`.

## Updating the list

Open `index.html`, edit the `<li>` items inside each `<section>`, commit, and push. The site updates on the next Pages build (≈30–60s).

## Categories

1. house & renovation
2. furniture & appliances
3. projects to build
4. research / scope (PhD)
5. teaching & university
6. declutter & sell
7. life admin
