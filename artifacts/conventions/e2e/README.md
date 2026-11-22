# Tests de bout en bout

Lancer les parcours avec :

```sh
pnpm --filter @workspace/conventions run test:e2e
```

La commande crée une base PostgreSQL temporaire, démarre l’API et l’interface en local, puis détruit la base et arrête les processus. Elle n’utilise pas la base de développement ou de production et n’envoie pas de courriel.

Sur une machine locale ou en CI, installer une fois Chromium pour Playwright :

```sh
pnpm --filter @workspace/conventions exec playwright install chromium
```

Dans l’environnement Replit, la commande utilise automatiquement le Chromium fourni par l’environnement. Pour sélectionner un autre exécutable, définir `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`.
