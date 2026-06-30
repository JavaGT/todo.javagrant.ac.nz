# todo.javagrant.ac.nz

An interactive todo list hosted on the Mac Mini. Categories and items are
stored in SQLite and edited live in the browser; changes save automatically.

## Stack

- **Frontend** — `public/` (`index.html`, `app.js`, `style.css`). Vanilla JS, no build step.
- **Backend** — `server.js`. A zero-dependency Node server using the built-in
  `node:http` and `node:sqlite` modules (Node ≥ 22). Binds to `127.0.0.1:8090`.
- **Database** — SQLite at `data/todo.db` (WAL mode). Seeded from `seed-data.js`
  on first run with the original static list.
- **Reverse proxy** — nginx terminates TLS (the `*.javagrant.ac.nz` wildcard
  cert) and requires HTTP Basic auth against `vault.htpasswd`, the same
  `javaisawesome` login used by the other private subdomains.

## Layout

```
server.js                # API + static serving (127.0.0.1:8090)
seed-data.js             # first-run seed content
public/index.html        # page shell
public/app.js            # rendering + interactions
public/style.css         # the calm aesthetic
data/todo.db             # the database (gitignored)
ai.acnz.todo.plist       # launchd unit (symlinked into ~/Library/LaunchAgents)
```

## API

All mutating requests must send `X-Requested-With: fetch` (CSRF guard).

- `GET    /api/todos`            — full snapshot `{ categories, todos }`
- `POST   /api/todos`            — `{ category_id, text, note? }`
- `PATCH  /api/todos/:id`        — `{ text?, note?, done?, category_id?, position? }`
- `DELETE /api/todos/:id`
- `POST   /api/categories`       — `{ name }`
- `PATCH  /api/categories/:id`   — `{ name }`
- `DELETE /api/categories/:id`   — 409 if the category is not empty

## Operations

Run locally for development:
```sh
npm start                 # default port 8090, db at data/todo.db
TODO_PORT=8091 TODO_DB=/tmp/t.db npm start
```

The production service is managed by launchd (`ai.acnz.todo`), kept alive
automatically and started at login:
```sh
launchctl kickstart -k gui/$(id -u)/ai.acnz.todo   # restart
tail -f /tmp/todo.log                                # logs
```

nginx config lives at `/opt/homebrew/etc/nginx/servers/todo.javagrant.ac.nz.conf`.
DNS for the subdomain is handled by the `*.javagrant.ac.nz` catchall A record
(pointing at the Mac Mini).
