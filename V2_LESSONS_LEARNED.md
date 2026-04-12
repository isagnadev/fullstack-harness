# Retour d'experience V1 — Points d'attention pour la V2

## 1. Claude Code SDK — Contraintes critiques

### 1.1 Le canal stdin est bidirectionnel

Le SDK utilise stdin pour deux choses simultanement :
- **Envoyer le prompt** (messages utilisateur)
- **Repondre au protocole de controle** (permissions `can_use_tool`, appels MCP)

Quand `can_use_tool` est defini, le SDK exige un prompt `AsyncIterable[dict]` (mode streaming). Le probleme : des que l'iterateur est epuise, le SDK ferme stdin (`end_input`), ce qui coupe aussi le canal de controle. L'agent ne peut plus utiliser d'outils.

**Solution V1** : bloquer l'iterateur avec un `anyio.Event` jusqu'a reception du `ResultMessage`, puis laisser stdin se fermer.

**Recommandation V2** : encapsuler cette logique dans le runner d'agent des le depart. Ne jamais laisser un `AsyncIterator` de prompt se terminer avant la fin de l'agent.

### 1.2 Compatibilite CLI / SDK

Le SDK Python (v0.0.25) ne reconnait pas tous les types de messages du CLI (v2.1.92+). Exemple : `rate_limit_event` provoque un `MessageParseError` qui **tue l'async generator** en plein vol — impossible de reprendre l'iteration.

**Solution V1** : monkey-patch de `parse_message` dans le module SDK **et** dans sa copie importee par `_internal.client` (le `from .module import func` de Python copie la reference).

**Recommandation V2** :
- Toujours wrapper le parser pour absorber les types inconnus
- Patcher les deux references (module source + module consommateur)
- Surveiller les mises a jour du SDK — ce patch devra etre retire quand le SDK gerera ces types nativement
- Ecrire un test qui verifie que le patch est actif au demarrage

### 1.3 Le CLI en mode streaming ne se termine pas seul

En mode `--input-format stream-json`, le CLI attend la fermeture de stdin pour terminer. Si stdin reste ouvert indefiniment, le processus ne rend jamais la main, meme apres avoir fini son travail.

**Recommandation V2** : le signal de fin doit etre explicite — fermer stdin des reception du `ResultMessage`.

## 2. Resilience et reprise

### 2.1 Sauvegarder le progres de maniere granulaire

En V1, `progress.json` n'est sauvegarde qu'apres un sprint complet (contrat + build + QA). Si le process crash pendant le QA, le sprint entier est perdu et doit etre relance depuis la negotiation de contrat, meme si le build etait termine.

**Recommandation V2** : sauvegarder l'etat a chaque sous-etape :
- Apres negotiation de contrat → `state: "contracted"`
- Apres build → `state: "built"`
- Apres QA → `state: "evaluated"`

Cela permet de reprendre au bon point sans re-executer les etapes reussies.

### 2.2 La reprise doit etre native, pas ajoutee apres coup

En V1, la reprise a ete greffeee sur un orchestrateur qui n'etait pas concu pour. Le `main()` executait les 3 phases en sequence sans verifier l'etat existant.

**Recommandation V2** : concevoir l'orchestrateur comme une **machine a etats** des le depart. Chaque phase/sous-etape lit l'etat courant et decide si elle doit s'executer ou etre skippeee.

### 2.3 Le coût des runs echoues est perdu

Quand un agent crash, `run_agent` retourne `cost_usd=0.0` car le `ResultMessage` n'a jamais ete recu. Mais le modele a bien ete appele et facture.

**Recommandation V2** : tracker le cout cote orchestrateur (duree * cout estime par turn) comme fallback quand le SDK ne retourne pas de cout.

## 3. Observabilite

### 3.1 Les exceptions silencieuses

En V1, le process mourrait sans aucun log quand une exception non prevue remontait (ex: `ExceptionGroup` d'anyio qui est un `BaseException`, pas un `Exception`).

**Recommandation V2** :
- Try/except `BaseException` au niveau global avec logging
- Mais laisser `KeyboardInterrupt` remonter pour permettre l'arret volontaire
- Logger la stacktrace **et** sauvegarder le progres avant de mourir

### 3.2 Le debug stderr du CLI est trop verbeux

Le flag `debug-to-stderr` du CLI envoie **tous** les logs debug (requetes API, tokens, hooks, LSP, etc.) — pas de filtrage par niveau.

**Recommandation V2** : rediriger stderr vers un fichier rotatif (`debug_{agent}_{sprint}.log`) plutot que le terminal. Ne l'activer qu'en mode debug explicite.

### 3.3 Pas de visibilite temps reel sur l'agent en cours

L'orchestrateur ne loggue rien entre le lancement d'un agent et sa fin. Un agent peut tourner 30+ minutes sans feedback.

**Recommandation V2** : streamer les `AssistantMessage` en temps reel vers un log ou un callback, pour voir ce que l'agent fait pendant son execution.

## 4. Playwright / Tests navigateur

### 4.1 Nom du package

Le package est `@playwright/mcp`, **pas** `@anthropic-ai/playwright-mcp` (qui n'existe pas sur npm).

### 4.2 Mode headless obligatoire

Par defaut, Playwright ouvre un Chrome **visible**. Problemes constates :
- Fenetres Chrome intempestives pendant l'execution
- Conflit avec le Chrome de l'utilisateur (flag `--no-sandbox`, fermeture du Chrome principal)
- Instabilite en mode headed sur un poste de dev

**Recommandation V2** : toujours passer `--headless`. Ajouter dans la config :
```yaml
qa:
  playwright:
    headless: true
```

### 4.3 Playwright consomme beaucoup de turns

Chaque action Playwright (navigate, click, screenshot, fill) consomme un turn. L'evaluateur avec Playwright peut facilement atteindre sa limite de turns (60) avant de finir le QA.

**Recommandation V2** :
- Augmenter `max_turns` pour l'evaluateur en mode QA (80-100)
- Ou separer le QA en deux passes : tests programmatiques (curl, unit tests) puis tests navigateur
- Limiter le nombre de screenshots a l'essentiel

## 5. Architecture de l'orchestrateur

### 5.1 Le sprint est l'unite atomique — trop grosse

Un sprint = contrat + build + QA. Si le QA echoue ou crash, tout le sprint est relance. Sur les sprints avances (5+), le build seul peut prendre 20-30 minutes.

**Recommandation V2** : decouper le sprint en sous-etapes persistees independamment (cf. 2.1).

### 5.2 Le budget ne compte pas les runs echoues

Les runs qui crashent retournent `cost_usd=0.0`, donc le budget affiché est sous-estime par rapport au cout reel.

**Recommandation V2** : estimer le cout meme en cas d'echec (cf. 2.3).

### 5.3 Le versioning est incomplet

- Seul le Builder commite (son code)
- Les artefacts QA (rapports, screenshots, contract reviews) n'etaient pas commites
- `progress.json` et `claude-progress.txt` non commites

**Recommandation V2** : l'orchestrateur devrait commiter les artefacts de coordination apres chaque sous-etape, pas deleguer ca au Builder via son prompt.

## 6. Environnement d'execution

### 6.1 Dependances systeme

- `pip` n'est pas installe par defaut sur Ubuntu moderne
- PEP 668 bloque `pip install` sans venv — un venv est necessaire
- `python` n'existe pas, c'est `python3`
- Playwright necessite `npx` (donc Node.js)

**Recommandation V2** : script de setup qui verifie et installe les prerequis, ou Docker.

### 6.2 Le CLI Claude doit etre installe et authentifie

Le SDK `claude-code-sdk` est un wrapper autour du CLI `claude`. Il faut :
- Le CLI installe (`npm install -g @anthropic-ai/claude-code`)
- Une session authentifiee (`claude auth login` ou plan Pro/Max actif)

**Recommandation V2** : verifier au demarrage que le CLI est present, authentifie, et que le modele demande est accessible.

## 7. Couts constates (ordre de grandeur)

| Phase | Cout |
|-------|------|
| Planning (1 agent, 15 turns) | ~$1 |
| Sprint simple (contrat + build + QA) | ~$5-8 |
| Sprint complexe (avec retries QA) | ~$10-15 |
| QA avec Playwright | ~$5-10 par passe |
| Projet complet (10 sprints) | ~$50-100 |

Le QA est la phase la plus couteuse. Les retries multiplient les couts.

## 9. Decouvertes supplementaires (apres quelques jours d'utilisation)

### 9.1 Le CLI exit 1 sur max_turns est trompeur

Quand un agent atteint `max_turns`, le CLI quitte avec exit code 1 **sans emettre de `ResultMessage`**. Du point de vue du SDK, ca ressemble a un crash generique ou a un rate limit. Impossible de distinguer depuis Python.

**Symptome V1** : `Exception: Command failed with exit code 1 (exit code: 1) — Check stderr output for details`. On a passe plusieurs jours a croire a un rate limit avant de trouver la vraie cause.

**Recommandation V2** :
- Toujours activer `debug-to-stderr` vers un fichier pour pouvoir diagnostiquer
- Compter les API requests avec `grep "API REQUEST.*source=sdk"` dans le log debug — si ca matche exactement `max_turns`, c'est la cause
- Augmenter genereusement `max_turns` des le depart, surtout pour l'evaluateur (150+ pour QA avec Playwright)
- Idealement, detecter ce cas cote orchestrateur et retourner une erreur explicite au lieu d'une exception generique

### 9.2 Cleanup des MCP servers stdio est tres lent

Le serveur Playwright MCP ne reagit pas aux signaux de shutdown normaux :
- SIGINT → aucune reaction
- SIGTERM → aucune reaction
- SIGKILL → ferme enfin

**Duree constatee** : 355 a 509 secondes (~6 a 8 minutes) entre le debut du shutdown et la fermeture complete. Pendant ce temps le CLI reste actif, le `ResultMessage` n'est pas envoye, et l'orchestrateur croit que l'agent tourne encore.

**Recommandation V2** :
- Utiliser un timeout idle dans le runner (cf. 9.3) pour detecter ce cas
- Envisager de kill directement le subprocess Claude si le shutdown traine trop
- Ou ne pas utiliser Playwright MCP en mode stdio — chercher une alternative HTTP/SSE

### 9.3 Le timeout idle dans le wrapper de prompt

Le stream de prompt (`AsyncIterator[dict]`) doit :
- Rester ouvert pendant que l'agent travaille (sinon stdin se ferme → canal de controle coupe)
- Se fermer quand l'agent a fini ET quand l'agent est bloque

**Solution V1** : polling avec `anyio.move_on_after` toutes les 30s, avec un timestamp `last_activity` partage (liste mutable) mis a jour par `run_agent` a chaque message recu. Si plus de 120s sans message, on ferme le stream.

**Important** : on ne peut PAS utiliser `anyio.fail_after` autour du `__anext__()` du generator du SDK — ca provoque `RuntimeError: Attempted to exit a cancel scope that isn't the current tasks's current cancel scope`. Les cancel scopes anyio ne peuvent pas traverser les task groups internes du SDK.

**Recommandation V2** : utiliser un mecanisme de timeout qui ne repose **pas** sur les cancel scopes pour wrapper le generator du SDK. Preferer le polling avec un event + timestamp partage.

### 9.4 Les sous-agents internes du CLI utilisent Haiku

Le CLI Opus spawn des sous-agents `Explore` (et autres) qui tournent en `claude-haiku-4-5-20251001`, pas en Opus. Visible dans les logs debug :
```
Tool search disabled for model 'claude-haiku-4-5-20251001': model does not support tool_reference blocks
```

**Impact** : la facturation est mixte (Opus + Haiku), et le comportement de ces sous-agents differe du modele principal. A prendre en compte dans le calcul de coûts.

### 9.5 MCP servers globaux (Notion, Atlassian, Figma) parasitent

Meme si l'agent n'a pas ces tools dans son `allowed_tools`, le CLI maintient des connexions aux MCP servers configures globalement dans `~/.claude/settings.json`. Ces connexions :
- Sont etablies au demarrage (ajoute latence)
- Timeout apres 507s avec `AbortError: The operation was aborted`
- Spamment les logs debug
- Potentiellement echouent (codes 403, 400) si les credentials manquent

**Recommandation V2** :
- Lancer le CLI avec un `settings.json` minimal specifique au harnais pour eviter d'heriter des MCP servers globaux de l'utilisateur
- Ou utiliser la variable d'environnement pour forcer un chemin de config vide

### 9.6 Limite de buffer JSON hard-codee (1 MB)

Le SDK a une constante `_MAX_BUFFER_SIZE = 1024 * 1024` pour parser les messages JSON du CLI. Quand le Builder produit de gros fichiers en une seule reponse (ou que les tool results sont volumineux), le parser crash avec :
```
JSON message exceeded maximum buffer size of 1048576 bytes
```

**Solution V1** : monkey-patch de `claude_code_sdk._internal.transport.subprocess_cli._MAX_BUFFER_SIZE` a 10 MB.

**Recommandation V2** : le SDK devrait exposer cette limite en option. En attendant, toujours appliquer le patch.

### 9.7 progress.json ne sauve qu'a la fin du sprint

Les runs qui crashent mid-sprint perdent leur cout et leur etat (cf. 2.1 et 2.3). Pire : le cout affiche est faux, car les runs echoues retournent `cost_usd=0.0`.

**Recommandation V2** : sauvegarder `progress.json` a chaque `add_run`, pas seulement a la fin du sprint.

### 9.8 Debug stderr : jamais vers le terminal

`debug-to-stderr` flood le terminal avec des milliers de lignes par minute. Meme pour du debug ponctuel, toujours rediriger vers un fichier.

**Recommandation V2** : activer par defaut vers `cli_debug.log` dans le workspace avec des headers de separation par agent invoke. Format utile :
```
===== <timestamp> agent=<type> sprint=<N> phase=<name> =====
```

### 9.9 Les Chrome fantomes apres un crash

Quand le CLI plante pendant Playwright, les processus Chrome enfants restent souvent orphelins. Consomment la RAM et les handles reseau.

**Recommandation V2** : au demarrage de chaque run, kill tous les Chrome/Playwright residuels avec un `pkill -f playwright-mcp` ou equivalent.

---

### 9.10 Config rechargee uniquement au demarrage de l'orchestrateur

`config.yaml` est lu une fois dans `main()` via `load_config()`. Tout changement de config pendant qu'un run est en cours **ne prend pas effet** — le run continue avec les valeurs chargees au demarrage. Constate : le Builder du sprint 13 a tourne avec `max_turns: 100` alors que le fichier disait 180, parce que l'orchestrateur avait demarre avant le changement.

**Recommandation V2** : soit relire la config a chaque sprint, soit logguer les valeurs effectives au demarrage de chaque agent (pour que l'utilisateur voie directement ce qui est en vigueur). Ideal : mettre les limites **par sprint** dans le product_spec.json, genere par le Planner en fonction de la complexite.

### 9.11 Cascade d'echecs quand le Builder atteint max_turns

Scenario concret observe sur le sprint 13 (5 features, dont mode sombre et personnalisation catégories):

1. **Builder attempt 1** : hit max_turns (100) en plein milieu du sprint → CLI exit sans avoir cree les fichiers des dernieres features (notifications, settings, providers, layout modifies)
2. **Evaluator QA attempt 1** : cherche les directories attendues via `rg` → erreurs `file does not exist` en cascade → sort prematurement (37 turns) **sans ecrire `qa_report_N.json`**
3. **Orchestrateur** : voit qu'il n'y a pas de rapport → retry attempt 2
4. **Builder attempt 2** : meme config, meme max_turns → meme echec
5. **Boucle infinie** jusqu'a epuisement des retries (3) → sprint marque failed

**Le piege** : l'evaluateur qui sort tot sans rapport ressemble a un crash, mais en realite il fait son travail en constatant que le build est incomplet. Il n'a juste pas de mecanisme propre pour signaler "je n'ai rien a tester, le build est vide".

**Recommandation V2** :
- L'evaluateur devrait TOUJOURS ecrire un `qa_report_N.json` meme quand il abandonne — avec `verdict: FAIL` et des bugs explicites
- L'orchestrateur devrait detecter le cas "builder a probablement hit max_turns" (nombre de turns ~= max_turns) et logguer une recommandation explicite d'augmenter la limite
- Dimensionner `max_turns` du builder en fonction du nombre de features du sprint : ~20 turns par feature (lecture + write + tests + commit) + 20 turns d'overhead. Pour 5 features, compter 120 minimum.

### 9.12 Persistance du code entre tentatives d'un meme sprint

**Probleme constate** : rien ne nettoie le workspace entre deux tentatives du Builder sur un meme sprint. Les fichiers ecrits, les commits git, les modifications de `feature_list.json` et `claude-progress.txt` d'une tentative echouee survivent a la tentative suivante.

**Consequences** :
- La 2e tentative herite des fichiers partiels ou buggues de la 1ere
- Les commits git peuvent etre incoherents (ex: "feat F032" alors que F032 n'est implementee qu'a moitie)
- Le QA inter-tentative voit un melange de travail issu de plusieurs tentatives
- Impossible de reproduire une tentative "propre" pour debugger
- Le Builder ne peut pas repartir sur de bonnes bases — il herite des mauvais choix precedents

**Effet observe** : le sprint 13 a pu aboutir en 3 tentatives precisement parce que les tentatives 1 et 2 avaient deja fait une partie du travail. La 3e a seulement pris 55 turns (vs ~100 pour une implementation complete). C'est efficace en apparence mais cache des incoherences potentielles.

**Approche visee pour V2** : repartir d'un **etat propre** entre chaque tentative d'un meme sprint. L'idee est que chaque tentative doit pouvoir etre consideree independamment, avec un etat initial reproductible.

Pistes a explorer :
- `git reset --hard` vers le commit precedant le debut du sprint + suppression des fichiers non-trackes
- Travailler sur une branche dediee par tentative, merge si succes, drop si echec
- Snapshot du workspace avant sprint, restore entre tentatives

La question reste ouverte — l'approche clean-state peut gaspiller du travail utile, et certains cas (ex: reprise apres crash infra) meritent peut-etre de conserver l'etat.

### 9.13 progress.json pendant un sprint en cours est trompeur

`progress.json` n'est sauvegarde que apres un sprint complet. Si le process tourne et qu'on lit `progress.json` a un instant T, on voit l'etat au dernier sprint complete, pas l'etat reel en memoire de l'orchestrateur. Les runs du sprint courant (contract, build, QA) existent dans la memoire du process mais pas sur disque.

**Implications** :
- Impossible d'analyser en live le travail en cours sans inspecter les fichiers du workspace directement (`sprint_contract_N.json`, `qa_report_N.json`, `git log`)
- Si le process crash, tous les runs du sprint courant sont perdus (cout inclus)

**Recommandation V2** : sauvegarder `progress.json` apres chaque `add_run`, pas seulement a la fin du sprint. Permet aussi un monitoring externe fiable.

### 9.14 Confinement workspace incomplet — contamination inter-projets

**Probleme constate** : sur le projet tarificateur-ia-build, les agents Builder et Evaluator ont derive vers le projet voisin mon-porte-monnaie a partir du sprint 7. Trois vecteurs identifies :

1. **Bash `cd` hors workspace** : `security.py` ne validait que le **premier** binaire d'une commande chainee. `cd ../mon-porte-monnaie/backend && python3 -m uvicorn ...` passait car `_extract_binary()` ne voyait que `cd` (allowliste). Le second binaire et le path cible n'etaient jamais verifies.

2. **Read/Glob/Grep sans confinement** : seuls Write et Edit etaient confines au workspace. Les agents pouvaient lire n'importe quel fichier du systeme via Read, decouvrir des projets voisins via Glob, et chercher du code dans d'autres workspaces via Grep. Un agent curieux qui fait `ls ..` ou `find /home -name Makefile` decouvre les projets voisins sans restriction.

3. **Port 3000 partage entre projets** : aucun mecanisme ne garantit qu'un dev server sur localhost:3000 appartient au projet en cours. Si un autre projet ecoute deja sur ce port, le Builder echoue silencieusement (EADDRINUSE) ou Next.js bascule sur 3001 sans prevenir. L'Evaluator Playwright navigue ensuite vers localhost:3000 et teste le mauvais projet.

**Consequences observees** :
- L'Evaluator QA sprint 7 a capture des screenshots de mon-porte-monnaie (dashboard avec donut chart des depenses) en croyant tester la page tarification de FunEstim → verdict FAIL sur du contenu sans rapport
- Le Builder sprint 11 a lance `uvicorn` et `next dev` **dans le workspace mon-porte-monnaie** car il avait lu ses fichiers et s'etait convaincu que c'etait son projet
- L'Evaluator sprint 12 a tente de sauvegarder des screenshots dans `mon-porte-monnaie/qa_screenshots_sprint12/` (bloque par Playwright allowed_roots)
- 15 tentatives de Write vers mon-porte-monnaie dans cli_debug.log, toutes refusees par le confinement Write existant, mais revelant la confusion persistante de l'agent
- Dev servers zombies de mon-porte-monnaie lances par le Builder et survivant au kill de l'orchestrateur (reparentes a systemd --user)

**Solutions V1 appliquees** (commits `a7086de` et `d2fea5f`) :
- Bash : splitter les commandes chainees (`&&`, `||`, `;`, `|`, `\n`), verifier chaque segment (binary allowlist + path confinement), tracker le `cd` effectif et refuser toute sortie du workspace
- Read/Glob/Grep : meme confinement que Write/Edit — `file_path` et `path` doivent resoudre dans le workspace
- Bash paths : tout argument ressemblant a un chemin (`..`, `../x`, `/abs/path`, `rel/path`) est resolu et verifie
- Cleanup ports : `_cleanup_workspace_ports()` dans l'orchestrateur tue les listeners sur :3000/:3001/:8000/:8001 dont le cwd est dans le workspace, appelee en debut de sprint et dans un `finally` global

**Recommandation V2** :
- Le confinement workspace doit s'appliquer a **tous** les tools qui manipulent des chemins (Read, Write, Edit, Glob, Grep, Bash), pas seulement a ceux qui ecrivent
- L'orchestrateur doit gerer le cycle de vie des dev servers : lancement explicite sur des ports dedies, pidfile dans le workspace, kill garanti en fin de sprint
- Envisager de lancer chaque agent dans un `chroot`, un namespace Linux, ou un container Docker pour rendre le confinement non-contournable au niveau OS
- Ajouter un health-check post-lancement : l'Evaluator devrait verifier que la page d'accueil affiche le bon nom de projet avant de commencer le QA

### 9.15 Le streaming API peut se bloquer indefiniment

**Probleme constate** : lors du sprint 7 (premiere tentative), l'Evaluator QA s'est fige pendant 40+ minutes. Le process etait en etat `S` (sleeping) dans `ep_poll`, avec deux connexions TCP ESTABLISHED vers l'API Anthropic, mais aucun octet recu depuis 40 minutes. `cli_debug.log` n'avait plus d'entree depuis le dernier `[API REQUEST]`. Le `qa_report_7.json` avait ete ecrit (verdict FAIL) 17 minutes apres le debut, mais le process n'a jamais termine.

**Diagnostic** : la requete streaming vers l'API est restee suspendue — pas de timeout cote SDK, pas de heartbeat, pas de detection de connexion morte. L'agent avait fini son travail (rapport ecrit, `validate_json` appele) mais une requete API supplementaire ou le cleanup MCP a bloque sur une socket morte.

**Impact** : le sprint 7 a ete perdu (1h de stall), le user a du `kill` manuellement, et le restart a relance le sprint depuis zero (contrat → build → QA) car `progress.json` n'avait pas encore ete sauvegarde.

**Recommandation V2** :
- Implementer un watchdog dans l'orchestrateur : si aucun message n'est recu du subprocess pendant N secondes (ex: 300s), considerer l'agent comme bloque et le tuer proprement (SIGTERM → delai → SIGKILL)
- Le timeout idle du wrapper de prompt (cf. 9.3) aide, mais ne couvre pas le cas ou le CLI lui-meme est bloque dans le shutdown MCP (cf. 9.2)
- Surveiller `cli_debug.log` en parallele : si le dernier `[API REQUEST]` date de plus de 5 minutes, c'est un indicateur de stall
- Sauvegarder `progress.json` a chaque `add_run` (cf. 9.13) pour ne pas perdre le cout des runs terminees quand le suivant bloque

### 9.16 Le feedback QA d'un run tue n'est pas perdu — mais fragile

**Observation positive** : quand l'Evaluator QA sprint 7 a ete kill (apres le stall de 40+ min), son `qa_report_7.json` etait deja ecrit sur disque. Au retry, le Builder a lu ce rapport, a corrige les 4 bugs signales (unicode `\u00e8` en literal dans le JSX, composant monolithique de 1054 lignes, JSON.parse sans try/catch, fonctions backend de 120+ lignes), et le QA retry a valide avec un score de 8.85/10.

**Ce qui a rendu ca possible** : la communication par fichiers JSON (cf. section 10). Le rapport QA persiste independamment du process qui l'a ecrit.

**Ce qui aurait pu mal tourner** : si l'agent avait ete kill *avant* d'ecrire le rapport (ou pendant l'ecriture, produisant un JSON tronque), le retry aurait eu zero feedback et aurait probablement reproduit les memes bugs.

**Recommandation V2** :
- Ecrire les rapports QA en mode atomique : ecrire dans un fichier `.tmp` puis `rename()` — garantit qu'un rapport est soit complet soit absent, jamais tronque
- L'orchestrateur devrait verifier la validite du `qa_report_N.json` existant avant de lancer un retry : s'il existe et contient un verdict FAIL, passer directement le feedback au Builder sans re-executer l'Evaluator

### 9.17 Le Planner doit dimensionner les sprints en fonction de la complexite, pas du nombre de features

**Probleme constate** : le prompt du Planner dit « 3 a 6 features par sprint ». Le sprint 13 du tarificateur n'avait que 2 features (assistant IA + optimisation parcours) mais elles etaient si lourdes (13+ criteres de test chacune, endpoints IA, composants frontend, integration avec l'existant) que le Builder a sature sa fenetre de contexte (139K/180K tokens) en 94 turns — sans avoir termine. Le sprint a echoue 3 fois de suite.

**Ce qui se passe concretement** : chaque agent Builder dispose d'une fenetre de contexte fixe (~180K tokens effectifs). Chaque turn consomme du contexte : lecture de fichiers existants, ecriture de code, execution de tests (345 tests = output volumineux), appels curl, lecture d'erreurs, corrections. Un sprint avec 2 features « simples » (CRUD basique, 4-5 criteres de test) tient en 40-60 turns. Un sprint avec 2 features « complexes » (integration IA, logique adaptative, composants interactifs) depasse 100 turns et sature le contexte.

**Le comptage par nombre de features est trompeur** : 2 features IA > 5 features CRUD en consommation de contexte.

**Recommandation V2** :
- Le Planner devrait estimer la **complexite** de chaque feature (simple/moyenne/complexe) en fonction du nombre de criteres de test, du nombre d'endpoints, et du niveau d'integration avec l'existant
- Regle de dimensionnement : viser un **budget de ~80 turns par sprint** (marge de securite sur une fenetre de 180K tokens). Approximation : ~15-20 turns par feature simple, ~30-40 turns par feature complexe
- Si un sprint depasse le budget estime, le Planner doit le splitter en sous-sprints — meme si ca fait des sprints a 1 seule feature
- Le prompt du Planner devrait remplacer « 3 a 6 features par sprint » par une consigne de complexite : « Chaque sprint doit etre realisable par le Builder en moins de 80 turns. Preferer des sprints plus nombreux et plus petits plutot que des sprints ambitieux qui risquent de saturer le contexte. »
- Idealement, le `product_spec.json` devrait inclure un champ `estimated_complexity` par sprint (low/medium/high) et un `estimated_turns` pour que l'orchestrateur puisse ajuster dynamiquement `max_turns`

---

## 10. Points qui ont bien fonctionne

- **Communication par fichiers JSON** : robuste, debuggable, pas de perte d'etat en memoire
- **Agents stateless** : chaque invocation repart de zero, pas de corruption d'etat
- **Prompts en francais** : les agents produisent du code correct quel que soit la langue du prompt
- **Validation JSON via MCP tools** : les schemas dans `tools.py:_REQUIRED_KEYS` evitent les fichiers malformes
- **Scoring QA structure** : le systeme de notation pondere (completude 30%, design 25%, robustesse 25%, code 20%) donne des resultats coherents
- **Contract negotiation** : le cycle proposition/review entre Builder et Evaluator produit des contrats de sprint realistes
