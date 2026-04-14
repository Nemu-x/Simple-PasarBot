# Suggested commit routine

## 1) Foundation

```bash
git add .gitignore package.json tsconfig.base.json .env.example deploy/ README.md
git commit -m "chore: bootstrap monorepo and docker baseline"
git push
```

## 2) Domain and DB

```bash
git add packages/domain packages/db
git commit -m "feat: add subscription domain and db schema"
git push
```

## 3) Integrations

```bash
git add packages/integrations/pasarguard packages/integrations/platega
git commit -m "feat: integrate pasarguard and platega adapters"
git push
```

## 4) App flows

```bash
git add apps/api apps/bot packages/worker apps/admin-web apps/miniapp docs
git commit -m "feat: implement mvp flows for bot cabinet admin and worker"
git push
```
