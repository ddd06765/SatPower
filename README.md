# SatPower — Web Edition

Portage web (Flask) de l'application Tkinter **SatPower**. Toute la
mécanique orbitale (période orbitale, éclipses LEO/MEO/GEO, angle bêta,
budget énergétique de mission) est reprise à l'identique côté serveur
en Python. La simulation SADA temps réel tourne côté navigateur en
JavaScript pour rester fluide, avec la même logique de modes
(Nominal / Positionnement / Protection / Maintien).

## Installation

```bash
cd satpower_web
python3 -m venv venv
source venv/bin/activate        # Windows : venv\Scripts\activate
pip install -r requirements.txt
```

## Lancement

```bash
python3 app.py
```

Puis ouvrez **http://127.0.0.1:5000** dans votre navigateur.

## Structure du projet

```
satpower_web/
├── app.py                  # Serveur Flask : routes, auth, moteur orbital, API
├── requirements.txt
├── satpower_data.json      # Base "utilisateurs" (créée automatiquement)
├── templates/
│   ├── landing.html         # Page d'accueil + connexion/inscription
│   └── dashboard.html       # Tableau de bord (onglets SADA / Mission)
└── static/
    ├── css/style.css        # Thème sombre orange/cyan (identique à l'original)
    └── js/
        ├── sada.js           # Simulation SADA temps réel + graphique canvas
        └── mission.js        # Appels API + graphique d'énergie cumulée
```

## Ce qui a changé par rapport à la version Tkinter

- **Interface** : fenêtres/widgets Tkinter → pages HTML/CSS, rendu dans le navigateur.
- **Authentification** : formulaire AJAX (`fetch`) vers `/api/login` et `/api/signup`,
  session Flask (cookie) au lieu d'une variable Python en mémoire.
- **Graphiques** : `tk.Canvas` → `<canvas>` HTML5 avec le même style de tracé
  (grille, dégradés de couleur par mode, courbes lissées).
- **Simulation SADA** : la boucle `after(500, ...)` devient un `setTimeout` JS ;
  la physique (modes, perturbations, correction IA) est identique.
- **Mission Planner** : les calculs restent en Python côté serveur (endpoint
  `POST /api/mission/simulate`) ; le frontend n'affiche que le résultat.
- **Persistance** : toujours un fichier JSON (`satpower_data.json`), inchangé
  dans son format `{"users": {email: {"nom":..., "password":...}}}`.

## Sécurité (déjà en place)

- Mots de passe hashés avec `werkzeug.security` (jamais stockés en clair).
- Serveur de production `gunicorn` (voir `Procfile`), Flask ne sert que le dev.
- Clé de session (`SATPOWER_SECRET`) lue depuis une variable d'environnement,
  avec refus de démarrer sur Render si elle n'est pas définie.

## Déploiement public sur Render (gratuit)

1. **Créer un dépôt GitHub** et y pousser ce dossier :
   ```bash
   cd satpower_web
   git init
   git add .
   git commit -m "SatPower web"
   git branch -M main
   git remote add origin https://github.com/VOTRE_UTILISATEUR/satpower.git
   git push -u origin main
   ```

2. **Sur [render.com](https://render.com)** : créer un compte (gratuit),
   puis **New +** → **Blueprint**, sélectionner le dépôt GitHub. Render lit
   automatiquement `render.yaml` et configure tout (build, démarrage,
   variable secrète générée, disque persistant pour les comptes).

   *(Si vous préférez le faire à la main plutôt que via le Blueprint : New +
   → Web Service → sélectionnez le repo → Build Command
   `pip install -r requirements.txt` → Start Command `gunicorn app:app`.)*

3. Cliquer **Apply** / **Create Web Service**. Le premier déploiement prend
   1 à 3 minutes.

4. Render fournit une URL publique du type
   `https://satpower.onrender.com` — c'est celle-ci que vous pouvez partager.

### À savoir avec le plan gratuit Render
- Le service "s'endort" après ~15 minutes d'inactivité ; la première visite
  après une pause peut prendre 30-50 secondes le temps qu'il se réveille.
- Le disque persistant (1 Go, gratuit) garde les comptes utilisateurs même
  après une pause ou un redéploiement.
- Pour un usage plus intensif (pas d'endormissement), il faudra passer à un
  plan payant Render.

### Mettre à jour l'app après un changement
```bash
git add .
git commit -m "Description du changement"
git push
```
Render redéploie automatiquement à chaque `push` sur `main`.
