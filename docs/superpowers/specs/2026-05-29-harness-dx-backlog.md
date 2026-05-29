# Backlog DX — Harnais multi-agents (TypeScript)

> **Date** : 2026-05-29 · **Statut** : backlog formel, prêt pour traitement ticket-par-ticket en sessions dédiées.
>
> **Objet** : améliorer l'expérience développeur et la qualité du code du **harnais lui-même** (l'orchestrateur), pas des applications qu'il génère.

## Comment ce backlog a été produit

Deux workflows multi-agents (lecture seule, vérifiés contre le code réel) :

1. **Audit DX** — 6 dimensions en parallèle + synthèse + critique de complétude (8 agents, ~574k tokens). A cartographié l'éparpillement du scoring et produit un premier backlog de 26 items + 8 findings additionnels + 8 angles non couverts.
2. **Enrichissement** — consolidation/dédup → 1 agent par ticket (vérification du code réel) → organisation en thèmes/vagues → critique de complétude (40 agents, ~1,6M tokens). A produit 37 tickets auto-suffisants ; la critique a recommandé 5 ajouts (DX-38→DX-42), intégrés ici.

**Total : 42 tickets.** Chaque ticket est conçu pour être traité isolément (problème, preuves `file:line`, correctif, critères d'acceptation, dépendances).

## Décision actée — Scoring : Option A (`config.yaml` = source unique de vérité)

La notation QA est aujourd'hui éclatée sur 6 fichiers (poids dupliqués ×4, seuils dupliqués ×4, `config.yaml` n'étant SSOT qu'à moitié → drift garanti). Le mainteneur a tranché pour l'**Option A** :

- déplacer **poids _et_ seuils** dans `config.yaml` (`qa.weights` + `qa.min_score_global`/`qa.min_score_per_criterion`) et l'exposer dans `types.ts` ;
- remplacer **tous** les chiffres en dur des prompts (`.md`) et de la table inline d'`evaluator.ts` par des **placeholders substitués au chargement** (même mécanisme que `evaluator.ts:198`, étendu aux poids **et** au system prompt, **et répliqué côté builder** qui partage `grading_criteria.md`).

Les tickets du thème *Scoring* (DX-01..DX-05, DX-39) sont rédigés en cohérence avec cette option.

## Posture de fidélité V1

Le harnais est un **port fidèle 1:1 de la V1 Python** qui préserve volontairement certaines limitations. Chaque ticket porte deux drapeaux :

- **Fidélité V1** — `oui` si le défaut est (au moins en partie) un choix délibéré de fidélité ; toute correction doit alors être tracée comme une divergence assumée.
- **Change le comportement** — `oui` si la correction modifie le comportement runtime, le format des fichiers JSON, ou le contexte exact reçu par les agents.

**Recommandation transverse** : isoler dans des PR distinctes les tickets `change le comportement = oui` (traçabilité de la divergence vs V1) des tickets purement documentaires.

## Légende

| Drapeau | Sens |
|---|---|
| 🔴 / 🟠 / 🟡 | Sévérité haute / moyenne / basse |
| Effort S / M / L | small / medium / large |
| Fidélité V1 | tension avec le port fidèle (cf. ci-dessus) |
| Comportement | la correction change le runtime / format / contexte agent |

## Plan d'exécution (vagues)

Ordonné pour traiter sécurité + quick wins d'abord, poser les fondations typage/validation, puis le scoring, puis la robustesse avancée, et enfin le polish.

### Vague 1 — Securite haute + quick wins surs

On ouvre par la seule faille de severite high a effort small : DX-16 (traversal projectName qui deplace le confinement securite des agents). Puis des quick wins a faible risque qui ameliorent immediatement la fiabilite et l'observabilite sans dependances : DX-15 preflight, DX-14 logging des causes d'echec (retours inchanges), DX-20 fiabilisation budget (costUsd=0). DX-07 (README) est un quick win pur cote docs, sans dependance, qui rend le repo lisible avant les gros chantiers. Note : DX-16 change le comportement (rejette les noms hors workspace) — a livrer isolement avec un test de non-regression.

**Tickets** : DX-16, DX-15, DX-14, DX-20, DX-07

### Vague 2 — Fondations typage/validation & extractions architecture

Pose les prerequis structurels avant le scoring et la reprise. DX-09 (type-guards apres readJson) est le pivot dont depend DX-23. DX-11 (zod sur config.yaml) doit precder DX-01 pour pouvoir valider que les poids somment a 1.0 quand ils arrivent en config. DX-12 (helper d'agents partage) precde DX-24 et facilite la propagation de l'interpolation Option A aux 3 agents. DX-13 (extractions hors orchestrator) et DX-08 (fix enum validate_json) sont des assainissements ciblesa faible couplage. Plusieurs touchent le typage runtime (behavior_change contenu) — a grouper pour amortir les tests.

**Tickets** : DX-08, DX-09, DX-11, DX-12, DX-13

### Vague 3 — Scoring Option A (SSOT config.yaml)

Le chantier scoring, isole dans sa propre vague car il modifie le texte exact recu par les agents (tension de fidelite assumee). DX-01 d'abord : promouvoir qa.weights dans config.yaml et interpoler poids+seuils dans grading_criteria.md, evaluator_prompt.md, la table inline evaluator.ts ET le system prompt, repercute cote builder (grading_criteria.md partage). Tous les autres dependent de DX-01 (sauf DX-04/DX-10 independants mais co-localises) : DX-02 documente sprintPassed, DX-03 verrouille le mapping titre->cle, DX-04 type scores, DX-05 uniformise le format des seuils. DX-10 (REQUIRED_KEYS + triple source de verite) ferme la boucle validation/prompts. Beneficie de DX-11 (zod) livre en Vague 2.

**Tickets** : DX-01, DX-02, DX-03, DX-04, DX-05, DX-10

### Vague 4 — Robustesse avancee, prompts & securite documentee

Les changements de comportement plus profonds, une fois les fondations en place. Reprise/process : DX-23 (valide le contenu JSON au skip — depend de DX-09) et DX-25 (kill dev-servers en cours de sprint). DX-24 (validation IDs de modele) depend de DX-12 et DX-10 livres avant. Securite : DX-17 documente/teste les limites du denylist et des sous-shells. Prompts : DX-06 (breakpoints), DX-28 (max_sprints injecte), DX-27 (protocole debut de sprint builder). Config : DX-29/DX-30/DX-31 (flags morts, posture MCP, fallback fastapi). DX-35 (artifactNames.ts) capitalise sur les extractions de la Vague 2.

**Tickets** : DX-17, DX-06, DX-28, DX-23, DX-25, DX-24, DX-27, DX-29, DX-30, DX-31, DX-35

### Vague 5 — Polish, portabilite, docs & outillage

Finitions a faible severite et tickets dont les decisions amont doivent etre figees. DX-26 (politique de langue) depend de DX-01 et DX-27 dont les decisions de prompt fixent l'etat a documenter. DX-32 (project.name/stack.backend decoratifs) depend de DX-16. DX-18 (noUncheckedIndexedAccess) et DX-37 (couverture de tests) durcissent la base apres stabilisation. DX-19 (portabilite ports), DX-22 (scripts package.json/role de zod), DX-21 (.gitignore Python), DX-36 (categories suggerees), DX-34/DX-33 (deduplication, champs non consommes) closent le backlog.

**Tickets** : DX-19, DX-18, DX-22, DX-37, DX-26, DX-32, DX-36, DX-34, DX-33, DX-21

> Les ajouts DX-38→DX-42 (issus de la critique) s'insèrent naturellement : DX-39 dans la Vague 3 (scoring), DX-40 dans la Vague 2 (typage/validation), DX-38/DX-41/DX-42 dans la Vague 5 (polish/docs/outillage).

### Ordre de priorité global

`DX-16 → DX-15 → DX-14 → DX-20 → DX-07 → DX-08 → DX-09 → DX-11 → DX-12 → DX-13 → DX-01 → DX-02 → DX-03 → DX-04 → DX-05 → DX-10 → DX-17 → DX-06 → DX-28 → DX-23 → DX-25 → DX-24 → DX-27 → DX-29 → DX-30 → DX-31 → DX-35 → DX-19 → DX-18 → DX-22 → DX-37 → DX-26 → DX-32 → DX-36 → DX-34 → DX-33 → DX-21`

### Dépendances notables

- DX-01 est la cle de voute du theme Scoring : DX-02, DX-03, DX-05 en dependent explicitement. Mecanisme Option A confirme dans le code : builder.ts:37 et evaluator.ts:56 concatenent tous deux grading_criteria.md, et evaluator.ts:198 interpole deja les seuils dans le user prompt — DX-01 doit etendre ce .replace aux poids, l'appliquer au system prompt ET le repliquer cote builder, sinon nouveau drift.
- DX-11 (zod sur config.yaml) devrait preceder DX-01 : declaré depends_on DX-01 dans le backlog, mais l'ordre d'execution recommande l'inverse (valider en zod que qa.weights somment a 1.0 n'a de sens qu'une fois les poids en config — donc livrer le squelette zod en Vague 2 puis etendre le schema dans la Vague 3 quand qa.weights arrive). Dependance bidirectionnelle a gerer en 2 temps.
- DX-09 (type-guards apres readJson) est prerequis dur de DX-23 (skip-planning/skip-final doit valider le contenu JSON, pas seulement l'existence — confirme orchestrator.ts:567 qui ne fait que requiredFiles.every(existsSync)).
- DX-24 (validation IDs de modele au preflight) depend de DX-12 (helper d'agents partage, ou loger le model resolu) ET DX-10 (alignement schemas). A placer apres la Vague 2.
- DX-12 (helper d'agents partage) : duplication confirmee a l'identique dans planner.ts, builder.ts, evaluator.ts (PROMPTS_DIR + readFileSync + permission_mode as cast). Le livrer tot facilite DX-01 (un seul point d'interpolation) et DX-24.
- DX-26 (politique de langue) depend de DX-01 et DX-27 : on ne documente la langue de reference qu'apres avoir fige le texte des prompts (Option A change grading_criteria.md ; DX-27 change le protocole builder).
- DX-32 (project.name/stack.backend decoratifs) depend de DX-16 : la decision de cabler ou non project.name comme fallback de projectName n'a de sens qu'apres l'assainissement du traversal.
- DX-35 (artifactNames.ts) et DX-13 (extractions hors orchestrator) sont synergiques mais non bloquants entre eux ; faire DX-13 d'abord libere orchestrator.ts puis DX-35 centralise les noms d'artefacts + convention sprint 0=final.
- Independants (aucune dependance, schedulables des qu'un creneau d'effort se libere) : DX-04, DX-06, DX-07, DX-08, DX-09, DX-12, DX-13, DX-14, DX-15, DX-16, DX-17, DX-18, DX-19, DX-20, DX-21, DX-22, DX-25, DX-27, DX-28, DX-29, DX-30, DX-31, DX-33, DX-34, DX-36, DX-37.
- Separation behavior_change : isoler dans des livraisons/PR distinctes les tickets qui modifient le contexte recu par les agents ou le comportement runtime (DX-01, DX-06, DX-08, DX-09, DX-11, DX-15, DX-16, DX-17, DX-19, DX-23, DX-24, DX-25, DX-27, DX-28, DX-32) des tickets purement documentaires/non-comportementaux (DX-02, DX-03, DX-04, DX-05, DX-07, DX-10, DX-14, DX-20, DX-26, DX-29, DX-30, DX-33, DX-34, DX-36, DX-37) — pour preserver la tracabilite de la tension de fidelite V1.

## Vue d'ensemble (42 tickets)

| ID | Titre | Thème | Sév. | Eff. | Fid. | Comp. | Dépend |
|----|-------|-------|------|------|------|-------|--------|
| DX-16 | Assainir projectName (process.argv[3]) : un nom avec '..' ou chemin absolu résout HORS d… | Sécurité | 🔴 | S | oui | oui | — |
| DX-15 | Ajouter un preflight (CLI claude, ANTHROPIC_API_KEY/session, playwright) avant la Phase 1 | Robustesse | 🟠 | S | non | oui | — |
| DX-14 | Logger la cause des échecs d'agent (catch silencieux dans le runner + cleanup ports) san… | Robustesse | 🟠 | S | oui | non | — |
| DX-20 | Fiabiliser le garde-fou budgetaire : les runs en echec (costUsd=0) faussent les agregats… | Robustesse | 🟠 | S | oui | non | — |
| DX-07 | Étoffer le README (point d'entrée humain) — actuellement 1 ligne, toute la doc vit dans … | Docs | 🟠 | S | non | non | — |
| DX-08 | validate_json: enum schema_name expose 'feature_list_item' (cle interne) comme schema ap… | Typage/Validation | 🟠 | S | oui | oui | — |
| DX-09 | Introduire des parseurs/type-guards après readJson (remplacer les casts 'as X | null' su… | Typage/Validation | 🔴 | M | oui | oui | — |
| DX-11 | Valider config.yaml au chargement avec zod — loadConfig fait `parse(raw) as Config` sans… | Typage/Validation | 🟠 | M | non | oui | DX-01 |
| DX-12 | Extraire un helper d'agents partagé (PROMPTS_DIR, loadPrompt, baseAgentOptions, narrowin… | Architecture/Modules | 🟠 | M | non | non | — |
| DX-13 | Extraire cleanupWorkspacePorts (+ DEV_SERVER_PORTS) et loadConfig/readJson hors de orche… | Architecture/Modules | 🟠 | M | non | non | — |
| DX-01 | Centraliser la definition du scoring QA (poids + seuils) dans config.yaml comme SSOT tot… | Scoring | 🔴 | M | oui | oui | — |
| DX-02 | Documenter au point de lecture que sprintPassed ne vérifie que verdict + seuil global (g… | Scoring | 🔴 | S | oui | non | DX-01 |
| DX-03 | Documenter et verrouiller les 4 clés canoniques de scores (completeness/design/robustnes… | Scoring | 🟠 | S | oui | non | DX-01 |
| DX-04 | Typer QaReport.scores comme structure connue (QaCriterionScore) au lieu de Record<string… | Typage/Validation | 🟠 | S | oui | non | — |
| DX-05 | Uniformiser le format des seuils QA dans la SSOT (min_score_global: 8 entier vs min_scor… | Scoring | 🟡 | S | oui | non | DX-01 |
| DX-10 | Aligner REQUIRED_KEYS sur les champs réellement consommés par l'orchestrateur (requested… | Typage/Validation | 🟠 | S | oui | non | — |
| DX-17 | Documenter et tester les limites réelles du bash_denylist (substring naïf + redondance a… | Sécurité | 🟠 | S | oui | oui | — |
| DX-06 | Aligner les breakpoints responsive (drift 768px tablette : grading_criteria 3 viewports … | Prompts | 🟠 | S | oui | oui | — |
| DX-28 | Injecter max_sprints dans le prompt planner et aligner la plage de sprints (prompt "8 à … | Prompts | 🟠 | S | oui | oui | — |
| DX-23 | Robustifier la reprise (skip-planning / skip-final) : valider le contenu JSON, pas seule… | Robustesse | 🟠 | S | oui | oui | DX-09 |
| DX-25 | Tuer les dev-servers spawnés par l'agent en fin de run / à l'abort (fuite de process pen… | Robustesse | 🟠 | M | oui | oui | — |
| DX-24 | Valider/normaliser les IDs de modèle au preflight : alias mouvants (claude-opus-4-6/4-7)… | Robustesse / Reproductibilité | 🟠 | S | non | oui | DX-12, DX-10 |
| DX-27 | Unifier le protocole de début de sprint du builder (system-prompt FR vs user-prompt EN i… | Prompts | 🟡 | S | oui | oui | — |
| DX-29 | Câbler ou retirer les flags QA morts (qa.tools.unit_tests, qa.tools.curl) — faux interru… | Configuration | 🟠 | S | oui | non | — |
| DX-30 | Décider et documenter la posture des outils MCP harness (validate_json / update_progress… | Configuration | 🟠 | S | oui | non | — |
| DX-31 | Supprimer les fallbacks de stack hardcodés dans planner.ts (dont le vestige 'fastapi') e… | Configuration | 🟡 | S | non | non | — |
| DX-35 | Extraire les noms d'artefacts JSON et la convention sprint 0=final dans un module partag… | Architecture/Modules | 🟠 | M | oui | non | — |
| DX-19 | Documenter la contrainte de plateforme Linux-only du nettoyage de ports et logger le no-… | Portabilité | 🟠 | M | oui | oui | — |
| DX-18 | Activer noUncheckedIndexedAccess et remplacer les casts `as string` par des gardes prouv… | Typage/Validation | 🟡 | S | non | non | — |
| DX-22 | Aligner les scripts package.json (build duplique typecheck, aucun lint/format) et clarif… | Outillage/CI | 🟡 | S | non | non | — |
| DX-37 | Étendre la couverture de tests unitaires : readJson, formatage du feedback QA (à extrair… | Outillage/CI | 🟡 | M | non | non | — |
| DX-26 | Documenter une politique de langue FR/EN transversale et explicite (qui parle quelle lan… | Docs | 🟡 | S | oui | non | DX-01, DX-27 |
| DX-32 | Documenter project.name et stack.backend comme décoratifs (jamais lus), ou les câbler co… | Configuration | 🟡 | S | oui | oui | DX-16 |
| DX-36 | Reformuler le prompt sur les catégories de features en "suggérées" — faux enum non enforcé | Prompts | 🟡 | S | oui | non | — |
| DX-34 | Éliminer la duplication de la liste 'fichiers requis du planner' et le commentaire répét… | Architecture/Modules | 🟡 | S | non | non | — |
| DX-33 | Exploiter les champs textOutput/resultText pour le diagnostic d'erreur, ou les marquer "… | Architecture/Modules | 🟡 | S | oui | non | — |
| DX-21 | Documenter (ou justifier) les règles .gitignore Python dans un repo présenté comme port TS | Outillage/CI | 🟡 | S | non | non | — |
| DX-38 | Distinguer la convention de commit `feat(module)` du harnais de celle imposée aux apps g… | Docs | 🟡 | S | oui | non | — |
| DX-39 | overall_score n'est jamais recalculé contre la formule pondérée (confiance aveugle au sc… | Scoring | 🟠 | S | oui | non | DX-01, DX-04 |
| DX-40 | validate_json ne vérifie que la PRÉSENCE des clés, jamais leur type ni les sous-structures | Typage & Validation | 🟠 | M | oui | non | DX-09, DX-11 |
| DX-41 | Auditer/compléter vitest.config.ts (couverture, include/exclude) en support de DX-37 | Outillage & CI | 🟡 | S | non | non | — |
| DX-42 | Relire les docs de migration pour drift vs code, ou les marquer « archive non maintenue » | Docs | 🟡 | S | non | non | — |

---

## Tickets détaillés

## Thème — Scoring (Option A — SSOT config.yaml)

_Coeur du chantier scoring : la definition QA (poids 30/25/25/20 + seuils) est dupliquee 4x sur 6 fichiers en 2 langues sans garde-fou. DX-01 promeut qa.weights dans config.yaml comme SSOT totale et interpole partout (etend evaluator.ts:198 aux poids ET au system prompt ET au builder qui partage grading_criteria.md). Les autres tickets durcissent autour : DX-02 documente que sprintPassed ne verifie que verdict+seuil global (gate par-critere et exception core-feature delegues a l'agent), DX-03 verrouille le mapping titre FR->cle JSON (completeness/design/robustness/code_quality), DX-05 uniformise le format des seuils (8 int vs 7.0 float), DX-04 type QaReport.scores. Tous DOIVENT respecter l'Option A._

### DX-01 — Centraliser la definition du scoring QA (poids + seuils) dans config.yaml comme SSOT totale (Option A) et interpoler partout

**Thème** Scoring · **Sévérité** 🔴 haute · **Effort** M · **Fidélité V1** oui · **Change le comportement** oui · **Dépend de** —

**Problème.** La definition du scoring QA (poids des 4 criteres + seuils PASS) est dupliquee sur 5 fichiers sans source unique de verite, et certaines valeurs sont en dur dans des fichiers que config.yaml ne controle pas. Concretement :

POIDS (30/25/25/20) — encodes 4 fois et ABSENTS de config.yaml :
1. prompts/grading_criteria.md : dans les titres de section (lignes 7/27/49/71) ET dans la formule de calcul (ligne 96 : `(completeness x 0.30) + (design x 0.25) + (robustness x 0.25) + (code_quality x 0.20)`).
2. prompts/evaluator_prompt.md : table FR des poids (lignes 65-68) ET exemple JSON `qa_report` avec `weight: 0.3 / 0.25 / 0.25 / 0.2` (lignes 83-86).
3. src/agents/evaluator.ts : table EN inline dans le user-prompt (lignes 191-196).

SEUILS (global 8, par-critere 7.0) — presents dans config.yaml ET interpoles correctement dans le user-prompt evaluator (evaluator.ts:198 via les variables minGlobal/minCriterion lues lignes 136-137), MAIS aussi codes en dur dans deux fichiers .md qui sont concatenes au SYSTEM prompt (evaluator.ts:56 et builder.ts:37) :
- grading_criteria.md:99 : `PASS si score_final >= 8 ET chaque critere individuel >= 7.0`
- evaluator_prompt.md:70 : `score moyen pondere >= 8/10`, ligne 71 : `si un critere individuel est < 7/10`, ligne 112 : `verdict PASS si overall_score >= 8 ET aucun critere individuel < 7`.

Consequence concrete : grading_criteria.md est partage par l'evaluator (system prompt, evaluator.ts:56) ET par le builder (system prompt, builder.ts:37). Donc l'agent recoit a la fois les seuils interpoles (user prompt, corrects) ET les seuils en dur (system prompt, fixes a 8/7). Si le mainteneur passe config.yaml a min_score_global: 9, l'agent voit deux valeurs contradictoires (9 dans le user prompt, 8 dans le system prompt) ; les poids ne sont meme pas modifiables car nulle part dans config.yaml. La decision mainteneur (Option A) est : config.yaml devient la SSOT totale (ajouter qa.weights + reutiliser min_score_global/min_score_per_criterion) et TOUS les chiffres en dur des .md et de la table inline deviennent des placeholders substitues au chargement des prompts, cote evaluator ET builder.

**Preuves.**
- `config.yaml:59-65` — Bloc qa: contient min_score_global: 8 et min_score_per_criterion: 7.0 et qa.tools, mais AUCUN bloc weights. Les poids sont absents de la config.
- `src/types.ts:44-52` — interface Config.qa declare min_score_global, min_score_per_criterion, tools — pas de champ weights. A etendre pour Option A.
- `src/agents/evaluator.ts:29-36` — loadEvaluatorOptions fait readFileSync de evaluator_prompt.md (systemPrompt) et grading_criteria.md (grading) — point d'injection naturel pour interpoler des placeholders au chargement.
- `src/agents/evaluator.ts:56` — systemPrompt = systemPrompt + grading : evaluator_prompt.md ET grading_criteria.md sont concatenes au SYSTEM prompt. C'est ici que les seuils/poids en dur des .md atteignent l'agent.
- `src/agents/evaluator.ts:136-137,198` — minGlobal/minCriterion lus depuis config.qa et interpoles dans le USER prompt (template literal ${minGlobal}/${minCriterion}). Mecanisme d'interpolation deja en place a etendre aux poids et au system prompt.
- `src/agents/evaluator.ts:191-196` — Table EN inline en dur dans le user prompt: | Completeness | 30% | / Design quality | 25% | / Robustness | 25% | / Code quality | 20% |. Poids dupliques ici.
- `src/agents/builder.ts:25-37` — loadBuilderOptions fait readFileSync de builder_prompt.md ET grading_criteria.md, et les concatene au system prompt (ligne 37). Le builder partage donc grading_criteria.md avec ses poids+seuils en dur — toute interpolation doit etre repliquee ici.
- `prompts/grading_criteria.md:7,27,49,71` — Poids dans les titres de section: '(30%)', '(25%)', '(25%)', '(20%)'.
- `prompts/grading_criteria.md:96` — Formule en dur: score_final = (completeness x 0.30) + (design x 0.25) + (robustness x 0.25) + (code_quality x 0.20).
- `prompts/grading_criteria.md:99` — Seuils en dur: 'PASS si score_final >= 8 ET chaque critere individuel >= 7.0'.
- `prompts/evaluator_prompt.md:65-68` — Table FR des poids en dur: Completude 30% / Design 25% / Robustesse 25% / Code 20%.
- `prompts/evaluator_prompt.md:70-71` — Seuils en dur: 'score moyen pondere >= 8/10' et 'si un critere individuel est < 7/10'.
- `prompts/evaluator_prompt.md:83-86` — Exemple JSON qa_report avec weight: 0.3 / 0.25 / 0.25 / 0.2 en dur (donnee a l'agent comme modele de sortie).
- `prompts/evaluator_prompt.md:112` — Regle en dur: 'verdict PASS si overall_score >= 8 ET aucun critere individuel < 7'.
- `src/orchestrator.ts:340,310-315` — qaScore = config.qa.min_score_global puis sprintPassed(report, qaScore) verifie verdict==='PASS' && overall_score >= minScore. Le seuil global cote orchestrateur lit deja la config (pas de probleme la) — confirme que seuls les prompts portent des valeurs en dur.
- `src/orchestrator.ts:19,41-50` — loadConfig fait parse(raw) du yaml via le package 'yaml' (import { parse } from 'yaml'). Un bloc imbrique qa.weights sera parse automatiquement sans changement de loader.

**Impact DX.** Aujourd'hui, regler le scoring (changer un poids ou un seuil) demande d'editer jusqu'a 5 fichiers de maniere coherente, dont 3 prompts en francais et une table EN inline en TS ; un oubli produit silencieusement des consignes contradictoires entre system prompt et user prompt envoyes au meme agent, ce qui degrade la fiabilite de la QA sans erreur visible. Apres Option A, un mainteneur regle le scoring en un seul endroit (config.yaml), avec garantie de propagation et un test qui echoue si la somme des poids derive de 1 — DX nettement plus sure et auditable.

**Correctif proposé.**
1. config.yaml : ajouter sous le bloc qa: un sous-bloc weights avec les 4 cles et leurs valeurs actuelles (decimales pour rester coherent avec la formule): qa.weights.completeness: 0.30, qa.weights.design: 0.25, qa.weights.robustness: 0.25, qa.weights.code_quality: 0.20. Conserver min_score_global: 8 et min_score_per_criterion: 7.0 inchanges.
2. src/types.ts : etendre interface Config.qa avec weights: { completeness: number; design: number; robustness: number; code_quality: number }.
3. Creer un helper d'interpolation reutilisable (ex: src/agents/prompt-vars.ts) exportant (a) une fonction buildScoringVars(config): Record<string,string> qui derive les placeholders depuis config.qa (seuils + poids en % entier ET en decimal), et (b) une fonction interpolate(text, vars) qui remplace les jetons {{NOM}}. Jetons a prevoir: {{MIN_SCORE_GLOBAL}}, {{MIN_SCORE_PER_CRITERION}}, {{W_COMPLETENESS_PCT}}/{{W_DESIGN_PCT}}/{{W_ROBUSTNESS_PCT}}/{{W_CODE_QUALITY_PCT}} (ex 30) et {{W_COMPLETENESS}}/{{W_DESIGN}}/{{W_ROBUSTNESS}}/{{W_CODE_QUALITY}} (ex 0.30 / 0.3 selon l'usage dans le .md). Important: l'exemple JSON evaluator_prompt.md:83-86 utilise le format 0.3/0.25/0.2 — choisir un formatage de placeholder qui reproduit ce style (pas de zero superflu) ou accepter 0.30 si l'agent le tolere.
4. prompts/grading_criteria.md : remplacer les poids des titres (30%/25%/25%/20% lignes 7,27,49,71) par {{W_*_PCT}}%, la formule ligne 96 par les jetons decimaux {{W_*}}, et les seuils ligne 99 (>= 8 et >= 7.0) par {{MIN_SCORE_GLOBAL}} et {{MIN_SCORE_PER_CRITERION}}.
5. prompts/evaluator_prompt.md : remplacer la table des poids lignes 65-68 par {{W_*_PCT}}%, l'exemple JSON lignes 83-86 (weight: 0.3...) par {{W_*}}, et les seuils lignes 70-71 et 112 par {{MIN_SCORE_GLOBAL}}/{{MIN_SCORE_PER_CRITERION}}.
6. src/agents/evaluator.ts : (a) dans loadEvaluatorOptions, apres les readFileSync (lignes 29-36), appliquer interpolate(systemPrompt, vars) et interpolate(grading, vars) avant la concatenation ligne 56, en passant config a la fonction; (b) remplacer la table inline en dur lignes 191-196 par les valeurs derivees de config.qa.weights (ou par les memes placeholders interpoles); les seuils du user prompt ligne 198 utilisent deja minGlobal/minCriterion — les conserver, ils proviennent deja de la config.
7. src/agents/builder.ts : repliquer l'interpolation sur grading_criteria.md dans loadBuilderOptions (lignes 29-37) avant la concatenation ligne 37, en utilisant le meme helper buildScoringVars(config) + interpolate. (builder_prompt.md n'a pas de chiffres de scoring d'apres l'audit — verifier rapidement avant; s'il en a, l'interpoler aussi.)
8. tests : ajouter tests/scoring-config.test.ts couvrant: (a) Math.abs(somme des qa.weights - 1) < 1e-9 echoue si on perturbe un poids; (b) interpolate ne laisse aucun jeton {{...}} non resolu apres traitement des trois .md charges avec une config donnee; (c) un changement de config (min_score_global: 9, ou un poids modifie) se retrouve dans la chaine finale du prompt produite par loadEvaluatorOptions ET loadBuilderOptions (via export/spy ou en factorisant la construction de prompt pour la rendre testable).
9. pnpm typecheck && pnpm test doivent passer.

**Critères d'acceptation.**
- [ ] config.yaml contient qa.weights (4 cles) avec somme = 1.0 et les valeurs actuelles 0.30/0.25/0.25/0.20.
- [ ] Aucun chiffre de poids (30/25/20, 0.30/0.25/0.20) ni de seuil (8, 7.0, 7) n'est present en dur dans prompts/grading_criteria.md, prompts/evaluator_prompt.md, ni dans la table inline de src/agents/evaluator.ts (lignes 191-196) — tous remplaces par des placeholders/valeurs derivees de config.
- [ ] Un test echoue si la somme des qa.weights differe de 1 (tolerance epsilon).
- [ ] Un test echoue s'il reste un jeton {{...}} non substitue dans les prompts finaux (evaluator system, evaluator grading, builder system) pour une config valide.
- [ ] Modifier config.yaml (ex min_score_global: 9 ou qa.weights.completeness: 0.40 avec ajustement compensatoire) propage la valeur dans le prompt final recu par l'evaluator ET par le builder (verifie par test).
- [ ] pnpm typecheck clean (tsc --noEmit).
- [ ] pnpm test passe (vitest run), y compris les tests scoring existants (orchestrator-scoring.test.ts inchanges).

**Risques.**
- Tension de fidélité V1 : les prompts `.md` deviennent des templates non-autonomes (placeholders) — moins lisibles seuls par un humain.
- Oublier de répliquer l'interpolation côté builder (`builder.ts:37`) recrée un drift system-prompt entre builder et evaluator.
- Le format des poids dans l'exemple JSON (`0.3` vs `0.30`) doit être reproduit fidèlement, sinon le modèle de sortie montré à l'agent change.
- `change le comportement = oui` : le contexte exact reçu par les agents est modifié — valider par un run réel, pas seulement `typecheck`/`test`.

**Notes de complétude (critique).**
- Inclure aussi l'exemple JSON `evaluator_prompt.md:83-86` (4e copie des poids) parmi les emplacements à interpoler sous l'Option A.
- Inscrire explicitement la substitution côté BUILDER (`builder.ts:37` concatène `grading_criteria.md`), sinon drift builder vs evaluator.

<details><summary>Notes de vérification</summary>

Toutes les affirmations du ticket source verifiees contre le code reel. Corrections de locations : (1) La table EN inline de l'evaluator est aux lignes 191-196 (le ticket source disait '193-196' dans seed_problem mais '188-200' dans locations ; la table elle-meme = en-tete ligne 191, separateur 192, 4 lignes 193-196 ; les lignes Scoring/PASS/FAIL vont jusqu'a 199). (2) Le seuil dans le user prompt evaluator est bien interpole ligne 198 via les variables minGlobal/minCriterion definies lignes 136-137 (confirme). (3) grading_criteria.md:96 contient une formule de poids en dur (0.30/0.25/0.25/0.20) que le ticket source mentionnait dans seed_problem mais pas dans locations — ajoutee a evidence car c'est une 5e occurrence de poids a interpoler. (4) evaluator_prompt.md : poids aussi en dur dans l'exemple JSON lignes 83-86 (weight: 0.3...), confirme. (5) Confirme que grading_criteria.md est partage evaluator (evaluator.ts:56) ET builder (builder.ts:37), les deux concatenant au SYSTEM prompt — donc la double-source seuils touche aussi le builder. (6) Confirme loadConfig utilise parse() du package 'yaml' (orchestrator.ts:19,49), donc un bloc imbrique qa.weights est parse sans modif du loader. (7) Aucun bloc qa.weights existant dans config.yaml ni dans types.ts (confirme absence). (8) Pas de test scoring existant sur les poids ; orchestrator-scoring.test.ts ne couvre que sprintPassed (seuil global cote orchestrateur), pas les prompts.

</details>

### DX-02 — Documenter au point de lecture que sprintPassed ne vérifie que verdict + seuil global (gate par-critère et exception "core feature cassée" délégués à l'agent)

**Thème** Scoring · **Sévérité** 🔴 haute · **Effort** S · **Fidélité V1** oui · **Change le comportement** non · **Dépend de** DX-01

**Problème.** Le harnais affiche partout (prompts + config) une règle de PASS à deux gates : (1) score pondéré >= min_score_global ET (2) chaque critère individuel >= min_score_per_criterion, plus une exception "une feature centrale (core feature) totalement cassée => FAIL automatique quel que soit le score". Or côté code, la décision finale de PASS d'un sprint est prise par `sprintPassed()` (src/orchestrator.ts:310-315), qui ne teste QUE `verdict === "PASS" && overall_score >= minScore`. Elle ne lit jamais `report.scores` (le détail par-critère pourtant typé dans QaReport, src/types.ts:107) et aucun champ de QaReport ne capture la notion de "core feature". Le seuil par-critère `min_score_per_criterion` n'est lu (src/agents/evaluator.ts:137) que pour être interpolé dans le prompt de l'evaluator (src/agents/evaluator.ts:198) — il est purement déclaratif et n'est jamais revérifié programmatiquement. Conséquence : le harnais fait une confiance aveugle au `verdict` auto-déclaré par l'agent. Un rapport `overall_score: 8.5, verdict: "PASS"` avec un critère individuel à 4 (et même une core feature cassée) passe le gate orchestrateur. Ce comportement est FIDÈLE à la V1 Python et honnêtement documenté dans CLAUDE.md:36, mais le commentaire JSDoc au-dessus de `sprintPassed` (src/orchestrator.ts:304-309) ne le dit PAS : il affirme seulement "reproduit la condition V1 : verdict === 'PASS' && overall_score >= minScore". Un développeur qui lit uniquement le code (et voit les deux gates prescrits dans les prompts) peut prendre ce mono-gate pour un bug oublié et "corriger" à tort en ajoutant une vérification par-critère côté orchestrateur — ce qui changerait le comportement et romprait la fidélité V1. Ce ticket est purement documentaire (zéro changement de comportement) : ancrer au point de lecture la nature délibérée de la délégation à l'agent.

**Preuves.**
- `src/orchestrator.ts:310-315` — sprintPassed() ne fait que `return report?.verdict === "PASS" && (report?.overall_score ?? 0) >= minScore`. Ne lit jamais report.scores ; aucune notion de core feature.
- `src/orchestrator.ts:304-309` — JSDoc actuelle : décrit la fonction comme reproduisant la condition V1 verdict+score global. N'avertit PAS que le gate par-critère et l'exception core-feature sont délégués à l'agent (non revérifiés). C'est précisément le manque à combler.
- `src/orchestrator.ts:394` — Unique site de décision PASS d'un sprint : `if (sprintPassed(report, qaScore))`. qaScore = config.qa.min_score_global (ligne 340).
- `src/orchestrator.ts:524-533` — L'évaluation finale (qa_report_final.json) ne gate sur rien : elle se contente de logger score et feature_coverage. Aucune vérification par-critère non plus, cohérent avec V1.
- `src/agents/evaluator.ts:137` — minCriterion = qaConfig.min_score_per_criterion ; lu uniquement pour interpolation.
- `src/agents/evaluator.ts:198` — `- **PASS**: weighted score >= ${minGlobal} AND every criterion >= ${minCriterion}` — seul usage de minCriterion. Purement déclaratif (envoyé à l'agent, pas appliqué par le code).
- `config.yaml:60-61` — min_score_global: 8 et min_score_per_criterion: 7.0. Le second n'a aucun effet programmatique sur le gate.
- `prompts/grading_criteria.md:99` — `**PASS** si score_final >= 8 ET chaque critère individuel >= 7.0` — chiffres en dur (8 et 7.0).
- `prompts/grading_criteria.md:102` — `**Exception** : un sprint est automatiquement en FAIL si une feature centrale (core feature du sprint contract) est totalement cassée, quel que soit le score.` — règle jamais revérifiée côté code.
- `prompts/evaluator_prompt.md:112-113` — Le verdict est PASS si overall_score >= 8 ET aucun critère individuel < 7 ; FAIL sinon — chiffres en dur (8 et 7).
- `prompts/evaluator_prompt.md:115` — `N'approuve JAMAIS un sprint où une feature centrale est cassée, même si le score moyen est suffisant.` — règle déléguée à l'agent.
- `src/types.ts:107` — QaReport.scores: Record<string, unknown> existe (détail par-critère) mais n'est jamais lu par l'orchestrateur ; aucun champ ne représente le statut core-feature.
- `CLAUDE.md:36` — Documentation projet honnête : 'the per-criterion gate is enforced by the evaluator prompt + grading_criteria.md; the orchestrator's sprintPassed() checks verdict === "PASS" && overall_score >= min_score_global'. Le ticket réplique cette vérité au point de lecture du code.
- `tests/orchestrator-scoring.test.ts:5-27` — Tests existants de sprintPassed : couvrent verdict+score global uniquement (aucun test par-critère), cohérent avec le comportement actuel. Sert de garde-fou anti-régression si quelqu'un tente d'ajouter un gate.

**Impact DX.** Élimine un faux positif de revue de code à fort impact : sans ce commentaire, un mainteneur lisant src/orchestrator.ts isolément voit un seul gate là où prompts et config en prescrivent deux (+ une exception core-feature), conclut à un bug, et "corrige" en ajoutant une vérification par-critère/core-feature côté orchestrateur — introduisant un changement de comportement et brisant la fidélité V1 revendiquée. Le commentaire ancre l'intention (délégation délibérée à l'agent, confiance au verdict auto-déclaré) exactement là où la confusion naît, sans obliger à retrouver CLAUDE.md:36.

**Correctif proposé.**
1. Étendre le JSDoc au-dessus de sprintPassed (src/orchestrator.ts:304-309) pour expliciter la portée volontairement limitée. Ajouter ~4 lignes : (a) sprintPassed ne vérifie QUE verdict==='PASS' && overall_score>=min_score_global ; (b) le gate par-critère (min_score_per_criterion, config.yaml:61) et l'exception 'core feature cassée => FAIL' sont prescrits dans les prompts (grading_criteria.md, evaluator_prompt.md) et DÉLÉGUÉS à l'evaluator — l'orchestrateur fait confiance au verdict auto-déclaré et NE relit PAS report.scores ; (c) comportement fidèle V1 — NE PAS 'corriger' en ajoutant un gate par-critère sans validation explicite du mainteneur (changement de comportement) ; (d) renvoyer vers CLAUDE.md:36. Garder le texte court et factuel (français, cohérent avec les autres commentaires du fichier).
2. Ajouter un commentaire d'1 ligne au point de lecture de l'interpolation declarative : src/agents/evaluator.ts:137, signaler que minCriterion sert UNIQUEMENT à l'interpolation du prompt (ligne 198) et n'est pas appliqué programmatiquement.
3. (Léger, optionnel mais recommandé) Ajouter un commentaire d'1 ligne près du site d'appel src/orchestrator.ts:394 renvoyant vers le JSDoc de sprintPassed pour la portée du gate.
4. NE PAS toucher la logique : aucun changement à sprintPassed, à QaReport, ni à l'évaluation finale. behavior_change=false strict.
5. NOTE D'ARTICULATION avec l'Option A (SSOT) : ce ticket est documentaire et n'introduit AUCUN chiffre en dur supplémentaire. Il dépend de DX-01 (le ticket qui implémente l'Option A : déplacer poids + seuils dans config.yaml/qa.weights et substituer les placeholders {{min_score_global}}/{{min_score_per_criterion}}/{{weights}} dans grading_criteria.md + evaluator_prompt.md + la table inline d'evaluator.ts:191-198, côté evaluator ET builder qui partagent grading_criteria.md). Le commentaire de sprintPassed doit référencer les valeurs comme 'le seuil config.yaml' (et non '8'/'7.0' en dur) pour rester correct après DX-01. Si DX-01 n'est pas encore fait, rédiger le commentaire en termes de noms de clés config (min_score_global, min_score_per_criterion) plutôt que de valeurs littérales — ainsi il reste valide dans les deux ordres d'exécution.
6. Vérifier `pnpm typecheck` clean et `pnpm test` vert (les tests de sprintPassed ne changent pas).

**Critères d'acceptation.**
- [ ] Le JSDoc de sprintPassed (src/orchestrator.ts) indique explicitement : (a) qu'il ne gate QUE sur verdict + min_score_global, (b) que le gate par-critère et l'exception core-feature sont délégués à l'evaluator via les prompts et non revérifiés côté code, (c) que c'est un choix de fidélité V1 à ne pas 'corriger' sans accord.
- [ ] src/agents/evaluator.ts:137 porte un commentaire précisant que min_score_per_criterion n'est utilisé que pour l'interpolation du prompt (declaratif), pas pour un gate.
- [ ] Le commentaire référence les valeurs par leur clé config (min_score_global / min_score_per_criterion) et non par des littéraux en dur, restant correct avant comme après DX-01.
- [ ] `pnpm typecheck` est clean.
- [ ] `pnpm test` (vitest) reste vert ; aucun test modifié, aucun nouveau gate introduit.
- [ ] git diff montre uniquement des changements de commentaires/JSDoc (aucune ligne exécutable modifiée) — behavior_change=false vérifiable.

**Risques.**
- Tension de fidélité V1 : la tentation naturelle en lisant ce ticket est d'ajouter le gate par-critère côté orchestrateur. C'est EXPLICITEMENT hors-périmètre — ce serait un changement de comportement (behavior_change), un ticket distinct nécessitant l'accord du mainteneur. Le présent ticket est purement documentaire.
- Risque de dérive si rédigé avec des chiffres en dur (8 / 7.0) : le commentaire deviendrait faux dès que config.yaml change ou après DX-01. Mitigation : référencer les clés config, pas les valeurs.
- Risque de désynchronisation avec CLAUDE.md:36 si l'un est mis à jour sans l'autre : garder les deux formulations alignées (la source de vérité reste config.yaml + prompts).
- Faible risque que la double affirmation (verdict ET score) du commentaire suggère une redondance ; préciser que overall_score est un garde-fou minimal complémentaire au verdict auto-déclaré, pas une revérification du détail par-critère.

**Notes de complétude (critique).**
- Préciser que ce ticket NE couvre PAS la non-vérification de `overall_score` (formule pondérée) → voir DX-39.

<details><summary>Notes de vérification</summary>

Toutes les affirmations du ticket source vérifiées contre le code réel. CONFIRMÉ : sprintPassed (src/orchestrator.ts:310-315, JSDoc 304-309) ne teste que verdict+overall_score, ne lit jamais report.scores. CONFIRMÉ : minCriterion (evaluator.ts:137) utilisé uniquement à la ligne 198 pour interpolation. CONFIRMÉ : grading_criteria.md:99 et :102 ; evaluator_prompt.md:112-113 et :115 ; CLAUDE.md:36. CONFIRMÉ : QaReport.scores existe (types.ts:107) mais inutilisé par l'orchestrateur ; aucun champ core-feature. CORRECTIONS de locations : (1) le ticket source citait 'src/orchestrator.ts:304-315' ET '310-315' — précision : la déclaration de fonction est 310-315, le JSDoc À AMENDER est 304-309. (2) Le ticket citait l'exception core-feature à 'orchestrator.ts:310-315' implicitement comme manquante — exact : aucune trace de 'core' dans orchestrator.ts (grep confirmé), la notion n'existe QUE dans les prompts (grading_criteria.md:102, evaluator_prompt.md:115) et evaluator.ts:208 (texte du prompt QA). (3) config : min_score_per_criterion à config.yaml:61 (exact) ; min_score_global à config.yaml:60 (le ticket ne citait que 61). DÉCOUVERTE ADDITIONNELLE non dans le ticket source : l'évaluation FINALE (orchestrator.ts:524-533) ne gate sur rien du tout — elle ne fait que logger score+coverage ; donc même le mono-gate verdict/score n'y est pas appliqué (cohérent V1, à mentionner dans le commentaire si on documente aussi runFinalEvaluation). DÉPENDANCE : ce ticket doit référencer les valeurs par clé config et non en dur pour rester cohérent avec l'Option A (DX-01) ; d'où depends_on=[DX-01] (id présumé du ticket Option A ; à confirmer contre le backlog si l'id réel diffère). Test existant tests/orchestrator-scoring.test.ts confirme la couverture mono-gate actuelle (garde-fou anti-régression).

</details>

### DX-03 — Documenter et verrouiller les 4 clés canoniques de scores (completeness/design/robustness/code_quality) : mapping titre FR -> clé JSON dans grading_criteria.md + validation des sous-clés

**Thème** Scoring · **Sévérité** 🟠 moyenne · **Effort** S · **Fidélité V1** oui · **Change le comportement** non · **Dépend de** DX-01

**Problème.** Les 4 clés JSON canoniques de l'objet `scores` du rapport QA — `completeness`, `design`, `robustness`, `code_quality` — ne sont définies NULLE PART de façon normative. Elles n'apparaissent que dans deux endroits implicites : (a) la formule en bloc-code de grading_criteria.md:96 (`completeness × 0.30 + design × 0.25 + robustness × 0.25 + code_quality × 0.20`) et (b) l'exemple JSON d'evaluator_prompt.md:82-86. Entre les deux, tout le reste de la doc raisonne en TITRES français : grading_criteria.md utilise « Complétude fonctionnelle » (l.7), « Qualité du design » (l.27), « Robustesse » (l.49), « Qualité du code » (l.71) ; evaluator_prompt.md:63-68 a une table « Critère/Poids » avec les mêmes libellés FR. Aucune ligne ne relie un titre FR à sa clé JSON. L'asymétrie est piégeuse et plus large que ce que dit le seed : AUCUN des 4 titres FR n'est égal à sa clé (« design » est le seul cas proche mais le titre est « Qualité du design » ; « Qualité du code » -> `code_quality` et non `code` ; « Complétude fonctionnelle » -> `completeness` ; « Robustesse » -> `robustness`). Un agent qui produit `design_quality`, `code`, `completude` ou `function_completeness` est plausible. Or rien ne le rattrape : `REQUIRED_KEYS['qa_report']` (tools.ts:26) ne valide QUE la présence du conteneur `scores`, jamais ses sous-clés ; `QaReport.scores` est typé `Record<string, unknown>` (types.ts:107) ; et l'orchestrateur ne lit jamais les sous-scores (il ne consomme que `overall_score` et `verdict`, cf. orchestrator.ts:314,390,526). Conséquence : un rapport aux sous-clés divergentes passe `validate_json` ET tout l'orchestrateur silencieusement — le détail des scores devient illisible/non corrélable et toute future logique de re-vérification du gate per-criterion (DX-01) serait cassée par des clés non standard. Ce ticket fixe la convention de manière normative (mapping explicite + liste canonique) et ferme le trou de validation. Dans le cadre Option A (config.yaml = SSOT), la formule en dur de grading_criteria.md:96 et la table de poids de l'evaluator (md:63-68 + inline ts:191-196) cesseront d'être des chiffres en dur ; ce ticket fournit en parallèle les NOMS de clés canoniques qui serviront de jeu de clés pour `qa.weights` (chaque entrée de `qa.weights` portera exactement ces 4 noms), garantissant la cohérence titre FR <-> clé config <-> clé du rapport JSON.

**Preuves.**
- `prompts/grading_criteria.md:7` — Titre de section « ## 1. Complétude fonctionnelle (30%) » — poids en dur dans le titre, aucune clé JSON mentionnée (clé attendue: completeness).
- `prompts/grading_criteria.md:27` — « ## 2. Qualité du design (25%) » — clé attendue: design.
- `prompts/grading_criteria.md:49` — « ## 3. Robustesse (25%) » — clé attendue: robustness.
- `prompts/grading_criteria.md:71` — « ## 4. Qualité du code (20%) » — clé attendue: code_quality (asymétrie : titre 'code' -> clé 'code_quality').
- `prompts/grading_criteria.md:96` — Première et seule apparition des 4 clés JSON dans grading_criteria.md, dans la formule en bloc-code : 'score_final = (completeness × 0.30) + (design × 0.25) + (robustness × 0.25) + (code_quality × 0.20)'. Introduites sans ligne de mapping préalable.
- `prompts/evaluator_prompt.md:63-68` — Table 'Critère | Poids' qui répète les titres FR (Complétude fonctionnelle 30% / Qualité du design 25% / Robustesse 25% / Qualité du code 20%) sans clés JSON.
- `prompts/evaluator_prompt.md:82-86` — Seul endroit où les 4 clés sont matérialisées comme clés d'objet JSON dans l'exemple de qa_report (completeness/design/robustness/code_quality avec score+weight+justification). Sert de spec de fait.
- `src/agents/evaluator.ts:191-196` — Table de poids dupliquée dans le prompt inline ANGLAIS (Completeness 30% / Design quality 25% / Robustness 25% / Code quality 20%) — encore d'autres libellés, toujours sans clés JSON.
- `src/tools.ts:26` — REQUIRED_KEYS['qa_report'] = ['sprint_id','overall_score','verdict','scores','bugs'] — valide la présence de 'scores' mais jamais ses sous-clés ; un objet scores aux clés divergentes passe validateJson().
- `src/types.ts:107` — QaReport.scores typé Record<string, unknown> — aucune contrainte compile-time sur les sous-clés.
- `src/orchestrator.ts:314` — sprintPassed() ne lit que report.verdict et report.overall_score — les sous-scores ne sont jamais consommés par l'orchestrateur, donc une clé divergente n'a aucun effet observable côté gate (le trou est totalement silencieux).

**Impact DX.** Aujourd'hui un mainteneur (ou un agent) doit reconstruire mentalement le mapping titre FR -> clé JSON en croisant 3 fichiers et en repérant l'unique exemple JSON ; l'asymétrie code/code_quality est une source d'erreur silencieuse. Comme rien ne valide les sous-clés, une dérive ne se voit qu'en ouvrant les qa_report_N.json à la main. Après ce ticket : le contrat (titre humain <-> clé machine <-> entrée config.yaml) est explicite et identique partout, et validate_json rejette un rapport mal-clé — feedback immédiat au lieu d'un échec silencieux. Pré-requis de fiabilité pour tout travail futur sur le gate per-criterion (DX-01).

**Correctif proposé.**
1. Choisir les 4 clés canoniques (inchangées, conformes à l'exemple evaluator_prompt.md:82-86) : completeness, design, robustness, code_quality. Les graver comme constante exportée unique source côté code : ajouter `export const SCORE_KEYS = ['completeness','design','robustness','code_quality'] as const;` dans src/tools.ts (ou un module scoring.ts si DX-01 en crée un), pour qu'OPTION A puisse l'utiliser comme jeu de clés de qa.weights.
2. Dans prompts/grading_criteria.md, accoler la clé à chaque titre de section sans figer le poids en dur (Option A : le poids vient de config). Réécrire les titres en : '## 1. Complétude fonctionnelle (`completeness`)', '## 2. Qualité du design (`design`)', '## 3. Robustesse (`robustness`)', '## 4. Qualité du code (`code_quality`)'. Retirer le pourcentage en dur du titre et le remplacer par un placeholder de poids substitué au chargement (cf. étape 4), ou laisser le poids hors-titre si DX-01 gère déjà l'affichage des poids — coordonner avec DX-01 pour ne pas dupliquer la substitution.
3. Dans prompts/grading_criteria.md, ajouter juste avant la section « Calcul du score final » (autour de l.92) un petit tableau de mapping normatif explicite : | Critère (FR) | Clé JSON | qui liste les 4 lignes, et une phrase : « Les clés de l'objet `scores` du qa_report DOIVENT être exactement completeness, design, robustness, code_quality ; tout autre nom est invalide. » Conserver la formule l.96 mais en remplaçant les poids en dur par des placeholders (Option A) — ex. `(completeness × {{WEIGHT_COMPLETENESS}}) + ...` — substitués au chargement.
4. OPTION A — étendre l'interpolation au CONTENU des .md : aujourd'hui evaluator.ts:33-36 et builder.ts:29-32 font un readFileSync brut du grading_criteria.md SANS aucune substitution (l'interpolation existante n'est QUE dans le prompt inline anglais, evaluator.ts:198). Introduire une fonction de rendu partagée (ex. renderGradingCriteria(config) ou une util `interpolate(template, vars)`) qui lit le .md puis remplace {{WEIGHT_COMPLETENESS}}/{{WEIGHT_DESIGN}}/{{WEIGHT_ROBUSTNESS}}/{{WEIGHT_CODE_QUALITY}} (+ {{MIN_SCORE_GLOBAL}}/{{MIN_SCORE_PER_CRITERION}} si DX-01 ne le fait pas déjà) par les valeurs de config.qa.weights / config.qa.min_score_*. L'APPELER côté evaluator ET builder (les deux partagent grading_criteria.md) pour garantir une vue identique. Aligner aussi la table de poids inline d'evaluator.ts:191-196 sur les mêmes valeurs interpolées et les mêmes clés.
5. Fermer le trou de validation : dans src/tools.ts:validateJson, pour schemaName === 'qa_report', après le check des clés racine, vérifier que data.scores est un objet dont les clés sont exactement SCORE_KEYS (ni manquantes ni superflues) ; sinon retourner isError:true avec un message listant les clés attendues vs reçues. (Décider avec le mainteneur si 'superflues' est une erreur dure ou un warning — proposer erreur dure pour cohérence avec l'esprit de validate_json.)
6. Optionnel cohérence types : remplacer QaReport.scores: Record<string, unknown> (types.ts:107) par un type avec les 4 clés optionnelles typées { score:number; weight:number; justification?:string } pour documenter le contrat côté compile-time (non bloquant, ne change pas le runtime).
7. pnpm typecheck (clean) ; ajouter/adapter tests vitest (cf. acceptance_criteria) ; pnpm test.

**Critères d'acceptation.**
- [ ] grading_criteria.md contient un tableau de mapping normatif reliant chacun des 4 titres FR à sa clé JSON, et chaque titre de section porte sa clé entre backticks.
- [ ] Les 4 clés canoniques sont définies UNE seule fois en code (SCORE_KEYS exporté) et réutilisées par la validation et par la logique Option A (jeu de clés de qa.weights).
- [ ] validateJson(workspaceDir, fixture, 'qa_report') retourne isError:true pour un rapport dont scores contient une clé divergente (ex. 'code' au lieu de 'code_quality', ou 'design_quality'), et isError:false pour un rapport aux 4 clés exactes — couvert par un test vitest dans tests/tools.test.ts.
- [ ] Le contenu de grading_criteria.md reçu par l'agent (via la fonction de rendu) ne contient plus de poids en dur : un test vérifie que changer config.yaml:qa.weights propage la nouvelle valeur dans la chaîne systemPrompt construite par loadEvaluatorOptions ET loadBuilderOptions (les deux côtés).
- [ ] pnpm typecheck est clean ; pnpm test passe (incl. les nouveaux cas).

**Risques.**
- Tension de fidélité V1 : le harnais est un port 1:1 qui préserve volontairement les limitations V1 ; figer les poids en dur dans les .md fait partie du comportement V1. Faire valider l'écart par le mainteneur (la décision Option A le couvre déjà, mais la substitution dans les .md est un mécanisme NOUVEAU — il n'existe aujourd'hui aucune interpolation sur le contenu des .md, seulement sur le prompt inline). Coordination forte requise avec DX-01 qui touche la même tuyauterie d'interpolation (config -> prompts) : risque de double-substitution ou de placeholders incohérents si les deux tickets sont traités séparément — d'où depends_on DX-01.
- Renforcer validateJson sur les sous-clés de qa_report est un comportement runtime NOUVEAU vs V1 (V1 ne validait que les clés racine). Un agent réel produisant occasionnellement une 5e clé (ex. 'overall' ou un champ bonus) verrait son rapport rejeté si 'clés superflues' = erreur dure ; choisir le niveau de strictness avec le mainteneur. C'est un behavior_change runtime mineur — le ticket est marqué behavior_change=false côté SORTIE des agents (les clés canoniques restent identiques), mais la validation devient plus stricte ; le noter explicitement.
- Risque de régression de prompt : un mauvais token de placeholder ({{...}} non substitué) fuiterait littéralement dans le system prompt envoyé à l'agent. Couvrir par un test asserttant l'absence de '{{' dans la chaîne rendue.
- Wording : les libellés diffèrent déjà entre FR (.md) et anglais (inline ts:191-196). En ajoutant les clés, garder les libellés humains inchangés pour ne pas perturber le ton FR des prompts ; n'ajouter que les clés entre backticks.

<details><summary>Notes de vérification</summary>

Toutes les locations du ticket source vérifiées et globalement exactes, avec corrections/précisions : (1) grading_criteria.md:7/27/49/71/96 confirmés — la formule l.96 est bien la première apparition des 4 clés, sans mapping préalable ; le seed disait l.96 'introduit brusquement les clés' : exact. (2) evaluator_prompt.md:83-86 -> en réalité l'objet scores s'étend de la l.82 à 86 (clé 'completeness' ouvre à l.83 mais le bloc 'scores': { démarre l.82) ; corrigé en 82-86. (3) tools.ts:26 confirmé : REQUIRED_KEYS['qa_report'] ne valide que la présence de 'scores'. (4) CORRECTION IMPORTANTE du seed : il affirme étendre 'le même mécanisme d'interpolation que evaluator.ts:198' au system prompt et aux .md. Vérifié : evaluator.ts:198 interpole les SEUILS (minGlobal/minCriterion lus de config l.136-137) UNIQUEMENT dans le prompt inline ANGLAIS — PAS dans les .md. Les .md (grading_criteria.md, evaluator_prompt.md) sont lus en readFileSync brut SANS substitution, côté evaluator (l.33-36) ET builder (l.29-32). Donc Option A doit INTRODUIRE un mécanisme d'interpolation sur le contenu .md qui n'existe pas encore — ce n'est pas une simple extension. (5) PRÉCISION du seed : l'asymétrie n'est pas seulement 'titre design->design / code->code_quality' : AUCUN des 4 titres FR n'égale sa clé (Complétude fonctionnelle->completeness, Qualité du design->design, Robustesse->robustness, Qualité du code->code_quality). (6) AJOUT : confirmé via grep que l'orchestrateur ne lit JAMAIS les sous-scores (seulement overall_score/verdict, orchestrator.ts:314/390/526) — le trou de clé divergente est donc 100% silencieux côté gate aujourd'hui. (7) config.yaml actuel n'a PAS de bloc qa.weights (seulement min_score_global:8 et min_score_per_criterion:7.0) ni types.ts correspondant — l'ajout de qa.weights relève de DX-01 (Option A), d'où depends_on:['DX-01'] ; ce ticket fournit les NOMS de clés canoniques que qa.weights devra utiliser. (8) Convention de test confirmée : tests vitest dans /tests (orchestrator-scoring.test.ts, tools.test.ts existants), en français, cible parfaite pour les nouveaux cas.

</details>

### DX-05 — Uniformiser le format des seuils QA dans la SSOT (min_score_global: 8 entier vs min_score_per_criterion: 7.0 flottant)

**Thème** Scoring · **Sévérité** 🟡 basse · **Effort** S · **Fidélité V1** oui · **Change le comportement** non · **Dépend de** DX-01

**Problème.** Sur l'échelle de notation unique 1-10, les deux seuils QA de `config.yaml` sont écrits dans des formats numériques incohérents : `min_score_global: 8` (entier) et `min_score_per_criterion: 7.0` (flottant). La même asymétrie est recopiée textuellement dans `prompts/grading_criteria.md:99` (« `score_final >= 8` ET chaque critère individuel `>= 7.0` »). C'est purement cosmétique : aucune conséquence runtime. `src/types.ts:45-46` type les deux champs en `number` (qui couvre int et float indifféremment), et le parseur `yaml` (utilisé via `parse()` dans `src/orchestrator.ts:49`) coerce `7.0` en le nombre JS `7`. Donc la comparaison `sprintPassed()` (orchestrator.ts:340, qui lit `min_score_global`) et l'interpolation `${minCriterion}` du prompt evaluator (evaluator.ts:137,198) fonctionnent identiquement quel que soit le format écrit. Le problème est uniquement la lisibilité de la SSOT des seuils : un mainteneur lisant `config.yaml` peut croire l'asymétrie int/float intentionnelle (par ex. penser que le seuil global est forcément entier alors que le par-critère accepterait des décimales), alors qu'elle ne traduit aucune sémantique. À traiter en même temps que DX-01 (Option A : config.yaml = SSOT totale, poids + seuils déplacés/interpolés dans les prompts), parce que DX-01 va de toute façon réécrire grading_criteria.md:99 et la table evaluator.ts en placeholders substitués au chargement — la normalisation de format doit être décidée à ce moment-là pour ne pas réintroduire l'incohérence.

**Preuves.**
- `config.yaml:60-61` — `min_score_global: 8` (entier YAML) et `min_score_per_criterion: 7.0` (flottant YAML) sous le bloc `qa:`. Même échelle 1-10, formats numériques différents.
- `prompts/grading_criteria.md:99` — Texte statique : `**PASS** si \`score_final >= 8\` ET chaque critère individuel \`>= 7.0\``. Reproduit verbatim l'asymétrie 8/7.0. C'est le SEUL endroit où l'asymétrie est visible textuellement (le .md est concaténé tel quel au system prompt par builder.ts:37 et evaluator.ts:56).
- `src/types.ts:45-46` — `min_score_global: number;` et `min_score_per_criterion: number;` — typés identiquement. Aucun impact compile-time du choix int vs float.
- `src/orchestrator.ts:49` — `return parse(raw) as Config;` — le parseur `yaml` coerce `7.0` en number JS `7`. Vérifié : `yaml.parse('b: 7.0')` => `{b:7}`, et l'interpolation template `` `${7}` `` rend `"7"`, jamais `"7.0"`.
- `src/agents/evaluator.ts:137,198` — `const minCriterion = qaConfig.min_score_per_criterion;` puis `every criterion >= ${minCriterion}`. Comme la valeur est déjà coercée en `7`, le prompt INLINE reçu par l'agent affiche déjà `8` / `7` (symétrique). L'asymétrie 8/7.0 n'existe donc QUE dans le .md statique, pas dans la table inline — correction importante au seed du ticket.
- `src/orchestrator.ts:340` — `const qaScore = config.qa.min_score_global;` consommé par `sprintPassed()` ; comparaison `overall_score >= min_score_global`. Insensible au format (int vs float) car JS `number`.
- `tests/orchestrator-scoring.test.ts:1-27` — Suite existante pour `sprintPassed`. Emplacement naturel pour ajouter un test d'invariant de format/cohérence des seuils si souhaité.

**Impact DX.** Friction de lecture faible mais réelle. La SSOT des seuils (config.yaml + grading_criteria.md) envoie un signal ambigu : l'asymétrie int/float laisse penser à une sémantique cachée alors qu'il n'y en a aucune. Après DX-01, config.yaml devient LA source unique citée dans toute la doc/onboarding ; y laisser un format incohérent multiplie le risque qu'un contributeur copie le pattern (ajout d'un futur seuil en `x.0` « pour faire comme l'autre »). Normaliser supprime cette ambiguïté à coût quasi nul.

**Correctif proposé.**
1. Décider d'un format unique pour les notes de l'échelle 1-10. Recommandation : entiers nus (`8` et `7`), car les notes par critère et le score global sont conceptuellement des entiers 1-10 (cf. tables de grading_criteria.md qui n'utilisent que des entiers) ; un seul format évite l'ambiguïté.
2. Dans `config.yaml:60-61`, remplacer `min_score_per_criterion: 7.0` par `min_score_per_criterion: 7` (laisser `min_score_global: 8` inchangé). Aucun changement de type côté `src/types.ts` (déjà `number`).
3. Ce ticket s'imbrique dans DX-01 (Option A). DX-01 transforme grading_criteria.md:99 et la table evaluator.ts:191-198 en placeholders substitués au chargement (même mécanisme d'interpolation que evaluator.ts:198, étendu aux poids + au system prompt, et répliqué côté builder qui partage grading_criteria.md). Donc : ne PAS coder en dur `8`/`7` dans le .md ; après DX-01, grading_criteria.md:99 doit lire les seuils via placeholders (ex. `score_final >= {{min_score_global}}` ET `>= {{min_score_per_criterion}}`) résolus depuis config.qa lors du `readFileSync` dans builder.ts ET evaluator.ts.
4. Vérifier que le moteur de substitution de DX-01 rend la valeur coercée par yaml (`7`), garantissant que .md substitué et prompt inline affichent strictement la même chaîne (`8` / `7`) — fin de l'asymétrie textuelle.
5. Si DX-01 n'est pas encore implémenté au moment de traiter ce ticket : appliquer a minima la normalisation `config.yaml` (étape 2) ET corriger grading_criteria.md:99 de `>= 7.0` vers `>= 7` pour cohérence immédiate, en notant que le .md sera de toute façon repassé en placeholders par DX-01.
6. Lancer `pnpm typecheck` et `pnpm test` ; aucune régression attendue (changement de valeur nul, format seul).

**Critères d'acceptation.**
- [ ] `config.yaml` n'écrit plus aucun seuil de l'échelle 1-10 en flottant : `grep -E 'min_score_(global|per_criterion):' config.yaml` retourne deux valeurs au même format (entiers nus `8` et `7`).
- [ ] `prompts/grading_criteria.md` ne contient plus la chaîne `7.0` (ni `8.0`) : `grep -F '7.0' prompts/grading_criteria.md` ne renvoie rien.
- [ ] Le system prompt reçu par l'évaluateur ET par le builder affiche les mêmes seuils que le prompt inline evaluator (`8` et `7`) — aucune divergence textuelle entre les deux représentations.
- [ ] Après DX-01 : changer `min_score_per_criterion` dans config.yaml propage la nouvelle valeur dans le prompt substitué (grading_criteria.md) reçu par les deux agents (vérifiable par un test d'interpolation).
- [ ] `pnpm typecheck` clean.
- [ ] `pnpm test` vert ; `sprintPassed` continue de passer (tests/orchestrator-scoring.test.ts inchangés et verts, la valeur `min_score_global` restant `8`).

**Risques.**
- Tension de fidélité V1 cosmétique (voir détail ci-dessus).

<details><summary>Notes de vérification</summary>

Toutes les locations du seed vérifiées contre le code réel. CORRECTIONS au seed : (1) Le seed affirme que l'asymétrie 8/7.0 se reproduit et que le fix touche la « table inline d'evaluator.ts » : en réalité evaluator.ts:198 interpole `${minCriterion}` depuis config, et le parseur `yaml` (orchestrator.ts:49) coerce `7.0` en number JS `7` — vérifié empiriquement (`yaml.parse('b: 7.0')` => `{b:7}`). Donc le prompt INLINE reçu par l'agent affiche DÉJÀ `8`/`7` (symétrique) ; l'asymétrie textuelle n'existe QUE dans le fichier statique grading_criteria.md:99. (2) types.ts:45-46 confirme les deux champs en `number` : zéro impact compile-time/runtime du choix int vs float — `behavior_change: false` est correct. (3) Confirmé que grading_criteria.md est concaténé tel quel au system prompt par builder.ts:37 ET evaluator.ts:56, donc l'asymétrie est visible par les deux agents via le .md — ce qui justifie de corriger côté builder ET evaluator, cohérent avec l'Option A de DX-01. (4) `tests/orchestrator-scoring.test.ts` existe et teste `sprintPassed` avec `min_score_global=8` ; il reste vert puisque seule la valeur par-critère change de format (et même pas de valeur).

</details>

### DX-04 — Typer QaReport.scores comme structure connue (QaCriterionScore) au lieu de Record<string, unknown>

**Thème** Typage/Validation · **Sévérité** 🟠 moyenne · **Effort** S · **Fidélité V1** oui · **Change le comportement** non · **Dépend de** —

**Problème.** Le champ `QaReport.scores` est typé `Record<string, unknown>` dans `src/types.ts:107`, alors que le prompt evaluator impose une forme stable et précise : un objet à exactement quatre clés (`completeness`, `design`, `robustness`, `code_quality`), chacune valant `{ score: number, weight: number, justification: string }` (cf. `prompts/evaluator_prompt.md:82-87`). Le champ central de tout le scoring du harnais est donc opaque côté TypeScript : un dev qui voudrait lire/valider/agréger les scores par critère de manière programmatique (par ex. pour ajouter un gate per-critère côté orchestrateur, ou un test qui vérifie Σpoids = 1) n'a aucune forme typée sur laquelle s'appuyer et doit faire des casts manuels.

Le correctif est purement compile-time : ajouter une interface `QaCriterionScore` et retyper `scores`. Aucun fichier `qa_report_N.json` n'est lu/parsé programmatiquement dans `src/` aujourd'hui (`grep "\.scores"` sur `src/` ne retourne rien ; les rapports sont seulement validés par présence de clés dans `tools.ts` via `REQUIRED_KEYS["qa_report"] = ["sprint_id","overall_score","verdict","scores","bugs"]`, et autrement consommés par l'agent LLM). Donc retyper le champ ne change ni le runtime ni le format JSON produit.

Tension de fidélité V1 : le port se veut "fidèle 1:1" et préserve volontairement le typage lâche `Record<string, unknown>` hérité de la nature dynamique du JSON Python. Resserrer le type est une amélioration DX qui s'écarte du minimalisme V1, à assumer explicitement. Pour éviter de casser le parse d'un JSON réel mal formé (un agent peut renvoyer une 5e clé ou omettre `justification`), il faut garder une signature d'index permissive ou rendre les sous-champs partiellement optionnels.

**Preuves.**
- `src/types.ts:103-112` — interface QaReport { sprint_id; overall_score; verdict; scores: Record<string, unknown>; bugs: QaReportBug[]; feedback?; feature_coverage?; [k:string]: unknown }. Ligne 107 = scores: Record<string, unknown> — le champ ciblé.
- `prompts/evaluator_prompt.md:82-87` — Bloc JSON canonique du rapport QA : scores:{ completeness:{score:8,weight:0.3,justification:'...'}, design:{score,weight:0.25,...}, robustness:{...,weight:0.25,...}, code_quality:{...,weight:0.2,...} }. Confirme la forme stable {score:number, weight:number, justification:string} pour 4 critères nommés.
- `prompts/grading_criteria.md:96` — Formule : score_final = completeness×0.30 + design×0.25 + robustness×0.25 + code_quality×0.20. Confirme les 4 mêmes critères et leurs poids en dur (somme = 1.0).
- `src/tools.ts:26` — REQUIRED_KEYS['qa_report'] = ['sprint_id','overall_score','verdict','scores','bugs'] — la seule validation programmatique de scores est sa présence (clé requise), pas sa forme. Aucune validation de structure interne.
- `src/types.ts:44-52` — interface Config.qa = { min_score_global; min_score_per_criterion; tools:{playwright;unit_tests;curl} }. PAS de champ `weights` aujourd'hui — donc DX-04 seul ne touche pas la config, mais une interface QaScoreWeights deviendra utile pour DX-01/DX-02 (Option A).
- `grep '\.scores' src/ → vide` — Aucun code dans src/ ne lit le champ scores d'un rapport QA. Confirme l'absence d'impact runtime du retypage.

**Impact DX.** Donne une forme exploitable et auto-documentée au champ le plus important du protocole inter-agents. Autocomplétion + vérification de type pour quiconque touche au scoring (notamment les tickets Option A qui déplaceront poids/seuils dans config.yaml et voudront éventuellement valider/agréger les scores par critère). Supprime des casts manuels et rend la structure `{score, weight, justification}` découvrable depuis l'IDE plutôt que cachée dans un prompt .md. Pose la brique de typage commune (`QaCriterionScore`, et optionnellement le set de noms de critères `QaCriterion`) réutilisable par DX-01/DX-02/DX-09.

**Correctif proposé.**
1. Dans src/types.ts, ajouter une interface : export interface QaCriterionScore { score: number; weight: number; justification: string; }
2. Définir une union des noms de critères alignée sur le prompt : export type QaCriterion = 'completeness' | 'design' | 'robustness' | 'code_quality';
3. Retyper le champ ligne 107 de `scores: Record<string, unknown>` vers une forme tolérante mais structurée. Recommandé (permissif, sûr au parse d'un JSON réel venant d'un LLM) : `scores: Partial<Record<QaCriterion, QaCriterionScore>> & Record<string, unknown>;` — garde l'index permissif pour ne pas casser sur un rapport mal formé ou avec une 5e clé.
4. Lancer `pnpm typecheck` et corriger les éventuels sites d'accès à `.scores` (il n'y en a aucun dans src/ aujourd'hui — reconfirmer qu'aucun n'a été ajouté entre-temps via grep).
5. NE PAS modifier ici les chiffres en dur des prompts ni introduire qa.weights : c'est le périmètre des tickets scoring Option A (DX-01/DX-02). DX-04 reste strictement le retypage compile-time. Si l'Option A est traitée dans la même session, exposer aussi `export type QaScoreWeights = Record<QaCriterion, number>;` pour que config.yaml (qa.weights) et QaCriterionScore.weight partagent le même vocabulaire de critères.
6. Optionnel (hors comportement) : ajouter un test vitest qui type-check une fixture scores conforme au bloc evaluator_prompt.md via `satisfies QaReport['scores']`.

**Critères d'acceptation.**
- [ ] `pnpm typecheck` reste clean après l'ajout de QaCriterionScore et le retypage de scores.
- [ ] `src/types.ts` expose une interface QaCriterionScore { score:number; weight:number; justification:string } et le champ QaReport.scores n'est plus `Record<string, unknown>` brut.
- [ ] Un accès typé `report.scores.completeness?.score` est résolu par le compilateur sans cast (autocomplétion sur les 4 critères).
- [ ] `pnpm test` reste vert (aucun changement runtime/format ; les schémas REQUIRED_KEYS de tools.ts ne sont pas modifiés).
- [ ] Le JSON produit par l'evaluator et la validation par clés requises de validate_json sont inchangés (aucune régression de protocole).

**Risques.**
- Tension de fidélité V1 : resserrer un type laissé volontairement lâche (Record<string, unknown>) s'écarte du minimalisme 'port 1:1'. À assumer comme amélioration DX consciente.
- Un type trop strict (ex: Record<QaCriterion, QaCriterionScore> sans index permissif, ou sous-champs non optionnels) pourrait donner une fausse garantie de structure alors que le JSON provient d'un LLM et peut être incomplet/mal formé — d'où la recommandation Partial<...> + index signature. Le type ne valide rien au runtime, il ne fait que documenter la forme attendue.
- Faux sentiment de sécurité : aucun parse runtime n'est ajouté ici, donc un rapport non conforme ne sera pas détecté par ce ticket (ce serait le rôle d'un futur ticket de validation zod/structurelle). Ne pas survendre la garantie.
- Couplage léger avec l'Option A : si DX-01/DX-02 renomment ou ajoutent des critères, l'union QaCriterion devra rester synchronisée avec config.yaml et les prompts — risque de dérive si les deux ne sont pas traités ensemble.

<details><summary>Notes de vérification</summary>

Toutes les affirmations du seed sont confirmées exactes. `src/types.ts:107` = `scores: Record<string, unknown>` (vérifié). `prompts/evaluator_prompt.md:82-87` = bloc scores avec exactement {completeness/design/robustness/code_quality:{score,weight,justification}} (vérifié). `prompts/grading_criteria.md:96` = formule avec poids 0.30/0.25/0.25/0.20 (vérifié). Corrections/précisions : (1) `grep '\.scores' src/` ne retourne RIEN → aucun consommateur programmatique du champ, ce qui renforce behavior_change=false (purement compile-time). (2) La seule validation programmatique de scores est sa présence comme clé requise dans `src/tools.ts:26` (REQUIRED_KEYS['qa_report']), pas sa structure — donc le retypage n'affecte pas validate_json. (3) Pour cohérence Option A : config.yaml (lignes 59-66) et Config.qa (src/types.ts:44-52) ne contiennent PAS encore de champ `weights` ; les poids vivent en dur dans grading_criteria.md:96 et dans la table inline d'evaluator.ts:191-196 (les seuils min_global/min_criterion y sont déjà interpolés via ${minGlobal}/${minCriterion} ligne 198). DX-04 ne crée pas qa.weights — périmètre des tickets scoring Option A — mais fournit le vocabulaire de critères (QaCriterion) réutilisable par eux. depends_on laissé vide : DX-04 est autonome et constitue un prérequis 'soft' pour DX-02 (gate per-critère programmatique) plutôt que l'inverse.

</details>

### DX-39 — overall_score n'est jamais recalculé contre la formule pondérée (confiance aveugle au score auto-déclaré)

**Thème** Scoring · **Sévérité** 🟠 moyenne · **Effort** S · **Fidélité V1** oui · **Change le comportement** non · **Dépend de** DX-01, DX-04

> _Ajouté par la critique de complétude — locations à reconfirmer en session._

**Problème.** Le harnais fait confiance au champ `overall_score` produit par l'évaluateur ; il ne recalcule jamais Σ(score_i × poids_i) pour vérifier que le score global correspond réellement aux scores par critère. C'est un invariant DISTINCT du gate par-critère (DX-02) : même si chaque critère est ≥ seuil, rien ne garantit que overall_score = somme pondérée. Sous l'Option A (poids passés en config via DX-01) et avec `scores` typé (DX-04), ce recalcul devient trivial.

**Preuves.**
- `prompts/grading_criteria.md:96` — Formule pondérée — unique endroit où elle est définie, jamais exécutée côté code.
- `src/orchestrator.ts:310-315` — sprintPassed lit overall_score mais ne le recompose jamais depuis report.scores.

**Impact DX.** Un score global incohérent (erreur de l'agent, ou hallucination) passe sans détection. Documenter la limite évite qu'un lecteur croie le score vérifié ; un contrôle de cohérence en warning donne un filet sans rigidifier la décision.

**Correctif proposé.**
1. Au minimum : documenter au point de lecture (commentaire près de sprintPassed) que overall_score est auto-déclaré et non recalculé.
2. Optionnel (après DX-01/DX-04) : ajouter un contrôle de cohérence avec tolérance ε entre overall_score et la somme pondérée calculée depuis qa.weights + report.scores, émis en WARNING (pas en échec dur) pour préserver la fidélité V1.

**Critères d'acceptation.**
- [ ] Le comportement de décision PASS/FAIL reste inchangé (si on s'en tient à la doc).
- [ ] Si le contrôle optionnel est ajouté : un rapport dont overall_score s'écarte de >ε de la somme pondérée déclenche un log d'avertissement, et un test le couvre.

**Risques.**
- Activer un échec dur sur l'écart changerait le comportement V1 — s'en tenir au warning.

<details><summary>Notes de vérification</summary>

Issu de critic.dropped (scoring_deep_dive.inconsistencies item 7 ; audit dim 1 élément 4). À confirmer en session.

</details>

---

## Thème — Typage & Validation

_Robustesse du typage et de la validation runtime. DX-09 (parseurs/type-guards apres readJson au lieu de casts 'as X|null' sur sortie LLM) est le pivot dont depend la reprise (DX-23). DX-11 valide config.yaml en zod au chargement (loadConfig fait parse...as Config sans verif). DX-08 corrige l'enum validate_json (feature_list_item expose, drift enum(6)/desc(5), double-cast destructeur). DX-10 aligne REQUIRED_KEYS sur les champs reellement consommes et documente la triple source de verite. DX-18 active noUncheckedIndexedAccess pour aligner la rigueur reelle sur la posture 'strict'. (DX-04 type aussi mais est range cote Scoring car co-localise.)_

### DX-09 — Introduire des parseurs/type-guards après readJson (remplacer les casts 'as X | null' sur sortie LLM non validée)

**Thème** Typage/Validation · **Sévérité** 🔴 haute · **Effort** M · **Fidélité V1** oui · **Change le comportement** oui · **Dépend de** —

**Problème.** `readJson(workspace, filename)` (src/orchestrator.ts:52-66) retourne `unknown | null` (sur fichier absent → null + warn ; sur JSON invalide → null + error ; sinon `JSON.parse(raw) as unknown`). Chaque appelant caste ensuite directement le résultat vers un type d'artefact LLM SANS validation runtime des types de valeurs :

- src/orchestrator.ts:277-280 → `as ContractReview | null` (puis lit `.approved`, `.feedback`, `.requested_changes`)
- src/orchestrator.ts:381-384 → `as QaReport | null` (puis lit `.overall_score`, `.verdict`, `.bugs`, `.feedback`)
- src/orchestrator.ts:434 → `as ProductSpec | null` (puis lit `.sprints`)
- src/orchestrator.ts:524 → `as QaReport | null` (rapport final)

Le code se protège ensuite par des défauts dispersés (`?? 0`, `?? "FAIL"`, `?? []`, `?? ""`), preuve implicite que le type asserté n'est pas fiable. Mais ces défauts ne couvrent QUE null/undefined, pas les types incorrects. Deux dangers concrets, confirmés en lecture du code :

1. CRASH : si l'LLM écrit `"overall_score": "8.5"` (string), alors à l.390 `report.overall_score ?? 0` vaut la string `"8.5"` (le `??` ne déclenche pas), puis l.392 `score.toFixed(1)` lance un TypeError (`.toFixed` n'existe pas sur string) → exception non rattrapée dans `runSprint`.
2. FAUX PASS silencieux : `sprintPassed` (l.310-315) fait `(report?.overall_score ?? 0) >= minScore`. Avec `overall_score: "8.5"` (string), `"8.5" >= 8` coerce en `8.5 >= 8` → `true`. Un score textuel peut donc faire passer un sprint sans que personne ne le voie.

La validation par clés requises (`validateJson`/`REQUIRED_KEYS`, tools.ts:112-121) ne vérifie QUE la présence des clés (`!(k in record)`), jamais le type des valeurs — et n'est de toute façon invoquée que par l'agent via MCP, pas par l'orchestrateur après `readJson`.

Correctif (cohérent avec le chemin déjà géré « rapport absent ≈ rapport invalide ») : introduire des parseurs/type-guards `parseQaReport(data): QaReport | null`, `parseProductSpec(...)`, `parseContractReview(...)` qui réutilisent `REQUIRED_KEYS`, coercent/valident les champs numériques critiques (`overall_score`), et retournent `null` si invalide. Les appeler juste après `readJson` ; un parse `null` suit alors la branche déjà existante « did not produce / cannot read » (continue/return).

**Preuves.**
- `src/orchestrator.ts:53-61` — readJson signature `(workspace, filename): unknown | null`; corps fait `JSON.parse(raw) as unknown` — aucune validation de forme, retourne null sur fichier absent ou JSON illisible.
- `src/orchestrator.ts:277-284` — `const review = readJson(...) as ContractReview | null;` puis `if (review === null) continue;` — cast direct sans type-guard; ensuite `review.approved`, `review.feedback`, `review.requested_changes` lus tels quels.
- `src/orchestrator.ts:381-388` — `const report = readJson(..., qa_report_${sprintNum}.json) as QaReport | null;` puis `if (report === null) continue;` — cast direct.
- `src/orchestrator.ts:390-392` — `const score = report.overall_score ?? 0; ... console.info(... ${score.toFixed(1)} ...)`. Le `?? 0` ne protège que de null/undefined: si overall_score est la string '8.5', score.toFixed(1) lance TypeError. Confirme la non-fiabilité du type asserté.
- `src/orchestrator.ts:310-315` — sprintPassed est une fonction PURE qui n'utilise PAS de cast (param structurel `{verdict?: unknown; overall_score?: number}`). MAIS `(report?.overall_score ?? 0) >= minScore` accepte une string: '8.5' >= 8 coerce et renvoie true → faux PASS si le score est textuel. C'est un consommateur du cast amont (l.381-384), pas un site de cast.
- `src/orchestrator.ts:434-438` — `const spec = readJson(..., product_spec.json) as ProductSpec | null; if (spec === null || !('sprints' in spec)) return;` — seul `sprints` est vérifié en présence (in), pas son type (devrait être array d'objets {id,...}).
- `src/orchestrator.ts:524-527` — `const report = readJson(..., qa_report_final.json) as QaReport | null;` puis `report.overall_score ?? 0` + `.toFixed(1)` (l.529): même hazard string→TypeError qu'au sprint.
- `src/tools.ts:104-121` — validateJson ne contrôle que la présence des clés requises (`required.filter(k => !(k in record))`); aucune vérification du type des valeurs. REQUIRED_KEYS.qa_report = [sprint_id, overall_score, verdict, scores, bugs] (l.26).
- `src/types.ts:103-112` — interface QaReport déclare overall_score: number, verdict: string, mais c'est purement compile-time (commentaire l.5-7: validation runtime déléguée aux REQUIRED_KEYS). Rien n'empêche un fichier LLM de violer ces types.
- `tests/orchestrator-scoring.test.ts:1-27` — Tests existants de sprintPassed couvrent verdict/score numériques et null/undefined, mais AUCUN cas où overall_score est une string — le faux PASS '8.5' >= 8 n'est pas couvert.

**Impact DX.** Aujourd'hui un fichier QA mal formé par l'LLM (champ numérique en string, verdict absent, scores non-objet) provoque soit un crash opaque de l'orchestrateur en plein sprint (TypeError sur .toFixed, pile peu parlante), soit un faux PASS silencieux qui laisse passer un sprint non conforme — les deux coûtent du budget API et de la confiance. Des parseurs centralisés rendent le contrat de chaque artefact explicite et testable, transforment « données LLM corrompues » en un échec propre et déjà géré (rapport ≈ absent → retry/skip), et offrent un point unique pour logguer POURQUOI un artefact a été rejeté. Le mainteneur peut alors faire confiance aux types `QaReport`/`ProductSpec`/`ContractReview` en aval au lieu de parsemer des `??` défensifs.

**Correctif proposé.**
1. Créer un module src/parsers.ts (ou bloc dans tools.ts près de REQUIRED_KEYS) exportant des fonctions pures: parseProductSpec, parseSprintContract, parseQaReport, parseContractReview, prenant `data: unknown` et retournant `T | null`.
2. Dans chaque parseur: (a) vérifier que data est un objet non-null non-array; (b) réutiliser REQUIRED_KEYS[schema] pour exiger la présence des clés (même liste que validateJson, source unique); (c) coercer/valider les champs critiques: pour qa_report, exiger que overall_score soit coercible en nombre fini (Number(x) non-NaN) et stocker la valeur NUMÉRIQUE coercée; vérifier que verdict est une string, scores un objet, bugs un array; pour product_spec, exiger que sprints soit un array; (d) retourner null (sans throw) si une contrainte échoue, en logguant via console.warn la raison précise.
3. Important (cohérence Option A scoring): le parseur NE doit PAS embarquer de seuils ni de poids de scoring en dur — il valide/coerce la forme uniquement. Les seuils (min_score_global, min_score_per_criterion) et poids restent gérés par config.yaml + interpolation des prompts (périmètre des tickets scoring), et la comparaison de PASS reste dans sprintPassed. Le parseur garantit seulement que overall_score est un number, ce qui supprime le faux PASS string et le crash .toFixed.
4. Remplacer les casts au point d'appel: l.277-280 `parseContractReview(readJson(...))`; l.381-384 `parseQaReport(readJson(...))`; l.434 `parseProductSpec(readJson(...))`; l.524 `parseQaReport(readJson(...))`. Conserver les branches `if (x === null) { warn; continue|return; }` existantes — un parse échoué emprunte le même chemin qu'un fichier absent.
5. Durcir sprintPassed (l.310-315) pour exiger un overall_score de type number (rejeter string même coercible) afin de fermer définitivement le faux PASS, OU s'appuyer sur le fait que parseQaReport a déjà coercé en number en amont — choisir l'option qui garde sprintPassed pure et testable (préférer: garder la comparaison numérique stricte `typeof report?.overall_score === 'number'`).
6. Ajouter des tests vitest dans tests/ (ex: tests/parsers.test.ts): qa_report valide → objet typé; overall_score string '8.5' → soit coercé en number 8.5 par parseQaReport, soit rejeté (null) selon décision; clé manquante → null; data non-objet → null; product_spec sans sprints array → null. Ajouter un cas sprintPassed avec overall_score string → false.
7. pnpm typecheck et pnpm test doivent rester clean.

**Critères d'acceptation.**
- [ ] pnpm typecheck clean (aucun `as QaReport|null`/`as ProductSpec|null`/`as ContractReview|null` restant dans orchestrator.ts; les casts sont remplacés par des appels de parseurs typés).
- [ ] pnpm test clean, avec de nouveaux tests couvrant: qa_report avec overall_score en string, qa_report sans clé requise, product_spec sans sprints array, contract_review non-objet.
- [ ] Un qa_report où overall_score est la string '8.5' ne provoque PLUS de TypeError sur .toFixed et ne produit PLUS un PASS: soit le rapport est rejeté (null → retry), soit overall_score est coercé en number 8.5 et la décision PASS reste numériquement correcte.
- [ ] Les parseurs réutilisent REQUIRED_KEYS (pas de duplication de la liste de clés) — la même source que validateJson.
- [ ] Aucun seuil ni poids de scoring n'est introduit en dur dans les parseurs (cohérence Option A: scoring piloté par config.yaml + interpolation des prompts, hors de ce ticket).
- [ ] Un parse échoué (forme invalide) suit exactement le chemin déjà existant 'fichier absent' (warn + continue/return), sans nouvelle branche de gestion d'erreur.

**Risques.**
- Tension de fidélité V1: la V1 Python castait probablement aussi sans validation de type. Ajouter une validation runtime CHANGE le comportement (un rapport au type tordu qui aurait été 'sauvé' par coercion JS deviendra un échec/retry). C'est l'intention du ticket (behavior_change=true) mais cela s'écarte du « port fidèle 1:1 » — à valider explicitement avec le mainteneur, car d'autres limitations V1 sont préservées délibérément.
- Choix de politique sur overall_score string: coercer (Number('8.5')=8.5, plus permissif, plus proche du comportement JS actuel) vs rejeter (plus strict). Coercer un '8.5x' ou '' donne NaN — bien traiter NaN comme invalide.
- Si un parseur devient trop strict (ex: exiger feature_coverage), il pourrait rejeter des rapports historiquement acceptés: ne valider QUE les clés de REQUIRED_KEYS + les types critiques, garder feedback/feature_coverage optionnels (conformes aux champs `?` de l'interface QaReport).
- Durcir sprintPassed pour exiger typeof number pourrait casser les tests existants si l'un d'eux s'appuyait sur la coercion — vérifier tests/orchestrator-scoring.test.ts (actuellement tous numériques, donc OK).
- Le faux PASS string et le crash .toFixed concernent aussi le score affiché à l.529 (rapport final) — ne pas oublier ce site, sinon le bug persiste en phase 3.

<details><summary>Notes de vérification</summary>

Toutes les locations ont été lues et vérifiées. Corrections vs ticket source: (1) `readJson` ne caste PAS lui-même — il retourne `unknown|null` (l.61 `as unknown`); les casts `as X|null` sont aux POINTS D'APPEL (l.280, 384, 434, 524). (2) src/orchestrator.ts:310-315 (sprintPassed) n'est PAS un site de cast: c'est une fonction pure au paramètre structurel `{verdict?: unknown; overall_score?: number}` — c'est un CONSOMMATEUR du cast amont (l.381-384). Je l'ai requalifié en site de symptôme. (3) Les défauts dispersés cités sont confirmés: l.292 `?? ""`, l.390 `?? 0`, l.391 `?? "FAIL"`, l.403 `?? []`, plus l.404 `?? ""` et l.526-527 (final). (4) Hazard `.toFixed` sur string confirmé l.392 ET l.529 (rapport final, non listé dans le ticket source — ajouté). (5) Faux PASS confirmé: `'8.5' >= 8` coerce → true dans sprintPassed (l.314). (6) REQUIRED_KEYS.qa_report = [sprint_id, overall_score, verdict, scores, bugs] (tools.ts:26); validation = présence seule (l.113 `!(k in record)`). (7) Tests existants (tests/orchestrator-scoring.test.ts) ne couvrent pas le cas string. Le répertoire de tests est `tests/` (pas `test/`). Ce ticket est primairement Typage/Validation; l'overlap scoring se limite à overall_score — j'ai borné le correctif pour rester cohérent Option A (aucun seuil/poids en dur dans les parseurs).

</details>

### DX-11 — Valider config.yaml au chargement avec zod — loadConfig fait `parse(raw) as Config` sans aucune vérification runtime

**Thème** Typage/Validation · **Sévérité** 🟠 moyenne · **Effort** M · **Fidélité V1** non · **Change le comportement** oui · **Dépend de** DX-01

**Problème.** `loadConfig` (src/orchestrator.ts:41-50) lit config.yaml via `yaml.parse` puis fait un simple cast TypeScript `return parse(raw) as Config`. Le cast `as Config` est purement compile-time : il n'effectue AUCUNE vérification à l'exécution. Conséquence : une clé mal orthographiée (ex. `min_score_globl` au lieu de `min_score_global`), un type incorrect (string au lieu de number), ou une section manquante n'est jamais détectée au chargement. L'erreur surgit beaucoup plus tard et de façon opaque :
- `config.qa.min_score_global` devient `undefined` → propagé dans `sprintPassed(report, undefined)` (orchestrator.ts:340, 394) où la comparaison `>= undefined` est toujours false → aucun sprint ne passe jamais, sans message clair.
- `config.budget.max_total_usd` devient `undefined`/`NaN` → `isOverBudget` (progress.ts:62) fait `total_cost_usd >= NaN` qui est TOUJOURS false → le garde-fou budgétaire ne se déclenche jamais, et le pipeline peut brûler des $ sans limite.
- Une section `agent_limits` ou `models` manquante crashe bien plus loin avec une stack trace cryptique au moment du run agent.

Contrairement aux artefacts JSON inter-agents (product_spec.json, qa_report_N.json, etc.) qui sont volontairement souples car produits librement par les agents (validation par REQUIRED_KEYS dans tools.ts, sans zod, fidèle à la V1), config.yaml est sous le contrôle TOTAL du repo/mainteneur. Il n'y a donc AUCUNE tension de fidélité V1 à valider strictement ce fichier : un schéma zod strict qui échoue tôt avec un message lisible est le comportement attendu et n'altère pas le protocole agent.

zod est déjà une dépendance directe (package.json:17, `^4.4.3`) et déjà importé dans src/tools.ts (`import { z } from "zod"`) pour déclarer les params des outils MCP — mais il n'est pas utilisé pour valider la config.

Ce ticket est un PRÉREQUIS de robustesse pour l'Option A du scoring (config.yaml = source unique de vérité) : une fois que les poids QA et les seuils seront lus depuis config.yaml et substitués dans les prompts, une config malformée corromprait silencieusement les prompts envoyés aux agents. Valider tôt évite ça.

**Preuves.**
- `src/orchestrator.ts:41-50` — loadConfig: lit le YAML puis `return parse(raw) as Config` — cast pur, zéro validation runtime. Aucune vérification de présence de clé ni de type.
- `src/types.ts:15-57` — Interface `Config` : structure cible (project, models, stack, orchestration, budget, agent_limits, qa, security). NOTE: il n'existe AUCUN champ `qa.weights` ici — l'audit source affirmait à tort que `qa.weights` existe déjà. Les poids (30/25/25/20) sont actuellement hardcodés ailleurs, pas dans config.yaml/Config (cf DX-01).
- `config.yaml:59-65` — Section qa : min_score_global=8, min_score_per_criterion=7.0, tools{playwright,unit_tests,curl}. Aucun bloc `weights`.
- `src/progress.ts:61-62` — isOverBudget(maxUsd) { return this.total_cost_usd >= maxUsd; } — si maxUsd vaut NaN/undefined (config mal validée), la comparaison est toujours false → budget jamais déclenché.
- `src/orchestrator.ts:340` — `const qaScore = config.qa.min_score_global;` puis passé à sprintPassed(report, qaScore) (ligne 394). Un undefined ici fait échouer silencieusement tous les sprints.
- `src/tools.ts:16` — `import { z } from "zod";` — zod déjà importé et utilisé pour les params MCP (lignes 146-167), preuve que la dép est disponible mais pas exploitée pour la config.
- `package.json:17` — "zod": "^4.4.3" — dépendance directe déjà présente (zod v4).
- `src/tools.ts:22-123` — REQUIRED_KEYS + validateJson : validation souple par clés-requises des artefacts inter-agents, délibérément SANS zod (fidèle V1). À NE PAS confondre avec config.yaml : la distinction artefacts-souples vs config-stricte est le coeur de ce ticket.

**Impact DX.** Aujourd'hui une faute de frappe dans config.yaml produit un échec silencieux et trompeur (tous les sprints FAIL, ou budget jamais respecté) que le mainteneur devra débugger à la main en remontant des NaN/undefined à travers plusieurs modules. Avec une validation zod au chargement, l'erreur est attrapée immédiatement avec un message pointant la clé/le type fautif (ex. `qa.min_score_global: Expected number, received undefined`), avant tout appel agent — donc avant de dépenser le moindre $ d'API. Gain net de débuggabilité et de confiance pour le mainteneur, sans aucun impact sur le comportement des agents quand la config est correcte.

**Correctif proposé.**
1. Créer `src/config-schema.ts` exportant un schéma zod `ConfigSchema` (z.object) qui reproduit EXACTEMENT l'interface `Config` de src/types.ts:15-57 : project{name,workspace}, models{planner,builder,evaluator}, stack{frontend,backend,backend_options[],database}, orchestration{max_sprints,max_retries_per_sprint,contract_negotiation_rounds}, budget{max_total_usd}, agent_limits{planner,builder,evaluator: chacun {max_turns:number, permission_mode:string, allowed_tools:string[]}}, qa{min_score_global:number, min_score_per_criterion:number, tools{playwright:boolean,unit_tests:boolean,curl:boolean}}, security{bash_allowlist:string[], bash_denylist:string[]}. Utiliser `.strict()` sur les objets pour rejeter les clés inconnues (détecte les fautes de frappe).
2. Coordonner avec DX-01 (Option A) : si DX-01 ajoute le bloc `qa.weights` (ex. {completeness, design, robustness, code_quality}) dans config.yaml, l'ajouter aussi à ConfigSchema avec une contrainte de somme. Implémenter via `.refine(w => Math.abs((w.completeness+w.design+w.robustness+w.code_quality) - 1.0) < 1e-9, 'qa.weights must sum to 1.0')`. Ce refine est le point de jonction explicite avec DX-01 ; si DX-01 n'est pas encore fait, valider au minimum les seuils existants et laisser un TODO marqué `// DX-01` pour le bloc weights.
3. Dériver le type depuis le schéma : `export type Config = z.infer<typeof ConfigSchema>` dans config-schema.ts, puis faire de src/types.ts:15-57 un ré-export (`export type { Config } from "./config-schema"`) OU garder l'interface manuelle ET ajouter un test de cohérence type-level. Privilégier z.infer pour éliminer la double-source de vérité (le schéma devient la SSOT du type Config).
4. Modifier `loadConfig` (src/orchestrator.ts:41-50) : remplacer `return parse(raw) as Config` par `return ConfigSchema.parse(parse(raw))`. Optionnel mais recommandé : envelopper dans try/catch pour transformer une `ZodError` en message lisible (`error.issues` formatés en `path: message`) avant de re-throw / process.exit(1), de sorte que l'échec au chargement soit immédiat et explicite.
5. Ajouter `tests/config-schema.test.ts` (vitest, dossier tests/ — cf vitest.config.ts include `tests/**/*.test.ts`) : (a) un fixture valide minimal parse sans erreur ; (b) une clé mal nommée (`min_score_globl`) fait échouer `.parse` ; (c) un type incorrect (string pour max_total_usd) échoue ; (d) [si DX-01 fait] des poids dont la somme ≠ 1.0 échouent via le refine ; (e) charger le vrai config.yaml du repo passe la validation (garde-fou de non-régression sur le fichier checké-in).
6. `pnpm typecheck` et `pnpm test` doivent rester clean.

**Critères d'acceptation.**
- [ ] `pnpm typecheck` clean après refactor (loadConfig retourne bien un Config, que le type vienne de z.infer ou de l'interface conservée).
- [ ] `pnpm test` clean ; un nouveau test échoue si on introduit une clé mal orthographiée dans la config validée (ex. `min_score_globl`).
- [ ] Lancer le harness avec un config.yaml contenant une faute de frappe ou un type incorrect produit une erreur AU CHARGEMENT (avant tout appel agent) avec un message identifiant le chemin de la clé fautive — et non un NaN/undefined silencieux plus tard.
- [ ] Le vrai config.yaml du repo passe `ConfigSchema.parse` sans modification (test de non-régression).
- [ ] [Si DX-01 réalisé] Un test échoue lorsque Σ(qa.weights) ≠ 1.0 (tolérance 1e-9).
- [ ] Aucun changement de comportement observable quand config.yaml est valide (mêmes valeurs propagées aux agents et au budget).

**Risques.**
- zod v4 (^4.4.3) : l'API d'erreurs diffère de zod v3 (ex. `error.issues`, format de message, `.strict()` sur z.object reste supporté mais vérifier la syntaxe exacte v4). Tester le formatage des messages d'erreur réellement produits.
- `.strict()` rejette TOUTE clé inconnue : si un futur réglage est ajouté à config.yaml sans mettre à jour le schéma, le chargement échouera. C'est le comportement voulu (force la cohérence) mais à documenter pour ne pas surprendre.
- Si on adopte `z.infer` comme source du type Config, bien vérifier que tous les consommateurs (orchestrator, builder, evaluator, planner, security, progress) compilent à l'identique — le type inféré doit être structurellement égal à l'interface actuelle (attention à optional vs required, et à `permission_mode` typé `string` puis casté en `Options["permissionMode"]`).
- Dépendance d'ordre avec DX-01 : la contrainte de somme des poids ne peut être implémentée que si DX-01 a introduit `qa.weights` dans config.yaml et le schéma. Sans DX-01, livrer la validation des seuils/structure et marquer le refine weights en TODO pour éviter de bloquer ce ticket.
- behavior_change=true assumé et souhaité : une config jusqu'ici tolérée silencieusement (clés en trop, types laxistes que yaml.parse acceptait) peut désormais faire échouer le démarrage. C'est l'intention (échouer tôt), mais vérifier que le config.yaml checké-in et tout config de dev local restent valides.
- Aucune tension de fidélité V1 : la V1 Python ne validait pas non plus la config, mais valider config.yaml ne touche PAS le protocole JSON inter-agents (qui reste souple via REQUIRED_KEYS). La fidélité concerne les artefacts agents, pas le fichier de config du repo.

<details><summary>Notes de vérification</summary>

Vérifié en lisant le code réel. CORRECTIONS apportées à l'audit source : (1) Le seed_problem affirme que `qa.weights` existe déjà dans config.yaml — c'est FAUX : ni config.yaml (lignes 59-65) ni l'interface Config (types.ts:44-52) ne contiennent de bloc `weights`. Les poids 30/25/25/20 sont hardcodés dans evaluator.ts:191-196 (table markdown du prompt) et grading_criteria.md:96. L'ajout de qa.weights dans config.yaml relève de DX-01 ; ce ticket en dépend pour la partie 'somme des poids'. (2) Les locations citées sont exactes : loadConfig est bien à src/orchestrator.ts:41-50, l'interface Config à src/types.ts:15-57. (3) Confirmé que zod est déjà dep (package.json:17, version ^4.4.3 = zod v4) et déjà importé/utilisé dans tools.ts pour les params MCP, mais jamais pour la config. (4) Confirmé le mécanisme de propagation des erreurs : config.budget.max_total_usd → isOverBudget (progress.ts:62, `>= maxUsd`) toujours false si NaN ; config.qa.min_score_global → sprintPassed (orchestrator.ts:340/394). (5) Les artefacts inter-agents sont validés par REQUIRED_KEYS dans tools.ts SANS zod, volontairement (fidèle V1) — la distinction config-stricte vs artefacts-souples tient. (6) Tests en vitest dans tests/ (include `tests/**/*.test.ts`), zod v2 de vitest pinné. depends_on=DX-01 ajouté (synergie poids). depends_on DX-22 mentionné dans le seed comme contexte (zod sous-utilisé) mais ce n'est pas un prérequis bloquant, donc non listé dans depends_on.

</details>

### DX-08 — validate_json: enum schema_name expose 'feature_list_item' (cle interne) comme schema appelable + drift enum(6)/description(5) + double-cast 'as unknown as' qui detruit le type litteral

**Thème** Typage/Validation · **Sévérité** 🟠 moyenne · **Effort** S · **Fidélité V1** oui · **Change le comportement** oui · **Dépend de** —

**Problème.** L'outil MCP `validate_json` declare son parametre `schema_name` via `z.enum([...Object.keys(REQUIRED_KEYS), "feature_list"] as unknown as [string, ...string[]])` (src/tools.ts:166-168). `REQUIRED_KEYS` (src/tools.ts:22-28) contient 5 cles dont `feature_list_item`, qui est une cle INTERNE servant uniquement a valider chaque element du tableau dans la branche `schema_name === "feature_list"` (src/tools.ts:69). L'enum genere donc 6 valeurs publiques: product_spec, feature_list_item, sprint_contract, qa_report, contract_review, feature_list.

Trois problemes en decoulent:

1) Schema interne expose. Un agent peut appeler `validate_json(schema_name="feature_list_item")` sur n'importe quel fichier. Au lieu d'etre rejete comme "Unknown schema", il tombe dans la branche objet-unique (src/tools.ts:90-123) qui exige les cles d'un item (id, sprint, category, description, passes) sur le fichier entier. Resultat trompeur: une `feature_list.json` (qui est un tableau) declenchera "feature_list_item must be a JSON object" (src/tools.ts:104-110), et un objet quelconque ayant ces 5 cles sera declare "Valid feature_list_item." — un verdict qui n'a aucun sens dans le protocole inter-agents (aucun fichier nomme feature_list_item n'existe).

2) Drift enum/description. La description de l'outil (src/tools.ts:162-163) annonce explicitement 5 schemas: "Available schemas: product_spec, feature_list, sprint_contract, qa_report, contract_review." L'enum en expose 6. Le message d'erreur "Unknown schema" (src/tools.ts:97) liste lui `Object.keys(REQUIRED_KEYS)` (5 cles, dont feature_list_item mais SANS feature_list) — soit une 3eme liste encore differente. Trois sources de verite incoherentes pour le meme ensemble de schemas.

3) Double-cast destructeur de type. Le `as unknown as [string, ...string[]]` (src/tools.ts:167) ecrase le type litteral: `schema_name` est type `string` au lieu d'une union litterale. On perd toute exhaustivite/auto-completion cote TS et toute garantie que les valeurs de l'enum correspondent aux cles reellement gerees par `validateJson`.

Fix (cf. proposed_fix): declarer une liste `PUBLIC_SCHEMAS` `as const` derivee explicitement (sans feature_list_item, avec feature_list), l'utiliser pour `z.enum`, la description ET le message "Unknown schema", en gardant `feature_list_item` interne a `REQUIRED_KEYS`.

**Preuves.**
- `src/tools.ts:22-28` — REQUIRED_KEYS contient 5 cles: product_spec, feature_list_item, sprint_contract, qa_report, contract_review. feature_list_item est une cle interne (pas un nom de fichier du protocole inter-agents).
- `src/tools.ts:62-88` — Branche `schema_name === 'feature_list'`: valide un tableau, utilise REQUIRED_KEYS['feature_list_item'] (l.69) pour valider chaque item. C'est le SEUL usage legitime de feature_list_item.
- `src/tools.ts:90-123` — Branche objet-unique: si schema_name=='feature_list_item' est passe, `required = REQUIRED_KEYS['feature_list_item']` est defini (l.91), donc PAS d'erreur 'Unknown schema'; le fichier entier est traite comme un item unique => verdicts trompeurs ('Valid feature_list_item.' l.123).
- `src/tools.ts:162-163` — Description de l'outil: 'Available schemas: product_spec, feature_list, sprint_contract, qa_report, contract_review.' => 5 valeurs, sans feature_list_item.
- `src/tools.ts:166-168` — z.enum([...Object.keys(REQUIRED_KEYS), 'feature_list'] as unknown as [string, ...string[]]) => 6 valeurs incl. feature_list_item. Double-cast `as unknown as` => schema_name type `string`, perte du type litteral et de l'exhaustivite z.enum.
- `src/tools.ts:97` — Message 'Unknown schema ... Available: ' liste Object.keys(REQUIRED_KEYS) = 5 cles dont feature_list_item mais SANS feature_list. 3e liste, encore differente de l'enum et de la description.
- `legacy-python/tools.py:163-166` — V1 Python fait `'enum': list(_REQUIRED_KEYS.keys()) + ['feature_list']` => contient aussi feature_list_item. La presence de feature_list_item dans l'enum est donc une REPRODUCTION FIDELE d'un defaut V1, PAS un defaut de port. Seul le `as unknown as` est un artefact TS.

**Impact DX.** Surface d'API ambigue pour les agents: 6 schemas exposes vs 5 documentes vs 5 listes en erreur. Un agent (Planner/Builder/Evaluator) peut invoquer un schema interne et recevoir un verdict de validation faux-positif ou faux-negatif, masquant un vrai probleme de format ou faisant croire a une validite inexistante. Cote mainteneur, le `as unknown as` casse l'auto-completion et empeche le compilateur de detecter un futur desalignement entre l'enum et les branches de validateJson. Corriger centralise la liste des schemas publics en une seule source et restaure le typage litteral.

**Correctif proposé.**
1. Dans src/tools.ts, juste apres REQUIRED_KEYS (l.28), declarer la liste publique explicite: `export const PUBLIC_SCHEMAS = ['product_spec', 'feature_list', 'sprint_contract', 'qa_report', 'contract_review'] as const;` (inclut feature_list, exclut feature_list_item).
2. Remplacer l'enum (src/tools.ts:166-168) par `schema_name: z.enum(PUBLIC_SCHEMAS)` — supprimer entierement le `[...Object.keys(REQUIRED_KEYS), 'feature_list'] as unknown as [string, ...string[]]`. z.enum accepte un readonly tuple `as const`, ce qui restaure le type litteral pour schema_name.
3. Garder REQUIRED_KEYS['feature_list_item'] tel quel (interne); il reste utilise par la branche feature_list (src/tools.ts:69). Ne PAS le retirer de REQUIRED_KEYS.
4. Aligner le message 'Unknown schema' (src/tools.ts:97): remplacer `Object.keys(REQUIRED_KEYS).join(', ')` par `PUBLIC_SCHEMAS.join(', ')` pour que la liste affichee corresponde exactement a l'enum et a la description.
5. Optionnel mais recommande: deriver la description (src/tools.ts:162-163) de PUBLIC_SCHEMAS pour eliminer la 3e source en dur — ex: `'Validate a JSON file against a known schema. Available schemas: ' + PUBLIC_SCHEMAS.join(', ') + '.'`.
6. Verification de comportement: comme feature_list_item n'est plus dans l'enum mais reste dans REQUIRED_KEYS, un appel direct validateJson(ws, f, 'feature_list_item') passerait encore la branche objet (la fonction pure ne filtre pas sur PUBLIC_SCHEMAS). Si l'on veut fermer aussi ce trou cote fonction pure, ajouter en tete de la branche objet-unique (avant src/tools.ts:91) un garde: `if (!PUBLIC_SCHEMAS.includes(schemaName as ...)) return Unknown schema`. A discuter (cf. risks) car cela change le comportement de la fonction pure au-dela de la surface enum.
7. Ajouter/mettre a jour les tests (cf. acceptance_criteria) et lancer pnpm typecheck + pnpm test.

**Critères d'acceptation.**
- [ ] pnpm typecheck est clean (aucun `as unknown as` restant pour schema_name; z.enum(PUBLIC_SCHEMAS) compile).
- [ ] Le type infere de schema_name dans le handler est l'union litterale des 5 schemas publics, pas `string` (verifiable par un test-type ou par hover/tsc).
- [ ] L'enum z.enum, la description de l'outil et le message 'Unknown schema' listent exactement les memes 5 valeurs (product_spec, feature_list, sprint_contract, qa_report, contract_review), sans feature_list_item.
- [ ] Un test verifie que feature_list_item n'apparait PAS dans PUBLIC_SCHEMAS et que feature_list y apparait.
- [ ] Les 7 tests existants de tests/tools.test.ts passent toujours sans modification de comportement pour les schemas legitimes.
- [ ] (Si fix #6 retenu) un nouveau test verifie que validateJson(ws, f, 'feature_list_item') renvoie isError avec 'Unknown schema'.

**Risques.**
- Tension de fidelite V1: la presence de feature_list_item dans l'enum est une reproduction FIDELE du V1 Python (legacy-python/tools.py:166 fait list(_REQUIRED_KEYS.keys()) + ['feature_list']). Retirer feature_list_item de l'enum est donc un ecart volontaire vis-a-vis du V1 (behavior_change=true). A confirmer avec le mainteneur que corriger ce defaut V1 est acceptable malgre la regle 'port fidele incl. limitations'. Le seed ticket affirmait a tort 'pas un choix V1'.
- La fonction pure validateJson reste accessible avec schema_name='feature_list_item' tant que le garde #6 n'est pas ajoute: l'enum ne protege que les appels via MCP, pas les appels directs (tests, code interne). Decider du perimetre.
- Risque d'oubli d'alignement: si on derive la description de PUBLIC_SCHEMAS (#5), bien preserver le wording exact pour ne pas perturber les prompts agents qui pourraient s'appuyer sur la formulation.
- z.enum exige un tuple non-vide; `as const` sur PUBLIC_SCHEMAS suffit (5 elements), aucun cast necessaire — verifier la version de zod (declaree dans package.json) supporte z.enum sur readonly tuple (zod >=3.x OK).

<details><summary>Notes de vérification</summary>

Toutes les locations du seed verifiees et precisees: enum a src/tools.ts:166-168 (le seed disait 166-168 OK), description a :162-163 (le seed disait l.163, en realite la string commence l.162), REQUIRED_KEYS a :22-28 OK, branche array a :62-88 (le seed disait 61-69; le lookup feature_list_item est bien l.69, la branche complete va jusqu'a 88), branche objet a :90-123 (le seed disait 104+). CORRECTION MAJEURE: le seed affirme 'Defaut de port (pas un choix V1)' — c'est INEXACT pour l'appartenance de feature_list_item a l'enum: legacy-python/tools.py:163-166 construit l'enum via list(_REQUIRED_KEYS.keys()) + ['feature_list'], qui contient deja feature_list_item. C'est donc une reproduction fidele d'un defaut V1, d'ou fidelity_tension passe a true (le seed avait false). Seul le double-cast `as unknown as` est un artefact 100% TS sans equivalent Python. Le drift de description (5 vs 6) existe aussi en V1 (description identique 'Available schemas: product_spec, feature_list, sprint_contract, qa_report, contract_review' a legacy-python/tools.py:154). Aucune autre reference a validate_json/schema_name dans src/ ou prompts/ (grep): seul src/tools.ts est concerne, donc pas de propagation a builder/evaluator. depends_on vide (ticket autonome, sans lien scoring/Option A). Tests existants: tests/tools.test.ts couvre la fonction pure validateJson mais aucun test ne couvre la construction de l'enum ni le cas feature_list_item."

</details>

### DX-10 — Aligner REQUIRED_KEYS sur les champs réellement consommés par l'orchestrateur (requested_changes, etc.) + test de cohérence prompts↔schémas, et documenter la triple source de vérité types.ts/REQUIRED_KEYS/prompts

**Thème** Typage/Validation · **Sévérité** 🟠 moyenne · **Effort** S · **Fidélité V1** oui · **Change le comportement** non · **Dépend de** —

**Problème.** Le harnais possède TROIS sources de vérité non synchronisées pour la forme des artefacts JSON inter-agents, toutes maintenues à la main sans contrôle croisé :

1. `REQUIRED_KEYS` (src/tools.ts:22-28) — utilisé par l'outil MCP `validate_json` que les agents appellent pour s'auto-valider.
2. Les interfaces TypeScript (src/types.ts) — miroir compile-time, jamais utilisé pour valider au runtime.
3. Les schémas JSON documentés dans les prompts .md (builder_prompt.md, evaluator_prompt.md) — ce que les agents produisent réellement.

Conséquence : plusieurs champs sont documentés dans les prompts ET consommés par l'orchestrateur, mais ABSENTS de REQUIRED_KEYS. Donc un agent peut produire un fichier qui passe `validate_json` (« Valid contract_review. ») tout en omettant un champ dont dépend la boucle de feedback. Cas vérifiés :

- `contract_review.requested_changes` : lu en orchestrator.ts:294 pour construire le feedback envoyé au builder ; documenté en evaluator_prompt.md:30 et dans le prompt inline evaluator.ts:108 ; ABSENT de REQUIRED_KEYS.contract_review = [sprint_id, approved, feedback]. S'il manque, le builder ne reçoit que `feedback` (le `?? []` en orchestrator.ts:294 masque l'absence) → boucle de négociation appauvrie sans erreur.
- `sprint_contract.out_of_scope` / `sprint_contract.technical_approach` : documentés en builder_prompt.md:73-76, explicitement vérifiés côté evaluator (evaluator_prompt.md:99 pour out_of_scope ; prompt inline evaluator.ts:100 « technical_approach is sound ») ; ABSENTS de REQUIRED_KEYS.sprint_contract = [sprint_id, sprint_name, agreed_deliverables].
- `qa_report.tests_run` / `qa_report.feedback` / `qa_report.bugs[].reproduction_steps` / `qa_report.screenshots` : documentés en evaluator_prompt.md:98-107 (et `feedback` lu en orchestrator.ts:404) ; ABSENTS de REQUIRED_KEYS.qa_report = [sprint_id, overall_score, verdict, scores, bugs]. `feedback` est lu via `?? ""` (orchestrator.ts:404) donc tolérant.
- `qa_report.feature_coverage` : lu en orchestrator.ts:527 (`?? "?"`), documenté en evaluator_prompt.md:126 et evaluator.ts:153, attendu uniquement dans le rapport FINAL (qa_report_final). REQUIRED_KEYS n'a pas de schéma distinct pour le rapport final.

Le risque réel n'est PAS un crash (l'orchestrateur garde-fou tout avec `?? []`/`?? ""`), mais une dégradation SILENCIEUSE : « validate_json OK » donne une fausse assurance que la boucle inter-agents transporte bien toute l'information de feedback. C'est un trou de fidélité où le contrat documenté (prompts) et le contrat validé (REQUIRED_KEYS) divergent sans que personne ne le sache.

Tension de fidélité V1 : REQUIRED_KEYS est un port littéral des clés minimales de la V1 Python. Élargir les clés requises = changement de comportement de `validate_json` (un fichier sans `requested_changes` serait désormais rejeté), ce qui pourrait faire échouer des agents qui passaient avant. C'est pourquoi ce ticket est cadré behavior_change=false : l'objectif est de DÉTECTER et DOCUMENTER l'écart (test de cohérence + commentaires), pas d'élargir les clés requises au runtime (ce qui serait un ticket séparé à behavior_change=true).

**Preuves.**
- `src/tools.ts:22-28` — REQUIRED_KEYS : product_spec/feature_list_item/sprint_contract/qa_report/contract_review avec leurs jeux de clés minimaux. sprint_contract=[sprint_id,sprint_name,agreed_deliverables] ; qa_report=[sprint_id,overall_score,verdict,scores,bugs] ; contract_review=[sprint_id,approved,feedback]. Exporté (utilisable en test).
- `src/orchestrator.ts:291-294` — evaluatorFeedback = (review.feedback ?? '') + '\n' + JSON.stringify(review.requested_changes ?? [], null, 2). Donc requested_changes EST consommé, mais le `?? []` masque son absence silencieusement.
- `src/orchestrator.ts:403-411` — Construction du feedback QA à partir de report.feedback (`?? ''`) et report.bugs (`?? []`), avec bug.severity/description/file/line/suggested_fix tous gardés par `??`. reproduction_steps n'est PAS lu par l'orchestrateur (seulement documenté pour l'agent).
- `src/orchestrator.ts:524-529` — report.feature_coverage lu via `?? '?'` pour l'affichage du rapport final ; champ optionnel, absent de REQUIRED_KEYS.
- `prompts/builder_prompt.md:73-76` — Le schéma sprint_contract documenté inclut out_of_scope et technical_approach, tous deux absents de REQUIRED_KEYS.sprint_contract.
- `prompts/evaluator_prompt.md:30` — contract_review documenté inclut requested_changes (absent de REQUIRED_KEYS.contract_review).
- `prompts/evaluator_prompt.md:98-107` — qa_report documenté inclut tests_run, feedback, screenshots (et bugs[].reproduction_steps en evaluator_prompt.md:94) — tous absents de REQUIRED_KEYS.qa_report.
- `src/agents/evaluator.ts:99-100` — Le prompt inline de review de contrat exige explicitement que out_of_scope soit explicite et technical_approach soit sound — confirme que ces champs font partie du contrat attendu côté agent, alors qu'ils ne sont pas requis par validate_json.
- `src/types.ts:79-92` — SprintContract et ContractReview déclarent agreed_deliverables/requested_changes mais avec index signature [k:string]:unknown ; requested_changes est `?` (optionnel). Aucune validation runtime n'utilise ces interfaces (commentaire types.ts:4-6).
- `tests/tools.test.ts:7` — validateJson est déjà importé et testé ici ; REQUIRED_KEYS est exporté depuis src/tools.ts → un nouveau test de cohérence peut l'importer directement. vitest.config.ts inclut tests/**/*.test.ts.

**Impact DX.** Sans contrôle croisé, toute évolution d'un prompt (ajout d'un champ requis dans le schéma documenté) ou de REQUIRED_KEYS dérive silencieusement de l'autre. Un mainteneur qui ajoute un champ au schéma du prompt croit qu'il sera validé ; il ne l'est pas. Inversement, `validate_json` peut donner « OK » sur un fichier qui prive la boucle de négociation/QA d'information. Un test de cohérence transforme cet écart implicite en garde-fou explicite et auto-documenté : toute future divergence prompts↔REQUIRED_KEYS casse le build, forçant une décision consciente (élargir REQUIRED_KEYS, ou ajouter le champ à une liste d'exemptions documentée). Améliore aussi la lisibilité : un commentaire pointant les trois sources évite à un nouveau contributeur de chercher pourquoi types.ts/REQUIRED_KEYS/prompts ne coïncident pas.

**Correctif proposé.**
1. Décider du cadrage (behavior_change=false) : on NE modifie PAS le jeu de clés réellement exigé par validate_json au runtime (préserve la fidélité V1 et évite de rejeter des fichiers auparavant acceptés). On ajoute un test de cohérence + de la documentation.
2. Créer tests/required-keys-consistency.test.ts (vitest, même style que tests/tools.test.ts). Importer REQUIRED_KEYS depuis ../src/tools.
3. Dans ce test, déclarer une table de référence explicite des champs ATTENDUS par schéma — séparée en deux ensembles : (a) hardRequired = clés que validate_json doit exiger (= REQUIRED_KEYS actuel), (b) consumedByOrchestrator = champs lus par orchestrator.ts pour piloter une boucle (requested_changes pour contract_review ; feedback+bugs pour qa_report ; feature_coverage pour le rapport final).
4. Ajouter un test qui échoue si un champ de consumedByOrchestrator n'est ni dans REQUIRED_KEYS ni dans une liste documentee d'exemptions tolérées (EXPECTED_OPTIONAL). Comme requested_changes/feature_coverage/feedback sont volontairement non-requis (gardés par `??`), les inscrire dans EXPECTED_OPTIONAL avec un commentaire expliquant pourquoi → le test devient un inventaire vivant de l'écart assumé.
5. Ajouter un second test de garde-fou pur : pour chaque schéma de REQUIRED_KEYS, vérifier qu'aucune clé requise n'a été supprimée par rapport à un snapshot figé dans le test (détecte une régression accidentelle de validate_json).
6. (Optionnel, faible coût, behavior_change=false) Extraire dans tests/ ou dans un fichier de fixtures la liste des clés documentées dans chaque schéma de prompt, et asserter que tout champ hardRequired figure bien dans le bloc JSON du prompt correspondant (lecture readFileSync des .md + regex sur les clés). Cela ferme la boucle prompts→REQUIRED_KEYS dans le sens inverse.
7. Ajouter un commentaire de bloc au-dessus de REQUIRED_KEYS (src/tools.ts:22) listant les TROIS sources de vérité (types.ts, REQUIRED_KEYS, prompts/*.md) et pointant vers le test de cohérence comme garde-fou. Ajouter un commentaire symétrique en tête de src/types.ts (déjà partiellement présent lignes 4-6) renvoyant au test.
8. Lancer `pnpm test` et `pnpm typecheck` ; s'assurer que tout est vert et que le nouveau test échoue bien si on retire artificiellement une clé de REQUIRED_KEYS ou un champ de la table de référence.
9. NE PAS toucher aux prompts .md ni au scoring ici (le scoring relève de l'Option A traitée par les tickets scoring dédiés). Ce ticket est strictement validation/typage.

**Critères d'acceptation.**
- [ ] `pnpm typecheck` est clean.
- [ ] `pnpm test` passe ; tests/required-keys-consistency.test.ts s'exécute via vitest.config.ts (include tests/**/*.test.ts).
- [ ] Le test ÉCHOUE si on retire une clé d'un schéma de REQUIRED_KEYS (snapshot/garde-fou).
- [ ] Le test ÉCHOUE si un champ consommé par l'orchestrateur (ex: requested_changes) n'est ni dans REQUIRED_KEYS ni dans la liste documentée EXPECTED_OPTIONAL — vérifiable en l'ajoutant temporairement à consumedByOrchestrator sans l'exempter.
- [ ] La liste EXPECTED_OPTIONAL documente explicitement, avec justification, chaque champ volontairement non-requis (requested_changes, feature_coverage, feedback, tests_run, screenshots, out_of_scope, technical_approach, reproduction_steps).
- [ ] Un commentaire au-dessus de REQUIRED_KEYS (src/tools.ts) nomme les trois sources de vérité et renvoie au test.
- [ ] Comportement runtime de validate_json INCHANGÉ : un sprint_contract sans out_of_scope est toujours accepté comme avant (vérifié par un cas de test explicite).

**Risques.**
- Tension de fidélité V1 : si quelqu'un confond ce ticket avec « élargir REQUIRED_KEYS au runtime », cela rejetterait des fichiers auparavant valides et casserait des agents en cours d'exécution → bien rester sur test+doc (behavior_change=false). Tout élargissement effectif des clés requises doit être un ticket séparé assumé behavior_change=true.
- Le test (étape 6) qui parse les blocs JSON des prompts .md par regex est fragile aux changements de formatage Markdown ; le garder optionnel et tolérant (ne matcher que les clés de premier niveau) ou s'en tenir à la table de référence manuelle (étapes 3-5) qui est robuste.
- Risque de duplication : la table de référence du test devient une 4e source à maintenir. L'atténuer en la gardant minimale (uniquement les champs réellement consommés par l'orchestrateur, pas tout le schéma) et en la documentant comme l'inventaire canonique de l'écart assumé.
- Faux sentiment de sécurité si la liste EXPECTED_OPTIONAL est mise à jour mécaniquement à chaque échec sans réflexion : documenter dans le commentaire qu'ajouter un champ à EXPECTED_OPTIONAL est une décision (le champ restera non garanti côté validate_json).

**Notes de complétude (critique).**
- Inclure un test de cohérence prompts ⇄ REQUIRED_KEYS pour les champs `requested_changes`, `out_of_scope`, `technical_approach`, `tests_run`.

<details><summary>Notes de vérification</summary>

Toutes les locations du ticket source sont EXACTES et vérifiées ligne par ligne : tools.ts:22-28, orchestrator.ts:294 (requested_changes via `?? []`), orchestrator.ts:403-411, orchestrator.ts:527, builder_prompt.md:73-78 (out_of_scope l.73, technical_approach l.76), evaluator_prompt.md:30 (requested_changes), evaluator_prompt.md:98-106 (tests_run/feedback/screenshots). Corrections/précisions par rapport au seed : (1) requested_changes est déclaré OPTIONNEL dans types.ts:90 et l'orchestrateur le garde avec `?? []`, donc son absence ne crashe PAS — l'impact est une dégradation silencieuse du feedback, pas une panne ; le seed disait « la boucle de feedback fonctionne » ce qui est juste mais nuance : elle fonctionne en mode dégradé. (2) Le seed mentionne reproduction_steps comme consommé ; VÉRIFIÉ FAUX côté orchestrateur — reproduction_steps n'est lu nulle part dans src/ (seulement documenté dans les prompts pour guider l'agent) ; il est néanmoins un champ documenté de qa_report.bugs absent de REQUIRED_KEYS, donc pertinent pour le test de cohérence mais pas « consommé par l'orchestrateur ». (3) technical_approach est exigé non seulement dans builder_prompt.md mais aussi dans le prompt inline evaluator.ts:100, et out_of_scope dans evaluator.ts:99 / evaluator_prompt.md:99 — renforce que ce sont des champs de contrat attendus. (4) feature_coverage n'est attendu QUE dans qa_report_final ; REQUIRED_KEYS ne distingue pas rapport intermédiaire vs final (un seul schéma qa_report) — à mentionner dans EXPECTED_OPTIONAL. (5) Infra de test confirmée : vitest.config.ts include tests/**/*.test.ts, REQUIRED_KEYS et validateJson sont exportés, tests/tools.test.ts importe déjà depuis ../src/tools — le test de cohérence s'intègre sans nouvelle config. Le scoring (poids 30/25/25/20 en dur dans evaluator.ts:191-196 et evaluator_prompt.md:63-71) est hors périmètre de ce ticket (relève de l'Option A / tickets scoring) ; ce ticket ne touche ni aux poids ni aux seuils.

</details>

### DX-18 — Activer noUncheckedIndexedAccess et remplacer les casts `as string` par des gardes prouvees, pour aligner la rigueur reelle sur la posture "strict" annoncee

**Thème** Typage/Validation · **Sévérité** 🟡 basse · **Effort** S · **Fidélité V1** non · **Change le comportement** non · **Dépend de** —

**Problème.** `tsconfig.json` active `strict: true` mais force explicitement `noUncheckedIndexedAccess: false`, alors que `CLAUDE.md` (ligne 76) et la spec de migration (`docs/superpowers/specs/...:90`) annoncent "TypeScript strict". Le flag `noUncheckedIndexedAccess` est precisement celui qui transforme un acces indexe `arr[i]` en `T | undefined` au lieu de `T`, ce qui force a prouver que l'index est valide.

CORRECTION MAJEURE par rapport au seed du ticket : apres verification reelle, activer le flag SANS aucune modification de code laisse `tsc --noEmit` propre (EXIT=0) et `pnpm test` vert (27/27). La premisse du seed selon laquelle le flag "revelerait des trous / acces hors borne" est inexacte pour le code actuel : tous les acces indexes potentiellement dangereux sont deja pre-empt par des casts `as string` ou de l'optional chaining. Il n'y a donc PAS de bug latent a corriger ici.

Ce qui reste vrai et justifie le ticket : (1) un ecart documentation/realite ("strict" annonce mais le flag le plus utile de la famille est desactive) ; (2) deux casts `as string` qui contournent le typage (`security.ts:44` et `security.ts:217`). Le cast de la ligne 217 (`tokens[1] as string`) est le seul "load-bearing" : si on active le flag et qu'on le retire, on obtient 4 erreurs TS2345 (l'argument `string | undefined` n'est pas assignable a `path.join`/`path.isAbsolute`). Or la ligne 211 garde deja `tokens.length < 2`, donc `tokens[1]` est prouvablement defini : le cast masque cette relation au compilateur au lieu de l'exprimer. Le cast ligne 44 (`s[i] as string`) n'est meme PAS necessaire au typecheck (le retirer compile quand meme, car `ch` n'est utilise qu'en concatenation/comparaison qui tolerent `undefined`) ; c'est un cast purement cosmetique.

L'objectif du ticket est donc : activer le flag (alignement posture) ET remplacer les deux casts par des constructions qui prouvent reellement la non-nullite (gardes / readonly assertions) plutot que de la masquer, afin que la classe de bug "acces hors borne" soit reellement attrapee par le compilateur a l'avenir, dans tout nouveau code.

**Preuves.**
- `tsconfig.json:7-8` — `"strict": true` immediatement suivi de `"noUncheckedIndexedAccess": false` — desactivation explicite du flag le plus pertinent de la famille strict.
- `CLAUDE.md:76` — "- TypeScript strict, ESM ... ; type annotations everywhere" — la doc annonce strict sans nuance, alors que le flag est desactive.
- `src/security.ts:44` — `const ch = s[i] as string;` dans la boucle `shlexSplit`. Verifie : retirer ce cast AVEC le flag active compile quand meme (EXIT=0). Cast non load-bearing / cosmetique.
- `src/security.ts:211-218` — Ligne 211 garde `if (tokens.length < 2) { deny }`. Ligne 217 `const target = tokens[1] as string;`. Verifie : avec flag=true, retirer ce cast produit 4 erreurs TS2345 (lignes 218,219,225) car `target: string | undefined` alimente `path.isAbsolute`/`path.join`. Le cast est donc load-bearing mais masque une non-nullite deja garantie par la garde.
- `tests/tools.test.ts:32,41,53,62,70,76,84` — `res.content[0]?.text` — acces indexe deja protege par optional chaining ; aucun changement requis sous le flag.
- `src/index.ts:10-11` — `const userPrompt = process.argv[2];` suivi de `if (userPrompt === undefined)` — deja correctement garde, compatible flag=true.
- `tsconfig.json (test manuel)` — Passer le flag a true sans toucher au code : `npx tsc --noEmit` -> EXIT=0 ; `pnpm test` -> 27 passed. Aucun bug latent revele.

**Impact DX.** Faible mais reel. Aujourd'hui : (1) la doc ment legerement sur le niveau de rigueur ; un contributeur croit que les acces indexes sont verifies alors qu'ils ne le sont pas, et tout nouveau code introduisant un `arr[i]` non garde passera silencieusement. (2) Les casts `as string` sont du "type-laundering" : ils suppriment la securite localement et donnent l'illusion d'un code prouve. Apres le fix : le compilateur attrape reellement la classe "acces hors borne" pour tout futur code, et le code de securite (le module le plus sensible du harnais) exprime ses invariants via des gardes lisibles plutot que via des casts opaques. Pas de pas absent de runner ; impact purement maintenabilite/confiance.

**Correctif proposé.**
1. Dans `tsconfig.json`, passer `"noUncheckedIndexedAccess": false` a `true` (ou supprimer la ligne pour heriter du defaut, qui reste false — donc l'ecrire explicitement a `true`).
2. `src/security.ts:217` : remplacer `const target = tokens[1] as string;` par une garde explicite qui prouve la non-nullite au compilateur. Option recommandee : juste apres la garde `if (tokens.length < 2) { return deny }`, ecrire `const target = tokens[1];` puis `if (target === undefined) { return { behavior: "deny", message: "Bare 'cd' is not allowed (would leave workspace)." }; }` — ce qui rend `target` de type `string` pour la suite SANS cast. (Le branche est mort en pratique grace a la garde length, mais il satisfait le compilateur honnetement.)
3. `src/security.ts:44` : retirer le cast `as string`. `const ch = s[i];` suffit ; verifier que la boucle compile (elle compile : `ch` n'est utilise qu'en `+=`/`===`). Si un usage requiert un narrowing, ajouter `if (ch === undefined) break;` en tete de boucle (deja garanti par `i < s.length`).
4. Scanner tout `src/` et `tests/` pour d'autres acces indexes nus introduits depuis (`grep -rn '\[[0-9]\]' src tests` et `.split(...)[n]`, `.pop()`, `.shift()`), corriger via garde/optional-chaining si le flag les revele.
5. Lancer `pnpm typecheck` (doit etre EXIT=0) et `pnpm test` (27/27).
6. Optionnel : mettre a jour `CLAUDE.md:76` pour mentionner explicitement `noUncheckedIndexedAccess` active, afin que la doc reflete la realite.

**Critères d'acceptation.**
- [ ] `tsconfig.json` contient `"noUncheckedIndexedAccess": true`.
- [ ] `pnpm typecheck` -> EXIT=0 (aucune erreur).
- [ ] `pnpm test` -> 27 tests passent (aucune regression).
- [ ] Plus aucun `as string` sur un acces indexe dans `src/security.ts` (verifiable : `grep -n 'as string' src/security.ts` ne retourne aucune ligne issue de `s[i]`/`tokens[1]`).
- [ ] Le comportement runtime de `shlexSplit` et du handler `cd` est inchange (les memes tests `tests/security.test.ts` passent sans modification).
- [ ] Un nouvel acces indexe non garde ajoute volontairement dans un fichier `src/` fait echouer `pnpm typecheck` (preuve que le flag attrape bien la classe de bug).

**Risques.**
- Risque faible de fidelite V1 : ce ticket touche la rigueur de typage TS, pas le comportement observable ; le port reste 1:1 cote runtime. A confirmer que les casts retires ne changent aucune valeur a l'execution (ils ne le font pas : `as string` est efface au compile-time).
- Si du nouveau code a ete ajoute depuis cette analyse (date d'audit 2026-05-29), le flag pourrait reveler de nouvelles erreurs non listees ici — l'etape 4 (scan global) couvre ce cas mais peut elargir l'effort.
- Piege : reflexe de re-introduire un `as` pour faire taire le compilateur. La consigne est d'utiliser des gardes/narrowing, pas des casts, sinon le ticket ne livre aucune valeur (on revient au type-laundering).
- Tres faible risque de creer une branche morte `if (target === undefined)` qu'un futur lint signalera comme inatteignable ; acceptable car il n'y a pas de lint configure dans le repo (aucun eslint detecte), et la branche exprime un invariant defensif.

<details><summary>Notes de vérification</summary>

VERIFIE LIGNE PAR LIGNE. Corrections vs seed du ticket : (1) Severite abaissee de medium a low et effort de medium a small — le seed surestime le travail : activer le flag ne casse RIEN aujourd'hui (`tsc --noEmit` EXIT=0, `pnpm test` 27/27 sous flag=true, teste reellement). (2) Le seed affirme que le flag "revelerait des trous (acces hors borne)" : FAUX pour le code actuel — tous les acces sont deja pre-empt par casts/optional-chaining ; il n'y a aucun bug latent. Le ticket reste utile pour l'alignement doc/realite et pour remplacer les casts opaques par des gardes honnetes. (3) Locations confirmees : `tsconfig.json:8` (le seed disait :9, c'est :8 dans le fichier reel — `noUncheckedIndexedAccess` est ligne 8, `esModuleInterop` ligne 9). (4) `security.ts:44` = `const ch = s[i] as string;` confirme, mais cast NON load-bearing (retire => compile encore). (5) `security.ts:217` = `const target = tokens[1] as string;` confirme, cast load-bearing (retire sous flag => 4x TS2345 lignes 218/219/225), MAIS l'acces est deja prouvablement sur grace a la garde length ligne 211. (6) `client.ts:86` cite par le seed = `for (const block of msg.message.content)` : c'est une iteration `for...of`, PAS un acces indexe ; cette location est hors-sujet pour ce ticket, retiree. (7) Aucun outil de lint dans le repo (pas d'eslint), donc les casts redondants ne sont pas signales automatiquement. (8) Tests utilisent `content[0]?.text` (optional chaining), deja compatibles.

</details>

### DX-40 — validate_json ne vérifie que la PRÉSENCE des clés, jamais leur type ni les sous-structures

**Thème** Typage & Validation · **Sévérité** 🟠 moyenne · **Effort** M · **Fidélité V1** oui · **Change le comportement** non · **Dépend de** DX-09, DX-11

> _Ajouté par la critique de complétude — locations à reconfirmer en session._

**Problème.** L'outil MCP validate_json (REQUIRED_KEYS, tools.ts) ne contrôle que la présence des clés de premier niveau — jamais leur type ni la forme des sous-objets. Un `scores: {quality: 9}` (clés inattendues) ou un `overall_score: "huit"` passe la validation. Limite transversale à TOUS les schémas, distincte de DX-03 (mapping titres→clés) et DX-37 (tests). Elle fait reposer les casts `as X` (DX-09) sur une garantie quasi nulle.

**Preuves.**
- `src/tools.ts:71-78` — validate_json : boucle de présence des clés requises, sans contrôle de type.
- `src/tools.ts:113-121` — Même schéma de validation présence-seule pour les autres artefacts.

**Impact DX.** La validation runtime donne une fausse assurance : un artefact structurellement faux mais aux bonnes clés est accepté, puis casse plus loin (readJson → cast → accès). Durcir (ou au moins documenter) clarifie ce sur quoi le code peut réellement compter.

**Correctif proposé.**
1. Documenter explicitement la garantie réelle (présence-seule) dans tools.ts et CLAUDE.md.
2. Ou durcir : définir un schéma zod minimal par type d'artefact (types des champs critiques : overall_score:number, verdict:string, scores:objet de critères) et valider via zod — synergie directe avec DX-11 (zod sur config) et DX-22 (zod sous-utilisé).

**Critères d'acceptation.**
- [ ] La limite est soit documentée sans ambiguïté, soit remplacée par une validation de type ; dans ce dernier cas un test échoue sur un artefact aux bonnes clés mais aux mauvais types.

**Risques.**
- Durcir peut faire échouer des rapports d'agents auparavant tolérés — calibrer le schéma sur ce que les prompts demandent réellement (DX-03/DX-10).

<details><summary>Notes de vérification</summary>

Issu de critic.dropped (audit dim 4, finding présence-seule). À confirmer en session.

</details>

---

## Thème — Securite

_DX-16 (high) : projectName=process.argv[3] non assaini coule dans path.resolve(workspace, projectName) — un nom '..'/absolu sort de ./workspace et deplace le confinement securite des agents sur le mauvais repertoire. DX-17 : limites reelles du bash_denylist (substring naif via RegExp.test sur la commande complete, redondance avec l'allowlist) et non-confinement des sous-shells sh -c / bash -c — a documenter et tester._

### DX-16 — Assainir projectName (process.argv[3]) : un nom avec '..' ou chemin absolu résout HORS de ./workspace et déplace le confinement sécurité des agents sur le mauvais répertoire

**Thème** Sécurité · **Sévérité** 🔴 haute · **Effort** S · **Fidélité V1** oui · **Change le comportement** oui · **Dépend de** —

**Problème.** Le 2e argument CLI (`process.argv[3]`, nom de projet) est passé tel quel, sans aucune validation ni assainissement, à `path.resolve(config.project.workspace, projectName)` dans `main()` (orchestrator.ts:549). `path.resolve` (comme `os.path.abspath`/`os.path.join` côté V1) traite `..` et les chemins absolus de manière transparente : un nom comme `../../../tmp/evil` résout HORS du dossier `./workspace` prévu, et un nom commençant par `/` (ex. `/etc/foo`) ignore complètement la racine workspace.

La conséquence va au-delà d'un simple répertoire mal placé. Le `workspace` ainsi calculé est ensuite propagé comme `workspaceDir` à `createPermissionHandler(config, workspaceDir)` (orchestrator → agents → security.ts:137), où il devient `absWorkspace = path.resolve(workspaceDir)` (security.ts:142). Or `absWorkspace` est la RACINE de tout le confinement filesystem des agents : confinement Bash (cd / chemins, security.ts:163,198,219), Read/Write/Edit (security.ts:245), Glob/Grep (security.ts:256). Si la racine est un dossier échappé, les agents sont confinés au mauvais endroit (ex. `/home/issa/tmp/evil` ou `/etc`) au lieu de rester sous `./workspace`. De plus `main()` exécute `fs.mkdirSync(workspace, { recursive: true })` (orchestrator.ts:550), `git init` (orchestrator.ts:554) et `cleanupWorkspacePorts(workspace)` (orchestrator.ts:594) sur ce chemin échappé, et écrit `progress.json` / `claude-progress.txt` (progress.ts) dedans.

Ce n'est pas un input venant d'un agent (qui serait déjà filtré par le permission handler) mais l'argument de lancement de l'orchestrateur lui-même — la valeur qui DÉFINIT la frontière de sécurité. Si elle est échappée, tout le mécanisme de confinement s'applique à la mauvaise frontière. À noter : la même faille existe à l'identique dans la V1 Python (orchestrator.py:448 `os.path.abspath(os.path.join(...))` sans validation), donc c'est un défaut préexistant fidèlement porté, pas une régression du port TS.

**Preuves.**
- `src/index.ts:16` — `const projectName = process.argv[3] ?? "default";` — l'argv brut est pris sans aucune validation puis passé directement à `main(userPrompt, projectName)` (index.ts:18).
- `src/orchestrator.ts:549` — `const workspace = path.resolve(config.project.workspace, projectName);` — `config.project.workspace` vaut `"./workspace"` (config.yaml:3). Aucun contrôle que `workspace` reste sous la racine. Vérifié empiriquement : `path.resolve('./workspace','../../../tmp/evil')` => `/home/issa/tmp/evil` ; `path.resolve('./workspace','/etc')` => `/etc` ; `path.resolve('./workspace','myproj')` => `.../workspace/myproj` (cas normal OK).
- `src/orchestrator.ts:550` — `fs.mkdirSync(workspace, { recursive: true })` + `git init` (l.554) + `cleanupWorkspacePorts(workspace)` (l.594) opèrent sur le chemin potentiellement échappé.
- `src/security.ts:142` — `const absWorkspace = path.resolve(workspaceDir);` — `absWorkspace` est l'unique racine du confinement. Utilisée par `isInside(candidate, absWorkspace)` pour Bash (l.198,219), Read/Write/Edit (l.245) et Glob/Grep (l.256). Si `workspaceDir` est échappé, les agents sont confinés au mauvais répertoire.
- `legacy-python/orchestrator.py:448` — `workspace = os.path.abspath(os.path.join(config["project"]["workspace"], project_name))` avec `project_name = sys.argv[2] if len(sys.argv) > 2 else "default"` (l.506) — même absence de validation en V1 : faille préexistante portée fidèlement.

**Impact DX.** Faible friction normale (les noms de projet usuels — `mon-app`, `blog-cuisine` — passent inchangés), mais un garde-fou crucial pour un harnais autonome : protège l'opérateur d'un nom de projet mal formé/collé (typo, copier-coller d'un chemin) qui ferait pondre des fichiers et lancer des agents hors du workspace, et surtout déplacerait la frontière de sécurité censée brider les agents. Un message d'erreur clair au lancement (« nom de projet invalide ») est bien meilleur DX qu'un dossier mystérieusement créé ailleurs ou un `git init` dans un répertoire inattendu. Effort faible, gain de robustesse élevé.

**Correctif proposé.**
1. Ajouter une fonction de validation/assainissement du nom de projet, idéalement dans un module testable (ex. exporter `validateProjectName(name: string): void` ou `resolveWorkspace(workspaceRoot, projectName): string` depuis orchestrator.ts ou un nouveau src/paths.ts). Préférer la validation côté `main()` (orchestrator.ts) plutôt que dans index.ts, pour que la garantie tienne quel que soit l'appelant de `main()`.
2. Stratégie 1 (rejet — la plus simple et explicite) : rejeter tout nom contenant un séparateur de chemin ou une référence de remontée. Refuser si `projectName` est vide, contient `/` ou `\`, est `.` ou `..`, contient un segment `..`, ou est absolu (`path.isAbsolute(projectName)`). Lever une erreur claire (`throw new Error("Invalid project name: must be a single path segment without '/', '..' or absolute paths")`). Ex. autoriser un regex strict `^[A-Za-z0-9._-]+$` excluant `..`.
3. Stratégie 2 (défense en profondeur, recommandée en complément) : après `const workspace = path.resolve(config.project.workspace, projectName)`, recalculer `const workspaceRoot = path.resolve(config.project.workspace)` et vérifier `isInside(workspace, workspaceRoot)` (réutiliser la logique `real === root || real.startsWith(root + path.sep)` de security.ts:118-121 ; envisager d'exporter `isInside` depuis security.ts pour éviter la duplication). Lever une erreur si le workspace résolu sort de la racine.
4. Placer la validation AVANT `fs.mkdirSync` / `git init` / `createPermissionHandler` (orchestrator.ts:549-554) pour qu'aucun effet de bord (création de dossier, git init) n'ait lieu sur un chemin échappé.
5. Conserver le comportement par défaut `"default"` (index.ts:16) qui reste un nom valide d'un seul segment.
6. Ajouter un test unitaire vitest (tests/orchestrator-paths.test.ts ou extension de tests/security.test.ts) couvrant : `../../../tmp/evil` rejeté, `/etc/foo` rejeté, `..` rejeté, `a/b` rejeté, nom vide rejeté, et `myproj` / `default` acceptés.
7. Documenter brièvement la divergence assumée avec V1 dans le commit (hardening sécurité hors-périmètre fidélité) et, si pertinent, dans CLAUDE.md (la note migration mentionne déjà les limitations V1 préservées — ce point devient une exception justifiée).

**Critères d'acceptation.**
- [ ] `pnpm typecheck` reste clean.
- [ ] `pnpm test` reste vert ; un nouveau test échoue si la validation est retirée (cas `../../../tmp/evil`, `/etc`, `..`, `a/b`, nom vide sont rejetés ; `myproj` et `default` acceptés).
- [ ] Lancer l'orchestrateur avec un projectName échappé (ex. `../../../tmp/evil` ou `/etc/foo`) provoque une erreur explicite AVANT toute création de répertoire, `git init` ou écriture de progress — aucun dossier n'est créé hors `./workspace`.
- [ ] Pour un nom valide d'un seul segment, le `workspace` résolu reste strictement à l'intérieur de `path.resolve(config.project.workspace)` (vérifiable via la garde `isInside`).
- [ ] Le confinement `absWorkspace` (security.ts:142) reçoit toujours un chemin garanti sous la racine workspace.
- [ ] Le comportement par défaut (`default`) et les noms de projet existants (`blog-cuisine`, `gestion-copro`, `terrain-sportif`) continuent de fonctionner sans changement.

**Risques.** Aucun identifié.

<details><summary>Notes de vérification</summary>

Toutes les affirmations du ticket source vérifiées contre le code réel. CONFIRMÉ : index.ts:16 prend `process.argv[3]` sans validation ; orchestrator.ts:549 fait `path.resolve(config.project.workspace, projectName)` ; security.ts:142 fixe `absWorkspace = path.resolve(workspaceDir)` qui sert de racine au confinement (Read/Write/Edit l.245, Glob/Grep l.256, Bash cd/chemins l.198/219). Traversal vérifié empiriquement : `path.resolve('./workspace','../../../tmp/evil')` => `/home/issa/tmp/evil`, et un chemin absolu `/etc` ignore la racine. `config.project.workspace` = `\"./workspace\"` (config.yaml:3). CORRECTION/PRÉCISION par rapport au seed : (1) la faille est strictement IDENTIQUE en V1 Python (orchestrator.py:448 + sys.argv[2] l.506) — c'est donc un défaut préexistant porté fidèlement, ce qui implique une tension de fidélité réelle → j'ai mis `fidelity_tension: true` (le seed indiquait false). (2) Effets de bord supplémentaires non mentionnés dans le seed : `fs.mkdirSync` (l.550), `git init` (l.554) et `cleanupWorkspacePorts` (l.594) s'exécutent aussi sur le chemin échappé. (3) Pas de ticket prérequis identifié → depends_on vide. Ce ticket n'est pas un ticket scoring, donc l'Option A ne s'applique pas ici.

</details>

### DX-17 — Documenter et tester les limites réelles du bash_denylist (substring naïf + redondance allowlist) et du non-confinement des sous-shells `sh -c` / `bash -c`

**Thème** Sécurité · **Sévérité** 🟠 moyenne · **Effort** S · **Fidélité V1** oui · **Change le comportement** oui · **Dépend de** —

**Problème.** Le module de sécurité (`src/security.ts`) présente deux faiblesses non documentées qui donnent une fausse impression de robustesse. Elles sont regroupées ici car elles relèvent du même module et de la même posture (sandbox de périmètre vs confinement fort).

(1) NON-CONFINEMENT DES SOUS-SHELLS `-c`. `sh` et `bash` sont dans la `bash_allowlist` (config.yaml:113-114). Quand l'agent émet `bash -c "<payload>"` ou `sh -c "<payload>"`, la validation extrait le binaire (`bash`/`sh`), le trouve dans l'allowlist, et N'INSPECTE JAMAIS la string passée à `-c` : ni `splitSegments`, ni `segmentBinary`, ni le confinement de chemins ne descendent dans le sous-shell. Conséquence vérifiée par exécution réelle : `bash -c "rm -fr /etc/foo"` → ALLOW (le flag `-fr` évite le pattern denylist littéral `rm -rf /`, et le payload échappe à toute re-validation) ; `sh -c "cat /etc/passwd"` → ALLOW (lecture hors workspace, contournant totalement le confinement filesystem appliqué aux outils Read/Write/Edit). Le confinement de chemins ne mord pas car `extractPaths` traite toute la string `-c` comme un seul token (ex. `"cat /etc/passwd"`) qui, joint à `effectiveCwd`, se résout DANS le workspace (`/ws/cat /etc/passwd`) et passe donc le test `isInside`.

(2) DENYLIST LARGEMENT ILLUSOIRE. `denyPatterns` est construit via `new RegExp(escapeRegExp(p))` (security.ts:139-141) puis testé par `pat.test(command)` sur la commande COMPLÈTE (security.ts:145-152) : c'est un substring littéral, non ancré, sans normalisation des espaces. Vérifié : `rm -rf /` matche mais `rm  -rf /` (double espace), `rm -fr /` (flags réordonnés) passent ; `chmod 777` matche mais `chmod -R 777`, `chmod 0777`, `chmod a+rwx` passent. De plus `wget`/`ssh`/`scp`/`nc `/`netcat` (config.yaml:119-123) ne sont PAS dans la `bash_allowlist` : ils sont déjà refusés par la garde allowlist, donc leur présence en denylist est une fausse défense en profondeur (sauf via sous-shell `-c`, cf. point 1, où la denylist devient leur seul rempart). Les seuls patterns qui ajoutent une vraie valeur sont `sudo` (binaire non allowlisté de toute façon, mais bloque aussi `cmd && sudo …` en sous-shell) et `chmod 777` (chmod EST allowlisté), ce dernier ne couvrant qu'une forme exacte.

Le ticket vise à DOCUMENTER ces limites (commentaires + note dans CLAUDE.md), ENCADRER le comportement par des tests qui figent les attentes, et — décision à acter — soit retirer `sh`/`bash` de l'allowlist (après vérification de l'impact sur init.sh et les commandes des agents), soit assumer explicitement le sous-shell comme trou connu. Note de fidélité : ce comportement est hérité de la V1 Python ; retirer `sh`/`bash` est un changement de comportement à arbitrer.

**Preuves.**
- `config.yaml:113-114` — `sh` et `bash` figurent dans bash_allowlist, ce qui autorise l'invocation de sous-shells `sh -c`/`bash -c`.
- `config.yaml:115-123` — bash_denylist = [rm -rf /, sudo, chmod 777, wget, ssh, scp, 'nc ', netcat]. wget/ssh/scp/nc/netcat ne sont PAS dans l'allowlist (config.yaml:68-114) → déjà refusés par la garde allowlist, donc redondants sauf à l'intérieur d'un sous-shell -c.
- `src/security.ts:139-141` — denyPatterns = config.security.bash_denylist.map(p => new RegExp(escapeRegExp(p))) — patterns littéraux non ancrés (pas de ^/$, pas de \b), espaces non normalisés.
- `src/security.ts:144-152` — validateBash teste pat.test(command) sur la commande COMPLÈTE avant tout découpage → substring naïf. 'rm  -rf /' et 'rm -fr /' passent ; 'chmod -R 777' passe.
- `src/security.ts:165-178` — La boucle par segment extrait le binaire via segmentBinary et vérifie l'allowlist, mais ne re-découpe jamais l'argument string d'un `-c` : la validation ne descend pas dans le sous-shell.
- `src/security.ts:97-109` — segmentBinary('bash -c "rm -fr /etc/foo"') → 'bash' (premier token non-env, non-flag) → présent dans l'allowlist.
- `src/security.ts:111-115` — extractPaths renvoie tokens.slice(1).filter(...) ; pour `sh -c "cat /etc/passwd"` le seul token-chemin candidat est la string entière 'cat /etc/passwd', joint à effectiveCwd il se résout DANS le workspace → isInside passe → aucun blocage du payload.
- `PROBE` — Exécution réelle via le module : `bash -c "rm -fr /etc/foo"` → ALLOW ; `sh -c "cat /etc/passwd"` → ALLOW ; `sh -c "rm -rf /etc/foo"` → DENY (denylist accidentellement) ; `bash -c "curl ... | sh"` → DENY mais pour mauvaise raison (le | dans les quotes casse splitSegments, quote non fermée → shlexSplit=[] → 'Could not parse').
- `src/orchestrator.ts:189-198` — init.sh est lancé directement par execFileSync('bash', [initSh]) côté orchestrateur, HORS du permission handler. Retirer 'bash'/'sh' de l'allowlist n'impacte donc PAS l'exécution d'init.sh elle-même — seulement d'éventuelles invocations `bash`/`sh` émises par les agents.
- `tests/security.test.ts:1-67` — Aucun test ne couvre les sous-shells `-c` ni les contournements de denylist (rm -fr, double-espace, chmod -R 777) ; l'ajout de cas est trivial dans la structure existante.

**Impact DX.** Risque de sécurité sous-estimé : le mainteneur croit disposer d'un denylist défensif et d'un confinement filesystem, alors qu'un agent (ou un prompt injecté) peut lire/écrire/supprimer hors workspace via `sh -c`/`bash -c`. Documenter et tester ces limites transforme un piège silencieux en contrat explicite : les futurs contributeurs sauront que la denylist n'est PAS un filtre fiable et que le confinement ne couvre pas les sous-shells. Améliore la confiance dans la couche sécurité et évite des régressions « invisibles » lors de futures éditions de config.yaml ou security.ts.

**Correctif proposé.**
1. AJOUTER un commentaire de tête sur validateBash (src/security.ts ~144) et au-dessus de bash_denylist (config.yaml:115) expliquant que la denylist est un substring NAÏF non ancré (espaces/flags non normalisés) et NON un filtre de sécurité fiable ; et que la validation ne descend PAS dans les sous-shells `sh -c`/`bash -c`.
2. AJOUTER une section 'Limites de sécurité connues (héritées V1)' dans CLAUDE.md (sous Architecture > security) listant : (a) sous-shell -c non re-validé, (b) denylist substring illusoire, (c) wget/ssh/scp/nc/netcat redondants car déjà hors allowlist.
3. AJOUTER des tests dans tests/security.test.ts qui FIGENT le comportement actuel (caractérisation) : `bash -c "rm -fr /etc/foo"` → allow ; `sh -c "cat /etc/passwd"` → allow ; `rm  -rf /` (double espace) non bloqué par denylist (mais bloqué par allowlist car rm hors allowlist) ; `chmod -R 777 x` non bloqué par denylist. Les commentaires de test doivent indiquer 'comportement connu/non souhaité' pour les cas allow.
4. DÉCISION À ACTER avec le mainteneur (par défaut: durcir) : retirer `sh` et `bash` de bash_allowlist (config.yaml:113-114). C'est SAFE vis-à-vis d'init.sh (lancé hors handler via execFileSync, orchestrator.ts:194). Avant de retirer, grep les prompts/ et src/agents/*.ts pour des commandes `sh`/`bash` attendues des agents ; si présentes, les ajuster ou conserver l'allowlist en assumant le trou (option B documentée).
5. SI on durcit : ajouter un test 'bash/sh denied' (binaire hors allowlist) et un test confirmant qu'init.sh reste fonctionnel (test d'intégration léger ou note manuelle), puis exécuter pnpm typecheck && pnpm test.

**Critères d'acceptation.**
- [ ] pnpm typecheck est clean.
- [ ] pnpm test passe ; tests/security.test.ts contient au moins 4 nouveaux cas couvrant: sous-shell `-c` (rm -fr et cat /etc/passwd), denylist double-espace, et chmod -R 777.
- [ ] Si décision = durcir: `sh -c "…"` et `bash -c "…"` retournent behavior:'deny' (binaire hors allowlist) ; un test le vérifie. Si décision = assumer: un test de caractérisation documente explicitement l'ALLOW comme comportement connu.
- [ ] src/security.ts et config.yaml contiennent un commentaire explicite sur les deux limites (substring naïf + sous-shell non confiné).
- [ ] CLAUDE.md documente la/les limite(s) de sécurité connue(s).
- [ ] init.sh continue de s'exécuter (vérifié: lancé hors handler), confirmé par note ou test.

**Risques.**
- Fidélité V1: retirer sh/bash de l'allowlist EST un changement de comportement par rapport au port fidèle ; à arbitrer explicitement avec le mainteneur (peut être scindé en 'documenter' (no behavior change) + 'durcir' (behavior change)).
- Si des prompts d'agents (prompts/, src/agents/*.ts) s'appuient sur `bash -c`/`sh -c` pour des opérations légitimes (heredocs, pipelines complexes), les retirer cassera ces flux : grep obligatoire avant suppression.
- Faux sentiment de complétude: même en retirant sh/bash, splitSegments reste quote-unaware (un `|`/`;` dans des quotes casse le découpage) — ne pas prétendre que le confinement est 'complet' ; le documenter comme limite résiduelle.
- Tests de caractérisation: bien les commenter comme 'comportement connu indésirable' pour ne pas laisser croire qu'un ALLOW hors-workspace est souhaité.

<details><summary>Notes de vérification</summary>

Toutes les locations du seed vérifiées et exactes (src/security.ts:123-178, 139-151 ; config.yaml:113-114, 115-123). Affirmations CONFIRMÉES par exécution réelle du module: (a) `bash -c \"rm -fr /etc/foo\"` → ALLOW (sous-shell non re-validé + denylist contournée par 'rm -fr') ; (b) `sh -c \"cat /etc/passwd\"` → ALLOW (lecture hors workspace) ; (c) denylist substring naïf: 'rm  -rf /', 'rm -fr /', 'chmod -R 777', 'chmod 0777', 'chmod a+rwx' passent la denylist ; (d) wget/ssh/scp/nc/netcat absents de l'allowlist → redondants. PRÉCISION/CORRECTION au seed: le seed cite `bash -c \"...\"` comme passant; c'est vrai en GÉNÉRAL mais un payload contenant un `|`/`;`/`&&` dans les quotes est DENY par accident (splitSegments quote-unaware → quote non fermée → 'Could not parse'), donc le bypass n'est pas universel — il s'applique aux payloads sans métacaractères de chaînage. CORRECTION importante non mentionnée dans le seed: init.sh est exécuté par l'orchestrateur via execFileSync('bash', [initSh]) à orchestrator.ts:194, HORS du permission handler — donc retirer 'bash'/'sh' de l'allowlist n'impacte PAS init.sh (contrairement à la crainte du seed 'ne pas retirer sh/bash sans vérifier init.sh' : la vérification est faite, init.sh est non concerné ; seules d'éventuelles commandes d'agents le seraient). Aucun test existant ne couvre ces cas (tests/security.test.ts:1-67).

</details>

---

## Thème — Robustesse & Reprise

_Fiabilite operationnelle du pipeline. Quick wins : DX-15 preflight (CLI claude, cle API/session, playwright), DX-14 logger la cause des echecs d'agent sans changer les retours, DX-20 fiabiliser le garde-fou budget (runs en echec costUsd=0 faussent les agregats). Plus lourds : DX-25 tuer les dev-servers spawnes pendant un sprint (pas seulement entre sprints), DX-23 robustifier skip-planning/skip-final (valider le contenu JSON, pas l'existence + budget au demarrage ; depend de DX-09), DX-24 valider/normaliser les IDs de modele au preflight (depend de DX-12 et DX-10)._

### DX-15 — Ajouter un preflight (CLI claude, ANTHROPIC_API_KEY/session, playwright) avant la Phase 1

**Thème** Robustesse · **Sévérité** 🟠 moyenne · **Effort** S · **Fidélité V1** non · **Change le comportement** oui · **Dépend de** —

**Problème.** `main()` (src/orchestrator.ts:543) ne vérifie aucun prérequis d'environnement avant de lancer la pipeline. Elle charge la config, crée le workspace, init git, puis appelle directement `phasePlanning()` -> `runPlanner()` -> `runAgent()` (la 1re invocation SDK). Si le CLI `claude` est absent du PATH, si aucune clé/session n'est disponible, ou (pour la QA) si `npx @playwright/mcp` n'est pas installable, l'échec ne remonte PAS proprement : `runAgent` (src/agents/client.ts:42) lance `query()`, redirige la stderr du CLI vers `<workspace>/cli_debug.log`, et arme un watchdog d'inactivité de 120 s (IDLE_TIMEOUT_MS=120_000, vérifié toutes les 5 s). En cas d'absence de message SDK, le watchdog `abort()` au bout de 120 s ; le `catch` renvoie alors `{ isError: true, costUsd: 0, ... }` (client.ts:99-109), de même qu'un `result` manquant (client.ts:114-124). Côté orchestrateur, `phasePlanning` voit `result.isError`, logge un générique `"Planner agent failed"` (orchestrator.ts:176) et retourne `false`, ce qui fait `process.exit(1)` (orchestrator.ts:574-577) — sans jamais indiquer la cause réelle ni pointer vers `cli_debug.log`. Pour un harnais dont le budget configuré est de 700 $ (config.yaml:23 `max_total_usd: 700.0`), attendre 120 s puis échouer avec un message opaque est coûteux en temps et déroutant. Un preflight léger (claude --version ; détection clé/session ; warn playwright si `qa.tools.playwright`) attrape ces erreurs en quelques ms avec un message clair, et logger le chemin de `cli_debug.log` au 1er `isError` rend le diagnostic immédiat.

**Preuves.**
- `src/orchestrator.ts:543-563` — main() : loadConfig, mkdir workspace, git init, ProjectProgress.load, puis console.info budget — AUCUNE vérification de prérequis avant la pipeline.
- `src/orchestrator.ts:565-578` — Enchaînement direct vers phasePlanning() ; en cas d'échec, console.error('Planning failed — aborting') + process.exit(1) sans cause.
- `src/orchestrator.ts:163-178` — phasePlanning : sur result.isError, log générique 'Planner agent failed' et return false ; aucune mention de cli_debug.log.
- `src/agents/client.ts:20-22` — IDLE_TIMEOUT_MS=120_000, IDLE_CHECK_INTERVAL_MS=5_000 : watchdog d'inactivité de 120 s.
- `src/agents/client.ts:48-64` — cli_debug.log écrit dans options.cwd (le workspace) ; stderr CLI redirigée vers ce fichier — seul endroit où la vraie erreur (ex. 'claude: command not found') apparaît.
- `src/agents/client.ts:99-124` — catch (abort/crash) ET result manquant renvoient tous deux isError:true, costUsd:0 — d'où le 'cost_usd=0' d'un agent crashé décrit dans CLAUDE.md.
- `src/agents/evaluator.ts:44-52` — Playwright MCP n'est ajouté (npx @playwright/mcp --headless) que si withPlaywright && config.qa.tools.playwright ; config.yaml:62-63 met playwright:true par défaut. Un échec d'install npx ne se voit qu'au 1er run QA, pas au planning.
- `config.yaml:22-23` — budget.max_total_usd: 700.0 — l'enjeu financier justifie un fail-fast clair.
- `src/index.ts:18-21` — main(...).catch() ne fait que console.error(e)+exit(1) ; n'attrape pas les échecs internes (isError) qui ne throwent pas.

**Impact DX.** Aujourd'hui un mauvais setup (CLI manquant, pas de clé/session, playwright non installable) coûte ~120 s d'attente par invocation puis un message d'erreur opaque, le vrai message étant enfoui dans workspace/<projet>/cli_debug.log dont le chemin n'est jamais affiché. Le preflight transforme cela en un échec quasi-instantané avec message explicite et actionnable, et l'affichage du chemin cli_debug.log au 1er isError raccourcit drastiquement le temps de diagnostic. Gain net en time-to-first-feedback et en confiance avant d'engager un budget potentiellement important.

**Correctif proposé.**
1. Créer une fonction exportée `preflight(config: Config): void` (nouveau fichier src/preflight.ts, ou en haut de orchestrator.ts) qui agrège des vérifications et lève une erreur explicite OU console.error+process.exit(1) avec un message clair listant TOUS les problèmes détectés (ne pas s'arrêter au premier).
2. Vérifier le CLI claude : `spawnSync('claude', ['--version'], { encoding: 'utf-8', timeout: 5000 })` ; si out.error (ENOENT) ou out.status !== 0, signaler 'CLI claude introuvable dans le PATH — installez @anthropic-ai/claude-code'. Réutiliser le pattern spawnSync déjà présent (orchestrator.ts:91).
3. Vérifier l'authentification : si `process.env.ANTHROPIC_API_KEY` est absent/vide, émettre un WARNING (pas un échec dur) du type 'ANTHROPIC_API_KEY non défini — le harnais s'appuiera sur une session CLI active ; vérifiez `claude` est connecté' (le SDK peut fonctionner via session CLI, donc ne pas bloquer).
4. Si `config.qa.tools.playwright === true` : tenter une détection légère de disponibilité de `@playwright/mcp` (ex. `spawnSync('npx', ['--no-install', '@playwright/mcp', '--version'], { timeout: 15000 })` ou équivalent) ; en cas d'échec, émettre un WARNING (pas un échec dur) indiquant que la QA Playwright échouera et suggérant `pnpm dlx playwright install` / la préinstallation du package — car playwright n'est utilisé qu'en Phase 2/3, pas au planning.
5. Appeler `preflight(config)` dans main() (orchestrator.ts) JUSTE après `const config = loadConfig();` (ligne 547), avant la création du workspace et l'init git, pour fail-fast avant tout effet de bord.
6. Dans phasePlanning (et idéalement dans les autres points isError de la boucle), au 1er `result.isError`, logger le chemin absolu de cli_debug.log : `console.error(\`Voir les détails du CLI : ${path.join(workspace, 'cli_debug.log')}\`)`. Centraliser si possible (helper) pour ne pas dupliquer sur les ~6 sites isError (orchestrator.ts:175, 363, etc.).
7. Ne PAS appeler runAgent pendant le preflight (pas de coût API) — uniquement des checks locaux (spawnSync) et des lectures d'env.
8. Ajouter un test unitaire (vitest) sur la pure-logic du preflight : injecter un faux 'runner' de commande (ou abstraire spawnSync derrière un paramètre) pour vérifier que (a) claude absent => message d'erreur fatal, (b) clé absente => warning non bloquant, (c) playwright indisponible avec qa.tools.playwright=true => warning non bloquant.
9. Mettre à jour CLAUDE.md (section Architecture/Runner) pour documenter le nouveau preflight.

**Critères d'acceptation.**
- [ ] `pnpm typecheck` clean.
- [ ] `pnpm test` passe, avec un nouveau test couvrant : claude manquant => sortie/échec fatal au preflight (avant tout appel runAgent), clé manquante => warning non bloquant, playwright indisponible (qa.tools.playwright=true) => warning non bloquant.
- [ ] Quand le CLI claude est absent du PATH, l'exécution échoue en < 5 s avec un message nommant explicitement 'claude' et le remède, et NON après ~120 s de watchdog.
- [ ] Le preflight est appelé dans main() avant la création du workspace / git init (aucun effet de bord si le preflight échoue dur).
- [ ] Au 1er result.isError d'un agent, le chemin absolu de <workspace>/cli_debug.log est affiché sur la console.
- [ ] Le preflight n'effectue aucun appel API payant (vérifiable : aucun runAgent/query invoqué dans son chemin de code).

**Risques.**
- Détection playwright via `npx @playwright/mcp --version` peut elle-même être lente ou tenter un téléchargement ; utiliser `--no-install` et/ou un timeout court, et la garder NON bloquante pour éviter de pénaliser des runs sans QA Playwright (ou si npx se comporte différemment selon versions).
- Faux négatif sur l'auth : le SDK peut fonctionner via session CLI active sans ANTHROPIC_API_KEY ; bloquer durement sur l'absence de clé casserait des setups valides — d'où WARNING seulement.
- spawnSync('claude','--version') suppose que 'claude' invoqué par le SDK est le même binaire que celui du PATH du process Node ; généralement vrai, mais un PATH divergent (ex. shell vs env Node) pourrait passer le preflight et échouer quand même — acceptable, le preflight reste un filet de sécurité, pas une garantie.
- behavior_change=true : le harnais peut désormais s'arrêter plus tôt (exit 1 au preflight). S'assurer que le code de sortie et le flux restent cohérents avec l'attente des scripts/CI éventuels.
- Tension de fidélité V1 : le preflight est une fonctionnalité NOUVELLE absente de la V1 Python ; elle ne modifie aucun comportement observable des agents ni le protocole JSON, donc fidelity_tension=false. Veiller à ne pas altérer le comportement watchdog/isError existant (les seuils 120s/cost_usd=0 sont des limitations V1 volontairement préservées) — le preflight les CONTOURNE en amont sans les changer.

<details><summary>Notes de vérification</summary>

Toutes les locations du ticket source sont EXACTES après lecture du code réel : src/orchestrator.ts:543-563 (main sans preflight), src/index.ts:18 (catch minimal), src/agents/evaluator.ts:44-49 (playwright MCP conditionnel à withPlaywright && config.qa.tools.playwright). Confirmé aussi : watchdog 120s (client.ts:20), cli_debug.log écrit dans options.cwd=workspace (client.ts:48-63), isError+costUsd=0 sur abort/crash et result manquant (client.ts:99-124), message d'échec planner générique sans pointer cli_debug.log (orchestrator.ts:176), budget 700$ (config.yaml:23). Précisions/corrections : (1) le ticket dit 'pas de message clair sauf dans cli_debug.log' — vérifié, MAIS le chemin de ce fichier n'est jamais affiché nulle part, à ajouter. (2) Environnement actuel observé : `claude` présent (v2.1.157), ANTHROPIC_API_KEY NON défini, @playwright/mcp PAS dans node_modules — ce qui illustre concrètement les 3 cas du preflight (le run réussirait probablement via session CLI mais la QA Playwright tomberait au 1er run QA, pas au planning). (3) config.yaml a bien `qa.tools.playwright: true` (l.62-63) -> le check playwright est pertinent par défaut. (4) Pattern spawnSync déjà utilisé dans le repo (orchestrator.ts:91 pour lsof) -> réutilisable pour les checks. (5) Aucun ticket prérequis identifié : ce ticket est indépendant du chantier scoring (Option A) et n'y touche pas. Note scoring : ce ticket n'est PAS un ticket scoring, donc l'Option A ne s'applique pas ici (aucun poids/seuil concerné).

</details>

### DX-14 — Logger la cause des échecs d'agent (catch silencieux dans le runner + cleanup ports) sans changer les valeurs de retour

**Thème** Robustesse · **Sévérité** 🟠 moyenne · **Effort** S · **Fidélité V1** oui · **Change le comportement** non · **Dépend de** —

**Problème.** Le runner d'agent et le nettoyage des ports avalent silencieusement leurs erreurs, rendant le diagnostic des échecs quasi impossible.

1. RUNNER (src/agents/client.ts). Le `try { for await ... } catch { ... }` (l.99) ne capture PAS l'erreur (`catch` sans binding) : il retourne immédiatement `isError: true, costUsd: 0` sans écrire la moindre trace. Deux causes très différentes produisent ce même chemin et sont indistinguables a posteriori : (a) l'abort du watchdog d'inactivité (l.68-73, `controller.abort()` après 120 s sans message — l'itération `for await` rejette alors) et (b) un crash réel du SDK/CLI. Combiné à `costUsd = 0` (fidélité V1 volontaire), un dev qui inspecte progress.json voit `success: false, cost_usd: 0` sans pouvoir dire si l'agent a planté, a été tué par le watchdog, ou s'est terminé sans ResultMessage.

2. Le second chemin d'erreur — `resultMsg === null` (l.114) — retourne le même objet `isError: true, costUsd: 0` également sans aucune trace. Ce cas signifie « le stream s'est terminé normalement mais aucun message `result` n'est arrivé » (≠ exception), or rien ne le distingue du cas exception dans les logs.

3. CLEANUP (src/orchestrator.ts:cleanupWorkspacePorts). La fonction empile des `catch` vides qui masquent des conditions d'environnement importantes :
   - l.100-102 : si `lsof` est absent/échoue (`out.error`), `return` muet — sur une machine sans `lsof` le cleanup est un no-op total et silencieux, les zombies dev-server survivent sans trace.
   - l.104-106 : `catch { return; }` autour du `spawnSync` — muet de même.
   - l.115-117 : `catch { continue; }` autour de `fs.readlinkSync('/proc/<pid>/cwd')` — sur macOS/non-Linux `/proc` n'existe pas, donc CHAQUE pid est sauté silencieusement : sur un Mac, aucun zombie ne sera jamais tué et aucun message ne le signale.
   - l.131-133 : `catch {}` sur `process.kill` (ProcessLookupError) — acceptable mais muet.
   - l.144-146 : `catch {}` global enveloppant toute la logique de kill.

Aucune de ces situations n'écrit dans cli_debug.log ni dans la console. Le fix demandé : nommer les erreurs (`catch (err)`) et écrire un message diagnostique dans cli_debug.log (runner) / via console (cleanup), en préfixant pour distinguer abort-watchdog vs exception SDK vs absence de ResultMessage, et en signalant quand lsof/proc est indisponible. Les VALEURS DE RETOUR restent strictement identiques (`isError: true, costUsd: 0`, etc.) — c'est du logging additif, donc behavior_change = false.

**Preuves.**
- `src/agents/client.ts:99-109` — `} catch {` sans binding : l'exception n'est ni nommée ni loggée ; retourne directement { isError: true, costUsd: 0, numTurns: 0, sessionId: '', resultText: null }. Aucun appendFileSync vers debugLogPath ici.
- `src/agents/client.ts:67-74` — Watchdog : setInterval qui appelle controller.abort() si Date.now()-lastActivity > IDLE_TIMEOUT_MS (120_000 ms). L'abort fait rejeter l'itération `for await` et tombe donc dans le même catch l.99 qu'un crash SDK — indistinguables.
- `src/agents/client.ts:114-124` — Chemin resultMsg === null : retourne { isError: true, costUsd: 0, ... } sans aucune trace. Distinct sémantiquement du catch (stream terminé proprement sans message `result`) mais produit le même objet et le même silence.
- `src/agents/client.ts:48,62` — Le pattern de log existe déjà : debugLogPath = join(options.cwd ?? '.', 'cli_debug.log') ; appendFileSync(debugLogPath, data) dans le handler stderr. Le fix réutilise ce même chemin/mécanisme.
- `src/orchestrator.ts:100-106` — Deux retours muets autour de lsof : `if (out.error) { return; }` puis `} catch { return; }`. lsof absent ⇒ cleanup no-op total et silencieux.
- `src/orchestrator.ts:112-117` — `cwd = fs.readlinkSync('/proc/${pid}/cwd')` dans un try/catch { continue; }. Sur macOS/non-Linux /proc absent ⇒ chaque pid sauté silencieusement, aucun zombie tué, aucun message.
- `src/orchestrator.ts:128-134` — `catch { // ProcessLookupError ... ignore }` sur process.kill — muet.
- `src/orchestrator.ts:144-146` — `} catch { // ne jamais faire échouer le nettoyage }` global enveloppant la boucle de kill — muet.
- `src/orchestrator.ts:138-142` — Pattern de log de succès existant à imiter : console.info + appendProgressLog(workspace, 'Cleaned up dev-server zombies: PIDs ...'). Le fix réutilise console + appendProgressLog (importé l.24-28).

**Impact DX.** Aujourd'hui, quand un sprint échoue, le seul artefact est progress.json avec success:false / cost_usd:0 : impossible de savoir si l'agent a planté, a été tué par le watchdog d'inactivité, ou n'a pas émis de ResultMessage — ni si le cleanup de ports a réellement tourné. Le dev doit ré-instrumenter le code à la main pour reproduire. Après fix, cli_debug.log (déjà le réceptacle de diagnostic du runner) contient un message daté préfixé par cause (ABORT vs EXCEPTION vs NO_RESULT), et la console signale quand lsof/proc est indisponible (notamment sur macOS où le cleanup est de facto inopérant). Gain direct de triabilité des échecs, sans toucher au comportement observable du pipeline.

**Correctif proposé.**
1. src/agents/client.ts — remplacer `} catch {` (l.99) par `} catch (err) {`. Avant le `return`, écrire dans debugLogPath via appendFileSync un message daté préfixé distinguant la cause : si `controller.signal.aborted` est vrai => `[runAgent ABORT] watchdog idle-timeout (>120s) — ${err}` ; sinon => `[runAgent EXCEPTION] ${err instanceof Error ? err.stack ?? err.message : String(err)}`. Conserver l'objet de retour À L'IDENTIQUE (isError:true, costUsd:0, numTurns:0, sessionId:'', resultText:null).
2. src/agents/client.ts — au chemin `resultMsg === null` (l.114), avant le `return`, écrire `[runAgent NO_RESULT] stream terminé sans message 'result' (durée ${Date.now()-start}ms)` dans debugLogPath. Conserver l'objet de retour à l'identique.
3. src/agents/client.ts — factoriser un petit helper interne `function logDebug(msg: string): void { appendFileSync(debugLogPath, `\n[${new Date().toISOString()}] ${msg}\n`); }` réutilisé par les trois sites (en-tête existant l.49 peut rester tel quel). Garder l'import appendFileSync existant.
4. src/orchestrator.ts:cleanupWorkspacePorts — `if (out.error)` (l.100) : avant `return`, émettre `console.debug('cleanupWorkspacePorts: lsof unavailable/failed (${out.error}) — skipping port cleanup')`. Idem dans le `} catch (e) { console.debug(...); return; }` l.104 (binder l'erreur).
5. src/orchestrator.ts:cleanupWorkspacePorts — readlinkSync /proc (l.113-117) : binder `catch (e)`. Pour éviter de spammer N lignes par pid sur macOS, détecter l'absence de /proc UNE seule fois en amont (ex: `const hasProc = fs.existsSync('/proc');` calculé avant la boucle, ou `process.platform !== 'linux'`) et émettre un unique `console.debug('cleanupWorkspacePorts: /proc indisponible (platform=${process.platform}) — impossible de filtrer les PID par cwd, skip')` puis `return` ; sinon comportement actuel inchangé (continue silencieux par pid légitime).
6. src/orchestrator.ts:cleanupWorkspacePorts — catch global l.144 : binder `catch (e)` et émettre `console.debug('cleanupWorkspacePorts: erreur inattendue ignorée — ${e}')`. Le catch process.kill l.131 peut être binder `catch (e)` avec un console.debug optionnel (ProcessLookupError attendu).
7. Utiliser console.debug (et NON console.warn/error) pour le cleanup afin de ne pas polluer la sortie nominale ; les messages restent invisibles sauf en mode debug. Le runner écrit dans le fichier cli_debug.log (pas la console), cohérent avec le canal de diagnostic existant.
8. pnpm typecheck (tsc --noEmit) doit rester clean ; pnpm test inchangé.

**Critères d'acceptation.**
- [ ] pnpm typecheck est clean (aucune erreur TS, notamment `err`/`e` typés `unknown` correctement gérés).
- [ ] pnpm test passe (les tests existants security/tools/progress/orchestrator-scoring restent verts ; aucune assertion sur les valeurs de retour de runAgent ne change).
- [ ] Les signatures et objets de retour de runAgent sont identiques bit-à-bit aux trois chemins (catch, resultMsg===null, succès) : isError:true & costUsd:0 préservés sur les chemins d'erreur.
- [ ] Sur un abort du watchdog, cli_debug.log contient une ligne préfixée [runAgent ABORT] ; sur une exception SDK, une ligne [runAgent EXCEPTION] ; sur stream sans result, une ligne [runAgent NO_RESULT] — les trois cas sont distinguables à la lecture du fichier.
- [ ] Sur une machine sans lsof OU sans /proc (ou process.platform !== 'linux'), cleanupWorkspacePorts émet au moins un message console.debug expliquant pourquoi aucun port n'est nettoyé, et ne produit pas N lignes par PID.
- [ ] Le cleanup ne fait toujours jamais échouer le pipeline (le catch global reste, simplement avec log).

**Risques.**
- Tension de fidélité V1 : le port est explicitement « faithful 1:1 » et préserve des limitations connues (cf. CLAUDE.md). Ajouter du logging est additif et ne change pas le comportement observable du pipeline ni les fichiers JSON inter-agents — acceptable — mais cli_debug.log gagne des lignes absentes de la V1 Python. Garder le wording neutre et ne PAS toucher costUsd/isError pour rester dans behavior_change=false.
- Distinguer abort vs exception via `controller.signal.aborted` n'est fiable que si l'abort est bien la cause du rejet ; un abort déclenché juste avant un crash pourrait mal classer. Acceptable car purement diagnostique.
- Détection /proc via process.platform : si quelqu'un fait tourner sous un Linux exotique sans /proc monté, le message dira 'platform=linux' mais skippera — utiliser fs.existsSync('/proc') est plus robuste que platform seul ; préférer le check existsSync.
- console.debug est masqué par défaut dans beaucoup de configs Node (selon le niveau) ; si le mainteneur veut la visibilité garantie pour l'indispo lsof/proc, envisager console.info — mais cela bruite la sortie nominale. Choix par défaut : console.debug (discret).
- Risque mineur de double écriture d'en-tête dans cli_debug.log si le helper logDebug duplique le format de l'en-tête existant l.49 ; garder un format distinct (préfixe [runAgent ...]) pour éviter la confusion.

<details><summary>Notes de vérification</summary>

Toutes les locations du ticket source ont été vérifiées contre le code réel et confirmées, avec quelques précisions/corrections de numérotation : (1) le catch du runner est bien sans binding et démarre l.99, mais le bloc de retour s'étend jusqu'à l.109 (le ticket disait '99-112' — 110-112 est le `finally { clearInterval(idle); }`, pas le return). (2) Le chemin resultMsg===null est bien l.114-124 (confirmé). (3) Côté cleanup, les catch vides cités existent tous : l.85 (realpathSync workspace — NON mentionné dans le ticket mais aussi muet, mineur), l.100-102 (out.error return), l.104-106 (catch spawnSync), l.115-117 (readlinkSync /proc — c'est bien CE catch qui cause le no-op macOS, pas un autre), l.128-133 (process.kill, le ticket disait l.131 ce qui est dans le bloc), l.144-146 (catch global). Le ticket listait orchestrator.ts:85 comme un des 5 catch{} : c'est le fallback realpathSync(workspace) l.83-87 qui n'est pas réellement un no-op silencieux problématique (il fixe un fallback path.resolve), donc je l'ai écarté du fix principal. Confirmé : le pattern de log réutilisable existe déjà (client.ts:48/62 pour cli_debug.log ; orchestrator.ts:138-142 + appendProgressLog importé pour le cleanup). Aucun test n'existe pour client.ts (SDK-driven, validé par runs réels selon CLAUDE.md) — donc pas d'AC de test unitaire sur le runner ; les tests pure-logic vivent dans /home/issa/Projects/fullstack-harness/tests/. Ce ticket n'est PAS lié au scoring (Option A non applicable). behavior_change=false confirmé : le fix est strictement additif (logging) et préserve isError/costUsd=0.

</details>

### DX-20 — Fiabiliser le garde-fou budgetaire : les runs en echec (costUsd=0) faussent les agregats et sous-estiment le cout reel

**Thème** Robustesse · **Sévérité** 🟠 moyenne · **Effort** S · **Fidélité V1** oui · **Change le comportement** non · **Dépend de** —

**Problème.** Quand un run d'agent est avorte (watchdog -> AbortController.abort, exception capturee dans le for-await) OU se termine sans ResultMessage (crash CLI), runAgent retourne deliberement costUsd: 0 (fidelite V1 documentee dans CLAUDE.md : "a missing result (crash/abort) yields isError: true, costUsd: 0"). Ce 0 est ensuite passe a makeAgentRun puis a progress.addRun, qui l'additionne tel quel dans total_cost_usd. Or un tel run a tres probablement deja consomme des tokens cote API avant de planter ou d'etre coupe (le ResultMessage du SDK arrive en dernier ; tout le travail des tours precedents est facture mais perdu pour la comptabilite). Consequence : total_cost_usd est une BORNE BASSE du cout reel, pas le cout reel. Le garde-fou budgetaire isOverBudget(maxUsd) (progress.ts:61-63, max_total_usd=700.0 dans config.yaml:22-23) compare cette borne basse au plafond et n'est evalue qu'entre les sprints (orchestrator.ts:466, jamais dans la boucle de retry interne d'un sprint). Apres plusieurs invocations crashees/coupees, la pipeline peut donc continuer au-dela du budget effectivement consomme cote API. Le garde-fou est donc moins fiable que ne le suggere CLAUDE.md ("Budget is enforced between sprints"). Ce comportement n'est PAS signale a l'operateur : ni log d'avertissement, ni mention que le total est une sous-estimation. Note : ce ticket NE veut PAS rendre la comptabilite exacte (impossible sans ResultMessage et contraire a la fidelite V1) ; il veut rendre la limitation EXPLICITE et le garde-fou conservateur.

**Preuves.**
- `src/agents/client.ts:99-109` — catch (abort/crash pendant le for-await) retourne { costUsd: 0, isError: true, numTurns: 0, ... }. Le cout des tours deja factures avant l'abort est perdu.
- `src/agents/client.ts:114-124` — resultMsg === null (boucle terminee sans ResultMessage) retourne aussi { costUsd: 0, isError: true }. Meme perte comptable.
- `src/agents/client.ts:128` — Chemin nominal : costUsd = resultMsg.total_cost_usd ?? 0 — seul cas ou le cout reel est capture.
- `src/progress.ts:52-55` — addRun fait this.total_cost_usd += run.cost_usd inconditionnellement ; un run echoue avec cost_usd=0 est pousse dans runs[] et contribue 0 au total tout en restant compte comme un run.
- `src/progress.ts:61-63` — isOverBudget(maxUsd) compare total_cost_usd >= maxUsd. Si total_cost_usd sous-estime, le seuil peut ne jamais etre atteint malgre une consommation API reelle superieure.
- `config.yaml:22-23` — budget.max_total_usd: 700.0 — le plafond reel auquel la borne basse est comparee.
- `src/orchestrator.ts:466-472` — Seul appel a isOverBudget, place en tete de la boucle for sprints, donc evalue UNIQUEMENT entre sprints (jamais entre les retries internes d'un meme sprint ni apres la planification).
- `src/orchestrator.ts:164-172` — addRun pour le planner : success: !result.isError, cost_usd: result.costUsd. Un planner crashe pousse un run cost_usd=0. (Memes patterns aux lignes 243-247, 266-270, 352-356, 370-374, 513-517 pour builder/evaluator contract+build et final eval.)
- `CLAUDE.md (section Runner)` — Documente explicitement 'a missing result (crash/abort) yields isError: true, costUsd: 0' et 'Budget is enforced between sprints via ProjectProgress.isOverBudget()' — les deux affirmations sont vraies mais leur interaction (budget = borne basse) n'est nulle part explicitee.

**Impact DX.** Pour le mainteneur/operateur du harnais : la valeur total_cost_usd affichee dans les logs (orchestrator.ts:468/482/494/602) et dans progress.json est presentee comme le cout du run, alors que c'est une borne basse silencieuse. En cas de runs instables (crashs CLI repetes, watchdog qui coupe), l'operateur peut depasser son budget reel sans alerte, et ne dispose d'aucun signal pour distinguer "tout va bien" de "j'ai perdu de la comptabilite". Rendre la limitation explicite (log + commentaire de code + champ de comptage des runs non comptabilises) restaure la confiance dans le garde-fou et evite les mauvaises surprises de facturation.

**Correctif proposé.**
1. Choisir la posture fidelite-compatible : NE PAS inventer un cout (resterait faux et romprait la fidelite V1) mais (a) rendre la limitation explicite et (b) rendre le garde-fou conservateur/observable. Implementer les etapes suivantes.
2. Dans src/progress.ts : ajouter un compteur d'observabilite. Ajouter un champ uncounted_runs: number (init 0, charge/sauve comme les autres dans constructor/load/save, defaut ?? 0 dans load pour retrocompat des anciens progress.json). Dans addRun, incrementer this.uncounted_runs quand run.success === false (signal qu'un cout a probablement ete consomme mais non comptabilise). Conserver l'addition de run.cost_usd inchangee (fidelite : on n'invente rien).
3. Dans src/progress.ts:addRun, documenter par commentaire : 'Un run echoue (success=false) a typiquement consomme des tokens avant le crash/abort mais renvoie cost_usd=0 (cf. client.ts). total_cost_usd est donc une BORNE BASSE du cout reel.'
4. Dans src/agents/client.ts:99-109 et 114-124, ajouter un commentaire au-dessus de chaque return costUsd:0 : 'BORNE BASSE : le cout des tours deja factures avant l'abort/crash est perdu (pas de ResultMessage). total_cost_usd sous-estimera le cout reel ; cf. progress.addRun et isOverBudget.'
5. Dans src/orchestrator.ts:466-472, enrichir le warning de budget et ajouter un avertissement quand des runs non comptabilises existent : si progress.uncounted_runs > 0, logger via console.warn une ligne du type 'Note: N runs en echec non comptabilises — le cout reel depasse probablement total_cost_usd ($X / $700) ; le garde-fou budgetaire est une borne basse.' Le faire au moins une fois par run (p.ex. dans le summary final orchestrator.ts:~602 et/ou avant le check budget).
6. Documentation : ajouter une phrase dans CLAUDE.md (section Runner ou Architecture/Budget) precisant que total_cost_usd est une borne basse car les runs crashes/avortes rapportent cost_usd=0, et que isOverBudget peut donc laisser passer un depassement reel ; le champ uncounted_runs expose le nombre de runs concernes.
7. Tests (vitest, module pur progress) : (1) addRun avec un run success:false -> uncounted_runs incremente et total_cost_usd inchange ; (2) save/load round-trip preserve uncounted_runs ; (3) load d'un progress.json legacy sans uncounted_runs -> defaut 0. NE PAS modifier la semantique de isOverBudget (>=) pour rester fidele.
8. Lancer pnpm typecheck (clean) et pnpm test (vert).

**Critères d'acceptation.**
- [ ] pnpm typecheck est clean
- [ ] pnpm test est vert, avec un nouveau test prouvant que addRun({success:false, cost_usd:0}) incremente uncounted_runs et laisse total_cost_usd inchange
- [ ] un test prouve que save puis load preservent uncounted_runs, et que load d'un progress.json sans ce champ retourne 0 (retrocompat)
- [ ] lors d'un run avec au moins un agent echoue, l'orchestrateur emet un avertissement explicite indiquant que total_cost_usd est une borne basse et le nombre de runs non comptabilises
- [ ] le code de client.ts (les deux returns costUsd:0) et progress.ts:addRun portent un commentaire documentant la posture 'borne basse'
- [ ] CLAUDE.md mentionne que le garde-fou budgetaire est une borne basse et expose uncounted_runs
- [ ] isOverBudget conserve sa semantique >= (aucun changement de comportement de blocage)
- [ ] le format de progress.json reste lisible par d'anciennes instances (champ ajoute, aucun champ supprime/renomme)

**Risques.**
- Tension de fidelite V1 : la V1 Python comptabilise vraisemblablement 0 pour les runs crashes sans champ d'observabilite. Ajouter uncounted_runs etend le format progress.json ; rester en ajout-seul (jamais supprimer/renommer un champ existant) pour ne pas casser la compatibilite de lecture documentee comme objectif du port.
- Ne PAS basculer vers une estimation de cout fabriquee : cela donnerait un total faux et romprait la fidelite ; le ticket choisit deliberement l'observabilite plutot que l'invention.
- Le garde-fou reste evalue uniquement entre sprints (orchestrator.ts:466) ; ce ticket ne deplace pas le check dans la boucle de retry interne (ce serait un behavior_change plus large) — la sous-estimation au sein d'un sprint long reste possible et doit etre mentionnee dans la doc.
- Si addRun est appele depuis d'autres chemins que l'orchestrateur (ou dans des tests existants), verifier que le comptage uncounted_runs sur success:false ne casse pas d'assertions existantes.
- Le critere success utilise est !result.isError ; s'assurer que addRun lit bien run.success (et non un re-calcul) pour rester coherent avec les call sites orchestrator.ts:171/249/272/358/376/519.

<details><summary>Notes de vérification</summary>

Toutes les locations du ticket source sont EXACTES et confirmees par lecture du code : client.ts:101-109 (catch -> costUsd:0, lignes precises 99-109), client.ts:114-124 (resultMsg null -> costUsd:0), progress.ts:54-55 (total_cost_usd += run.cost_usd dans addRun lignes 52-55), progress.ts:61 (isOverBudget, lignes 61-63), orchestrator.ts:466 (seul appel isOverBudget, lignes 466-472). Confirme en plus : config.yaml:22-23 budget.max_total_usd=700.0 (le 700$ cite est correct) ; isOverBudget n'est appele qu'une seule fois dans tout l'orchestrateur, en tete de boucle sprints, donc PAS dans la boucle de retry interne d'un sprint ni apres la planification (renforce l'affirmation 'moins fiable'). Tous les addRun (planner 164-172, builder/evaluator contract 243-247/266-270, builder/evaluator build 352-356/370-374, final eval 513-517) passent cost_usd: result.costUsd et success: !result.isError, donc un run echoue pousse bien cost_usd=0. CLAUDE.md confirme textuellement les deux affirmations source ('costUsd: 0' au crash ; 'Budget is enforced between sprints'). Le seed_problem est exact ; aucune correction de fond necessaire. J'ai precise que le fix recommande est l'observabilite (compteur + logs + commentaires + doc), PAS une estimation fabriquee, pour respecter la fidelite V1. Ticket de robustesse pure (aucune dimension scoring), donc l'Option A scoring ne s'applique pas. depends_on vide : aucun prerequis percu.

</details>

### DX-25 — Tuer les dev-servers spawnés par l'agent en fin de run / à l'abort (fuite de process pendant un sprint, pas seulement entre sprints)

**Thème** Robustesse · **Sévérité** 🟠 moyenne · **Effort** M · **Fidélité V1** oui · **Change le comportement** oui · **Dépend de** —

**Problème.** Les prompts demandent explicitement aux agents de lancer des serveurs de dev (builder_prompt.md ligne 23 : "Lance le serveur de dev via init.sh si nécessaire" ; l'evaluator lance npm/php/uvicorn pour ses tests Playwright/curl), mais rien ne les arrête PENDANT le déroulement d'un sprint ni à la fin d'un run d'agent. Deux trous :

1. cleanupWorkspacePorts() n'est invoqué qu'à DEUX endroits : au DÉBUT de chaque sprint (orchestrator.ts:332) et dans le finally du run complet (orchestrator.ts:594). Donc un dev-server lancé par le builder reste vivant pendant TOUT le reste du sprint (implémentation builder, QA evaluator, retries), puis jusqu'au début du sprint suivant. Sur un sprint long ou multi-retry, plusieurs serveurs peuvent coexister sur les mêmes ports (collisions EADDRINUSE) ou consommer RAM/CPU inutilement.

2. Le watchdog d'inactivité (client.ts:68-74) appelle controller.abort() au bout de 120 s sans message SDK. abort() coupe la session SDK (la query() rejette, gérée par le catch client.ts:99), mais ne tue PAS les sous-process que l'agent a spawnés via son outil Bash. Ces dev-servers ne sont pas des enfants directs du process harness — ils sont spawnés par le sous-process CLI/agent — donc abort() ne les fait pas tomber. Résultat : un agent aborté laisse fuiter ses dev-servers jusqu'au prochain cleanup inter-sprint (ou jamais si le run s'arrête là, ou jamais sur macOS, cf. la limitation /proc ci-dessous).

L'angle "fuite de process pendant un sprint long / sur abort" n'est couvert par aucun autre ticket du backlog. Le correctif : appeler le nettoyage de ports aussi en fin de chaque run d'agent et au déclenchement de l'abort, pas seulement entre sprints.

**Preuves.**
- `src/orchestrator.ts:81-147` — cleanupWorkspacePorts() : tue via lsof + process.kill(SIGTERM) les PID en LISTEN sur :3000/:3001/:8000/:8001 dont /proc/<pid>/cwd est sous le workspace. C'est le SEUL mécanisme de cleanup de ports du harness.
- `src/orchestrator.ts:331-332` — runSprint() appelle cleanupWorkspacePorts(workspace) AU DÉBUT du sprint ('Nettoie les dev-servers laissés par les agents du sprint précédent'). Aucun appel pendant ou en fin de sprint.
- `src/orchestrator.ts:592-595` — Le seul autre appel est dans le finally de main() : cleanupWorkspacePorts une fois à la toute fin du run complet (ou sur Ctrl+C/crash).
- `src/agents/client.ts:68-74` — Watchdog : setInterval qui, après IDLE_TIMEOUT_MS (120s) sans message, fait controller.abort(). Il ne tue aucun sous-process ; aucun appel à cleanupWorkspacePorts ici.
- `src/agents/client.ts:99-112` — Le catch sur l'itération de query() (déclenché par abort ou crash) retourne {isError:true, costUsd:0} ; le finally ne fait que clearInterval(idle). Aucun nettoyage de process.
- `prompts/builder_prompt.md:23` — Étape de protocole de sprint : 'Lance le serveur de dev via init.sh si nécessaire' — confirme que l'agent ouvre des dev-servers de longue durée via son outil Bash.
- `config.yaml:79-88` — L'allowlist Bash autorise npm/pnpm/npx/node/php/symfony/uvicorn — tous capables de lancer un serveur persistant. Confirme que les dev-servers sont spawnés par l'agent (grandchild), pas par le harness.
- `src/orchestrator.ts:113-117` — cleanupWorkspacePorts lit /proc/<pid>/cwd via fs.readlinkSync ; en cas d'échec (catch) il fait 'continue' et ne tue donc rien. Sur macOS, /proc n'existe pas → readlink échoue pour TOUS les PID → aucun kill (limitation portabilité, cf. DX-19).

**Impact DX.** Sur un sprint long ou multi-retry, les dev-servers s'accumulent : collisions de ports (EADDRINUSE quand le builder relance init.sh, ce qui peut faire échouer la QA de l'evaluator de façon trompeuse), consommation RAM/CPU croissante, et processus zombies après un abort par watchdog. Le mainteneur doit parfois tuer manuellement des process orphelins entre deux exécutions. Sur macOS, le nettoyage ne fonctionne pas du tout (limitation /proc). Un nettoyage en fin de run agent + à l'abort rend le harness plus prévisible et évite des QA faux-négatifs dus à des ports occupés par un serveur fantôme du run précédent.

**Correctif proposé.**
1. Exposer le cleanup au module client : passer le chemin workspace à runAgent (déjà accessible via options.cwd) OU accepter un callback de cleanup optionnel. Le plus simple et le moins couplé : ajouter un paramètre optionnel à runAgent, p.ex. onTeardown?: () => void, fourni par chaque agent (planner/builder/evaluator) qui connaît déjà workspaceDir. Éviter d'importer orchestrator.ts depuis client.ts (cycle d'import) — soit extraire cleanupWorkspacePorts dans un nouveau module src/cleanup.ts importable des deux côtés, soit passer le callback.
2. Déclencher le teardown sur abort : dans le callback du watchdog (client.ts:68-74), après controller.abort(), invoquer le teardown (kill des dev-servers du workspace). Le faire aussi dans le finally de runAgent (client.ts:110-112) pour couvrir la fin normale ET le crash, en plus de clearInterval(idle).
3. Garder la sémantique idempotente : cleanupWorkspacePorts est déjà tout-en-try/catch et no-op si rien n'écoute ; l'appeler plus souvent est sûr. Conserver le scope strict (uniquement les PID dont le cwd est sous le workspace) pour ne jamais tuer les serveurs d'autres projets de l'utilisateur.
4. Laisser intacts les appels existants (runSprint:332, main finally:594) — ils restent utiles comme filet de sécurité ; le nouvel appel par-run rend juste le nettoyage plus précoce et couvre l'abort.
5. (Hors périmètre strict mais à noter dans le ticket) le bug macOS /proc est une cause racine de fuite persistante ; le réparer relève de DX-19 (portabilité lsof/proc). Ce ticket le rend juste plus visible. Ne PAS l'embarquer ici pour garder l'effort 'medium'.
6. pnpm typecheck doit rester clean ; pnpm test doit passer. Ajouter un test unitaire ciblant le câblage (voir acceptance_criteria) sans dépendre du SDK réel.

**Critères d'acceptation.**
- [ ] pnpm typecheck est clean (tsc --noEmit) après l'ajout du teardown.
- [ ] pnpm test passe ; un nouveau test (dans tests/, p.ex. tests/client-teardown.test.ts ou tests/orchestrator.test.ts) vérifie que le callback de teardown est appelé (a) en fin de run normal et (b) quand le watchdog déclenche l'abort. Le test mocke query() du SDK et/ou injecte un faux teardown — il ne lance pas de vrai dev-server ni le SDK réel (cf. convention : seuls les modules pure-logic sont testés en unit).
- [ ] Si cleanupWorkspacePorts est extrait dans src/cleanup.ts, les imports existants dans orchestrator.ts sont mis à jour et le comportement (scope workspace-only via /proc/<pid>/cwd, kill SIGTERM, no-op silencieux) est inchangé — les chemins runSprint:332 et main finally:594 fonctionnent toujours.
- [ ] Manuellement (Linux) : lancer un sprint qui démarre un dev-server, provoquer/observer un abort watchdog → vérifier qu'aucun process n'écoute encore sur :3000/:3001/:8000/:8001 sous le workspace après le run de l'agent (pas seulement au sprint suivant).
- [ ] Aucun process hors workspace n'est tué (les serveurs de dev d'autres projets de l'utilisateur survivent) — invariant de scope préservé.

**Risques.**
- Fidélité V1 : la V1 Python ne nettoyait probablement les ports qu'entre sprints (comportement porté tel quel). Nettoyer en fin de run agent / à l'abort est un CHANGEMENT DE COMPORTEMENT volontaire (behavior_change=true) qui s'écarte du port 1:1 — à assumer/documenter comme amélioration DX justifiée, pas comme régression.
- Couper le dev-server en fin de run du builder peut casser un workflow où l'evaluator s'attendait à réutiliser le serveur encore chaud lancé par le builder. En pratique l'evaluator (re)lance ses propres serveurs pour la QA, mais à vérifier : si une dépendance implicite existe, le nettoyage par-run pourrait forcer un redémarrage et rallonger légèrement la QA. Mitigation : ne nettoyer qu'en fin de run ET à l'abort (pas au milieu), et laisser l'evaluator relancer.
- Cycle d'import si client.ts importe orchestrator.ts (orchestrator importe déjà les agents qui importent client). Mitigation imposée : extraire cleanupWorkspacePorts dans un module dédié (src/cleanup.ts) ou passer un callback — ne PAS créer de dépendance client→orchestrator.
- abort() est asynchrone côté SDK : le teardown lancé juste après abort() pourrait s'exécuter avant que le CLI ait relâché ses enfants, laissant un PID survivant capturé une fraction de seconde plus tard. Le filet existant (cleanup début sprint suivant + finally main) couvre ce cas résiduel.
- Sur macOS le teardown reste inopérant (limitation /proc, cf. DX-19) : ce ticket ne corrige PAS la fuite sur macOS, il améliore seulement le timing sur Linux. Ne pas sur-vendre la portée.

<details><summary>Notes de vérification</summary>

Toutes les affirmations du seed vérifiées contre le code réel. Corrections/précisions : (1) la location 'src/agents/client.ts:68' désigne le DÉBUT du bloc watchdog (setInterval) ; l'abort effectif est ligne 71 — référence conservée comme correcte. (2) 'src/orchestrator.ts:81-147' = corps de cleanupWorkspacePorts, exact. (3) Confirmé que cleanupWorkspacePorts n'est appelé QUE 2 fois (runSprint:332 et main finally:594) — pas en fin de run agent ni à l'abort. (4) Confirmé que le watchdog ne tue aucun sous-process (seul controller.abort()). (5) Confirmé que les dev-servers sont spawnés par l'agent via Bash (grandchildren du harness), donc non couverts par abort() — l'allowlist config.yaml:79-88 autorise npm/pnpm/npx/node/php/symfony/uvicorn. (6) Précision ajoutée non explicite dans le seed mais confirmée : cleanupWorkspacePorts repose sur /proc/<pid>/cwd (orchestrator.ts:113-117), inexistant sur macOS → cleanup totalement inopérant sur macOS (recoupe DX-19, qui devient un prérequis MORAL mais pas bloquant : ce ticket améliore le timing sur Linux indépendamment). (7) Tests du harness situés dans tests/ (vitest include: tests/**/*.test.ts) ; convention : seuls modules pure-logic en unit. (8) Ce ticket ne concerne PAS le scoring → Option A non applicable ici.

</details>

### DX-23 — Robustifier la reprise (skip-planning / skip-final) : valider le contenu JSON, pas seulement l'existence, et vérifier le budget au démarrage

**Thème** Robustesse · **Sévérité** 🟠 moyenne · **Effort** S · **Fidélité V1** oui · **Change le comportement** oui · **Dépend de** DX-09

**Problème.** La logique de reprise de `main()` (src/orchestrator.ts) décide de sauter une phase uniquement sur l'EXISTENCE de fichiers, jamais sur leur validité ou complétude.

1) Phase 1 (Planning) est sautée si les 3 fichiers `product_spec.json`, `feature_list.json`, `init.sh` existent (existsSync, l.566-569). Un run interrompu (Ctrl+C / crash agent pendant l'écriture) peut laisser un `product_spec.json` tronqué ou un JSON syntaxiquement valide mais incomplet (ex: clé `sprints` manquante). Le planning est alors sauté à tort.

2) En Phase 2, `phaseSprints` lit ce fichier via `readJson(...)` (l.434). Correction par rapport au seed : `readJson` (l.53-66) attrape déjà les erreurs de parsing et renvoie `null` ; et `phaseSprints` garde `spec === null || !("sprints" in spec)` (l.435) puis fait un `return` propre avec `console.error("Cannot read sprints from product_spec.json")`. Donc il n'y a PAS de crash non-géré — mais l'échec est silencieux et trompeur : au lieu de régénérer le spec corrompu, le pipeline s'arrête avec un message obscur sans jamais relancer le planning. C'est un cul-de-sac de reprise.

3) Phase 3 (Final Evaluation) est sautée si `qa_report_final.json` existe (existsSync, l.586). Même problème : un rapport final tronqué d'un run interrompu fait sauter l'évaluation finale à tort, et `phaseFinalEvaluation` produirait sinon un `readJson(...) === null` géré par un simple `console.warn` (l.531-533).

4) Aucune vérification de budget au démarrage de `main()`. `isOverBudget(budgetMax)` n'est testé qu'à l'intérieur de la boucle de sprints, avant chaque sprint (l.466). Si un `progress.json` chargé (l.557) indique déjà un coût cumulé >= `max_total_usd`, `main()` lance quand même Phase 1 puis Phase 2, et le coût ne sera détecté qu'au premier tour de boucle de sprint — après avoir potentiellement relancé un planning coûteux. La reprise ne court-circuite pas un budget déjà épuisé.

Note de fidélité : le harnais est un port fidèle V1 et préserve volontairement certaines limitations. Ce ticket introduit un changement de comportement (behavior_change=true) — voir risks.

**Preuves.**
- `src/orchestrator.ts:566-569` — Skip Phase 1 : `const requiredFiles = ["product_spec.json", "feature_list.json", "init.sh"]; if (requiredFiles.every((f) => fs.existsSync(path.join(workspace, f))))` — décision basée uniquement sur existsSync, jamais sur le contenu.
- `src/orchestrator.ts:586-591` — Skip Phase 3 : `if (fs.existsSync(path.join(workspace, "qa_report_final.json"))) { ...skipped... } else { await phaseFinalEvaluation(...) }` — existsSync seul, pas de validation du rapport.
- `src/orchestrator.ts:434-438` — `const spec = readJson(workspace, "product_spec.json") as ProductSpec | null; if (spec === null || !("sprints" in spec)) { console.error("Cannot read sprints from product_spec.json"); return; }` — return propre (PAS de crash, correction du seed), mais sans relancer le planning : cul-de-sac trompeur.
- `src/orchestrator.ts:53-66` — `readJson` fait déjà try/catch sur JSON.parse et retourne null avec `console.error("Invalid JSON in ...")`. Donc un JSON tronqué -> null géré, pas une exception remontante. Le problème est la décision de skip en amont (existsSync), pas le parsing.
- `src/orchestrator.ts:466-472` — `if (progress.isOverBudget(budgetMax)) { console.warn(...); break; }` — unique point de contrôle budget, situé DANS la boucle de sprints, pas au démarrage de main().
- `src/orchestrator.ts:557-562` — `const progress = ProjectProgress.load(workspace);` charge total_cost_usd persisté ; aucune vérification isOverBudget n'est faite entre ce chargement et le lancement de Phase 1 (l.572).
- `src/progress.ts:61-63` — `isOverBudget(maxUsd: number): boolean { return this.total_cost_usd >= maxUsd; }` — query pure réutilisable au démarrage.
- `src/tools.ts:34-124` — `validateJson(workspaceDir, filePath, schemaName)` : fonction pure qui parse + vérifie les clés requises par schéma, renvoie `{content, isError?}`. Réutilisable hors MCP pour valider product_spec / feature_list / qa_report à la reprise (synergie DX-09).
- `src/tools.ts:22-28` — `REQUIRED_KEYS` mappe les schémas : product_spec=[name,description,design_system,sprints,stack], feature_list_item=[...], qa_report=[sprint_id,overall_score,verdict,scores,bugs], etc. Donne les clés à exiger pour juger un fichier de reprise 'complet'.
- `config.yaml:23` — `max_total_usd: 700.0` sous la clé `budget` — seuil utilisé par isOverBudget, déjà chargé via loadConfig() (l.547).

**Impact DX.** Aujourd'hui, une reprise après interruption peut soit (a) sauter silencieusement le planning sur un spec corrompu puis s'arrêter avec un message trompeur ("Cannot read sprints") sans rien régénérer, soit (b) sauter une évaluation finale incomplète, soit (c) relancer un pipeline alors que le budget est déjà épuisé. Le développeur doit diagnostiquer manuellement (ouvrir les JSON, éditer progress.json) au lieu d'obtenir un comportement de reprise prévisible. Le fix rend la reprise auto-diagnostique : régénération automatique si un livrable est corrompu/incomplet, et arrêt net + clair si le budget est déjà dépassé avant de dépenser quoi que ce soit.

**Correctif proposé.**
1. Exporter une petite primitive de validation de fichier de reprise réutilisant `validateJson` de src/tools.ts (synergie DX-09). Ex: dans orchestrator.ts, `function isValidArtifact(workspace, filename, schemaName): boolean` qui appelle `validateJson(workspace, filename, schemaName)` et retourne `result.isError !== true`. Si DX-09 centralise déjà la validation, consommer ce module au lieu de dupliquer.
2. Remplacer la condition de skip Phase 1 (l.567-569) : au lieu de `requiredFiles.every(existsSync)`, exiger que init.sh existe ET que product_spec.json valide le schéma `product_spec` ET que feature_list.json valide le schéma `feature_list`. Si un seul échoue -> NE PAS sauter, relancer phasePlanning (log explicite: 'Planning outputs missing or invalid (<fichier>: <raison>) — regenerating').
3. Remplacer la condition de skip Phase 3 (l.586) : ne sauter que si qa_report_final.json valide le schéma `qa_report`. Sinon relancer phaseFinalEvaluation (log explicite indiquant le rapport invalide/incomplet).
4. Ajouter une vérification budget au démarrage de main(), juste après `ProjectProgress.load` (l.557) et avant Phase 1 (l.566) : `if (progress.isOverBudget(config.budget.max_total_usd)) { console.error('Budget already exhausted ($X / $Y) before start — aborting. Lower total_cost_usd in progress.json or raise budget.max_total_usd to resume.'); process.exit(1); }`. Réutiliser le seuil déjà disponible via config (l.562 l'affiche déjà).
5. Garder `readJson` et les gardes existantes (l.435, l.531-533) comme filet de sécurité de seconde ligne — ne pas les retirer.
6. Ajouter/étendre des tests vitest sur la logique pure de reprise extraite (isValidArtifact + décision de skip) : un product_spec tronqué/incomplet ne doit pas être traité comme 'déjà fait' ; un qa_report final incomplet non plus ; un budget déjà dépassé doit court-circuiter.
7. pnpm typecheck + pnpm test verts.

**Critères d'acceptation.**
- [ ] pnpm typecheck est clean.
- [ ] pnpm test passe ; un test échoue si un product_spec.json syntaxiquement valide mais sans la clé `sprints` est considéré comme un livrable de planning valide (doit déclencher la régénération, pas le skip).
- [ ] Un test vérifie qu'un product_spec.json tronqué (JSON invalide) déclenche la régénération de Phase 1 au lieu du skip.
- [ ] Un test vérifie qu'un qa_report_final.json incomplet (clés requises manquantes) déclenche la régénération de Phase 3 au lieu du skip.
- [ ] Au démarrage, si progress.total_cost_usd >= config.budget.max_total_usd, main() s'arrête immédiatement (exit code != 0) avec un message clair, sans lancer Phase 1.
- [ ] Comportement inchangé sur le chemin nominal : des artefacts complets/valides + budget OK -> les phases sont toujours correctement sautées comme avant.
- [ ] La validation réutilise REQUIRED_KEYS / validateJson (pas de duplication d'une nouvelle liste de clés).

**Risques.**
- Tension de fidélité V1 : le port préserve volontairement des limitations V1 ; durcir le skip est un behavior_change qui s'écarte du port 1:1. À valider avec le mainteneur.
- REQUIRED_KEYS ne fait qu'un check de présence de clés (pas de validation profonde) : un fichier passant le check peut rester sémantiquement incomplet (ex: sprints:[]). Documenter comme garde-fou structurel, pas validation exhaustive.
- Régression de coût : un skip transformé en régénération relance des agents et dépense du budget ; garder un seuil de validation conservateur (ne régénérer que sur invalidité claire).
- process.exit(1) au démarrage sur budget dépassé change le code de sortie ; vérifier qu'aucun script d'appel ne dépend de l'ancien comportement.
- Bien router le bon schemaName par fichier (feature_list via le schéma liste, product_spec/qa_report via les schémas objet) pour éviter faux positifs/négatifs.

<details><summary>Notes de vérification</summary>

Locations du seed vérifiées et exactes : src/orchestrator.ts:566-578 (skip Phase 1), 586-591 (skip Phase 3), 434 (readJson product_spec), 466 (isOverBudget dans la boucle). CORRECTION du seed_problem : un product_spec.json tronqué ne 'casse pas plus loin' par crash — `readJson` (l.53-66) attrape déjà l'erreur JSON et retourne null, et `phaseSprints` (l.435) garde ce null avec un `return` propre + console.error 'Cannot read sprints from product_spec.json'. Le vrai défaut n'est donc pas un crash mais un cul-de-sac de reprise silencieux/trompeur (planning sauté à tort, pas régénéré). Le cas le plus insidieux est un JSON SYNTAXIQUEMENT valide mais incomplet (clé `sprints` manquante) : readJson renvoie l'objet, le guard `!('sprints' in spec)` l'attrape quand même ici, mais d'autres clés manquantes (design_system, stack) passeraient inaperçues jusqu'à un usage en aval — d'où l'intérêt de valider via REQUIRED_KEYS. Confirmé qu'il n'existe AUCUN check budget dans main() entre ProjectProgress.load (l.557) et le lancement de Phase 1 ; isOverBudget n'est appelé qu'en l.466. Confirmé que `validateJson` (src/tools.ts:34) et `REQUIRED_KEYS` (src/tools.ts:22) sont des primitives pures réutilisables hors MCP, ce qui rend la synergie DX-09 concrète. Ce ticket n'est PAS lié au scoring — l'Option A ne s'applique pas. fidelity_tension repassé à true (le seed indiquait false) car le durcissement du skip s'écarte du port fidèle 1:1 qui préserve les limitations V1.

</details>

### DX-24 — Valider/normaliser les IDs de modèle au preflight : alias mouvants (claude-opus-4-6/4-7) jamais vérifiés avant le 1er appel coûteux

**Thème** Robustesse / Reproductibilité · **Sévérité** 🟠 moyenne · **Effort** S · **Fidélité V1** non · **Change le comportement** oui · **Dépend de** DX-12, DX-10

**Problème.** config.yaml fige trois IDs de modèle (`models.planner: "claude-opus-4-6"`, `models.builder`/`models.evaluator: "claude-opus-4-7"`) qui sont des alias potentiellement inexistants/mouvants. Ces valeurs sont injectées telles quelles dans `Options.model` (un simple `string`, aucune validation compile-time) au moment de construire les options de chaque agent, puis transmises au CLI Claude lors du premier `query()`. Il n'existe AUCUN point de validation entre le chargement de la config (`loadConfig()` fait `parse(raw) as Config`, sans contrôle) et le premier appel agent réel (Phase 1 Planning). Conséquence : si un alias est invalide, l'erreur n'apparaît qu'au runtime du premier appel coûteux. Pire, selon la façon dont le CLI signale l'échec, le runner peut ne jamais recevoir de message `result` ; le watchdog d'inactivité (120 s) finit alors par `abort()`, et `runAgent` renvoie `isError: true, costUsd: 0`. L'opérateur perd ~2 minutes par agent et obtient un diagnostic pauvre (cause réelle uniquement dans `cli_debug.log`). Aucune politique de pinning ni de mise à jour des alias n'est documentée. Le SDK expose pourtant `query(...).supportedModels(): Promise<ModelInfo[]>`, alimenté par la réponse d'initialisation de session (pas par un appel de génération coûteux), ce qui permet un preflight bon marché : récupérer la liste des `ModelInfo.value` autorisés et vérifier que les trois IDs configurés en font partie AVANT de lancer Planning.

**Preuves.**
- `config.yaml:5-8` — models.planner='claude-opus-4-6', models.builder='claude-opus-4-7', models.evaluator='claude-opus-4-7' — alias en dur, jamais validés.
- `src/orchestrator.ts:41-50` — loadConfig() fait `parse(raw) as Config` : cast non vérifié, aucune validation des valeurs de models.* (ni de quoi que ce soit d'autre).
- `src/orchestrator.ts:543-578` — main() enchaîne loadConfig() puis directement phasePlanning() : aucun preflight de modèle/credentials entre les deux. Le 1er appel coûteux (Planner) est donc le 1er endroit où un modèle invalide se manifeste.
- `src/agents/planner.ts:42` — model: config.models.planner — injecté tel quel dans Options.model (string).
- `src/agents/builder.ts:36` — model: config.models.builder — idem (loadBuilderOptions, partagé contrat+implémentation).
- `src/agents/evaluator.ts:55` — model: config.models.evaluator — idem (loadEvaluatorOptions, partagé review+QA).
- `src/types.ts:20-24` — Config.models = { planner: string; builder: string; evaluator: string } — typé string, aucune contrainte sur les valeurs admissibles.
- `src/agents/client.ts:68-74,99-124` — Watchdog 120 s -> controller.abort() ; sur abort/crash ou result manquant, runAgent renvoie {isError:true, costUsd:0}. Un modèle invalide qui ne produit pas de message result coûte donc un cycle watchdog complet et un cost trompeur de 0.
- `node_modules/@anthropic-ai/claude-agent-sdk/sdk.d.ts:2243` — supportedModels(): Promise<ModelInfo[]> exposé sur l'objet Query retourné par query() ; alimenté par la réponse d'init de session (cf. SDKControlInitializeResponse.models, sdk.d.ts:2909), donc validation possible sans appel de génération coûteux.
- `node_modules/@anthropic-ai/claude-agent-sdk/sdk.d.ts:1183-1190` — ModelInfo.value = identifiant de modèle utilisable dans les appels API ; c'est la valeur à comparer aux IDs configurés.

**Impact DX.** Sans ce garde-fou, une simple coquille ou un alias retiré côté plateforme fait échouer le pipeline tardivement, après ~120 s de watchdog par agent, avec un `cost_usd=0` trompeur et la cause réelle enterrée dans cli_debug.log. Un preflight transforme cet échec opaque en message immédiat et explicite ("model 'claude-opus-4-6' introuvable ; modèles disponibles : ..."), au coût d'un seul handshake d'init de session. Documenter la politique d'alias clarifie aussi la reproductibilité d'un repo qui se présente comme un port fidèle figé.

**Correctif proposé.**
1. Ajouter une fonction de preflight des modèles (idéalement dans le module preflight introduit par DX-12, sinon dans orchestrator.ts) : ouvrir une session SDK légère via `query()` avec un prompt trivial mais en n'itérant PAS sur les messages de génération — appeler immédiatement `await q.supportedModels()` pour récupérer la liste des ModelInfo, puis fermer/abandonner la session. Construire l'ensemble des valeurs autorisées à partir de `models.map(m => m.value)`.
2. Vérifier que `config.models.planner`, `config.models.builder` et `config.models.evaluator` figurent tous dans cet ensemble. Si un ID manque, échouer le preflight avec un message listant l'ID fautif, l'agent concerné, et les valeurs disponibles ; faire `process.exit(1)` AVANT phasePlanning (cohérent avec le comportement preflight de DX-12).
3. Câbler l'appel preflight au tout début de main() (orchestrator.ts:543), après loadConfig() et avant la création du workspace / Phase 1, pour qu'aucun coût d'agent ne soit engagé si un modèle est invalide. Prévoir un échappatoire env (ex. HARNESS_SKIP_MODEL_CHECK=1) pour les environnements offline/CI où supportedModels() n'est pas joignable, en loggant un warning explicite.
4. Si DX-10 (validation zod de config.yaml) est livré, ajouter au schéma une contrainte de forme sur models.* (string non vide) ; la validation sémantique 'le modèle existe' reste au preflight runtime puisqu'elle dépend de la plateforme — documenter cette répartition dans le code.
5. Documenter la politique de pinning/mise à jour des alias de modèle : ajouter dans CLAUDE.md (ou un commentaire en tête de la section models de config.yaml) que ces valeurs sont des alias susceptibles d'évoluer, qu'elles sont validées au preflight, et la procédure pour les rafraîchir.
6. pnpm typecheck ; pnpm test (le preflight des modèles dépend du SDK -> couverture par run réel ; n'écrire de test unitaire que sur la fonction pure de comparaison ID-configuré ⊂ liste-autorisée, en mockant supportedModels).

**Critères d'acceptation.**
- [ ] pnpm typecheck est clean.
- [ ] Lancer le pipeline avec un models.planner volontairement invalide (ex. 'claude-opus-INEXISTANT') échoue au preflight AVANT toute exécution d'agent (aucun run 'planner' ajouté à progress.json, aucun coût engagé) avec un message nommant l'ID invalide, l'agent concerné et les modèles disponibles.
- [ ] Lancer le pipeline avec les trois IDs valides passe le preflight et continue normalement vers Phase 1.
- [ ] Le coût du preflight est limité à un handshake d'init de session (pas de tour de génération) : vérifié en observant qu'aucun message 'result' de génération n'est consommé pour ce contrôle.
- [ ] Un test unitaire échoue si la fonction pure de validation accepte un ID absent de la liste des modèles autorisés (et passe quand tous les IDs y figurent).
- [ ] CLAUDE.md (ou config.yaml) documente que models.* sont des alias mouvants validés au preflight, avec la procédure de mise à jour.
- [ ] Un mode d'échappatoire (env var) permet de sauter le contrôle hors-ligne en loggant un warning.

**Risques.**
- Coût/latence du handshake : ouvrir une session SDK juste pour supportedModels() ajoute un court délai au démarrage ; acceptable mais à mesurer. Prévoir un timeout court pour ne pas bloquer si l'init traîne.
- Dépendance à la disponibilité réseau/credentials au preflight : si le contrôle s'exécute avant la vérification ANTHROPIC_API_KEY/CLI de DX-12, il peut échouer pour une mauvaise raison. Ordonner le preflight credentials AVANT le preflight modèles, ou fusionner les deux.
- supportedModels() pourrait renvoyer des alias normalisés différents de ceux acceptés en entrée (ex. 'opus' vs 'claude-opus-4-7') ; tester la sémantique réelle de comparaison sur un run avant de durcir l'égalité stricte, sous peine de faux négatifs bloquant un pipeline pourtant valide. D'où l'échappatoire env.
- behavior_change=true : le pipeline refusera désormais de démarrer sur un modèle invalide là où il partait (et échouait tard) auparavant. Comportement souhaité mais à signaler dans le changelog.
- Fidélité V1 : la V1 Python n'avait pas ce preflight ; il s'agit d'un ajout de robustesse hors périmètre du 'port fidèle'. Tension faible (aucun comportement V1 existant n'est modifié, seulement un échec précoce ajouté), mais à mentionner pour cohérence avec la posture du repo.
- Si supportedModels() n'est pas fiable selon la version du SDK pinné (@anthropic-ai/claude-agent-sdk ^0.3.154), valider sa présence/comportement sur cette version exacte avant de s'y fier.

<details><summary>Notes de vérification</summary>

Toutes les locations du ticket source corrigées et resserrées : les modèles sont consommés à planner.ts:42, builder.ts:36, evaluator.ts:55 (et non les plages 41-50/35-44/54-63 qui couvrent l'objet Options entier ; la ligne exacte du champ model est ce qui compte). Confirmé qu'il n'existe aucun preflight ni aucune validation des models.* : loadConfig() (orchestrator.ts:48-49) fait un cast brut et main() (orchestrator.ts:543-578) enchaîne directement vers Phase 1. Confirmé via sdk.d.ts que Options.model est un simple string sans contrainte, et surtout que le SDK expose `query(...).supportedModels(): Promise<ModelInfo[]>` (sdk.d.ts:2243) alimenté par la réponse d'init de session (SDKControlInitializeResponse.models, sdk.d.ts:2909) — c'est LE mécanisme bon marché à utiliser pour le preflight, ce que le ticket source ne précisait pas. Correction sur depends_on : le ticket source cite 'DX-15' comme synergie preflight, mais dans l'audit consolidé l'item preflight (CLI claude/ANTHROPIC_API_KEY/playwright avant Phase 1) est rank 12, et la validation zod de config.yaml est rank 10 ; rank 15 concerne l'extraction des noms d'artefacts JSON, sans rapport. J'ai donc remplacé DX-15 par DX-12 (preflight, prérequis naturel : même point d'insertion) et DX-10 (validation config, complémentaire). Note : les IDs DX-N de ce workflow ne suivent PAS le rang du backlog (le ticket source DX-24 provient de critic.gap, pas de backlog rank 24) ; les depends_on ci-dessus utilisent la convention DX-<rank> par défaut faute d'autre table de correspondance — à réconcilier si le workflow attribue des IDs différents. Confirmé que la limitation cost_usd=0 sur crash/abort (client.ts:101-124) rend l'échec tardif d'autant plus trompeur (renforce la justification du preflight).

</details>

---

## Thème — Architecture & Modules

_Extractions pour la testabilite et la deduplication. DX-12 (helper d'agents partage : PROMPTS_DIR, loadPrompt, baseAgentOptions, narrowing permission_mode) est duplique a l'identique dans planner/builder/evaluator et conditionne DX-24. DX-13 sort cleanupWorkspacePorts/DEV_SERVER_PORTS/loadConfig/readJson hors de orchestrator.ts (604 lignes). DX-35 extrait les noms d'artefacts JSON + convention sprint 0=final (artifactNames.ts). DX-34/DX-33 sont du nettoyage (duplication liste fichiers planner, champs textOutput/resultText non consommes)._

### DX-12 — Extraire un helper d'agents partagé (PROMPTS_DIR, loadPrompt, baseAgentOptions, narrowing du permission_mode)

**Thème** Architecture/Modules · **Sévérité** 🟠 moyenne · **Effort** M · **Fidélité V1** non · **Change le comportement** non · **Dépend de** —

**Problème.** Les trois modules d'agents (planner.ts, builder.ts, evaluator.ts) dupliquent trois blocs identiques ou quasi identiques, ce qui crée un risque de drift silencieux : toute évolution de la construction des Options doit être répétée 3 fois.

1. PROMPTS_DIR : bloc strictement identique copié-collé dans les 3 fichiers (path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../prompts")). 3 copies + 3 imports identiques de node:fs / node:path / node:url.

2. Chargement des prompts : chaque module fait son propre readFileSync(path.join(PROMPTS_DIR, ...)). builder.ts et evaluator.ts lisent en plus grading_criteria.md et le concatènent avec systemPrompt + "\n\n---\n\n" + grading (logique dupliquée à l'identique entre builder.ts:37 et evaluator.ts:56).

3. Le bloc Options : model/cwd/maxTurns/permissionMode/allowedTools/mcpServers/canUseTool est construit 3 fois avec la même forme (planner.ts:41-50, builder.ts:35-44, evaluator.ts:54-63). Les seules différences réelles : le model choisi, le contenu du systemPrompt, et le fait que l'evaluator peut ajouter conditionnellement le serveur MCP Playwright + l'outil mcp__playwright__*.

4. Le cast permission_mode : `agentCfg.permission_mode as Options["permissionMode"]` apparaît 3 fois (planner.ts:46, builder.ts:40, evaluator.ts:59). C'est un cast non validé : config.yaml déclare permission_mode comme string libre (types.ts:11 AgentLimits.permission_mode: string), donc une faute de frappe dans config.yaml (ex. "acceptEdit" au lieu de "acceptEdits") passerait silencieusement au SDK sans erreur de compilation ni d'exécution côté harnais. Le type SDK PermissionMode est une union fermée : 'default' | 'acceptEdits' | 'bypassPermissions' | 'plan' | 'dontAsk' | 'auto'.

Fix sans behavior_change : factoriser PROMPTS_DIR, loadPrompt (avec concaténation optionnelle du grading) et un baseAgentOptions dans un nouveau module src/agents/options.ts, avec narrowing validé du permission_mode. Note d'interdépendance : le helper loadPrompt deviendra le point d'interpolation naturel pour les placeholders de scoring de DX-01 (Option A) ; ce ticket le prépare mais reste autonome.

**Preuves.**
- `src/agents/planner.ts:18-21` — PROMPTS_DIR via path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../prompts") — copie 1/3
- `src/agents/builder.ts:18-21` — PROMPTS_DIR — copie 2/3, strictement identique
- `src/agents/evaluator.ts:18-21` — PROMPTS_DIR — copie 3/3, strictement identique
- `src/agents/planner.ts:41-50` — Bloc Options (model/cwd/maxTurns/permissionMode/allowedTools/mcpServers/canUseTool). systemPrompt = planner_prompt.md seul (pas de grading)
- `src/agents/builder.ts:35-44` — Bloc Options dans loadBuilderOptions. systemPrompt = builder_prompt.md + "\n\n---\n\n" + grading_criteria.md (builder.ts:29-37)
- `src/agents/evaluator.ts:54-63` — Bloc Options dans loadEvaluatorOptions. Même concaténation grading (evaluator.ts:56). Différence réelle : mcpServers/allowedTools enrichis conditionnellement avec Playwright si withPlaywright && config.qa.tools.playwright (evaluator.ts:42-52)
- `src/agents/planner.ts:46` — `permissionMode: agentCfg.permission_mode as Options["permissionMode"]` — cast non validé 1/3
- `src/agents/builder.ts:40` — Même cast non validé 2/3
- `src/agents/evaluator.ts:59` — Même cast non validé 3/3
- `src/types.ts:11` — AgentLimits.permission_mode: string — type source large, d'où le cast nécessaire et la possibilité d'une valeur invalide
- `node_modules/@anthropic-ai/claude-agent-sdk/sdk.d.ts:1975` — type PermissionMode = 'default' | 'acceptEdits' | 'bypassPermissions' | 'plan' | 'dontAsk' | 'auto' — union cible pour le narrowing validé
- `config.yaml:28` — permission_mode: "acceptEdits" pour les 3 agents (planner/builder/evaluator) — valeur unique actuellement, donc le narrowing ne change aucun comportement

**Impact DX.** Réduit la surface de duplication de ~3x à 1x pour PROMPTS_DIR, le chargement de prompts et la construction des Options. Toute évolution future (ajout d'un champ Options, changement de la stratégie de concaténation grading, ajout d'un MCP) se fait à un seul endroit, supprimant le risque de drift entre agents. Le narrowing du permission_mode transforme une faute de frappe config.yaml silencieuse (qui passerait au SDK telle quelle) en une erreur explicite et localisée. Surtout, crée le point d'extension loadPrompt sur lequel DX-01 branchera l'interpolation des placeholders de scoring (Option A) une seule fois pour les 3 agents, au lieu de 3 fois.

**Correctif proposé.**
1. Créer src/agents/options.ts. Y déplacer PROMPTS_DIR (path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../prompts")) — chemin inchangé car options.ts reste dans src/agents/.
2. Ajouter une fonction loadPrompt(fileName: string, opts?: { withGrading?: boolean }): string qui fait readFileSync(path.join(PROMPTS_DIR, fileName), "utf-8") et, si withGrading, concatène + "\n\n---\n\n" + loadPrompt("grading_criteria.md"). Garder EXACTEMENT le séparateur "\n\n---\n\n" pour ne pas altérer le system prompt reçu par les agents. (Ce loadPrompt est le hook futur de DX-01 pour interpoler les placeholders de scoring ; ne pas implémenter l'interpolation ici, juste centraliser le chargement.)
3. Ajouter une fonction de narrowing parsePermissionMode(value: string): PermissionMode (importer le type PermissionMode depuis @anthropic-ai/claude-agent-sdk) qui valide value contre l'ensemble {'default','acceptEdits','bypassPermissions','plan','dontAsk','auto'} et throw une Error explicite (citant la clé config et la valeur reçue) si invalide. Définir l'ensemble comme un const array typé readonly pour qu'il reste synchronisé avec le type.
4. Ajouter baseAgentOptions(args: { model: string; systemPrompt: string; agentCfg: AgentLimits; workspaceDir: string; config: Config }): Options qui retourne l'objet Options commun { model, systemPrompt, cwd: workspaceDir, maxTurns: agentCfg.max_turns, permissionMode: parsePermissionMode(agentCfg.permission_mode), allowedTools: agentCfg.allowed_tools, mcpServers: { harness: createHarnessTools(workspaceDir) }, canUseTool: createPermissionHandler(config, workspaceDir) }.
5. Refactorer planner.ts : supprimer PROMPTS_DIR + imports node:fs/node:url devenus inutiles, remplacer le bloc Options par baseAgentOptions({ model: config.models.planner, systemPrompt: loadPrompt("planner_prompt.md"), agentCfg: config.agent_limits.planner, workspaceDir, config }).
6. Refactorer builder.ts (loadBuilderOptions) : utiliser baseAgentOptions avec systemPrompt: loadPrompt("builder_prompt.md", { withGrading: true }) et model: config.models.builder.
7. Refactorer evaluator.ts (loadEvaluatorOptions) : partir de baseAgentOptions (systemPrompt: loadPrompt("evaluator_prompt.md", { withGrading: true }), model: config.models.evaluator), puis appliquer la logique Playwright existante PAR-DESSUS l'objet retourné — surcharger mcpServers (ajouter "playwright") et allowedTools (push "mcp__playwright__*") uniquement si withPlaywright && config.qa.tools.playwright. Préserver l'ordre et la condition exacts d'evaluator.ts:44-52.
8. Lancer pnpm typecheck (alias de tsc --noEmit) puis pnpm test ; vérifier que les 4 suites tests/ passent toujours et qu'aucun comportement observable ne change.

**Critères d'acceptation.**
- [ ] pnpm typecheck (tsc --noEmit) est clean après refactor
- [ ] pnpm test : les 4 suites existantes (orchestrator-scoring, progress, security, tools) restent vertes
- [ ] src/agents/options.ts existe et exporte loadPrompt, parsePermissionMode et baseAgentOptions ; PROMPTS_DIR et le cast `as Options["permissionMode"]` n'apparaissent plus dans planner.ts / builder.ts / evaluator.ts (vérifiable par grep : 0 occurrence)
- [ ] Le system prompt résultant est byte-pour-byte identique à avant pour chaque agent (même séparateur "\n\n---\n\n", même contenu grading pour builder/evaluator, pas de grading pour planner)
- [ ] Un test unitaire couvre parsePermissionMode : 'acceptEdits' (et les autres valeurs valides) renvoie la valeur ; une valeur inconnue (ex. 'acceptEdit') throw
- [ ] Avec config.yaml inchangé (permission_mode='acceptEdits' partout), les Options produites par les 3 agents sont équivalentes à l'état actuel (aucun behavior_change observable)

**Risques.**
- Régression silencieuse sur le system prompt si le séparateur ou l'ordre de concaténation grading change : préserver strictement "\n\n---\n\n" et l'ordre systemPrompt-puis-grading.
- La logique Playwright de l'evaluator est conditionnelle et enrichit mcpServers + allowedTools ; mal la réappliquer par-dessus baseAgentOptions pourrait écraser le serveur harness ou perdre l'outil mcp__playwright__*. Surcharger en conservant la clé harness, ne pas réassigner mcpServers à un objet ne contenant que playwright.
- PROMPTS_DIR est relatif au fichier source via import.meta.url : tant que options.ts reste dans src/agents/, le chemin ../../prompts reste correct. Le déplacer ailleurs (ex. racine src/) casserait la résolution — garder le module dans src/agents/.
- parsePermissionMode introduit un throw qui n'existait pas : c'est intentionnel (fail-fast sur config invalide) mais c'est un changement de comportement aux marges. Avec la config actuelle ('acceptEdits') aucune exception n'est levée, donc pas d'impact en pratique ; documenter ce durcissement.
- Aucune tension de fidélité V1 : la V1 Python ne validait pas non plus permission_mode, mais ce ticket ne modifie ni les artefacts JSON inter-agents ni le protocole ni les valeurs par défaut — il durcit seulement une zone interne au harnais TS. behavior_change reste false pour la config livrée.
- Couplage avec DX-01 : si DX-01 est traité d'abord ou en parallèle, coordonner la signature de loadPrompt pour qu'elle accueille l'interpolation (ex. un paramètre placeholders) sans nouvelle refonte. Ce ticket peut toutefois être livré seul.

<details><summary>Notes de vérification</summary>

Toutes les locations du ticket source sont exactes (vérifiées ligne par ligne dans planner.ts, builder.ts, evaluator.ts). Confirmé : PROMPTS_DIR est strictement identique dans les 3 fichiers ; le cast `as Options[\"permissionMode\"]` apparaît bien 3 fois (planner.ts:46, builder.ts:40, evaluator.ts:59) ; types.ts:11 déclare permission_mode: string (cast donc non validé). Le type SDK PermissionMode (sdk.d.ts:1975) est l'union 'default'|'acceptEdits'|'bypassPermissions'|'plan'|'dontAsk'|'auto'. config.yaml utilise 'acceptEdits' pour les 3 agents → le narrowing n'introduit aucun changement de comportement avec la config livrée. Précisions ajoutées vs ticket source : (1) builder.ts ET evaluator.ts dupliquent aussi la concaténation grading_criteria.md (séparateur \"\\n\\n---\\n\\n\"), à factoriser dans loadPrompt ; planner NE charge PAS grading. (2) La seule vraie divergence du bloc Options de l'evaluator est l'enrichissement conditionnel Playwright (evaluator.ts:42-52), à réappliquer par-dessus le helper. (3) Dépendance DX-01 confirmée : les chiffres de scoring en dur sont dans grading_criteria.md (poids 30/25/25/20, PASS>=8, critère>=7.0 — lignes 7/27/49/71/96/99-100), evaluator_prompt.md (lignes 65-70, 112) et la table inline evaluator.ts:189-199 — loadPrompt sera leur point d'interpolation. depends_on laissé vide : DX-12 est livrable indépendamment et c'est plutôt DX-01 qui dépendra de DX-12 (loadPrompt partagé). Layout tests confirmé : tests/ avec 4 suites ; scripts pnpm typecheck=tsc --noEmit, pnpm test=vitest run.

</details>

### DX-13 — Extraire cleanupWorkspacePorts (+ DEV_SERVER_PORTS) et loadConfig/readJson hors de orchestrator.ts (604 lignes) vers des modules testables

**Thème** Architecture/Modules · **Sévérité** 🟠 moyenne · **Effort** M · **Fidélité V1** non · **Change le comportement** non · **Dépend de** —

**Problème.** `src/orchestrator.ts` est le plus gros fichier du harnais (604 lignes, ~18 Ko) et mélange quatre responsabilités distinctes : (1) chargement de configuration YAML (`loadConfig`), (2) I/O JSON générique du workspace (`readJson`), (3) plomberie de nettoyage de ports dev-server Linux-spécifique (`cleanupWorkspacePorts` + constante `DEV_SERVER_PORTS`, ~75 lignes de logique `lsof` / `/proc/<pid>/cwd` / `process.kill`), et (4) la vraie orchestration de haut niveau (les 3 phases + `negotiateContract`, `runSprint`, `sprintPassed`, `main`).

Les trois premiers blocs n'ont rien à voir avec l'orchestration et alourdissent inutilement le fichier qui devrait se concentrer sur le pilotage des agents. En particulier `cleanupWorkspacePorts` est de la pure plomberie système, fortement OS-dépendante (lsof + /proc), donc difficile à lire et impossible à tester unitairement tant qu'elle est noyée dans le fichier d'orchestration. Aujourd'hui le seul morceau de logique pure d'orchestrator.ts couvert par un test est `sprintPassed` (`tests/orchestrator-scoring.test.ts`).

Objectif : déplacer ces helpers vers des modules dédiés (`src/workspace-ports.ts`, `src/io.ts`, `src/config.ts`) pour que `orchestrator.ts` ne garde que les phases + `main` + helpers d'orchestration purs. Refactor strictement mécanique : aucun changement de comportement, juste un déplacement de code + ajustement des imports.

**Preuves.**
- `src/orchestrator.ts:1-604` — Fichier de 604 lignes (confirmé par `wc -l`), le plus gros de src/ (~18 Ko vs 8,5 Ko pour security.ts). En-tête de doc décrit uniquement les 3 phases d'orchestration.
- `src/orchestrator.ts:40-50` — `export function loadConfig(configPath?: string): Config` — lit config.yaml via readFileSync + parse(yaml). Pur chargement de config, aucun lien avec l'orchestration.
- `src/orchestrator.ts:52-66` — `export function readJson(workspace, filename): unknown | null` — I/O JSON générique (existsSync + readFileSync + JSON.parse, warn/error en cas d'échec). Utilitaire réutilisable.
- `src/orchestrator.ts:68-71` — Commentaire + `const DEV_SERVER_PORTS = ["3000","3001","8000","8001"]` — appartient au module ports, pas à l'orchestrateur. À déplacer AVEC cleanupWorkspacePorts (pas une location séparée du ticket source mais nécessaire).
- `src/orchestrator.ts:81-147` — `export function cleanupWorkspacePorts(workspace): void` — ~67 lignes : realpathSync(workspace), spawnSync('lsof', ['-tiTCP','-sTCP:LISTEN','-i:'+ports]), parse PIDs, readlinkSync(`/proc/${pid}/cwd`), filtre cwd ⊂ workspace, process.kill(SIGTERM), log via appendProgressLog. Plomberie OS-spécifique (lsof + /proc) sans aucun lien avec le pilotage des agents.
- `src/orchestrator.ts:332,594` — Les deux seuls call-sites de cleanupWorkspacePorts : ligne 332 (début de runSprint) et 594 (bloc finally de main). Devront importer depuis le nouveau module.
- `src/orchestrator.ts:254,277,381,434,524` — 5 call-sites internes de readJson (contrat, review, qa_report, product_spec, qa_report_final). Tous dans orchestrator.ts — readJson n'est importé par aucun autre module.
- `src/orchestrator.ts:547` — Unique call-site de loadConfig : `const config = loadConfig()` dans main(). Aucun autre module ne l'importe ; les agents reçoivent `config` en paramètre.
- `src/agents/builder.ts:25-29, src/agents/evaluator.ts:29-33, src/agents/planner.ts:35` — Les agents font leur propre readFileSync des prompts/grading et reçoivent `config: Config` en argument — ils n'appellent NI loadConfig NI readJson. Confirme que l'extraction n'impacte pas les agents.
- `src/orchestrator.ts:139-142` — cleanupWorkspacePorts dépend de appendProgressLog (importé depuis ./progress ligne 24-28). Le nouveau module workspace-ports.ts devra importer appendProgressLog depuis ./progress.
- `src/index.ts:8, tests/orchestrator-scoring.test.ts:3` — Seuls importeurs externes d'orchestrator.ts : index.ts importe `main`, le test importe `sprintPassed`. Aucun n'importe les 3 helpers à extraire — l'API publique consommée reste intacte.
- `vitest.config.ts:1-8` — include: ['tests/**/*.test.ts'] — seuls les tests sous tests/ sont exécutés ; les *.test.ts du workspace généré sont exclus. Un nouveau tests/workspace-ports.test.ts sera bien pris en compte.
- `tsconfig.json:5` — moduleResolution: 'Bundler' — imports extensionless (`./io`, `./config`, `./workspace-ports`), cohérent avec le style existant (`./progress`, `./agents/...`).

**Impact DX.** orchestrator.ts passe de 604 à ~510 lignes et son contenu redevient cohérent avec son nom (phases + main uniquement). cleanupWorkspacePorts devient lisible et testable isolément (mock de spawnSync/readlinkSync), ce qui prépare DX-19 (portabilité OS) et DX-26 (tests). loadConfig/readJson dans des modules dédiés clarifient les frontières I/O et donnent un point d'accroche naturel à DX-11 (validation de config). Réduction de la charge cognitive pour quiconque ouvre l'orchestrateur.

**Correctif proposé.**
1. Créer `src/config.ts` : y déplacer `loadConfig` (lignes 40-50) tel quel ; importer `parse` depuis 'yaml', `fs`, `path`, `fileURLToPath` depuis 'node:url', et le type `Config` depuis './types'. ATTENTION : `loadConfig` utilise `import.meta.url` pour résoudre '../config.yaml' relativement au fichier ; comme le module passe de src/ à src/, le chemin relatif '../config.yaml' reste correct (même profondeur). Vérifier qu'il pointe toujours vers la racine du repo.
2. Créer `src/io.ts` : y déplacer `readJson` (lignes 52-66) tel quel ; importer `fs` et `path`. (Optionnel : si DX-11 est traité ensuite, c'est le module qui accueillera la validation ; ne rien ajouter ici, simple déplacement.)
3. Créer `src/workspace-ports.ts` : y déplacer le commentaire + `DEV_SERVER_PORTS` (68-71) ET `cleanupWorkspacePorts` (81-147) tels quels ; importer `spawnSync` depuis 'node:child_process', `fs`, `path`, et `appendProgressLog` depuis './progress'. Exporter `DEV_SERVER_PORTS` aussi (utile pour un futur test/config).
4. Dans `src/orchestrator.ts` : supprimer les définitions déplacées (40-50, 52-66, 68-71, 81-147) ; ajouter les imports `import { loadConfig } from './config'`, `import { readJson } from './io'`, `import { cleanupWorkspacePorts } from './workspace-ports'`. Nettoyer les imports devenus inutilisés en tête de fichier : `parse` de 'yaml' (n'est plus utilisé qu'ici), `spawnSync` de 'node:child_process' (garder `execFileSync` qui reste utilisé lignes 194,554), `fileURLToPath`. NE PAS retirer `fs`/`path` (encore utilisés par les phases).
5. Garder les helpers d'orchestration purs (`sprintPassed` 310-315) DANS orchestrator.ts — le test `tests/orchestrator-scoring.test.ts` l'importe de là et c'est de la logique d'orchestration, pas un utilitaire I/O.
6. Lancer `pnpm typecheck` (tsc --noEmit doit être clean) puis `pnpm test` (les 4 suites existantes doivent rester vertes, dont orchestrator-scoring).
7. Ajouter `tests/workspace-ports.test.ts` couvrant cleanupWorkspacePorts : (a) early-return si lsof.error (lsof absent) sans throw ; (b) ne tue que les PIDs dont /proc/<pid>/cwd est ⊂ workspace ; (c) ignore les PIDs hors workspace. Mocker `node:child_process`.spawnSync et `node:fs`.readlinkSync/realpathSync/ via vi.mock. (Réutilisé/affiné par DX-26.)

**Critères d'acceptation.**
- [ ] `pnpm typecheck` est clean (0 erreur tsc).
- [ ] `pnpm test` : les 4 suites existantes (security, tools, progress, orchestrator-scoring) restent vertes.
- [ ] `src/orchestrator.ts` ne contient plus les définitions de loadConfig, readJson, DEV_SERVER_PORTS ni cleanupWorkspacePorts ; il les importe depuis ./config, ./io, ./workspace-ports respectivement.
- [ ] `src/orchestrator.ts` fait < 540 lignes (était 604).
- [ ] `grep -rn cleanupWorkspacePorts src/` montre la définition uniquement dans src/workspace-ports.ts et les appels dans src/orchestrator.ts (lignes ~332 et ~594 équivalentes).
- [ ] `pnpm dev` (ou un run réel) produit toujours le log 'Cleaned up dev-server zombies: PIDs ...' quand des zombies existent — comportement inchangé.
- [ ] Le test tests/workspace-ports.test.ts existe et passe (au moins : early-return sans lsof, kill in-workspace, skip out-of-workspace).
- [ ] Aucun import circulaire (workspace-ports → progress, et progress ne réimporte pas workspace-ports/orchestrator).

**Risques.**
- Imports inutilisés résiduels en tête d'orchestrator.ts (parse, spawnSync, fileURLToPath) feraient échouer typecheck si noUnusedLocals est actif — les nettoyer fait partie du fix. `execFileSync` reste utilisé (init.sh + git init), ne pas le retirer.
- Le chemin '../config.yaml' dans loadConfig est résolu via import.meta.url relativement au fichier source : src/config.ts est à la même profondeur que src/orchestrator.ts donc '../config.yaml' reste valide, MAIS toute exécution via build dist/ devrait être vérifiée (ici exécution via tsx, donc src/ direct — OK). Vérifier explicitement après déplacement.
- Risque d'import circulaire si workspace-ports.ts importe quelque chose d'orchestrator.ts — il ne doit importer QUE ./progress. RAS sur le code actuel.
- Tension de fidélité V1 : aucune. Le refactor est purement structurel (déplacement intra-paquet), il ne touche pas au comportement préservé de la V1 (cleanup au début de sprint + finally). Veiller à ne PAS 'améliorer' la logique au passage (ex: rendre les ports configurables) — cela appartient à DX-19/DX-11, pas à ce ticket de découpage.
- Synergie/ordre : si DX-11 (validation config) ou DX-19 (portabilité ports) sont prévus juste après, ce ticket doit passer en PREMIER car il crée les modules cibles ; sinon ces tickets toucheraient encore orchestrator.ts.

<details><summary>Notes de vérification</summary>

Toutes les locations du ticket source sont EXACTES après lecture du fichier réel : loadConfig 40-50 (le ticket disait 41-50, la signature est à la ligne 41 mais le commentaire JSDoc est ligne 40 — différence cosmétique), readJson 52-66 (ticket 52-66 exact), cleanupWorkspacePorts 81-147 (ticket 81-147 exact). Le ticket source omettait `DEV_SERVER_PORTS` (lignes 68-71) qui DOIT être déplacé avec cleanupWorkspacePorts — ajouté au fix. Fichier confirmé à 604 lignes (`wc -l`). CORRECTION/PRÉCISION par rapport au seed : (a) cleanupWorkspacePorts dépend de `appendProgressLog` (./progress) — le nouveau module doit l'importer, point non mentionné dans le seed. (b) loadConfig/readJson ne sont importés par AUCUN autre module (agents reçoivent config en paramètre et lisent leurs prompts eux-mêmes) ; seuls index.ts (main) et le test (sprintPassed) importent d'orchestrator.ts — l'extraction est donc sûre. (c) vitest n'inclut que tests/** donc un nouveau test workspace-ports y sera pris. (d) moduleResolution Bundler → imports extensionless cohérents. Ce ticket est `behavior_change=false` et `fidelity_tension=false` : déplacement mécanique pur. Sans rapport avec le scoring/Option A.

</details>

### DX-35 — Extraire les noms d'artefacts JSON et la convention sprint 0=final dans un module partagé (artifactNames.ts)

**Thème** Architecture/Modules · **Sévérité** 🟠 moyenne · **Effort** M · **Fidélité V1** oui · **Change le comportement** non · **Dépend de** —

**Problème.** Les noms des fichiers d'artefacts inter-agents (sprint_contract_N.json, contract_review_N.json, qa_report_N.json, qa_report_final.json) sont des littéraux template dupliqués à travers TROIS surfaces sans source unique :

1. Le LECTEUR (orchestrateur), qui fait readJson()/existsSync() sur ces noms pour récupérer les sorties d'agents.
2. L'ÉCRIVAIN INDIRECT (user-prompts inline en anglais dans builder.ts/evaluator.ts), qui dit à l'agent d'écrire un fichier portant ce nom exact.
3. La PROSE FR (prompts/*.md), qui décrit la même convention en langage naturel (avec le placeholder « N » non substitué).

La convention sprintNum===0 => qa_report_final.json est codée en dur à deux endroits : en TypeScript (evaluator.ts:139-140) et en prose (evaluator_prompt.md:118-126, notamment ligne 125). Comme l'écrivain (l'agent, piloté par le prompt) et le lecteur (l'orchestrateur, code TS) ne partagent aucune constante, tout désalignement — un nom modifié d'un seul côté, ou un agent qui suit la prose FR plutôt que le user-prompt anglais — fait que readJson() renvoie null et déclenche un avertissement générique peu diagnostique (« Builder did not produce a contract file », « Evaluator did not produce QA report », « did not produce a review file »). La cause racine (un fichier écrit sous un nom légèrement différent) reste invisible.

Fix : créer src/artifactNames.ts exposant des helpers purs — contractFile(n), reviewFile(n), qaReportFile(n) (avec la règle n===0 => qa_report_final.json intégrée) — importés par orchestrator.ts ET par builder.ts/evaluator.ts, ces derniers les utilisant pour interpoler les user-prompts inline. Le module devient la source unique du LECTEUR et de l'ÉCRIVAIN. behavior_change=false : les noms produits restent strictement identiques.

**Preuves.**
- `src/orchestrator.ts:254` — LECTEUR : readJson(workspace, `sprint_contract_${sprintNum}.json`) — littéral template du contrat.
- `src/orchestrator.ts:279` — LECTEUR : readJson(workspace, `contract_review_${sprintNum}.json`) — littéral template de la review.
- `src/orchestrator.ts:383` — LECTEUR : readJson(workspace, `qa_report_${sprintNum}.json`) — littéral template du rapport QA de sprint.
- `src/orchestrator.ts:524` — LECTEUR : readJson(workspace, "qa_report_final.json") — littéral en dur du rapport final (branche sprint 0).
- `src/orchestrator.ts:586` — SITE NON FLAGGÉ dans le ticket source : fs.existsSync(path.join(workspace, "qa_report_final.json")) — second usage en dur du nom final pour sauter la phase 3 si déjà faite. À couvrir aussi.
- `src/agents/builder.ts:85` — ÉCRIVAIN (mode contrat) : le user-prompt dit `writing sprint_contract_${sprintNum}.json`.
- `src/agents/builder.ts:140` — ÉCRIVAIN (mode implémentation) : le user-prompt dit `Read sprint_contract_${sprintNum}.json`.
- `src/agents/builder.ts:55,106` — Docstrings TS répétant le même pattern (cosmétique, non load-bearing mais à garder cohérent).
- `src/agents/evaluator.ts:91` — ÉCRIVAIN/LECTEUR (mode review) : user-prompt `Read sprint_contract_${sprintNum}.json`.
- `src/agents/evaluator.ts:104` — ÉCRIVAIN (mode review) : user-prompt `Write contract_review_${sprintNum}.json` — site non listé dans le ticket source, à couvrir.
- `src/agents/evaluator.ts:139-140` — CONVENTION en dur (code) : const reportName = sprintNum === 0 ? "qa_report_final.json" : `qa_report_${sprintNum}.json`. C'est le coeur de la règle 0=final côté écrivain.
- `src/agents/evaluator.ts:159` — ÉCRIVAIN/LECTEUR (mode QA, scope sprint) : user-prompt `Test ... sprint_contract_${sprintNum}.json`.
- `prompts/builder_prompt.md:57` — PROSE FR : 'produis un fichier sprint_contract_N.json' (placeholder N non substitué).
- `prompts/builder_prompt.md:22,84` — PROSE FR : 'Lis le sprint_contract_N.json' (l.22) et 'Lis le contrat sprint_contract_N.json' (l.84) — répétitions du même pattern.
- `prompts/builder_prompt.md:42` — PROSE FR : glob 'git add qa_report_*.json contract_review_*.json' — forme glob du pattern, pas un nom de fichier substituable ; à laisser tel quel (n'est pas un nom unique).
- `prompts/evaluator_prompt.md:75` — PROSE FR : 'Produis qa_report_N.json' (heading de la structure de sortie). NOTE: le ticket source citait l.75 pour la convention 0=final — INEXACT. La l.75 est juste le pattern de sortie sprint.
- `prompts/evaluator_prompt.md:118-126` — PROSE FR : section 'Mode Évaluation Finale' où la convention 0=final vit réellement ; l.125 'Produis un qa_report_final.json'. C'est ICI (pas l.75) qu'est décrite la règle sprint 0 => final.
- `prompts/evaluator_prompt.md:15,23` — PROSE FR : 'valider un sprint_contract_N.json' (l.15) et 'Produis contract_review_N.json' (l.23) — patterns review/contrat en prose.
- `src/agents/evaluator.ts:54-63` — Pattern de substitution déjà éprouvé : le system prompt MD est concaténé (l.56) et les user-prompts interpolent déjà des valeurs de config (${minGlobal}/${minCriterion} à evaluator.ts:198). Le même mécanisme readFileSync + interpolation est réutilisable pour les noms d'artefacts dans les .md FR si on veut aussi substituer la prose.
- `src/tools.ts:22-28` — REQUIRED_KEYS mappe des NOMS DE SCHÉMA (product_spec, sprint_contract, qa_report, contract_review) — ce sont les clés logiques, pas les noms de fichiers versionnés. artifactNames.ts est complémentaire (fichier physique) et ne remplace pas ce mapping.
- `src/orchestrator.ts:181,566` — Les noms d'artefacts du planner ['product_spec.json','feature_list.json','init.sh'] sont eux aussi en dur (deux fois). Hors du seed initial mais candidats naturels à ajouter au même module pour cohérence.

**Impact DX.** Aujourd'hui, ajouter/renommer un artefact ou changer la convention 0=final exige d'éditer en parallèle l'orchestrateur, deux modules d'agents, et deux fichiers .md FR, sans aucun garde-fou : un oubli ne casse pas la compilation (ce sont des chaînes), se manifeste à l'exécution par un null + warning générique, et coûte un run complet pour être diagnostiqué. Centraliser donne une source unique, un point de modification unique, et permet de tester la cohérence lecteur/écrivain hors ligne. Réduit la classe de bugs « l'orchestrateur ne trouve pas le fichier que l'agent a écrit ».

**Correctif proposé.**
1. Créer src/artifactNames.ts avec des fonctions pures et typées : contractFile(n: number): string => `sprint_contract_${n}.json` ; reviewFile(n: number): string => `contract_review_${n}.json` ; qaReportFile(n: number): string => n === 0 ? 'qa_report_final.json' : `qa_report_${n}.json`. Ajouter une constante FINAL_SPRINT = 0 documentant la convention. Optionnel mais recommandé : ajouter PLANNER_ARTIFACTS = ['product_spec.json','feature_list.json','init.sh'] et SPEC_FILE/FEATURE_LIST_FILE pour couvrir orchestrator.ts:181,566.
2. orchestrator.ts (LECTEUR) : remplacer les 5 littéraux par les helpers — l.254 contractFile(sprintNum), l.279 reviewFile(sprintNum), l.383 qaReportFile(sprintNum), l.524 qaReportFile(0), l.586 qaReportFile(0). Importer depuis ./artifactNames.
3. evaluator.ts (ÉCRIVAIN/LECTEUR) : remplacer la ternaire l.139-140 par qaReportFile(sprintNum) ; interpoler les user-prompts via les helpers — l.91/l.159 contractFile(sprintNum), l.104 reviewFile(sprintNum), l.203 ${reportName} reste mais alimenté par qaReportFile. Importer depuis ../artifactNames.
4. builder.ts (ÉCRIVAIN) : interpoler les user-prompts via les helpers — l.85 et l.140 contractFile(sprintNum). Importer depuis ../artifactNames. Mettre à jour les docstrings l.55/106 par cohérence (non load-bearing).
5. Décision de portée prose FR : option minimale (RECOMMANDÉE, behavior_change=false strict) — laisser les .md FR tels quels car ils décrivent un PATTERN avec « N » (pas un nom concret) et ne sont pas paramétrés par sprint ; ils restent corrects. Option étendue : si on veut éliminer toute duplication, étendre le mécanisme d'interpolation déjà utilisé pour ${minGlobal}/${minCriterion} (readFileSync du .md + remplacement de tokens) à des placeholders de pattern, en répliquant côté builder qui partage grading_criteria.md — mais comme ces .md sont des system prompts statiques sans sprintNum disponible au chargement, l'interpolation y serait limitée à des tokens littéraux fixes ; à ne faire que si la prose diverge réellement.
6. Ajouter src/artifactNames.ts à l'export barrel si index.ts en a un, et écrire un test unitaire dédié (tests/artifactNames.test.ts) couvrant les trois helpers + la branche n===0.
7. pnpm typecheck && pnpm test pour valider.

**Critères d'acceptation.**
- [ ] pnpm typecheck est clean après refactor.
- [ ] Aucun littéral 'sprint_contract_${' / 'contract_review_${' / 'qa_report_${' ni 'qa_report_final.json' ne subsiste dans src/orchestrator.ts, src/agents/builder.ts, src/agents/evaluator.ts (hors src/artifactNames.ts) — vérifiable par grep.
- [ ] tests/artifactNames.test.ts existe et passe : assert contractFile(1)==='sprint_contract_1.json', reviewFile(2)==='contract_review_2.json', qaReportFile(3)==='qa_report_3.json', qaReportFile(0)==='qa_report_final.json'.
- [ ] Test de cohérence lecteur/écrivain : pour un sprintNum donné, le nom interpolé dans le user-prompt builder/evaluator == le nom lu par l'orchestrateur (même appel de helper) — un test échoue si les deux divergent.
- [ ] pnpm test (suite existante : orchestrator-scoring, progress, security, tools) reste verte.
- [ ] Diff git ne change aucun nom de fichier produit à l'exécution (behavior_change=false confirmé par revue du diff).

**Risques.**
- Tension de fidélité V1 : le port est explicitement 1:1 avec la V1 Python qui n'avait probablement pas ce module ; introduire artifactNames.ts est une amélioration de structure côté harnais (pas côté apps générées) — acceptable car behavior_change=false et noms identiques, mais à documenter comme écart assumé vs port strict.
- Si l'option étendue (substitution prose FR) est choisie : risque de désynchroniser la prose FR du comportement réel si les tokens sont mal nommés ; les system prompts .md n'ont pas sprintNum au chargement, donc la substitution y est intrinsèquement limitée — ne pas sur-ingénierer.
- Le glob builder_prompt.md:42 (qa_report_*.json contract_review_*.json) n'est PAS un nom unique substituable ; le laisser tel quel — le remplacer casserait la commande git add.
- Oubli du second site final orchestrator.ts:586 (existence-check) ou du writer evaluator.ts:104 : non flaggés dans le ticket source, facile à manquer ; couverts ici explicitement.
- Ne pas confondre artifactNames.ts (noms de fichiers physiques) avec REQUIRED_KEYS de tools.ts (noms de schémas logiques) — ce sont deux registres distincts ; ne pas fusionner.

<details><summary>Notes de vérification</summary>

Toutes les locations du ticket source ont été lues et vérifiées contre le code réel. Confirmé exact : orchestrator.ts:254/279/383/524 (lecteur), builder.ts:85 (écrivain), evaluator.ts:104 (writer review) et 139-143 (convention 0=final en code), builder_prompt.md:57 (prose). CORRECTIONS : (a) evaluator_prompt.md:75 NE contient PAS la convention 0=final — c'est le heading 'Produis qa_report_N.json' de la structure de sortie de sprint ; la convention sprint 0 => final vit en réalité dans la section 'Mode Évaluation Finale' aux lignes 118-126 (concrètement l.125). (b) Le ticket cite evaluator.ts:104 dans 'locations' mais c'est le writer de contract_review, pas une partie de la convention finale — clarifié. SITES SUPPLÉMENTAIRES non listés dans le seed et à couvrir : orchestrator.ts:586 (existsSync qa_report_final.json), evaluator.ts:91/159 (sprint_contract dans user-prompts), evaluator.ts:104 (contract_review writer), builder.ts:140 (sprint_contract en mode implémentation), plus les répétitions prose builder_prompt.md:22/84 et evaluator_prompt.md:15/23. Mécanisme d'interpolation : confirmé qu'evaluator.ts interpole DÉJÀ des valeurs config dans les user-prompts (${minGlobal}/${minCriterion}, ligne 198 = la table de scoring) — donc étendre ce pattern aux noms d'artefacts est trivial pour les user-prompts inline. En revanche, les .md FR sont des system prompts statiques sans sprintNum au chargement : la substitution y est intrinsèquement limitée (option étendue seulement). Tests harnais réels dans tests/ (orchestrator-scoring, progress, security, tools) ; les *.test.ts sous workspace/ sont des apps générées, à ignorer. Aucun module artifactNames préexistant (grep négatif). behavior_change=false confirmé : tous les helpers reproduisent exactement les chaînes actuelles.

</details>

### DX-34 — Éliminer la duplication de la liste 'fichiers requis du planner' et le commentaire répétant DEV_SERVER_PORTS

**Thème** Architecture/Modules · **Sévérité** 🟡 basse · **Effort** S · **Fidélité V1** non · **Change le comportement** non · **Dépend de** —

**Problème.** Deux micro-duplications de type "DRY" dans src/orchestrator.ts, sans garde-fou, qui dériveront silencieusement si l'une des copies est modifiée sans l'autre.

1. La liste des sorties attendues du Planner — ["product_spec.json", "feature_list.json", "init.sh"] — est écrite en dur DEUX fois, dans deux variables locales toutes deux nommées `requiredFiles` : une à la validation post-planning (phasePlanning, l.181) et une au skip-planning (main, l.566). Les deux blocs sont séparés de 385 lignes et DOIVENT rester strictement identiques pour que la logique soit cohérente : si la phase de planning produit un fichier de plus mais qu'on ne met à jour qu'une des deux listes, on aura soit une validation qui exige un fichier que le skip ne vérifie pas (faux "déjà fait"), soit l'inverse. Aucun test ni typage ne lie les deux copies.

2. La constante module `DEV_SERVER_PORTS = ["3000","3001","8000","8001"]` (l.71) est la seule source programmatique des ports (utilisée uniquement l.96 via `.join(",")` pour lsof). Mais le JSDoc de `cleanupWorkspacePorts` (l.74) ré-énumère ces mêmes ports en prose : « Tue tout dev-server écoutant sur :3000/:3001/:8000/:8001 ... ». Cette copie manuelle dans le commentaire dérivera de la constante si la liste de ports change.

Correctif (Option-A non concernée : ce ticket ne touche pas au scoring) : extraire une constante module partagée `PLANNER_OUTPUTS` réutilisée aux deux emplacements, et reformuler le JSDoc pour ne plus énumérer les ports en dur (référencer la constante par son nom au lieu de copier les valeurs). Quick win trivial, aucun changement de comportement.

**Preuves.**
- `src/orchestrator.ts:181` — 1ère copie : `const requiredFiles = ["product_spec.json", "feature_list.json", "init.sh"];` dans phasePlanning(), bouclée l.182-187 pour vérifier que le planner a bien produit chaque fichier (sinon return false).
- `src/orchestrator.ts:566` — 2nde copie IDENTIQUE : `const requiredFiles = ["product_spec.json", "feature_list.json", "init.sh"];` dans main(), utilisée l.567-569 via `requiredFiles.every((f) => fs.existsSync(...))` pour décider de SAUTER la phase planning. Même nom de variable, même littéral, 385 lignes plus loin, sans lien.
- `src/orchestrator.ts:71` — Source unique programmatique : `const DEV_SERVER_PORTS = ["3000", "3001", "8000", "8001"];` — utilisée UNIQUEMENT l.96 (`"-i:" + DEV_SERVER_PORTS.join(",")` pour lsof). Le commentaire l.68-70 explique pourquoi elle reste ici plutôt que dans config.yaml (invariant du harness).
- `src/orchestrator.ts:74` — JSDoc de cleanupWorkspacePorts : « Tue tout dev-server écoutant sur :3000/:3001/:8000/:8001 dont le cwd se trouve à l'intérieur de *workspace*. » — copie manuelle en prose des 4 valeurs de DEV_SERVER_PORTS, qui dérivera si la constante change.
- `tests/orchestrator-scoring.test.ts` — Confirme l'existence d'un répertoire `tests/` au niveau harnais (avec security/tools/progress/orchestrator-scoring.test.ts) : un test unitaire vérifiant l'égalité des références/usages de PLANNER_OUTPUTS est faisable et conforme au pattern existant.

**Impact DX.** Réduit le risque de bug silencieux le plus insidieux du flux d'orchestration : un désalignement entre la validation post-planning et la décision de skip-planning (faux "déjà fait" → sprints lancés sur un workspace incomplet, ou inversement planning relancé en boucle). Une constante unique rend l'intention explicite et auto-documentée (« voici LA liste des livrables du planner »), et la reformulation du JSDoc évite qu'un commentaire mente sur les ports réellement scannés. Gain de lisibilité immédiat pour quiconque modifie le contrat de sortie du planner.

**Correctif proposé.**
1. Déclarer une constante module en haut de src/orchestrator.ts (près de DEV_SERVER_PORTS, l.71, ou juste après les helpers readJson/loadConfig) : `const PLANNER_OUTPUTS = ["product_spec.json", "feature_list.json", "init.sh"] as const;` avec un court commentaire expliquant que c'est le contrat de sortie du Planner, partagé entre validation et skip.
2. Remplacer la déclaration locale l.181 dans phasePlanning() : supprimer `const requiredFiles = [...]` et faire boucler la validation sur PLANNER_OUTPUTS (`for (const fname of PLANNER_OUTPUTS) { ... }`).
3. Remplacer la déclaration locale l.566 dans main() : supprimer `const requiredFiles = [...]` et utiliser `PLANNER_OUTPUTS.every((f) => fs.existsSync(path.join(workspace, f)))` l.567-569.
4. Reformuler le JSDoc de cleanupWorkspacePorts (l.74) pour ne plus énumérer les ports en dur : remplacer « :3000/:3001/:8000/:8001 » par une formulation référençant la constante, p.ex. « Tue tout dev-server écoutant sur l'un des DEV_SERVER_PORTS dont le cwd se trouve à l'intérieur de *workspace*. » (idem ligne 593 si un commentaire ré-énumère des ports — vérifier ; à la lecture actuelle l.593 ne cite pas de ports, ne rien changer).
5. Lancer `pnpm typecheck` (doit rester clean ; `as const` ne casse rien car les littéraux sont consommés en lecture seule).
6. Optionnel mais recommandé (conforme au pattern tests/) : ajouter un test unitaire léger dans tests/ qui assert que PLANNER_OUTPUTS contient exactement les 3 fichiers attendus, fixant ainsi le contrat et garantissant qu'un changement futur est intentionnel.
7. Lancer `pnpm test` pour vérifier non-régression des modules pure-logic.

**Critères d'acceptation.**
- [ ] Le littéral ["product_spec.json", "feature_list.json", "init.sh"] n'apparaît plus qu'à UN seul endroit dans src/orchestrator.ts (la déclaration de PLANNER_OUTPUTS) — vérifiable par `grep -c 'feature_list.json' src/orchestrator.ts` excluant les usages legitimes (readJson l.434, messages d'erreur).
- [ ] phasePlanning (validation post-planning) et main (skip-planning) référencent tous deux la MÊME constante PLANNER_OUTPUTS — il devient impossible de désaligner les deux listes.
- [ ] Le JSDoc de cleanupWorkspacePorts ne contient plus la chaîne « :3000/:3001/:8000/:8001 » ; ajouter/retirer un port dans DEV_SERVER_PORTS ne crée plus d'incohérence avec le commentaire.
- [ ] `pnpm typecheck` passe sans erreur.
- [ ] `pnpm test` passe (aucune régression ; le nouveau test éventuel sur PLANNER_OUTPUTS est vert).
- [ ] Aucun changement de comportement runtime : un workspace complet est toujours skippé, un workspace incomplet relance toujours le planning (mêmes 3 fichiers exigés qu'avant).

**Risques.**
- Tension de fidélité V1 : NULLE en pratique. C'est un refactor de variable locale → constante module, le comportement observable (mêmes 3 fichiers, même logique de validation/skip) est identique au port et à la V1 Python. Aucun risque de divergence avec le contrat V1.
- Piège de portée : bien déclarer PLANNER_OUTPUTS au niveau module (pas dans une fonction) pour qu'elle soit visible à la fois par phasePlanning (l.~181) et main (l.~566).
- Faux positif de grep : `product_spec.json` et `feature_list.json` apparaissent aussi légitimement ailleurs (readJson l.434, messages console, et dans les prompts agents src/agents/*.ts qui sont des chaînes destinées aux agents — NE PAS y toucher, ce sont des prompts en anglais verbatim de V1). Ne factoriser QUE les deux littéraux d'orchestrator.ts l.181/566.
- Ne PAS déplacer DEV_SERVER_PORTS ni PLANNER_OUTPUTS vers config.yaml : le commentaire l.68-70 documente explicitement que ces ports sont un invariant du harness, pas un réglage par projet. Idem PLANNER_OUTPUTS est un contrat interne, pas une config utilisateur.
- Si on utilise `as const`, vérifier que les sites de consommation (for...of, .every) acceptent un readonly array — c'est le cas, mais le typecheck le confirmera.

<details><summary>Notes de vérification</summary>

Toutes les affirmations du ticket source sont VÉRIFIÉES exactes contre le code réel : (1) le littéral des sorties planner est bien dupliqué identiquement aux l.181 (validation, phasePlanning) et l.566 (skip, main) — écart réel de 385 lignes, les deux variables se nomment `requiredFiles`. (2) DEV_SERVER_PORTS est déclarée l.71, consommée programmatiquement UNIQUEMENT l.96, et ré-énumérée en prose dans le JSDoc l.74 (« :3000/:3001/:8000/:8001 »). Corrections/précisions vs le seed : le seed dit « écrit en dur 2 fois » pour les sorties planner — confirmé exactement 2 occurrences en littéral dans orchestrator.ts. Précision ajoutée : `product_spec.json`/`feature_list.json` apparaissent ailleurs (readJson l.434, prompts agents) mais ce ne sont PAS des duplications à factoriser. Ce ticket ne touche PAS au scoring → contrainte Option-A non applicable ici (noté pour le scoreur). Aucune dépendance perçue vers d'autres tickets. Infra de tests harnais confirmée présente (tests/security|tools|progress|orchestrator-scoring.test.ts), rendant l'AC du test optionnel réaliste.

</details>

### DX-33 — Exploiter les champs textOutput/resultText pour le diagnostic d'erreur, ou les marquer "exposés pour parité, non consommés"

**Thème** Architecture/Modules · **Sévérité** 🟡 basse · **Effort** S · **Fidélité V1** oui · **Change le comportement** non · **Dépend de** —

**Problème.** L'interface `AgentResult` (src/agents/client.ts:28-36) expose 7 champs, dont 3 ne sont JAMAIS lus par aucun consommateur : `textOutput`, `resultText`, `sessionId`. Ces 3 champs sont pourtant remplis dans les 3 chemins de retour de `runAgent()` (le catch ligne 101-109, le cas resultMsg===null ligne 115-123, et le retour nominal ligne 126-134). Les seuls champs effectivement consommés par les appelants sont `costUsd`, `durationMs`, `numTurns` et `isError` (l'orchestrateur les mappe vers les champs snake_case de `AgentRun` via `makeAgentRun`, et teste `isError`).

C'est du code mort de structure : il suggère faussement (a) qu'on capture et persiste la sortie texte de l'agent, et (b) qu'on peut reprendre/corréler une session via `sessionId`. Un mainteneur qui voudrait persister la sortie d'un agent croira à tort que le plumbing existe déjà, alors que la donnée est calculée puis jetée. C'est une fausse piste DX.

Le potentiel gâché est précis : sur un échec d'agent, l'orchestrateur ne logue que `console.error("Planner agent failed")` (orchestrator.ts:175-178) et abandonne l'objet `result` entier — donc le `textOutput` (texte assistant accumulé avant le crash/abort) ET le `resultText` sont perdus, alors qu'ils contiennent justement le contexte de diagnostic le plus utile en cas de crash/abort/timeout watchdog.

Note de fidélité : ces champs proviennent probablement d'une parité 1:1 avec la V1 Python (le harnais est un port fidèle qui préserve volontairement des limitations V1). Le choix doit donc trancher entre les retirer (s'écarter de la parité de surface mais nettoyer) et les documenter/exploiter (préserver la parité). L'option recommandée — exploiter `textOutput`/`resultText` pour enrichir `cli_debug.log` en cas d'erreur — préserve TOUTES les signatures (zéro changement d'interface, zéro changement de comportement nominal) tout en supprimant le caractère "mort" des champs.

**Preuves.**
- `src/agents/client.ts:28-36` — interface AgentResult { textOutput: string; costUsd; durationMs; numTurns; isError; sessionId: string; resultText: string | null }. 7 champs déclarés.
- `src/agents/client.ts:101-109` — chemin catch (abort/crash) : remplit textOutput=textParts.join, sessionId='' , resultText=null. costUsd=0 confirmé (limitation V1 connue).
- `src/agents/client.ts:114-124` — chemin resultMsg===null : même remplissage, isError=true, costUsd=0.
- `src/agents/client.ts:126-134` — retour nominal : textOutput=textParts.join, sessionId=resultMsg.session_id, resultText = resultMsg.subtype==='success' ? resultMsg.result : null. Le ternaire est correct : le type SDKResultError (sdk.d.ts:3457-3475) n'a PAS de champ result, seulement errors: string[].
- `grep src/ tests/` — textOutput / resultText / sessionId n'apparaissent QUE dans src/agents/client.ts. Aucune occurrence dans orchestrator.ts, planner.ts, builder.ts, evaluator.ts, ni dans les 4 fichiers de tests.
- `src/orchestrator.ts:168-171 (et 247-250, 270-273, 356-359, 374-377, 517-520)` — tous les sites de consommation ne lisent que result.costUsd / durationMs / numTurns / isError via makeAgentRun. Confirme que les 3 champs sont morts côté consommateurs.
- `src/orchestrator.ts:175-178` — sur échec planner : console.error('Planner agent failed'); return false; — l'objet result (donc textOutput/resultText) est abandonné sans être logué. Diagnostic perdu.
- `src/agents/client.ts:48-62` — cli_debug.log existe déjà : ouvert via join(cwd,'cli_debug.log'), reçoit un en-tête horodaté (l.49-53) puis la stderr du CLI (l.61-63). Cible naturelle pour y écrire aussi textOutput/resultText.

**Impact DX.** Réduit la confusion : un champ rempli mais jamais lu fait croire qu'une capacité (persistance de sortie, reprise de session) existe alors qu'elle est inerte. En exploitant textOutput/resultText dans cli_debug.log en cas d'erreur, on transforme un coût de maintenance (code mort) en gain de diagnostic : après un crash/abort/timeout, le débogueur trouve dans cli_debug.log non seulement la stderr du CLI mais aussi le dernier texte produit par l'agent — synergie directe avec l'amélioration du diagnostic (DX-14). Aucun impact sur le comportement nominal ni sur la facturation.

**Correctif proposé.**
1. DÉCISION : retenir l'option 'exploiter' (préserve la parité V1 ET supprime le code mort), plutôt que 'retirer'. Si le mainteneur préfère retirer, voir variante en fin.
2. Dans src/agents/client.ts, extraire un helper local `flushDiagnostic(textOutput: string, resultText: string | null)` qui, si textOutput non vide OU resultText non null, fait appendFileSync(debugLogPath, '\n----- agent output (diagnostic) -----\n' + (resultText ?? textOutput) + '\n'). debugLogPath est déjà en scope (l.48).
3. Appeler ce helper dans les DEUX chemins d'erreur uniquement (catch l.101-109 et resultMsg===null l.114-124), AVANT le return, pour ne pas polluer cli_debug.log lors des runs nominaux réussis. Ne PAS l'appeler dans le retour nominal l.126-134 (sinon le log grossit à chaque sprint réussi).
4. Conserver les 3 champs dans AgentResult inchangés (signature stable) — ils restent disponibles pour un futur consommateur, mais ne sont plus 'morts' puisque textOutput/resultText sont désormais consommés à la source.
5. Pour sessionId qui reste non consommé : ajouter un commentaire JSDoc sur la ligne 34 : '/** Exposé pour parité V1 ; pas encore consommé (corrélation de session future). */'.
6. pnpm typecheck doit rester clean (aucun changement de type).
7. pnpm test doit rester vert (les chemins d'erreur ne sont pas couverts par les tests SDK ; vérifier qu'aucun test n'asserte le contenu exact de cli_debug.log).
8. VARIANTE 'retirer' (si choisie) : supprimer textOutput, resultText, sessionId de l'interface (l.29,34,35) et des 3 returns ; supprimer l'accumulation textParts (l.78,83-91) devenue inutile. Plus invasif, s'écarte de la parité de surface V1, et perd la possibilité du diagnostic — non recommandé.

**Critères d'acceptation.**
- [ ] pnpm typecheck est clean après modification
- [ ] pnpm test reste vert
- [ ] Après un échec/abort simulé d'un agent, cli_debug.log contient une section '----- agent output (diagnostic) -----' avec le texte de l'agent (resultText si présent, sinon textOutput accumulé)
- [ ] Un run d'agent NOMINAL réussi n'ajoute PAS de section diagnostic dans cli_debug.log (vérifie qu'on ne flush que sur erreur)
- [ ] grep des 3 champs montre que textOutput et resultText sont désormais lus dans src/agents/client.ts (plus seulement écrits) ; sessionId porte un commentaire de parité explicite
- [ ] La signature de l'interface AgentResult est inchangée (aucun appelant cassé)

**Risques.**
- Tension de fidélité V1 : ces champs viennent vraisemblablement du port fidèle. Exploiter (vs retirer) minimise cette tension car aucune signature ne change ; mais écrire dans cli_debug.log AU-DELÀ de la stderr du CLI est un comportement observable nouveau dans ce fichier — à valider comme acceptable (le fichier est un log de debug, pas un artefact de protocole inter-agents, donc faible risque).
- Croissance du fichier cli_debug.log : limiter le flush aux seuls chemins d'erreur évite la croissance à chaque sprint. Ne pas flush dans le retour nominal.
- textOutput peut être volumineux (concat de tous les blocs assistant). En cas d'erreur c'est acceptable et utile, mais éviter de l'écrire sur le happy path.
- Si un test futur asserte le contenu exact de cli_debug.log, il devra tenir compte de la nouvelle section ; aujourd'hui aucun test ne le fait.
- Ne PAS confondre avec un changement de protocole : ne rien écrire dans les JSON inter-agents (product_spec.json, qa_report, etc.) — uniquement cli_debug.log.

<details><summary>Notes de vérification</summary>

Audit source confirmé sur tous les points principaux, avec deux précisions/corrections : (1) Le ticket source listait les locations src/agents/client.ts:28-36 et 126-134 ; j'ai vérifié et ÉTENDU : les champs sont remplis dans TROIS chemins de retour (101-109, 114-124, 126-134), pas seulement deux — le chemin 'catch' a été ajouté. (2) Affirmation 'aucun appelant ne les lit' CONFIRMÉE par grep exhaustif : textOutput/resultText/sessionId n'apparaissent que dans client.ts ; orchestrator.ts ne consomme que costUsd/durationMs/numTurns/isError (l.168-171, 247-250, 270-273, 356-359, 374-377, 517-520). (3) La remarque du ticket sur resultText a été validée contre le SDK : SDKResultError (sdk.d.ts:3457-3475) ne possède pas de champ `result`, donc le ternaire l.133 (subtype==='success' ? resultMsg.result : null) est correct et nécessaire — pas un bug. (4) cli_debug.log existe déjà et reçoit en-tête + stderr (l.48-63), confirmant que la cible de la synergie DX-14 est viable sans nouveau plumbing. (5) Sur échec, orchestrator.ts:175-178 jette bien l'objet result sans logger textOutput/resultText — la perte de diagnostic est réelle. Ce ticket n'est PAS lié au scoring : l'Option A ne s'applique pas ici.

</details>

---

## Thème — Prompts

_Coherence et parametrage des prompts. DX-06 : drift breakpoints responsive (grading_criteria 3 viewports avec tablette 768px vs evaluator_prompt + table inline 2 viewports) — consignes Playwright contradictoires. DX-28 : injecter max_sprints dans le prompt planner et aligner la plage ('8 a 30' vs config max_sprints=20). DX-27 : unifier le protocole de debut de sprint builder (system FR vs user EN inline desynchronises). DX-36 : reformuler les categories de features en 'suggerees' (faux enum non enforce)._

### DX-06 — Aligner les breakpoints responsive (drift 768px tablette : grading_criteria 3 viewports vs evaluator_prompt + table inline evaluator.ts 2) — consignes Playwright contradictoires

**Thème** Prompts · **Sévérité** 🟠 moyenne · **Effort** S · **Fidélité V1** oui · **Change le comportement** oui · **Dépend de** —

**Problème.** Trois sources qui atteignent l'agent dans un seul et même contexte donnent des jeux de breakpoints responsive contradictoires.

- prompts/grading_criteria.md:42 (critère "Qualité du design", section Vérifications) demande de tester 3 viewports : "mobile 375px, tablet 768px, desktop 1280px".
- prompts/evaluator_prompt.md:45 (Mode 2 / a) Tests navigateur Playwright) ne demande que 2 viewports : "viewport mobile 375px + desktop 1280px".
- src/agents/evaluator.ts:174 (table inline du user-prompt QA, section "Browser Tests (Playwright)") ne demande aussi que 2 viewports : "375px mobile, 1280px desktop".

L'evaluator construit son system prompt en concaténant evaluator_prompt.md + grading_criteria.md (evaluator.ts:56 : `systemPrompt + "\n\n---\n\n" + grading`). L'agent reçoit donc, dans le même contexte, deux consignes incohérentes : le system prompt lui dit à la fois "teste 375/1280" (depuis evaluator_prompt.md) et "vérifie 375/768/1280" (depuis grading_criteria.md), puis le user-prompt (evaluator.ts:164-209) renforce la version 2-viewports. L'agent doit arbitrer seul, ce qui rend le test responsive non déterministe : tantôt le tablet 768px est testé, tantôt non, et la cohérence du scoring "design" (qui pèse 25%) en dépend.

Le même fichier grading_criteria.md est aussi concaténé au system prompt du builder (builder.ts:37, même mécanisme `systemPrompt + "\n\n---\n\n" + grading`). Le builder reçoit donc "tablet 768px" comme cible de qualité responsive, alors que l'evaluator (côté prompt opératoire Playwright) ne testera explicitement que 375 et 1280 : le builder est noté sur un breakpoint que la consigne de test ne couvre pas systématiquement. C'est une incohérence builder/evaluator, pas seulement intra-evaluator.

Note de cadrage : ce n'est PAS un ticket de scoring au sens de l'Option A (qui concerne poids + seuils min_score_*). Les viewports sont des chaînes en dur dans les prompts ; il n'existe aujourd'hui aucun champ config.yaml pour eux. Le correctif primaire est donc une simple harmonisation des trois sources sur un jeu unique de breakpoints.

**Preuves.**
- `prompts/grading_criteria.md:42` — Section '2. Qualité du design (25%)' > Vérifications : '- Le layout est-il responsive (mobile 375px, tablet 768px, desktop 1280px) ?' — 3 viewports, inclut tablet 768px.
- `prompts/evaluator_prompt.md:45` — Mode 2 > 'a) Tests navigateur (Playwright MCP)' : '- Vérifie la responsivité (viewport mobile 375px + desktop 1280px)' — 2 viewports, pas de 768px.
- `src/agents/evaluator.ts:174` — User-prompt QA, section '### a) Browser Tests (Playwright)' : '- Test responsive viewports (375px mobile, 1280px desktop)' — 2 viewports, pas de 768px.
- `src/agents/evaluator.ts:56` — systemPrompt: systemPrompt + "\n\n---\n\n" + grading — evaluator_prompt.md (2 viewports) et grading_criteria.md (3 viewports) arrivent ensemble dans le system prompt de l'evaluator, d'où la contradiction intra-contexte.
- `src/agents/builder.ts:37` — systemPrompt: systemPrompt + "\n\n---\n\n" + grading — grading_criteria.md (donc 'tablet 768px') est aussi concaténé au system prompt du builder ; le builder est jugé sur un breakpoint que la consigne de test n'exige pas explicitement.
- `config.yaml:59-65` — Bloc qa: contient min_score_global, min_score_per_criterion, tools.{playwright,unit_tests,curl}. Aucun champ pour les viewports/breakpoints — ils sont uniquement en dur dans les prompts.

**Impact DX.** QA responsive non déterministe : selon l'arbitrage de l'agent entre les deux consignes, le viewport tablette 768px est testé ou pas, ce qui fait varier la note "design" (25% du score pondéré) d'une run à l'autre pour un même code. Cette variance dégrade la reproductibilité des verdicts PASS/FAIL et brouille le signal renvoyé au builder en boucle de retry. Côté builder, l'objectif de qualité affiché (3 breakpoints) ne correspond pas à la vérification opérationnelle (2 breakpoints), ce qui peut produire un feedback QA injuste ("design 7/10 car layout cassé à 768px" alors que 768px n'était pas une cible de test annoncée) ou au contraire un angle mort (le builder soigne 768px sans jamais être validé dessus). Pour le mainteneur du harnais, c'est une dette de cohérence à faible coût mais à fort effet de surprise lors du debug d'un scoring instable.

**Correctif proposé.**
1. Choisir le jeu canonique de breakpoints. Recommandation : retenir les 3 viewports (375 mobile / 768 tablette / 1280 desktop) car (a) tablet est un cas réel fréquemment cassé, (b) c'est l'option qui élargit la couverture plutôt que de la réduire, (c) elle aligne sur la formulation la plus complète déjà présente. Si le mainteneur préfère minimiser le coût/temps de QA, retenir 375/1280 — mais alors aligner grading_criteria.md vers le bas. Trancher AVANT d'éditer.
2. Éditer src/agents/evaluator.ts:174 pour refléter le jeu canonique. Si 3 viewports retenus : '- Test responsive viewports (375px mobile, 768px tablet, 1280px desktop)'.
3. Éditer prompts/evaluator_prompt.md:45 pour le même jeu : '- Vérifie la responsivité (viewport mobile 375px, tablette 768px, desktop 1280px)'.
4. Aligner prompts/grading_criteria.md:42 sur exactement la même liste (si on garde 3, ne rien changer ; si on choisit 2, retirer 'tablet 768px').
5. Vérifier qu'aucune autre source ne mentionne de viewport : grep -rniE '375|768|1280|viewport|breakpoint' prompts/ src/ a été lancé — seules ces 3 lignes contiennent des valeurs ; confirmer après édition qu'elles sont identiques.
6. (Optionnel, NON requis par l'Option A) Si l'on veut éviter ce type de drift à l'avenir, centraliser les breakpoints dans config.yaml sous qa.viewports (ex: qa.viewports: ['375px mobile','768px tablet','1280px desktop']) puis injecter cette liste par interpolation dans le user-prompt de evaluator.ts (déjà templaté via ${...}) ET, pour les .md, étendre le même mécanisme de substitution de placeholders que celui prévu pour poids/seuils. Cette centralisation est cohérente avec l'esprit Option A mais en dehors de son périmètre strict (poids+seuils) : la traiter comme amélioration facultative greffée sur l'infra de substitution introduite par le ticket scoring, pas comme prérequis de cette correction d'alignement.
7. pnpm typecheck puis pnpm test pour s'assurer qu'aucune assertion existante ne dépend des chaînes modifiées.

**Critères d'acceptation.**
- [ ] Les trois sources (grading_criteria.md:42, evaluator_prompt.md:45, evaluator.ts:174) listent exactement le même ensemble de breakpoints, avec les mêmes valeurs px.
- [ ] grep -rniE '375|768|1280' prompts/ src/agents/ ne renvoie aucune occurrence où le jeu de viewports diffère entre fichiers.
- [ ] Le system prompt assemblé de l'evaluator (evaluator_prompt.md + grading_criteria.md) ne contient plus deux listes de viewports divergentes.
- [ ] Le system prompt assemblé du builder (builder_prompt.md + grading_criteria.md) annonce le même jeu de breakpoints que celui réellement testé côté evaluator.
- [ ] pnpm typecheck est clean.
- [ ] pnpm test passe (aucune régression sur les tests pure-logic existants).

**Risques.**
- Tension de fidélité V1 : le harnais est un port 1:1 revendiqué et préserve volontairement les limitations V1. Si la V1 Python présente le MÊME drift de viewport dans ses prompts/grading_criteria, le 'corriger' diverge de la V1. Vérifier legacy-python/ (prompts partagés selon CLAUDE.md : 'config.yaml et prompts/ sont partagés, inchangés depuis V1' — donc le drift préexiste à l'identique en V1). Décider explicitement : soit on assume une amélioration post-port documentée, soit on laisse tel quel. C'est ce qui rend fidelity_tension=true.
- behavior_change=true : ajouter ou retirer un viewport modifie le comportement de test de l'evaluator et peut faire basculer des notes 'design', donc des verdicts PASS/FAIL. À communiquer comme changement intentionnel, pas comme refactor neutre.
- Edition de chaînes en dur dans evaluator.ts : si un test unitaire (vitest) assert sur le contenu exact du prompt, il cassera — d'où le pnpm test dans les critères.
- Si on retient 3 viewports, légère hausse du temps/coût de QA (un screenshot/redimensionnement supplémentaire par run Playwright) ; négligeable mais réel sur des runs longs.
- L'option de centralisation config.yaml (étape optionnelle) ne doit PAS être confondue avec l'Option A scoring : l'introduire ici prématurément créerait un couplage avec le ticket scoring et brouillerait le périmètre. La garder hors du correctif minimal sauf décision contraire du mainteneur.

<details><summary>Notes de vérification</summary>

Les 3 locations de la seed sont EXACTES et confirmées par lecture directe : grading_criteria.md:42 = 3 viewports (375/768/1280), evaluator_prompt.md:45 = 2 viewports (375/1280), evaluator.ts:174 = 2 viewports (375/1280). Le mécanisme de concaténation est confirmé : evaluator.ts:56 (systemPrompt + grading) ET builder.ts:37 (même pattern) — donc le drift impacte AUSSI le builder, point que la seed ne mentionnait pas et que j'ajoute (grading_criteria est partagé builder+evaluator). Un grep exhaustif (375|768|1280|viewport|responsive|tablet|mobile|desktop|breakpoint) sur prompts/, src/ et config.yaml ne révèle AUCUNE autre source de viewports : seules ces 3 lignes portent des valeurs, plus grading_criteria.md:33 qui dit juste 'responsive' sans chiffres (non concerné). config.yaml n'a AUCUN champ viewport (bloc qa = min_score_global/min_score_per_criterion/tools uniquement) : ce ticket n'est donc pas un ticket scoring Option A, mais une correction d'alignement de prompts ; j'ai requalifié le titre/problem en conséquence et explicité que la centralisation config est facultative et hors périmètre Option A. Le scoring_deep_dive.inconsistencies confirme le finding ('VIEWPORTS : ... l'agent reçoit des consignes incoherentes selon la section') et critic.additional_findings le porte avec exactement ces 3 locations — corroboration totale. depends_on vidé : aucun prérequis (la correction d'alignement est autonome ; seule l'étape optionnelle de centralisation s'appuierait sur l'infra du ticket scoring, mais elle n'est pas requise).

</details>

### DX-28 — Injecter max_sprints dans le prompt planner et aligner la plage de sprints (prompt "8 à 30" vs config max_sprints=20)

**Thème** Prompts · **Sévérité** 🟠 moyenne · **Effort** S · **Fidélité V1** oui · **Change le comportement** oui · **Dépend de** —

**Problème.** Il existe une incohérence entre la consigne donnée au Planner et la borne appliquée par l'orchestrateur, et la borne config n'est jamais transmise à l'agent.

1) Le system prompt du Planner (prompts/planner_prompt.md:101) demande explicitement "Vise **8 à 30 sprints** avec **2 à 5 features par sprint**". L'agent peut donc légitimement produire jusqu'à 30 sprints.

2) config.yaml:18 fixe orchestration.max_sprints: 20. Cette borne est lue dans phaseSprints (src/orchestrator.ts:441) puis appliquée par sprints.slice(0, maxSprints) (src/orchestrator.ts:456). Tout sprint au-delà du 20e est donc silencieusement ignoré : la boucle ne l'itère jamais, ses features restent passes:false dans feature_list.json, et AUCUN warning n'est émis. Le slice tronque sans trace.

3) Le user-prompt construit par runPlanner (src/agents/planner.ts:58-78) injecte le workspace et la stack, mais JAMAIS config.orchestration.max_sprints. La borne config n'atteint donc jamais l'agent, qui n'a aucun moyen de connaître la vraie limite et se fie au "8 à 30" en dur du .md.

Résultat : si le Planner suit sa consigne et génère 25-30 sprints, 5-10 sprints (et toutes leurs features) sont abandonnés silencieusement. Le nombre "8 à 30" du prompt est en dur et désynchronisé de la SSOT config.yaml.

**Preuves.**
- `prompts/planner_prompt.md:101` — Ligne unique mentionnant un nombre de sprints : '- Vise **8 à 30 sprints** avec **2 à 5 features par sprint**.' Valeur en dur, désynchronisée de config.yaml. Vérifié par grep : c'est la seule occurrence d'un compte de sprints dans le prompt.
- `config.yaml:18` — orchestration.max_sprints: 20 — la borne réelle appliquée, plus basse que le maximum de 30 suggéré au planner.
- `src/orchestrator.ts:441` — const maxSprints = config.orchestration.max_sprints; lit la borne config dans phaseSprints.
- `src/orchestrator.ts:456` — for (const sprint of sprints.slice(0, maxSprints)) — tronque silencieusement la liste de sprints au-delà de max_sprints, sans warning ni log. Aucune comparaison spec.sprints.length > maxSprints n'existe.
- `src/agents/planner.ts:58-78` — fullPrompt (template literal) injecte workspace, frontend, backendOptions, database mais PAS config.orchestration.max_sprints. La borne config ne parvient jamais à l'agent.
- `src/agents/planner.ts:35-38` — systemPrompt = readFileSync(planner_prompt.md) utilisé tel quel : aucun .replace() ni interpolation ${} n'est appliqué au .md du planner (vérifié par grep, 0 occurrence de 'replace' ou '${' dans planner.ts). Le seul point d'interpolation existant est le user-prompt (template literal).
- `src/agents/evaluator.ts:198` — Mécanisme d'interpolation de référence : le user-prompt (template literal inline) utilise ${minGlobal}/${minCriterion}. NB : c'est le user-prompt qui est interpolé, pas le .md system prompt — le même choix (injecter dans le user-prompt) est le plus simple et fidèle pour ce ticket.

**Impact DX.** Quand le mainteneur ajuste max_sprints dans config.yaml (présenté comme SSOT), la valeur n'a aucun effet sur ce que l'agent vise : le prompt continue de réclamer "8 à 30". L'écart se manifeste par une perte de travail silencieuse (sprints tronqués, features jamais implémentées) sans aucun signal dans les logs ni dans progress.json, ce qui rend le diagnostic difficile : un utilisateur voit des features passes:false sans comprendre que c'est dû au slice. Source de confusion et de débogage inutile.

**Correctif proposé.**
1. config.yaml reste la SSOT : utiliser orchestration.max_sprints (=20) déjà présent. Pas de nouvelle clé nécessaire (le minimum '8' peut rester littéral dans le .md, ou être ajouté en clé optionnelle min_sprints si l'on veut paramétrer aussi le plancher — non requis).
2. Paramétrer le .md : remplacer dans prompts/planner_prompt.md:101 le '8 à 30 sprints' en dur par un placeholder, p.ex. '- Vise **8 à {{MAX_SPRINTS}} sprints** avec **2 à 5 features par sprint**.' (choisir une syntaxe de placeholder distincte du ${} JS pour éviter toute collision, ex: {{MAX_SPRINTS}}).
3. Dans src/agents/planner.ts:35-38, appliquer une substitution après readFileSync : const systemPrompt = readFileSync(...).replace(/\{\{MAX_SPRINTS\}\}/g, String(config.orchestration.max_sprints)); (le planner n'avait aucune substitution jusqu'ici — c'est l'introduction du même esprit que evaluator.ts mais appliqué au system prompt .md).
4. Renforcer en injectant aussi la borne dans le user-prompt (src/agents/planner.ts:58-78) sous la section Context ou Instructions, ex: '- Maximum sprints (hard cap, sprints beyond this are dropped): ${config.orchestration.max_sprints}'. Cela double la transmission (system + user) et explicite la conséquence à l'agent.
5. Filet de sécurité côté orchestrateur (src/orchestrator.ts, juste avant la boucle ~456) : si spec.sprints.length > maxSprints, émettre un console.warn explicite listant le nombre tronqué (ex: `Planner produced ${spec.sprints.length} sprints but max_sprints=${maxSprints}; ${spec.sprints.length - maxSprints} sprint(s) will be skipped and their features left passes:false`). Optionnel : l'écrire aussi via appendProgressLog pour laisser une trace persistante.
6. pnpm typecheck doit rester clean ; ajouter/étendre un test unitaire pure-logic vérifiant que la substitution {{MAX_SPRINTS}} produit bien la valeur config dans le system prompt assemblé (si le builder du prompt est extractible/testable ; sinon, test sur une petite fonction utilitaire de substitution extraite).

**Critères d'acceptation.**
- [ ] pnpm typecheck est clean après modification.
- [ ] prompts/planner_prompt.md ne contient plus le nombre '30' en dur pour les sprints ; il contient un placeholder substitué au chargement.
- [ ] Changer orchestration.max_sprints dans config.yaml propage la nouvelle valeur dans le system prompt ET le user-prompt effectivement reçus par l'agent planner (vérifiable par un test/assertion sur la string assemblée).
- [ ] Le user-prompt du planner contient explicitement la borne max_sprints issue de config.
- [ ] Quand spec.sprints.length > max_sprints, un console.warn (et idéalement une ligne claude-progress.txt) est émis indiquant combien de sprints sont tronqués — plus de troncature 100% silencieuse.
- [ ] pnpm test passe ; un test échoue si la substitution du placeholder ne reflète pas la valeur de config.

**Risques.**
- Fidélité V1 : modifier le contenu d'un prompt .md et introduire une substitution dans le planner s'écarte du port 1:1 ; behavior_change assumé, à confirmer avec le mainteneur.
- Le warning de troncature modifie la sortie console/log de runs existants ; bénin.
- slice(0,maxSprints) inchangé : des features restent passes:false ; le warning informe sans corriger la perte — décider du périmètre (aligner+alerter vs garantir zéro troncature).
- Collision de syntaxe placeholder : éviter ${} dans le .md, préférer {{ }} + .replace ciblé.
- Plancher '8' reste en dur si non paramétré.

<details><summary>Notes de vérification</summary>

Toutes les affirmations du ticket source ont été vérifiées et sont exactes. Confirmé : planner_prompt.md:101 = '8 à 30 sprints' (seule occurrence, via grep) ; config.yaml:18 = max_sprints: 20 ; orchestrator.ts:441 lit la borne, orchestrator.ts:456 = sprints.slice(0, maxSprints) sans aucun warning de troncature (aucune comparaison length>max ailleurs) ; planner.ts:58-78 n'injecte jamais max_sprints dans le user-prompt. Précision importante non explicite dans le seed : le planner N'applique AUCUNE substitution/interpolation sur son system prompt (planner.ts:35-38, grep 0 'replace'/'${'), contrairement à ce que 'même mécanisme que evaluator.ts:198' pourrait laisser croire — evaluator.ts:198 interpole un USER-prompt (template literal), pas un .md. Le builder (builder.ts:37) concatène grading_criteria.md verbatim sans substitution. Donc le fix introduit réellement un nouveau point de substitution sur le system prompt .md du planner (ou, plus simple/fidèle, injecte la borne dans le user-prompt template literal existant). Ce ticket n'est PAS un ticket scoring (Option A non applicable au sens poids/seuils), mais il partage l'esprit SSOT : config.yaml comme source unique, prompts paramétrés. depends_on vide : aucun prérequis identifié.

</details>

### DX-27 — Unifier le protocole de début de sprint du builder (system-prompt FR vs user-prompt EN inline, déjà désynchronisés)

**Thème** Prompts · **Sévérité** 🟡 basse · **Effort** S · **Fidélité V1** oui · **Change le comportement** oui · **Dépend de** —

**Problème.** Le "protocole de début de sprint" du builder est défini DEUX fois, dans deux langues, et les deux copies ont déjà divergé.

1. Source A (system prompt, FR) : `prompts/builder_prompt.md:14-25` — section "## Protocole de début de sprint" avec 8 étapes numérotées. Ce fichier est chargé comme system prompt par `loadBuilderOptions()` (builder.ts:25-28, 37).
2. Source B (user prompt inline, EN) : `src/agents/builder.ts:128-155` — section "## Sprint Protocol" / "Follow these steps IN ORDER:" avec 8 étapes numérotées + un bloc "## Implementation Rules". Injecté UNIQUEMENT en mode implémentation (`runBuilderImplement`), pas en mode négociation de contrat.

Le builder reçoit donc, en mode implémentation, les deux versions simultanément (system + user). Elles se contredisent déjà à l'étape 6 :
- FR (builder_prompt.md:23) : "Lance le serveur de dev via `init.sh` si nécessaire" → demande de DÉMARRER LE SERVEUR.
- EN (builder.ts:141) : "Check if `init.sh` needs to be run (e.g., first sprint)" → demande de LANCER LE SCAFFOLD init.sh.

Ce ne sont pas deux traductions d'une même intention : l'une parle de serveur de dev, l'autre de scaffold. Pire, les deux sont en pratique déjà obsolètes : l'orchestrateur exécute `init.sh` lui-même une seule fois pendant la phase de planning (`src/orchestrator.ts:189-205`), donc l'agent n'a normalement plus à le relancer. Au-delà de l'étape 6, le bloc "## Implementation Rules" inline (builder.ts:145-154) re-paraphrase les règles déjà présentes dans `builder_prompt.md:27-47` (une feature à la fois, tests, commits, ne pas modifier feature_list.json…), créant une seconde zone de duplication FR/EN sujette au même drift.

Fix (Option : source unique = system prompt FR) : garder le protocole détaillé uniquement dans `builder_prompt.md`, et remplacer la duplication inline EN par une simple référence ("Follow the sprint protocol defined in your system instructions"), en conservant dans l'inline uniquement le contexte spécifique à l'invocation (numéro de sprint, feedback QA, mode).

**Preuves.**
- `prompts/builder_prompt.md:14-25` — Section FR '## Protocole de début de sprint' : 8 étapes (pwd, lire claude-progress.txt, git log -20, lire feature_list.json, lire sprint_contract_N.json, 'Lance le serveur de dev via init.sh si nécessaire', vérifier les features existantes, commencer l'implémentation). C'est le system prompt du builder.
- `src/agents/builder.ts:25-28,37` — loadBuilderOptions() lit builder_prompt.md et le passe en systemPrompt (concaténé avec grading_criteria.md). Les deux modes builder (contract + implement) partagent ce system prompt.
- `src/agents/builder.ts:128-155` — Le prompt inline EN de runBuilderImplement re-déclare '## Sprint Protocol' (8 étapes, builder.ts:136-143) + '## Implementation Rules' (builder.ts:145-154), duplicant le contenu du system prompt FR.
- `src/agents/builder.ts:141 vs prompts/builder_prompt.md:23` — Divergence d'étape 6 confirmée : inline 'Check if init.sh needs to be run (e.g., first sprint)' vs FR 'Lance le serveur de dev via init.sh si nécessaire'. Sémantiques différentes (scaffold vs serveur de dev).
- `src/orchestrator.ts:189-205` — L'orchestrateur rend init.sh exécutable et l'exécute lui-même UNE fois en phase planning (avant la boucle de sprint), ce qui rend l'étape 6 (les deux versions) factuellement dépassée du point de vue agent.
- `src/agents/builder.ts:76-94` — Le prompt inline du mode contrat (runBuilderContract) ne redéfinit PAS le protocole de sprint : il liste juste les instructions de proposition de contrat. La duplication ne concerne donc que le mode implémentation.

**Impact DX.** Deux sources de vérité pour la même procédure → maintenance double et drift garanti (déjà constaté). Un mainteneur qui corrige le protocole dans builder_prompt.md (FR) ne voit pas qu'il faut aussi corriger builder.ts (EN), et inversement. L'agent reçoit des instructions contradictoires (serveur de dev vs scaffold), ce qui peut le pousser à relancer init.sh inutilement ou à démarrer un serveur de dev en doublon. Réduire à une source unique supprime la classe de bug "j'ai édité une copie sur deux" et clarifie quelle invocation porte quelle responsabilité.

**Correctif proposé.**
1. Décider de la source unique : le system prompt FR (prompts/builder_prompt.md) reste le détenteur canonique du protocole, conformément à la convention CLAUDE.md (prompts détaillés en FR dans prompts/, user-prompts inline en EN minimaux).
2. Dans prompts/builder_prompt.md:23, corriger l'étape 6 ambiguë/obsolète. init.sh étant exécuté par l'orchestrateur en planning, reformuler en une intention claire et non contradictoire, par ex. 'Si le serveur de dev n'est pas déjà lancé, démarre-le (init.sh a déjà scaffoldé le projet en phase planning)'. Choisir UNE sémantique et s'y tenir.
3. Dans src/agents/builder.ts (runBuilderImplement, lignes ~128-155), supprimer la section '## Sprint Protocol' (lignes 132-143) ET le bloc '## Implementation Rules' (145-154), et les remplacer par une référence courte : 'Follow the sprint start protocol and implementation rules defined in your system instructions.'
4. Conserver dans l'inline UNIQUEMENT le contexte propre à l'invocation : '## Mode: Sprint Implementation', 'Sprint number: ${sprintNum}', et le ${feedbackSection} (QA feedback). Ces éléments ne sont pas dupliqués ailleurs et doivent rester.
5. Vérifier que les références au numéro de sprint qui étaient dans les étapes inline (ex. 'sprint_contract_${sprintNum}.json', 'features for sprint ${sprintNum}') restent transmises : soit via la ligne 'Sprint number: ${sprintNum}' déjà présente, soit en ajoutant une phrase explicite '(use sprint number ${sprintNum} for contract/feature lookups)'. Le system prompt FR utilise 'sprint_contract_N.json' générique, donc le N concret doit venir de l'inline.
6. Lancer pnpm typecheck (template string toujours valide) et pnpm test (les tests unitaires ne couvrent pas le contenu des prompts, donc ils restent verts ; vérifier qu'aucun test n'asserte sur le texte inline).
7. Optionnel mais cohérent : faire de même pour tout autre bloc inline EN qui paraphrase le system prompt, mais le scope de CE ticket est le protocole de début de sprint + implementation rules du builder.

**Critères d'acceptation.**
- [ ] Le protocole de début de sprint et les implementation rules n'existent plus qu'à un seul endroit (prompts/builder_prompt.md) ; src/agents/builder.ts ne contient plus de liste d'étapes 1-8 ni de bloc de règles dupliqué, seulement une référence aux instructions système.
- [ ] L'étape 6 de prompts/builder_prompt.md n'est plus ambiguë/contradictoire vis-à-vis du comportement réel (init.sh exécuté par l'orchestrateur en planning).
- [ ] Le prompt inline de runBuilderImplement conserve : le mode, 'Sprint number: ${sprintNum}', le ${feedbackSection} QA, et au moins une mention explicite du numéro de sprint concret pour les lookups contract/feature.
- [ ] pnpm typecheck est clean.
- [ ] pnpm test passe (aucun test n'asserte sur le texte des étapes inline supprimées).
- [ ] Une lecture rapide montre que modifier le protocole dans builder_prompt.md suffit désormais à changer ce que reçoit le builder (plus de seconde copie à éditer).

**Risques.**
- Tension de fidélité V1 : le harnais est un port fidèle 1:1 du Python V1, qui contient probablement la même double-déclaration FR/EN. Dédupliquer s'écarte volontairement de V1 (d'où fidelity_tension=true). Vérifier dans legacy-python/ que la divergence existait déjà avant de la présenter comme une correction de port plutôt qu'une dérive TS, MAIS legacy-python/ est explicitement À IGNORER selon le contexte projet — donc assumer ce ticket comme une amélioration DX post-port, pas un alignement V1.
- Changement de comportement (behavior_change=true) : retirer la liste d'étapes EN du user-prompt et la remplacer par une référence modifie le prompt effectif envoyé à l'agent. Le LLM pourrait suivre moins littéralement les étapes si elles ne sont plus répétées en tête du user-prompt (les system prompts sont parfois moins 'saillants' qu'une consigne inline immédiate). À valider par un run réel avant de considérer le ticket fermé.
- Si on supprime trop agressivement l'inline, on peut perdre la transmission du ${sprintNum} concret (le system prompt parle de 'sprint_contract_N.json' générique). Bien garder une injection explicite du numéro de sprint.
- Risque de régression de langue : mélanger une référence EN ('Follow the protocol in your system instructions') pointant vers un contenu FR est acceptable (le builder est bilingue de fait) mais doit rester cohérent avec la convention CLAUDE.md ; ne pas traduire le system prompt FR par effet de bord.
- Ce ticket n'a pas de dépendance scoring, donc l'Option A (config.yaml SSOT) ne s'applique pas ici ; ne pas confondre avec les tickets scoring.

<details><summary>Notes de vérification</summary>

Toutes les affirmations du ticket source ont été vérifiées contre le code réel et sont exactes :
- prompts/builder_prompt.md:14-25 contient bien la section FR '## Protocole de début de sprint' à 8 étapes (le ticket disait 14-26 ; la section va précisément de la ligne 14 (titre) aux lignes 18-25 (étapes), ligne 26 est vide — location affinée à 14-25).
- src/agents/builder.ts:128-155 contient bien le prompt inline EN avec '## Sprint Protocol' (132-143) et '## Implementation Rules' (145-154) — location confirmée.
- Divergence d'étape 6 CONFIRMÉE textuellement : FR 'Lance le serveur de dev via init.sh si nécessaire' (l.23) vs EN 'Check if init.sh needs to be run (e.g., first sprint)' (l.141).
Précisions ajoutées par la lecture du code, non dans le ticket source : (a) la duplication ne concerne QUE le mode implémentation (runBuilderImplement) ; le mode contrat (runBuilderContract, builder.ts:76-94) ne redéclare pas le protocole. (b) La duplication va au-delà de l'étape 6 : le bloc '## Implementation Rules' inline (145-154) re-paraphrase builder_prompt.md:27-47. (c) init.sh est exécuté par l'orchestrateur lui-même en phase planning (orchestrator.ts:189-205), ce qui rend les DEUX versions de l'étape 6 factuellement obsolètes du point de vue agent — un argument supplémentaire pour réécrire proprement l'étape dans la source unique. Aucune affirmation du ticket source n'a dû être infirmée ; uniquement précisée/élargie.

</details>

### DX-36 — Reformuler le prompt sur les catégories de features en "suggérées" — faux enum non enforcé

**Thème** Prompts · **Sévérité** 🟡 basse · **Effort** S · **Fidélité V1** oui · **Change le comportement** non · **Dépend de** —

**Problème.** Le prompt du planificateur présente la liste des catégories de features comme un enum fermé alors qu'aucune validation runtime ni type ne l'enforce. `prompts/planner_prompt.md:77` écrit « Les catégories possibles : `setup`, `auth`, `layout`, `core`, `data`, `api`, `ui`, `ai`, `admin`, `settings`. » — formulation qui laisse croire à un ensemble contrôlé/autorisé. Or :
- `src/tools.ts:24` (REQUIRED_KEYS.feature_list_item) ne vérifie que la PRÉSENCE de la clé `category`, jamais sa valeur. Un agent peut écrire `"category": "marketing"` (hors liste) sans aucune erreur de validation.
- `src/types.ts:73` déclare `category: string` — type permissif, pas une union littérale.
- La valeur de `category` n'est consommée par AUCUNE logique du harnais (orchestrateur, progress, scoring) : c'est une métadonnée purement descriptive. Elle n'influence donc ni le contrôle de flux ni le scoring.

Résultat : fausse impression d'enum contrôlé. Deux corrections cohérentes sont possibles ; vu que la valeur n'a aucun effet fonctionnel et que la V1 Python a exactement le même comportement (cf. fidelity tension), l'option recommandée est de reformuler le prompt en « catégories suggérées » plutôt que d'introduire une validation stricte qui diverge de V1 et risque de faire échouer des plans valides sur une métadonnée cosmétique. Une alternative (union de types/zod + validation) est documentée mais non recommandée par défaut.

**Preuves.**
- `prompts/planner_prompt.md:77` — « Les catégories possibles : `setup`, `auth`, `layout`, `core`, `data`, `api`, `ui`, `ai`, `admin`, `settings`. » — formulation type enum fermé (10 catégories).
- `prompts/planner_prompt.md:68` — L'exemple JSON de feature_list.json montre `"category": "setup"`, renforçant l'idée d'un vocabulaire contraint.
- `src/tools.ts:24` — REQUIRED_KEYS.feature_list_item = ["id", "sprint", "category", "description", "passes"] — `category` n'est qu'une clé requise ; validateJson (tools.ts:62-88) ne fait qu'un check de présence par item, jamais de contrôle de valeur/enum.
- `src/types.ts:73` — `category: string;` dans l'interface FeatureListItem — pas de type union, aucune contrainte compile-time sur les valeurs.
- `src/tools.ts (grep)` — `category` n'apparaît nulle part ailleurs en src/ que tools.ts:24 et types.ts:73 ; jamais lue par orchestrator.ts ni progress.ts. Métadonnée descriptive sans effet fonctionnel.
- `tests/tools.test.ts:46-47` — Les fixtures de test utilisent `category: "ui"` et `category: "api"` (toutes deux dans la liste) ; une reformulation du prompt ne touche pas aux tests, et une éventuelle validation enum les laisserait passer.
- `legacy-python/tools.py:22` — REQUIRED_KEYS Python identique (présence uniquement). Confirme que toute validation enum constituerait une divergence de comportement vs V1.

**Impact DX.** Faible mais réel : un lecteur du code (ou un mainteneur) croit que la catégorie est un enum contrôlé alors qu'elle est libre. Toute personne s'appuyant sur cette liste pour filtrer/grouper en aval serait surprise de trouver des valeurs hors liste produites par l'agent. La reformulation clarifie l'intention (vocabulaire indicatif, non contraint) et élimine une dette de cohérence prompt↔code sans risque. Coût quasi nul.

**Correctif proposé.**
1. Option recommandée (alignée fidélité V1, behavior_change=false) — reformuler le prompt : remplacer prompts/planner_prompt.md:77 « Les catégories possibles : ... » par une formulation explicitement indicative, p.ex. « Catégories suggérées (vocabulaire indicatif, non exhaustif) : `setup`, `auth`, `layout`, `core`, `data`, `api`, `ui`, `ai`, `admin`, `settings`. Tu peux en proposer d'autres si pertinent. »
2. Vérifier que planner_prompt.md reste cohérent : l'exemple ligne 68 (`"category": "setup"`) demeure valide comme illustration ; aucune autre ligne à toucher.
3. Aucune modif de src/tools.ts, src/types.ts ni des tests nécessaire pour cette option (le contrat de présence de clé est inchangé).
4. Option alternative NON recommandée par défaut (si le mainteneur veut un vrai enum, behavior_change=true, divergence V1) : définir une union partagée `export type FeatureCategory = 'setup' | 'auth' | ... | 'settings'` dans src/types.ts:73, étendre validateJson dans src/tools.ts pour vérifier `category` ∈ enum dans la branche feature_list (autour de tools.ts:71-78), et ajouter un test échouant sur une catégorie hors-liste. À n'implémenter QUE sur décision explicite du mainteneur d'accepter la divergence de fidélité V1.

**Critères d'acceptation.**
- [ ] prompts/planner_prompt.md:77 ne présente plus la liste comme un ensemble fermé/autorisé : le mot « suggérées » (ou « indicatif/non exhaustif ») y figure.
- [ ] `pnpm typecheck` reste clean.
- [ ] `pnpm test` passe sans modification (aucun test ne dépend de la valeur de category au-delà de la présence de clé).
- [ ] Si l'option alternative (enum strict) est choisie au lieu de la reformulation : un nouveau test échoue lorsqu'un item feature_list a une category hors enum, et passe pour une category de la liste — ET le mainteneur a explicitement accepté la divergence V1.

**Risques.**
- Fidelity tension : introduire une validation enum (option alternative) ferait diverger le comportement du port du V1 Python (legacy-python/tools.py:22 ne valide pas la valeur), ce qui contredit la note de migration du CLAUDE.md (« préserve V1 incluant ses limitations »). La reformulation du prompt évite cette tension.
- Risque sur l'option alternative : un plan par ailleurs valide pourrait être rejeté à cause d'une métadonnée cosmétique (category), augmentant inutilement les échecs de planification.
- Risque résiduel quasi nul pour la reformulation : changer le wording d'un prompt FR ne casse aucun test ; vérifier juste que la phrase reste grammaticalement correcte et que l'exemple JSON reste cohérent.
- Les prompts sont partagés/inchangés depuis V1 (config.yaml + prompts/ « shared, unchanged from V1 » selon CLAUDE.md) : modifier planner_prompt.md introduit une première divergence prompt vs V1 ; rester sur une reformulation purement clarifiante (pas de changement sémantique de sortie attendue) minimise l'impact.

<details><summary>Notes de vérification</summary>

Toutes les locations du ticket source sont EXACTES et vérifiées : planner_prompt.md:77 (liste des catégories), tools.ts:24 (REQUIRED_KEYS.feature_list_item avec présence de 'category'), types.ts:73 (`category: string`). Corrections/précisions apportées : (1) `category` n'apparaît dans src/ QUE dans tools.ts:24 et types.ts:73 — elle n'est consommée par AUCUNE logique du harnais (grep dans orchestrator.ts/progress.ts négatif), donc behavior_change=false est correct et l'enforcement n'aurait aucun effet fonctionnel. (2) Confirmé que legacy-python/tools.py:22 a un REQUIRED_KEYS identique → l'option « validation enum » serait une divergence V1 réelle (fidelity_tension=true confirmé). (3) Les fixtures tests/tools.test.ts:46-47 utilisent des catégories de la liste, donc ni la reformulation ni une validation enum ne casseraient les tests existants. Ce ticket n'est PAS lié au scoring (poids/seuils) : l'Option A (config.yaml SSOT + placeholders) ne s'applique donc pas ici. Recommandation : privilégier la reformulation du prompt (pas de divergence V1) plutôt que l'enum strict.

</details>

---

## Thème — Configuration

_Faux interrupteurs et champs decoratifs. DX-29 : cabler ou retirer qa.tools.unit_tests/curl (flags morts). DX-30 : poser la posture des outils MCP harness (validate_json/update_progress jamais references dans les prompts). DX-31 : supprimer les fallbacks de stack hardcodes dans planner.ts (vestige 'fastapi') et clarifier stack.backend='auto' vs backend_options. DX-32 : documenter ou cabler project.name et stack.backend (jamais lus ; depend de DX-16)._

### DX-29 — Câbler ou retirer les flags QA morts (qa.tools.unit_tests, qa.tools.curl) — faux interrupteurs

**Thème** Configuration · **Sévérité** 🟠 moyenne · **Effort** S · **Fidélité V1** oui · **Change le comportement** non · **Dépend de** —

**Problème.** config.yaml expose un bloc `qa.tools` avec trois booléens (`playwright`, `unit_tests`, `curl`, lignes 62-65) et `src/types.ts` les type tous les trois (lignes 47-51). Mais un seul de ces flags est réellement consulté à l'exécution : `config.qa.tools.playwright` à `src/agents/evaluator.ts:44`, qui décide d'attacher (ou non) le serveur MCP Playwright et d'autoriser `mcp__playwright__*`. Les deux autres flags — `unit_tests` et `curl` — ne sont lus nulle part dans `src/` (vérifié par grep : seules occurrences = la déclaration de type dans types.ts et la lecture playwright dans evaluator.ts). Les passer à `false` n'enlève donc strictement rien.

Les instructions correspondantes (lancer `npm test`/`pytest`/`phpunit`, envoyer des requêtes `curl`) sont codées en dur à deux endroits indépendants du flag :
1. dans le prompt inline de l'évaluateur (`src/agents/evaluator.ts:177-181`, section « b) Programmatic Tests ») ;
2. dans les fichiers de prompt `.md` chargés en tête de system prompt : `prompts/evaluator_prompt.md:47-52` (« Tests programmatiques ») et `prompts/builder_prompt.md:49-53` (section « Auto-test », qui demande au builder de lancer les tests unitaires et de vérifier via `curl`).

Résultat : `unit_tests` et `curl` sont de faux interrupteurs. Ils donnent un faux sentiment de contrôle au mainteneur (on croit pouvoir désactiver ces phases de QA, alors qu'elles restent toujours instruites dans les prompts), et créent une asymétrie déroutante : `playwright` est réellement gaté côté évaluateur, mais ses deux voisins du même bloc ne le sont pas. C'est une tension de fidélité : le port reproduit fidèlement la V1, mais le bloc `qa.tools` ressemble à une surface de config active alors qu'elle est à 2/3 inerte.

**Preuves.**
- `config.yaml:62-65` — Bloc qa.tools déclare playwright: true, unit_tests: true, curl: true — trois booléens présentés sur un pied d'égalité.
- `src/types.ts:47-51` — L'interface Config type les trois flags (playwright/unit_tests/curl) comme boolean, suggérant qu'ils sont tous opérants.
- `src/agents/evaluator.ts:44` — Seul `config.qa.tools.playwright` est lu : `if (withPlaywright && config.qa.tools.playwright)` conditionne l'ajout du MCP Playwright et de l'autorisation mcp__playwright__*. Aucune lecture de unit_tests ni curl ailleurs (confirmé par grep -rn sur src/).
- `src/agents/evaluator.ts:177-181` — Section « b) Programmatic Tests » du prompt inline : instruit toujours `Run unit tests: npm test / pytest / phpunit` et `Send curl requests to API endpoints`, indépendamment des flags unit_tests/curl.
- `prompts/evaluator_prompt.md:47-52` — Section « b) Tests programmatiques » du system prompt évaluateur (chargé par readFileSync à evaluator.ts:29) : exécute les tests unitaires + envoie des requêtes curl, en dur.
- `prompts/builder_prompt.md:49-53` — Section « Auto-test » du system prompt builder (chargé par builder.ts:25) : demande npm test/pytest/phpunit et vérification via curl, en dur — donc curl/unit_tests sont aussi instruits côté builder, hors de tout flag.
- `src/orchestrator.ts:41-49` — loadConfig() parse config.yaml via `yaml.parse` sans validation ni transformation : les flags morts sont chargés tels quels, aucun avertissement.

**Impact DX.** Le mainteneur qui veut désactiver la QA programmatique (ex. projet sans backend HTTP, ou pour accélérer/réduire le coût d'une QA browser-only) édite `qa.tools.unit_tests: false` / `qa.tools.curl: false` et constate que rien ne change : l'évaluateur continue de lancer les tests et les curl. Perte de temps, perte de confiance dans le fichier de config. L'asymétrie avec `playwright` (qui, lui, marche) rend le piège d'autant plus insidieux : on déduit à tort que tout le bloc `qa.tools` est actif. Coût : moyen, car ça concerne le levier de réglage le plus visible (le bloc QA), faible effort à corriger.

**Correctif proposé.**
1. Décider entre les deux options ci-dessous ; recommandation par défaut = Option WIRE (rendre les flags load-bearing) car elle supprime l'asymétrie sans réduire le périmètre. L'option DOC reste acceptable si l'on veut zéro changement de comportement.
2. --- Option WIRE (recommandée) : rendre unit_tests et curl réellement opérants ---
3. Dans src/agents/evaluator.ts:loadEvaluatorOptions, conserver tel quel le gating playwright. Construire dynamiquement la section « b) Programmatic Tests » du prompt inline (lignes 177-181) : n'inclure la ligne `Run unit tests` que si config.qa.tools.unit_tests, et la/les lignes curl (`Send curl requests`, `Verify HTTP status codes`) que si config.qa.tools.curl. Réutiliser le même mécanisme d'interpolation déjà présent à evaluator.ts:198 (template string sur des valeurs de config) — ici en assemblant des fragments conditionnels avant le `runAgent`.
4. Pour les prompts .md (evaluator_prompt.md:47-52 et builder_prompt.md:49-53) qui sont chargés par readFileSync : remplacer les lignes unit-tests/curl en dur par des marqueurs/placeholders (ex. blocs délimités `<!-- if:unit_tests -->...<!-- endif -->` et `<!-- if:curl -->...<!-- endif -->`) puis appliquer une fonction de stripping/substitution au chargement, côté evaluator.ts:29 ET côté builder.ts:25 (le builder partage la logique de prompt et instruit lui aussi curl/unit_tests). Factoriser cette fonction d'interpolation dans un helper partagé pour éviter la divergence des deux call-sites.
5. Décider du statut du flag pour le builder : soit le builder respecte aussi unit_tests/curl (cohérent, recommandé), soit on documente explicitement que qa.tools ne gate que l'évaluateur. Tracer ce choix dans un commentaire config.yaml.
6. Ajouter un test unitaire (tests/, vitest) qui appelle la fonction de construction de prompt avec {unit_tests:false, curl:false} et asserte que les fragments correspondants sont absents ; et avec true qu'ils sont présents. Couvrir aussi le builder.
7. pnpm typecheck + pnpm test verts.
8. --- Option DOC (zéro changement de comportement, fidélité maximale) ---
9. Dans config.yaml, au-dessus du bloc qa.tools (lignes 62-65), ajouter un commentaire explicite : seul `playwright` est gaté (active/désactive le MCP Playwright dans l'évaluateur) ; `unit_tests` et `curl` sont informatifs/non câblés — les tests unitaires et curl sont toujours instruits via prompts/evaluator_prompt.md et prompts/builder_prompt.md.
10. Optionnel : marquer les champs en commentaire `# non câblé (V1)` pour signaler la dette.
11. Ne PAS retirer les flags ni le typage (retirer changerait la forme du fichier de config, tension de fidélité V1) — se contenter de documenter.
12. pnpm typecheck reste vert (aucun changement de code).

**Critères d'acceptation.**
- [ ] Option WIRE : passer qa.tools.unit_tests=false dans config.yaml fait disparaître l'instruction `Run unit tests`/`npm test` du prompt reçu par l'évaluateur (vérifiable par un test qui inspecte la string de prompt construite).
- [ ] Option WIRE : passer qa.tools.curl=false fait disparaître l'instruction d'envoi de requêtes curl du/des prompt(s) concerné(s).
- [ ] Option WIRE : un test vitest échoue si un flag est ignoré (assertion présence/absence de fragment selon le flag), couvrant évaluateur ET builder si le builder est gaté.
- [ ] Option DOC : config.yaml documente clairement que seul playwright est opérant ; aucun comportement runtime modifié.
- [ ] Dans les deux options : pnpm typecheck clean et pnpm test verts.
- [ ] Plus aucune asymétrie silencieuse : soit les trois flags sont opérants, soit le commentaire de config explicite lesquels le sont.

**Risques.**
- Tension de fidélité V1 : ce ticket déclare behavior_change=false, mais l'Option WIRE change effectivement le comportement quand un opérateur met un flag à false (jusqu'ici inerte). Comme la config par défaut laisse les trois flags à true, le comportement out-of-the-box reste identique à la V1 — l'écart n'apparaît que sur reconfiguration. Valider avec le mainteneur que rendre ces flags load-bearing est acceptable vis-à-vis de la politique « port fidèle ». Si non, prendre l'Option DOC.
- Option WIRE : si on gate côté builder, désactiver unit_tests/curl peut réduire la qualité auto-testée du builder (il ne lancera plus ses propres tests) — comportement attendu mais à documenter pour éviter une surprise.
- Refactor des prompts .md : le mécanisme de placeholder/stripping doit être robuste (ne pas casser le reste du prompt français). Tester que sans aucun flag modifié, le prompt rendu est identique à l'actuel (diff vide) pour garantir l'absence de régression silencieuse.
- Duplication de logique : la substitution de prompt existe déjà sous forme de simple template string (evaluator.ts:198) ; introduire un helper partagé entre evaluator.ts et builder.ts évite la dérive, mais touche deux modules — bien couvrir par tests.
- Option DOC : ne résout pas le faux sentiment de contrôle pour qui ne lit pas le commentaire ; c'est un palliatif, pas un fix.

<details><summary>Notes de vérification</summary>

Toutes les affirmations du ticket source vérifiées contre le code réel, avec corrections/précisions : (1) config.yaml:62-65 et types.ts:47-51 confirmés exacts. (2) evaluator.ts:44 confirmé : seul `config.qa.tools.playwright` est lu (grep -rn sur src/ ne trouve unit_tests/curl QUE dans types.ts:49 et la lecture playwright d'evaluator.ts:44 — donc unit_tests et curl sont bien morts côté code). (3) Le ticket source localisait les instructions en dur uniquement à evaluator.ts:177-181 ; vérification : elles sont présentes là (section « b) Programmatic Tests ») MAIS AUSSI dans deux prompts .md chargés par readFileSync — prompts/evaluator_prompt.md:47-52 et prompts/builder_prompt.md:49-53. Le builder instruit donc lui aussi unit_tests/curl, ce que le ticket source n'avait pas relevé : tout fix « câblage » doit couvrir le builder, pas seulement l'évaluateur. (4) Le mécanisme d'interpolation cité comme modèle existe bien : evaluator.ts utilise des template strings sur minGlobal/minCriterion (l'interpolation `${minGlobal}`/`${minCriterion}` se trouve à evaluator.ts:198, valeurs définies lignes 136-137). (5) Aucun config loader dédié : config parsé via yaml.parse dans orchestrator.ts:41-49 (loadConfig), sans validation — donc aucun garde-fou existant sur les flags. (6) Aucun test existant ne couvre qa.tools (seul tests/orchestrator-scoring.test.ts touche le scoring, via sprintPassed). Ce ticket relève de la dimension Configuration, pas Scoring : l'Option A (SSOT scoring) n'impose donc rien ici, mais sa technique de placeholders substitués au chargement des prompts est exactement le pattern réutilisable pour l'Option WIRE.

</details>

### DX-30 — Décider et documenter la posture des outils MCP harness (validate_json / update_progress) jamais référencés dans les prompts

**Thème** Configuration · **Sévérité** 🟠 moyenne · **Effort** S · **Fidélité V1** oui · **Change le comportement** non · **Dépend de** —

**Problème.** Le serveur MCP in-process `harness` (src/tools.ts:141-178) expose deux outils — `update_progress` (append horodaté dans claude-progress.txt) et `validate_json` (vérification required-keys d'un fichier JSON contre un schéma de REQUIRED_KEYS). Les deux sont déclarés dans les allowed_tools du builder (config.yaml:46-47) ET de l'evaluator (config.yaml:56-57). MAIS aucun prompt système ni aucun prompt utilisateur ne demande jamais aux agents de les appeler :

1. update_progress n'est jamais invoqué : les prompts demandent explicitement d'écrire claude-progress.txt À LA MAIN (builder_prompt.md:19,90,96-104 ; src/agents/builder.ts:152 « Update claude-progress.txt with a sprint summary »). L'outil MCP fait pourtant exactement ce travail.
2. validate_json n'est jamais invoqué : aucun prompt n'instruit de valider les JSON produits (product_spec, feature_list, sprint_contract, qa_report, contract_review) avant de les écrire. Vérifié : grep sur prompts/ et src/agents/ ne renvoie aucune occurrence des noms d'outils ; grading_criteria.md et planner_prompt.md n'y font aucune référence non plus.
3. La fonction pure validateJson() et la table REQUIRED_KEYS ne sont référencées NULLE PART en dehors de tools.ts (le seul autre hit est un commentaire dans types.ts:5). L'orchestrateur ne les appelle pas.

Conséquence DX : CLAUDE.md:71 présente « Validation schemas ... are defined in src/tools.ts:REQUIRED_KEYS (required-keys check, not zod — faithful to V1) » comme LE mécanisme de validation de l'architecture, alors qu'en pratique ce chemin est inactif — l'outil n'est offert qu'à la discrétion (jamais sollicitée) de l'agent. On maintient donc une connaissance dupliquée (les schémas required-keys de REQUIRED_KEYS recopient la structure des fichiers décrite dans les prompts et CLAUDE.md) pour un chemin de code que rien ne déclenche, ce qui induit en erreur sur l'architecture réelle de validation (il n'y a en fait AUCUNE validation automatique des JSON inter-agents).

Décision à prendre (ticket = trancher + appliquer), deux postures possibles :
- Posture A « rendre load-bearing » : instruire explicitement les agents d'appeler ces outils (update_progress au lieu d'éditer à la main ; valider chaque JSON via validate_json avant de le considérer comme produit). Comporte une tension de fidélité V1.
- Posture B « optionnel/best-effort assumé » : laisser le code tel quel mais documenter sans ambiguïté (CLAUDE.md + commentaire tools.ts) que ces outils sont disponibles mais best-effort, et que REQUIRED_KEYS n'est PAS un mécanisme de validation actif du pipeline.

Note de fidélité : la V1 Python exposait vraisemblablement ces mêmes outils sans les câbler dans les prompts (le port est « fidèle 1:1 » et préserve délibérément les limitations V1). La posture A modifie donc le comportement des agents vs V1 ; la posture B est la plus fidèle et la plus sûre. Ce ticket recommande par défaut la posture B (zéro changement de comportement, correctif purement documentaire), tout en laissant la décision au mainteneur.

**Preuves.**
- `src/tools.ts:141-178` — createHarnessTools() définit les deux outils MCP (update_progress lignes 142-158 ; validate_json lignes 160-171) et les enregistre via createSdkMcpServer (lignes 173-177). Câblé dans planner/builder/evaluator via mcpServers:{harness:...}.
- `src/tools.ts:22-28` — REQUIRED_KEYS : schémas required-keys pour product_spec, feature_list_item, sprint_contract, qa_report, contract_review. Consommés uniquement par validateJson() (même fichier).
- `config.yaml:46-47` — allowed_tools du builder incluent mcp__harness__update_progress et mcp__harness__validate_json.
- `config.yaml:56-57` — allowed_tools de l'evaluator incluent les deux mêmes outils MCP.
- `config.yaml:29-35` — allowed_tools du planner N'INCLUENT PAS les outils MCP (Read/Write/Edit/Glob/Grep/Bash seulement) — pourtant src/agents/planner.ts:48 câble quand même le serveur harness, donc tools disponibles mais hors allowlist côté planner. Correction vs ticket source qui ne listait pas ce détail.
- `prompts/builder_prompt.md:96-104` — Instruit d'écrire claude-progress.txt à la main (bloc markdown « ## Sprint N — ... »), sans mention de update_progress.
- `src/agents/builder.ts:152` — Le prompt utilisateur builder répète « Update claude-progress.txt with a sprint summary » (édition manuelle), ne mentionne aucun outil MCP.
- `prompts/evaluator_prompt.md:1-127` — Aucune mention de validate_json ni update_progress sur tout le prompt évaluateur (modes review de contrat + QA). Confirmé par grep.
- `CLAUDE.md:71-72` — « Validation schemas for these files are defined in src/tools.ts:REQUIRED_KEYS (required-keys check, not zod — faithful to V1). » — présente REQUIRED_KEYS comme LE mécanisme de validation alors qu'aucun appelant ne l'active dans le pipeline.
- `src/types.ts:5` — Seule autre référence à REQUIRED_KEYS dans tout src/ : un commentaire (« la validation se fait par REQUIRED_KEYS, pas par ces interfaces »). Confirme qu'aucun code n'appelle validateJson hors tools.ts.
- `tests/tools.test.ts` — Tests unitaires existants ciblent le module tools (validateJson). Point d'accroche pour ajouter un test de cohérence si posture A retenue.

**Impact DX.** Un nouveau contributeur lisant CLAUDE.md croit qu'il existe une couche de validation automatique des JSON inter-agents (REQUIRED_KEYS) et un mécanisme structuré de logging de progrès (update_progress). En réalité aucun n'est déclenché : les JSON sont produits sans validation, le progrès est écrit en texte libre. Cela crée une fausse confiance (« mes fichiers sont validés ») et une dette de connaissance : les schémas REQUIRED_KEYS doivent rester synchronisés avec la structure réelle des fichiers décrite ailleurs, sans bénéfice, et peuvent diverger silencieusement. Trancher + documenter clarifie l'architecture réelle et supprime l'ambiguïté.

**Correctif proposé.**
1. ÉTAPE 0 — Décision : confirmer la posture avec le mainteneur. Recommandation par défaut = Posture B (optionnel/best-effort, zéro changement de comportement, la plus fidèle V1). Les étapes 1-3 décrivent la posture B ; les étapes 4-7 décrivent la posture A (à n'appliquer QUE si le mainteneur choisit explicitement de rendre les outils load-bearing).
2. [POSTURE B] ÉTAPE 1 — Corriger CLAUDE.md:71-72 : remplacer la phrase qui présente REQUIRED_KEYS comme LE mécanisme de validation par une formulation exacte, ex. « src/tools.ts expose un outil MCP validate_json (schémas required-keys dans REQUIRED_KEYS) mis à disposition des agents mais best-effort : aucun prompt ni l'orchestrateur ne l'invoque actuellement — il n'y a donc pas de validation automatique des JSON inter-agents (fidèle à V1). »
3. [POSTURE B] ÉTAPE 2 — Corriger CLAUDE.md:46 (description des MCP tools) : ajouter une note que update_progress/validate_json sont exposés mais non sollicités par les prompts (les agents écrivent claude-progress.txt à la main).
4. [POSTURE B] ÉTAPE 3 — Ajouter un commentaire en tête de createHarnessTools (src/tools.ts:141) et/ou au-dessus de REQUIRED_KEYS (ligne 22) indiquant : « Outils best-effort, non référencés par les prompts actuels ; REQUIRED_KEYS n'est pas un gate de pipeline. » Aucun changement de code exécutable. pnpm typecheck + pnpm test doivent rester verts.
5. [POSTURE A — alternative, seulement si décidée] ÉTAPE 4 — builder_prompt.md : remplacer l'instruction d'écriture manuelle de claude-progress.txt (lignes 94-104) par « appelle l'outil mcp__harness__update_progress(phase, message) en fin de sprint » ; idem dans src/agents/builder.ts:152.
6. [POSTURE A] ÉTAPE 5 — builder_prompt.md (mode implémentation, ~lignes 80-90) et evaluator_prompt.md (sections de production de JSON) : ajouter « avant de considérer un fichier JSON produit, valide-le via mcp__harness__validate_json(file_path, schema_name) et corrige les erreurs signalées ».
7. [POSTURE A] ÉTAPE 6 — Vérifier que les noms de schémas attendus par validate_json (product_spec, feature_list, sprint_contract, qa_report, contract_review) sont mentionnés tels quels dans les prompts pour que l'agent passe le bon schema_name (l'enum est défini src/tools.ts:166-168).
8. [POSTURE A] ÉTAPE 7 — Ajouter dans tests/tools.test.ts un test garantissant que toute clé de REQUIRED_KEYS reste un schéma valide accepté par l'enum de validate_json (cohérence schémas <-> outil), et noter dans CLAUDE.md que les outils sont désormais load-bearing.
9. ÉTAPE FINALE (toutes postures) — Mettre à jour MEMORY.md si la décision touche le périmètre du port fidèle ; lancer pnpm typecheck et pnpm test.

**Critères d'acceptation.**
- [ ] La posture (A ou B) est explicitement choisie et tracée dans le commit / la PR.
- [ ] [B] CLAUDE.md ne présente plus REQUIRED_KEYS / validate_json / update_progress comme des mécanismes actifs : un lecteur comprend qu'ils sont best-effort et non invoqués par le pipeline actuel.
- [ ] [B] Aucun changement de comportement runtime : pnpm typecheck clean et pnpm test vert sans modification de test.
- [ ] [A] Au moins un prompt (builder et/ou evaluator) référence nommément mcp__harness__update_progress et/ou mcp__harness__validate_json avec le bon schema_name.
- [ ] [A] Un test dans tests/tools.test.ts échoue si une clé de REQUIRED_KEYS n'est pas un schema_name accepté par validate_json (cohérence schémas <-> enum d'outil).
- [ ] grep des noms d'outils (update_progress, validate_json) dans prompts/ et src/agents/ reflète la posture retenue (0 occurrence pour B hors documentation ; ≥1 occurrence instructive pour A).

**Risques.**
- Tension de fidélité V1 : la posture A change le comportement observable des agents (appels MCP au lieu d'écriture manuelle), ce qui s'écarte du « port 1:1 » revendiqué ; à valider explicitement avec le mainteneur. La posture B est neutre côté fidélité.
- Posture A : si validate_json est rendu obligatoire, un faux négatif (schéma required-keys trop strict, ex. champs optionnels absents) pourrait bloquer un agent ou consommer des tours/budget en boucles de correction inutiles.
- Posture A : risque de divergence si un agent passe un schema_name erroné (l'enum src/tools.ts:166 rejette les noms inconnus) ; nécessite que les prompts citent les noms exacts.
- Posture A sur update_progress : l'outil fait un simple append ; il ne reproduit pas le format markdown structuré « ## Sprint N — ... » demandé actuellement (builder_prompt.md:98-103). Basculer sur l'outil change la forme du log claude-progress.txt — à arbitrer.
- Posture B (doc only) : risque que la dette de connaissance (schémas REQUIRED_KEYS non utilisés mais à maintenir) persiste ; acceptable mais à signaler comme dette assumée.

<details><summary>Notes de vérification</summary>

Toutes les locations du ticket source sont VÉRIFIÉES et exactes : src/tools.ts:141-178 (définition des 2 outils), config.yaml:46-47 et 56-57 (allowed_tools builder+evaluator), builder_prompt.md:94-104 (écriture manuelle de claude-progress.txt), evaluator_prompt.md:1-127 (aucune mention des outils). Confirmé par grep : aucun prompt (builder/evaluator/planner/grading_criteria) ne mentionne update_progress ni validate_json. CORRECTIONS / PRÉCISIONS apportées vs ticket source : (1) Le planner câble aussi le serveur harness (src/agents/planner.ts:48) MAIS config.yaml:29-35 n'inclut PAS les outils MCP dans son allowlist — donc côté planner ils sont doublement non utilisables/non sollicités. (2) Précisé que validateJson()/REQUIRED_KEYS ne sont référencés nulle part hors tools.ts, à l'exception d'un commentaire dans types.ts:5 (preuve que l'orchestrateur ne valide rien). (3) Existence d'un fichier de test tests/tools.test.ts couvrant le module tools — point d'accroche concret pour l'acceptance criteria de la posture A. Ticket source = vrai : « connaissance dupliquée pour un chemin de code inactif, trompeur sur l'architecture de validation » est confirmé. Ce ticket n'est PAS un ticket de scoring (Option A non applicable) ; il porte sur les outils MCP. behavior_change marqué false car la recommandation par défaut (posture B) est purement documentaire ; la posture A serait, elle, un changement de comportement (signalé dans risks).

</details>

### DX-31 — Supprimer les fallbacks de stack hardcodés dans planner.ts (dont le vestige 'fastapi') et clarifier stack.backend ('auto') vs backend_options

**Thème** Configuration · **Sévérité** 🟡 basse · **Effort** S · **Fidélité V1** non · **Change le comportement** non · **Dépend de** —

**Problème.** Dans src/agents/planner.ts (lignes 53-56), les trois champs de stack sont lus depuis config.stack avec des fallbacks defensifs `??` : `frontend ?? "nextjs-tailwind"`, `backend_options ?? ["api-platform", "fastapi"]`, `database ?? "sqlite"`. Or ces trois champs sont declares REQUIS (non-optionnels) dans l'interface Config.stack (src/types.ts:25-30 : `frontend: string`, `backend: string`, `backend_options: string[]`, `database: string`) et sont toujours presents dans config.yaml (lignes 11-15). Les `??` sont donc du code mort en pratique : ils ne se declenchent jamais sous un config.yaml valide, et le type garantit deja la presence. C'est une contradiction interne : l'usage defensif `??` suggere que les champs peuvent etre absents, alors que le type Config les declare obligatoires.

Probleme aggravant (le vrai risque) : le fallback de backend_options inclut "fastapi", alors que config.yaml:13-14 ne liste QUE "api-platform" (l'option fastapi a ete retiree de backend_options) et que builder_prompt.md:10 decrit uniquement le backend "PHP 8.3 + API Platform (Symfony)". Le tableau de fallback `["api-platform", "fastapi"]` est donc un vestige non synchronise qui re-injecterait "fastapi" dans le prompt du planner si backend_options venait a manquer — suggerant a tort que fastapi est un backend supporte par le harnais actuel. (Note : config.yaml:12 conserve un commentaire `backend: "auto" # "api-platform" ou "fastapi" — le builder decide` qui mentionne aussi fastapi ; voir verification_notes.)

Point de clarte secondaire : le champ config.stack.backend vaut "auto" dans config.yaml mais n'est JAMAIS lu par planner.ts (seuls frontend, backend_options, database sont consommes). La relation entre stack.backend ("auto", non utilise cote code) et stack.backend_options (la vraie liste injectee dans le prompt) n'est pas documentee, ce qui prete a confusion sur quelle cle fait foi.

**Preuves.**
- `src/agents/planner.ts:53-56` — const stackOptions = config.stack; puis frontend = stackOptions.frontend ?? "nextjs-tailwind"; backendOptions = stackOptions.backend_options ?? ["api-platform", "fastapi"]; database = stackOptions.database ?? "sqlite". Les trois ?? sont du code mort (champs requis par le type) et le fallback backend_options re-introduit 'fastapi'.
- `src/types.ts:25-30` — interface Config.stack declare frontend: string; backend: string; backend_options: string[]; database: string — tous requis (non-optionnels), donc jamais undefined a la compilation; contredit l'usage ??.
- `config.yaml:10-15` — Bloc stack: frontend: "nextjs-tailwind" (l.11), backend: "auto" (l.12, avec commentaire mentionnant fastapi), backend_options: ["api-platform"] uniquement (l.13-14), database: "sqlite" (l.15). Aucun champ absent.
- `src/agents/planner.ts:65-67` — Le prompt envoye a l'agent interpole `Frontend stack: ${frontend}`, `Backend options: ${backendOptions.join(", ")}`, `Database: ${database}` — c'est par ce join que 'fastapi' atteindrait le prompt si le fallback se declenchait.
- `prompts/builder_prompt.md:9-11` — La stack du builder est decrite comme Frontend Next.js+Tailwind / Backend PHP 8.3 + API Platform (Symfony) / SQLite. Aucune mention de fastapi : confirme que fastapi n'est pas un backend supporte cote builder.
- `prompts/planner_prompt.md:50-55` — Le template product_spec.json fixe stack.backend: "api-platform" et stack.database: "sqlite" en dur dans le prompt (pas de fastapi). Coherent avec config.yaml apres correction.

**Impact DX.** Faible mais reel : code mort qui ment sur les invariants (les `??` laissent croire que la stack peut etre absente alors que le type la garantit). Le fallback "fastapi" est un piege documentaire — un mainteneur lisant planner.ts conclurait a tort que fastapi est un backend supporte, alors que config.yaml et builder_prompt.md ne le supportent plus. Risque de drift silencieux : si un jour backend_options devenait optionnel ou vide, le harnais injecterait un backend fantome dans le prompt du planner sans erreur. Nettoyer ces lignes reduit la surface de confusion stack et aligne code/config/prompts sur une seule verite.

**Correctif proposé.**
1. Dans src/agents/planner.ts:54-56, supprimer les trois fallbacks `??` puisque Config.stack garantit la presence des champs : `const frontend = stackOptions.frontend;` / `const backendOptions = stackOptions.backend_options;` / `const database = stackOptions.database;`. (Optionnel : inliner directement `config.stack.frontend` etc. et retirer la variable intermediaire stackOptions.)
2. Verifier qu'aucune autre reference a 'fastapi' ne subsiste cote code/prompts : `grep -rn -i fastapi src prompts config.yaml`. Apres correction de planner.ts, seul resterait le commentaire de config.yaml:12.
3. Decision sur config.yaml:12 (commentaire `backend: "auto" # "api-platform" ou "fastapi" — le builder decide`) : retirer la mention 'fastapi' du commentaire pour le rendre coherent avec backend_options (ex: `backend: "auto" # le builder choisit parmi backend_options`). Garde le champ backend lui-meme (toujours requis par le type).
4. Clarifier la semantique stack.backend vs backend_options : ajouter un court commentaire dans config.yaml indiquant que backend: "auto" signifie 'choix delegue au builder parmi backend_options' et que backend_options est la liste effectivement injectee dans le prompt du planner. (Aucun changement de code requis ; documentation seule.)
5. Lancer `pnpm typecheck` et confirmer qu'aucune NOUVELLE erreur n'apparait (cf. risks : la baseline a deja 2 erreurs preexistantes dans security.ts sans rapport).
6. Optionnel — si on veut une garantie runtime plutot que purement type : ce ticket reste 'small' en se contentant de supprimer le code mort ; une validation zod de config.yaml serait un ticket distinct.

**Critères d'acceptation.**
- [ ] planner.ts ne contient plus aucun operateur `??` sur les champs de stack (frontend/backend_options/database) : `grep -n '??' src/agents/planner.ts` ne renvoie aucune ligne liee a la stack.
- [ ] La chaine 'fastapi' n'apparait plus dans src/ ni prompts/ ni dans les valeurs de config.yaml : `grep -rn -i fastapi src prompts config.yaml` ne renvoie rien (ou au plus rien apres nettoyage du commentaire de config.yaml:12).
- [ ] `pnpm typecheck` n'introduit AUCUNE nouvelle erreur par rapport a la baseline (la baseline actuelle a 2 erreurs preexistantes dans src/security.ts:219 et :225, hors perimetre de ce ticket).
- [ ] Le comportement observable est inchange sous un config.yaml valide : le prompt du planner contient toujours `Frontend stack: nextjs-tailwind`, `Backend options: api-platform`, `Database: sqlite` (les fallbacks ne se declenchaient jamais).
- [ ] config.yaml documente clairement (commentaire) la relation backend ("auto") vs backend_options (liste source de verite injectee dans le prompt).

**Risques.**
- Tension de fidelite V1 : la CLAUDE.md insiste sur un 'port fidele 1:1' preservant les limitations V1. Verifier que les `??` n'existaient PAS deja dans legacy-python/agents/planner.py — s'ils en sont une transposition fidele, leur suppression est un ecart assume vs V1 (a documenter dans le commit). Si la V1 Python n'avait pas ces fallbacks, c'est au contraire un drift introduit lors du port, et le nettoyage RESTAURE la fidelite.
- Faux 'no behavior change' si un utilisateur s'appuyait sur un config.yaml partiel (sans backend_options) en comptant sur le fallback : apres correction, un tel config provoquerait `backendOptions.join is not a function` / `undefined` a l'execution au lieu d'un fallback silencieux. C'est voulu (fail-fast vs masquage), mais a mentionner. Le type Config le rendait deja illegal en theorie.
- Le `pnpm typecheck` global ne sera pas 'clean' a cause des 2 erreurs preexistantes dans security.ts — ne pas conclure a tort que ce ticket les a introduites. Ne PAS tenter de les corriger ici (hors perimetre).
- Modifier le commentaire de config.yaml:12 touche un fichier 'partage, inchange depuis V1' (cf. CLAUDE.md) ; impact nul sur le runtime (commentaire YAML) mais a signaler comme ecart documentaire vs V1 si la fidelite stricte est exigee.

<details><summary>Notes de vérification</summary>

Toutes les affirmations du seed verifiees contre le code reel. CONFIRME : planner.ts:54-56 contient bien les trois `??` dont `backend_options ?? ["api-platform", "fastapi"]` (ligne 55). CONFIRME : types.ts:25-30 declare les 4 champs de stack comme requis (frontend, backend, backend_options, database). CONFIRME : config.yaml backend_options (l.13-14) ne liste QUE "api-platform" ; fastapi a ete retire de la liste. CONFIRME : builder_prompt.md:10 decrit le backend comme PHP 8.3 + API Platform (Symfony), sans fastapi. CONFIRME : 'fastapi' n'apparait nulle part ailleurs dans src/prompts/config (hors legacy-python) que planner.ts:55 et le commentaire config.yaml:12.

CORRECTIONS apportees aux locations du seed : (1) Le bloc stack de config.yaml va de la ligne 10 (`stack:`) a 15 (`database:`), pas 11-15 comme indique ; corrige. (2) Le seed omet une 3e occurrence de 'fastapi' : le COMMENTAIRE config.yaml:12 (`backend: \"auto\" # \"api-platform\" ou \"fastapi\" — le builder decide`) mentionne aussi fastapi ; ajoute au perimetre du fix (etape 3). (3) Le seed dit que config.stack.backend pourrait valoir 'api-platform' — en realite config.yaml:12 le fixe a \"auto\", et ce champ n'est JAMAIS lu par planner.ts (seuls frontend/backend_options/database le sont) ; precision ajoutee au probleme.

NOUVEAU CONSTAT hors-seed : `pnpm typecheck` n'est PAS clean sur la baseline actuelle — 2 erreurs preexistantes dans src/security.ts:219 et :225 ('string | undefined' not assignable to 'string'), sans aucun rapport avec ce ticket. L'acceptance criterion 'typecheck clean' a donc ete reformule en 'aucune NOUVELLE erreur introduite'. Ce ticket n'est PAS un ticket scoring (theme Configuration) : l'Option A ne s'applique pas.

</details>

### DX-32 — Documenter project.name et stack.backend comme décoratifs (jamais lus), ou les câbler comme fallback/source de choix

**Thème** Configuration · **Sévérité** 🟡 basse · **Effort** S · **Fidélité V1** oui · **Change le comportement** oui · **Dépend de** DX-16

**Problème.** Deux réglages de config.yaml sont trompeurs car jamais lus par le code, donc modifier leur valeur n'a aucun effet (faux sentiment de contrôle).

1) config.project.name ("mon-projet", config.yaml:2 ; typé src/types.ts:17). Le nom de projet effectif provient exclusivement de process.argv[3] avec défaut "default" (src/index.ts:16), propagé vers main(userPrompt, projectName) puis utilisé pour construire le workspace (path.resolve(config.project.workspace, projectName), src/orchestrator.ts:549) et tracer progress.project_name (src/orchestrator.ts:558). Seul config.project.workspace est réellement lu ; config.project.name ne l'est nulle part dans src/.

2) config.stack.backend ("auto", config.yaml:12, commentaire "le builder décide" ; typé src/types.ts:27). Le planner lit config.stack (src/agents/planner.ts:53) mais ne consomme que frontend (l.54), backend_options (l.55) et database (l.56) ; le champ backend est ignoré et n'est jamais injecté dans le prompt du planner. La vraie source du choix backend est backend_options (l.66 du prompt : "Backend options: ..."), pas backend. L'exemple "backend": "api-platform" dans prompts/planner_prompt.md:52 est une illustration de sortie attendue, pas une lecture du champ config.

Décision Option A (scoring) sans objet ici : ce ticket ne touche pas au scoring/poids/seuils ; aucune substitution de placeholder requise. Le périmètre est purement "config.project.name + config.stack.backend".

Choix de design demandé au mainteneur (les deux respectent la nature low/small) :
- A. Câbler : utiliser config.project.name comme fallback de argv[3] (au lieu de "default") — synergie avec DX-16 — et soit câbler stack.backend (l'injecter au prompt comme préférence) soit le supprimer au profit de backend_options.
- B. Documenter décoratif : ajouter des commentaires explicites dans config.yaml et des JSDoc dans types.ts indiquant que name est ignoré (le nom vient de l'argv CLI) et que backend est ignoré (backend_options est la source du choix).

**Preuves.**
- `config.yaml:2` — project.name: "mon-projet" — déclaré mais jamais lu par src/ (vérifié par grep exhaustif).
- `config.yaml:12` — stack.backend: "auto" avec commentaire inline "le builder décide" ; jamais lu/injecté.
- `config.yaml:13-14` — stack.backend_options: ["api-platform"] — c'est CE champ (pas backend) qui atteint le planner.
- `src/types.ts:17` — project.name: string — typé mais sans consommateur.
- `src/types.ts:27` — backend: string dans l'interface stack — typé mais sans consommateur.
- `src/index.ts:16` — const projectName = process.argv[3] ?? "default"; — défaut codé en dur "default", n'utilise PAS config.project.name.
- `src/orchestrator.ts:549` — path.resolve(config.project.workspace, projectName) — seul project.workspace est lu ; le nom vient du paramètre projectName (issu de l'argv).
- `src/orchestrator.ts:558` — progress.project_name = projectName; — la trace de progression reçoit l'argv, pas config.project.name.
- `src/agents/planner.ts:53-56` — const stackOptions = config.stack; puis lecture de frontend (l.54), backend_options (l.55), database (l.56) — backend jamais lu.
- `src/agents/planner.ts:66` — `- Backend options: ${backendOptions.join(", ")}` — le prompt n'expose QUE backend_options au planner, jamais backend.
- `prompts/planner_prompt.md:52` — "backend": "api-platform" — exemple de la forme de product_spec.json attendue (le builder/planner décide), pas une lecture du champ config.
- `legacy-python/orchestrator.py:506` — FIDÉLITÉ V1 : project_name = sys.argv[2] if len(sys.argv) > 2 else "default" — V1 ignorait déjà config.project.name.
- `legacy-python/orchestrator.py:449` — FIDÉLITÉ V1 : seul config["project"]["workspace"] est lu ; name jamais lu.
- `legacy-python/agents/planner.py:57-59` — FIDÉLITÉ V1 : planner V1 lit frontend, backend_options, database mais PAS backend — comportement identique au port TS.

**Impact DX.** Friction de configuration : un utilisateur qui édite project.name (le réglage le plus naturel à modifier en haut du fichier) ou stack.backend s'attend à un effet — renommer le workspace, forcer un backend — et n'en obtient aucun, sans message d'erreur. Échec silencieux qui érode la confiance dans config.yaml comme source de vérité. La présence de stack.backend ET stack.backend_options côte à côte est particulièrement ambiguë : rien n'indique lequel pilote réellement le choix.

**Correctif proposé.**
1. DÉCISION PRÉALABLE (mainteneur) : choisir entre A (câbler) et B (documenter décoratif). B préserve strictement la fidélité V1 (recommandé par défaut vu la sévérité low) ; A introduit un behavior_change.
2. --- Si B (documenter décoratif, zéro changement de comportement) ---
3. config.yaml:2 — ajouter un commentaire inline sur project.name : '# DÉCORATIF : ignoré. Le nom de projet vient de l'argument CLI (argv[3]), défaut "default". Voir src/index.ts:16.'
4. config.yaml:12 — remplacer le commentaire actuel par : '# DÉCORATIF : ignoré. La source du choix backend est backend_options (ci-dessous), proposé au planner qui décide.'
5. src/types.ts:17 — JSDoc sur name : '/** Décoratif : non lu. Le nom de projet effectif provient de process.argv[3] (src/index.ts). */'
6. src/types.ts:27 — JSDoc sur backend : '/** Décoratif : non lu. Le choix backend dérive de backend_options, proposé au planner. */'
7. Mettre à jour CLAUDE.md (section Conventions / Configuration) pour noter ces deux champs décoratifs, en cohérence avec la note de migration sur les limitations V1 préservées.
8. --- Si A (câbler — behavior_change, synergie DX-16) ---
9. src/index.ts:16 — charger config et utiliser config.project.name comme fallback : 'const projectName = process.argv[3] ?? config.project.name ?? "default";' (attention : index.ts n'importe pas encore loadConfig ; soit l'importer, soit déplacer la résolution du fallback dans orchestrator.main qui a déjà config).
10. Préférer la résolution dans orchestrator.main(userPrompt, projectName) : si projectName === 'default' (sentinelle) ET config.project.name est défini et non vide, utiliser config.project.name ; sinon garder projectName. Éviter de coupler index.ts à loadConfig.
11. Pour backend : soit (3a) le SUPPRIMER de config.yaml + types.ts (la vérité est backend_options) et documenter ; soit (3b) l'injecter : si backend !== 'auto', l'ajouter au prompt planner.ts comme 'Preferred backend: ${backend}' en plus de backend_options.
12. Ajouter/mettre à jour des tests unitaires couvrant la résolution du nom et (si 3b) l'injection backend.
13. Documenter le nouveau comportement dans CLAUDE.md et signaler l'écart volontaire vs V1 dans la note de migration.

**Critères d'acceptation.**
- [ ] pnpm typecheck reste clean après le changement.
- [ ] pnpm test reste vert (aucune régression).
- [ ] Variante B : config.yaml:2, config.yaml:12, src/types.ts:17, src/types.ts:27 portent chacun un commentaire/JSDoc explicite 'décoratif/ignoré' ; aucun changement de comportement runtime (les sorties workspace/progress/planner-prompt sont byte-identiques avant/après).
- [ ] Variante A (nom) : lancer 'pnpm dev "..."' SANS argv[3] crée le workspace sous config.project.name (et non 'default') ; un test unitaire vérifie que la résolution renvoie config.project.name quand argv[3] est absent et la valeur argv[3] quand elle est fournie.
- [ ] Variante A (backend 3b) : si stack.backend !== 'auto', le prompt reçu par le planner contient la préférence backend (test sur la chaîne fullPrompt) ; si 3a, le champ backend est absent de config.yaml et de l'interface stack, et aucun code ne le référence.
- [ ] CLAUDE.md décrit le statut (décoratif OU câblé) des deux champs, cohérent avec le code.

**Risques.**
- TENSION DE FIDÉLITÉ V1 : câbler (variante A) dévie du comportement V1 Python (argv-only pour le nom ; backend_options-only pour le backend) — vérifié dans legacy-python. Le projet est un 'port fidèle 1:1' ; tout câblage doit être assumé comme évolution volontaire et documenté dans la note de migration. La variante B (documentation seule) ne porte aucun risque de fidélité.
- Variante A (nom) : si on importe loadConfig dans index.ts, on couple le point d'entrée à la lecture de config (alourdit le chemin d'erreur si config.yaml est absent/malformé) ; préférer résoudre le fallback dans orchestrator.main qui charge déjà config.
- Variante A (nom) : utiliser config.project.name comme fallback peut changer silencieusement le répertoire workspace des utilisateurs existants qui s'appuyaient sur le défaut 'default' — changement de comportement à communiquer.
- Variante A (backend 3b) : injecter une préférence backend pourrait biaiser le planner et réduire la latitude 'le builder décide' qui est intentionnelle ; valider que cela n'altère pas la qualité des plans.
- Risque transverse : modifier le commentaire de config.yaml:12 sans toucher au code pourrait, à l'inverse, laisser croire que backend_options est aussi décoratif — bien distinguer les deux dans la formulation.

<details><summary>Notes de vérification</summary>

Toutes les affirmations du ticket source ont été vérifiées par lecture directe et grep exhaustif sur src/. CONFIRMÉ : (1) config.project.name (config.yaml:2, types.ts:17) n'est lu nulle part dans src/ ; le nom vient de process.argv[3] ?? \"default\" (index.ts:16) et seul config.project.workspace est lu (orchestrator.ts:549). (2) config.stack.backend (config.yaml:12, types.ts:27) n'est jamais injecté ; planner.ts:53 lit config.stack mais ne consomme que frontend/backend_options/database (l.54-56), et seul backend_options atteint le prompt (l.66). CORRECTION mineure de référencement : le ticket source cite 'planner.ts:52-56' pour les options stack — la plage exacte est planner.ts:53-56 (l.53 = const stackOptions = config.stack ; l.54-56 = lectures), et l'injection au prompt est en planner.ts:66. CORRECTION de typage : le ticket source cite 'types.ts:28' pour stack.backend — c'est inexact, types.ts:28 est backend_options ; le champ backend est en types.ts:27 (backend_options en :28). FIDÉLITÉ : la limitation est héritée de V1 (legacy-python/orchestrator.py:506 argv-only ; planner.py:57-59 sans backend ; orchestrator.py:449 workspace-only) — le port TS est donc fidèle, ce qui renforce que ce ticket est une amélioration optionnelle (doc ou évolution), pas un bug de port. SCOPE : aucun lien scoring (pas de poids/seuils), donc l'Option A imposée pour les tickets scoring ne s'applique pas ici. depends_on DX-16 conservé comme indiqué par le ticket source (synergie sur la résolution du nom de projet) mais le contenu de DX-16 n'a pas pu être vérifié dans ce périmètre.

</details>

---

## Thème — Docs

_DX-07 : etoffer le README (1 ligne aujourd'hui ; toute la doc vit dans CLAUDE.md) — point d'entree humain. DX-26 : documenter une politique de langue FR/EN transversale (qui parle quelle langue, a qui, pourquoi) ; depend de DX-01 et DX-27 dont les decisions de prompt fixent l'etat de reference a documenter._

### DX-07 — Étoffer le README (point d'entrée humain) — actuellement 1 ligne, toute la doc vit dans CLAUDE.md

**Thème** Docs · **Sévérité** 🟠 moyenne · **Effort** S · **Fidélité V1** non · **Change le comportement** non · **Dépend de** —

**Problème.** Le README.md du dépôt ne contient qu'un titre (`# fullstack-harness`, 19 octets, une seule ligne). C'est pourtant le premier (et souvent le seul) fichier qu'un humain lit après un clone, et la landing page affichée par GitHub. Tout le contenu utile pour démarrer — pitch du projet, prérequis (Node, pnpm, CLI `claude`, `ANTHROPIC_API_KEY`/session CLI active), les 4 commandes (`pnpm install`, `pnpm dev`, `pnpm typecheck`, `pnpm test`), le schéma des 3 phases d'orchestration et le protocole JSON inter-agents — vit exclusivement dans CLAUDE.md. Or CLAUDE.md est explicitement cadré comme « guidance for Claude Code » (ligne 3) et chargé automatiquement par l'agent : ce n'est pas un point d'entrée humain, et rien dans le README ne renvoie vers lui ni vers les specs/plans de `docs/`. Conséquence : un nouvel arrivant (ou le mainteneur lui-même dans six mois) ne sait pas comment lancer le harnais, quels prérequis installer, ni où trouver la doc d'architecture, sans ouvrir et déchiffrer un fichier destiné à l'agent. Le correctif est purement documentaire (aucun changement de comportement) : transformer le README en point d'entrée humain autonome (pitch + prérequis + commandes + schéma des phases) et renvoyer vers CLAUDE.md et `docs/` pour les détails, en gardant CLAUDE.md comme source canonique pour éviter la duplication divergente.

**Preuves.**
- `README.md:1` — Fichier entier : une seule ligne `# fullstack-harness`. `wc -c README.md` confirme 19 octets. Aucune commande, aucun prérequis, aucun lien.
- `CLAUDE.md:1-3` — Le fichier s'ouvre sur « This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository. » — cadrage agent, pas lecteur humain.
- `CLAUDE.md:17-27` — Section ## Commands (les 4 commandes pnpm) + bloc prérequis (Node, pnpm, CLI claude, ANTHROPIC_API_KEY/session) : c'est le seul endroit du dépôt où ces infos existent, et il faut ouvrir CLAUDE.md pour les trouver.
- `CLAUDE.md:29-72` — Sections ## Architecture (3 phases) et ## Inter-agent JSON protocol : toute la doc d'architecture est ici, sans aucun pont depuis le README.
- `package.json:7-13` — Scripts réels : dev=`tsx src/index.ts`, typecheck=`tsc --noEmit`, test=`vitest run`. Pas de script `init`/`lint`. À refléter fidèlement dans le README.
- `src/index.ts:9-16` — Usage CLI vérifié : `tsx src/index.ts <user-prompt> [project-name]`, prompt obligatoire (sinon exit 1), project-name optionnel par défaut `"default"` — donc `pnpm dev "<prompt>"` écrit dans workspace/default/ (et NON workspace/mon-projet/ malgré config.yaml project.name).
- `docs/superpowers/specs/2026-05-28-harness-typescript-port-design.md` — Spec de migration existante (vérifiée via find docs). Cible naturelle d'un lien « pour aller plus loin » depuis le README.
- `docs/superpowers/plans/2026-05-28-harness-typescript-port.md` — Plan de migration existant. Idem, à lier depuis le README.

**Impact DX.** Réduit drastiquement le time-to-first-run pour tout nouvel arrivant (et pour le mainteneur revenant sur le projet) : aujourd'hui il faut ouvrir un fichier destiné à l'agent pour découvrir prérequis et commandes. Un README correct rend le dépôt auto-explicatif au premier coup d'œil (y compris sur la page GitHub), clarifie le rôle distinct README (humain) vs CLAUDE.md (agent), et expose les chemins de doc (`docs/`) jusque-là invisibles.

**Correctif proposé.**
1. Rédiger un README.md structuré avec, dans l'ordre : (1) un titre + un pitch d'une à deux phrases (reprendre/condenser CLAUDE.md:7-9 — orchestrateur qui pilote 3 agents Claude Planner/Builder/Evaluator via @anthropic-ai/claude-agent-sdk pour construire des apps full-stack en autonomie ; agents communiquant par fichiers JSON sur disque).
2. Ajouter une section « Prérequis » alignée sur CLAUDE.md:26-27 : Node, pnpm, le CLI `claude` installé, et `ANTHROPIC_API_KEY` (ou une session CLI active). Mentionner que vitest est épinglé à ^2 (Node < 20.19/22.12) si on veut être complet.
3. Ajouter une section « Démarrage rapide » avec les 4 commandes exactes de package.json/CLAUDE.md:19-24 : `pnpm install`, `pnpm dev "<prompt>" [project-name]`, `pnpm typecheck`, `pnpm test`. Préciser que la sortie atterrit dans `workspace/<project-name>/` et que `project-name` est optionnel (défaut `default`, cf. src/index.ts:16) — ne PAS sur-promettre workspace/mon-projet.
4. Ajouter une section « Architecture » courte : résumé des 3 phases (Planning → Sprint loop [contract negotiation + implémentation/QA] → Final evaluation) et une ligne sur le protocole JSON inter-agents, en renvoyant vers CLAUDE.md pour le détail plutôt que de tout dupliquer.
5. Ajouter une section « Pour aller plus loin / Documentation » avec des liens relatifs cliquables : `[CLAUDE.md](./CLAUDE.md)` (référence canonique architecture/conventions, préciser qu'il sert aussi de guidance à l'agent), `[docs/superpowers/specs/...](./docs/superpowers/specs/2026-05-28-harness-typescript-port-design.md)` et `[docs/superpowers/plans/...](./docs/superpowers/plans/2026-05-28-harness-typescript-port.md)`. Vérifier que les chemins de lien résolvent réellement (fichiers présents).
6. Optionnel : une ligne sur la nature du projet (port fidèle 1:1 de la V1 Python, archive sous legacy-python/) reprise de CLAUDE.md:11-15, pour situer le lecteur. Ne PAS recopier la liste exhaustive des limitations V1 — renvoyer vers CLAUDE.md.
7. Garder le README volontairement mince et non redondant : tout détail susceptible de diverger (seuils, modèles, limites) reste dans config.yaml/CLAUDE.md, le README ne fait que pointer. Pas de duplication de chiffres.

**Critères d'acceptation.**
- [ ] README.md > 19 octets et contient au minimum : un pitch, une section prérequis, les 4 commandes (`pnpm install`, `pnpm dev`, `pnpm typecheck`, `pnpm test`), un résumé des 3 phases, et au moins un lien vers CLAUDE.md.
- [ ] Les commandes citées dans le README correspondent exactement aux scripts de package.json (dev/typecheck/test) — aucune commande inventée (pas de `pnpm lint`/`pnpm init` inexistants).
- [ ] Les prérequis listés correspondent à CLAUDE.md:26-27 (Node, pnpm, CLI claude, ANTHROPIC_API_KEY/session) — aucun prérequis fantôme.
- [ ] Tous les liens relatifs du README résolvent vers des fichiers réellement présents (./CLAUDE.md, ./docs/superpowers/specs/2026-05-28-harness-typescript-port-design.md, ./docs/superpowers/plans/2026-05-28-harness-typescript-port.md).
- [ ] Aucun chiffre/seuil de config dupliqué dans le README qui pourrait diverger de config.yaml (vérification : pas de poids QA ni seuils numériques recopiés).
- [ ] `pnpm typecheck` et `pnpm test` restent verts (ticket purement docs, ne doit toucher aucun .ts).

**Risques.**
- Duplication divergente : recopier prérequis/commandes dans le README crée un second endroit à maintenir qui dérivera de CLAUDE.md. Mitigation : README mince qui pointe vers CLAUDE.md/config.yaml pour les détails, plutôt que de tout dupliquer.
- Sur-promesse sur project-name : ne pas écrire que `pnpm dev` sans argument utilise config.yaml project.name (`mon-projet`) — le code (src/index.ts:16) impose le défaut `default`. Risque de doc fausse si on déduit le comportement de config.yaml au lieu du code.
- Liens cassés : les chemins de docs contiennent une date (2026-05-28) ; un renommage futur casserait les liens. Mitigation : lier la spec/plan tels qu'ils existent aujourd'hui et accepter la maintenance, ou pointer le dossier docs/superpowers/.
- Aucune tension de fidélité V1 : ticket purement documentaire, aucun changement de comportement du harnais, n'altère pas le port 1:1 (README et docs ne font pas partie du périmètre porté depuis la V1).

<details><summary>Notes de vérification</summary>

Toutes les affirmations du seed sont confirmées. README.md = 19 octets, une seule ligne `# fullstack-harness` (lu + wc -c). CLAUDE.md s'ouvre bien sur un cadrage « guidance for Claude Code » (ligne 3) et contient commandes (17-27), prérequis (26-27), architecture 3 phases (29-72) — tout l'utile y est et nulle part ailleurs. Corrections/précisions par rapport au seed : (1) les locations citées par le seed sont correctes (README.md:1, CLAUDE.md:1). (2) Le seed mentionne « lien vers CLAUDE.md/docs » : docs existe et ne contient que docs/superpowers/specs/...-design.md et docs/superpowers/plans/...-port.md (vérifié via find) — il n'y a PAS de docs/superpowers/specs/ ET plans/ multiples comme la phrase pourrait le suggérer, ce sont deux fichiers datés précis ; les chemins exacts sont fournis dans evidence/proposed_fix. (3) Détail à NE PAS rater dans la rédaction : `pnpm dev` sans project-name écrit dans workspace/default/ (src/index.ts:16), pas workspace/mon-projet/ malgré config.yaml project.name=mon-projet — piège documentaire. (4) Aucun LICENSE ni fichier .env d'exemple dans le repo (donc ne pas référencer un .env.example inexistant). (5) Ticket Docs pur, hors scope scoring/Option A — aucune contrainte config.yaml SSOT applicable.

</details>

### DX-26 — Documenter une politique de langue FR/EN transversale et explicite (qui parle quelle langue, à qui, et pourquoi)

**Thème** Docs · **Sévérité** 🟡 basse · **Effort** S · **Fidélité V1** oui · **Change le comportement** non · **Dépend de** DX-01, DX-27

**Problème.** Le harnais mélange trois langues sans politique documentée explicitement raisonnée :
1. System prompts agents (prompts/*.md) : 100% français (ex. "# Agent Builder", "## Rôle", "Tu es un développeur full-stack senior").
2. User prompts inline (src/agents/*.ts) : 100% anglais (ex. "## Mode: Sprint Implementation", "Follow these steps IN ORDER").
3. Schéma JSON inter-agents : clés en anglais (agreed_deliverables, test_criteria, requested_changes, feature_coverage).
4. Commentaires/docstrings du code TS : français (ex. "Port fidèle de la V1 Python", "Construit les Options partagées").

Cette mixité existe parce que c'est un port fidèle 1:1 de la V1 Python (les .md et les chaînes de prompt sont verbatim de V1). Le problème DX n'est PAS la mixité en soi mais le fait qu'aucune politique n'explique QUI parle quelle langue, À QUI, et POURQUOI. CLAUDE.md mentionne la convention de façon incidente à deux endroits (ligne 44 et ligne 79) mais sans la poser comme dimension transversale ni en donner la raison (fidélité V1) ni en tirer les conséquences pour le mainteneur.

Conséquence aggravante concrète (citée par le seed) : un libellé d'un même concept existe dans les deux langues, donc un grep mono-langue rate l'autre occurrence. Cas réel vérifié = les poids de notation : grading_criteria.md utilise les libellés FR (Complétude 30%, Qualité du design 25%, Robustesse 25%, Qualité du code 20%) tandis que la table inline evaluator.ts:191-196 utilise les libellés EN (Completeness, Design quality, Robustness, Code quality). Un mainteneur qui cherche "Completeness" ne trouve jamais la source FR, et inversement — c'est exactement le drift que DX-01 doit corriger. Sans politique de langue documentée, ce type de double-source se reproduira à chaque ajout de prompt.

Note : ce ticket est purement documentaire (behavior_change=false). Il ne propose PAS de tout traduire (ce qui casserait la fidélité V1), mais de poser la convention explicitement et d'en faire un critère de relecture.

**Preuves.**
- `prompts/builder_prompt.md:1-5` — System prompt builder intégralement en français : '# Agent Builder', '## Rôle', 'Tu es un développeur full-stack senior.' Idem planner_prompt.md:1 ('# Agent Planificateur'), evaluator_prompt.md:1 ('# Agent Évaluateur QA'), grading_criteria.md:1 ('# Critères de notation QA').
- `src/agents/builder.ts:128-155` — User prompt inline du mode implémentation en anglais : '## Mode: Sprint Implementation', 'Follow these steps IN ORDER:', 'Work on ONE feature at a time'. Confirme la coexistence FR (system) + EN (user) au sein du MÊME agent.
- `src/agents/builder.ts:1-4` — Docstring de tête de fichier en français : 'Builder agent — implements features sprint by sprint.' / 'Port fidèle de la V1 Python'. Commentaires de code FR mêlés à des identifiants/JSDoc EN.
- `CLAUDE.md:44` — Première mention incidente : 'System prompt: loaded from prompts/ (written in French) + grading_criteria.md appended'. Documente le fait FR mais pas la politique ni le pourquoi.
- `CLAUDE.md:79` — Seconde mention (la convention réelle) : 'Agent prompts in prompts/ are written in French; the inline user-prompts in src/agents/*.ts are in English (verbatim from V1)'. C'est l'emplacement correct de la convention — le seed citait CLAUDE.md:1 qui est inexact (CLAUDE.md:1 = titre '# CLAUDE.md').
- `prompts/grading_criteria.md:7-71` — Libellés de critères/poids en FR : 'Complétude fonctionnelle (30%)', 'Qualité du design (25%)', 'Robustesse (25%)', 'Qualité du code (20%)'.
- `src/agents/evaluator.ts:191-196` — Table inline des MÊMES poids en EN : '| Completeness | 30% |', '| Design quality | 25% |', '| Robustness | 25% |', '| Code quality | 20% |'. Double-source cross-langue = le drift que DX-01 corrige, illustre l'impact du grep mono-langue.
- `src/agents/builder.ts:88-89` — Clés JSON du protocole en anglais dans un prompt anglais : 'agreed_deliverables', 'feature_id', 'test_criteria', 'out_of_scope', 'technical_approach'. Le schéma inter-agents est EN, ce que la politique doit documenter comme 3e axe.

**Impact DX.** Un contributeur non francophone doit lire les system prompts français pour comprendre le comportement réel des agents (le 'pourquoi' du scoring est dans grading_criteria.md en FR), alors que les user prompts et le code applicatif lui parlent en anglais — friction d'onboarding. L'absence de politique explicite fait que le grep d'un concept dans une seule langue rate sa contrepartie, ce qui masque les drifts de valeurs dupliquées (poids, seuils, libellés) et augmente le coût de maintenance à chaque évolution. Documenter la politique transforme la mixité subie en convention assumée et fournit un critère de relecture pour les PR futures.

**Correctif proposé.**
1. Dans CLAUDE.md, remplacer la convention incidente (ligne 79) par une sous-section dédiée '### Politique de langue (FR/EN)' sous 'Conventions', qui formalise les 4 axes : (a) system prompts prompts/*.md = FR ; (b) user prompts inline src/agents/*.ts = EN ; (c) schéma JSON inter-agents (clés) = EN ; (d) commentaires/docstrings code TS = FR.
2. Pour chaque axe, donner le POURQUOI : la mixité est héritée du port fidèle 1:1 de la V1 Python (les .md et chaînes de prompt sont verbatim V1) ; toute traduction casserait la fidélité et est donc hors politique tant que la fidélité V1 est l'objectif.
3. Ajouter une règle de relecture explicite : 'Quand une valeur (poids, seuil, libellé de critère) apparaît à la fois dans un prompt FR et dans le code EN, c'est une double-source à éliminer — la source de vérité est config.yaml (cf. politique de scoring Option A, DX-01).' Faire le lien explicite vers DX-01 pour éviter que la politique de langue et la SSOT scoring divergent.
4. Mettre à jour la mention de la ligne 44 (section 'Agent composition pattern') pour pointer vers la nouvelle sous-section au lieu de répéter 'written in French' isolément, afin d'avoir une source unique de la politique dans le doc.
5. Optionnel (cohérent, non bloquant) : ajouter une note 'langue cible si la fidélité V1 est levée' pour anticiper un futur chantier — par défaut, ne rien convertir.

**Critères d'acceptation.**
- [ ] CLAUDE.md contient une sous-section unique et nommée décrivant les 4 axes de langue (system prompt FR, user prompt EN, clés JSON EN, commentaires FR) avec le pourquoi (fidélité V1).
- [ ] La sous-section référence explicitement le risque de double-source cross-langue et renvoie à la politique de scoring config.yaml (DX-01) comme SSOT.
- [ ] Les deux anciennes mentions incidentes (CLAUDE.md ligne ~44 et ~79) ne se contredisent pas et pointent vers / sont consolidées dans la nouvelle sous-section (pas de troisième source divergente).
- [ ] Aucune modification de comportement : pnpm typecheck reste clean et pnpm test reste vert (ticket purement docs, aucun .ts/.md de prompt modifié).

**Risques.**
- Tension de fidélité V1 : si la politique laissait entendre qu'il faut tout uniformiser, elle inciterait à traduire les prompts verbatim et casserait le port 1:1. Le texte doit clairement statuer 'on documente, on ne convertit pas'.
- Drift documentaire : ajouter une 3e source de vérité sur la langue si on n'élimine pas / ne redirige pas les mentions existantes des lignes 44 et 79.
- Couplage avec DX-01 : si DX-01 (Option A, poids dans config.yaml) n'est pas encore fait, l'exemple 'poids = double-source' reste valable mais la politique doit pointer vers la cible config.yaml sans présupposer qu'elle est déjà en place — formuler comme direction, pas comme état actuel.
- Risque faible de sur-ingénierie : sévérité 'low', rester concis (quelques lignes dans CLAUDE.md) plutôt qu'un long doc séparé.

<details><summary>Notes de vérification</summary>

Vérifié en lisant le code réel. CORRECTIONS apportées au ticket source : (1) location 'CLAUDE.md:1' est inexacte — CLAUDE.md:1 est le titre '# CLAUDE.md' ; la convention de langue est réellement en CLAUDE.md:79, avec une seconde mention incidente en CLAUDE.md:44. Les deux ont été intégrées dans evidence. (2) location 'src/agents/builder.ts:128-155' confirmée : le user prompt anglais commence bien à la ligne 128 et la liste de règles EN va jusqu'à 155. (3) 'prompts/builder_prompt.md:1' confirmée (fichier FR). (4) effort réévalué de 'medium' (seed) à 'small' : c'est une édition documentaire ciblée dans CLAUDE.md, pas un refactor. (5) La double-source cross-langue des POIDS citée par le seed (DX-01) est confirmée concrète : grading_criteria.md (FR, lignes 7-71) vs evaluator.ts:191-196 (EN) — ajoutée comme evidence principale de l'impact 'grep mono-langue'. (6) Confirmé que les 4 system prompts (planner/builder/evaluator/grading_criteria) sont tous FR et que les 3 fichiers agents (planner/builder/evaluator.ts) ont tous des user prompts EN — la mixité est systématique, pas ponctuelle. depends_on = DX-01 (la politique doit pointer vers la SSOT scoring) et DX-27 (drifts FR/EN ponctuels que cette politique transversale chapeaute).

</details>

### DX-38 — Distinguer la convention de commit `feat(module)` du harnais de celle imposée aux apps générées

**Thème** Docs · **Sévérité** 🟡 basse · **Effort** S · **Fidélité V1** oui · **Change le comportement** non · **Dépend de** —

> _Ajouté par la critique de complétude — locations à reconfirmer en session._

**Problème.** Le format de commit `feat(module): description` apparaît pour DEUX publics distincts sous un libellé identique, sans rien qui signale la séparation : CLAUDE.md:78 fixe la convention du dépôt du HARNAIS, tandis que builder.ts:150 et builder_prompt.md:40 imposent ce même format au Builder pour les commits des apps GÉNÉRÉES. Un mainteneur peut éditer l'une en croyant toucher l'autre (édition croisée).

**Preuves.**
- `CLAUDE.md:78` — Convention de commit du dépôt du harnais.
- `src/agents/builder.ts:150` — Instruction de commit transmise au Builder pour les apps générées.
- `prompts/builder_prompt.md:40` — Même format répété dans le prompt builder.

**Impact DX.** Ambiguïté faible mais réelle : deux conventions homonymes pour deux dépôts différents (le harnais vs le workspace généré). Un commentaire de portée évite une correction au mauvais endroit.

**Correctif proposé.**
1. Ajouter une mention de portée à chaque emplacement (ex: dans builder.ts/builder_prompt.md « format pour les commits de l'APP GÉNÉRÉE, distinct de la convention du harnais »).
2. Optionnel : référencer CLAUDE.md:78 comme la convention du harnais lui-même.

**Critères d'acceptation.**
- [ ] Chacun des deux emplacements indique explicitement à quel dépôt (harnais vs app générée) sa convention s'applique.

**Risques.** Aucun identifié.

<details><summary>Notes de vérification</summary>

Issu de critic.dropped (audit dim 2, finding 8). Les locations sont à reconfirmer en session (numéros de ligne approximatifs).

</details>

### DX-42 — Relire les docs de migration pour drift vs code, ou les marquer « archive non maintenue »

**Thème** Docs · **Sévérité** 🟡 basse · **Effort** S · **Fidélité V1** non · **Change le comportement** non · **Dépend de** —

> _Ajouté par la critique de complétude — locations à reconfirmer en session._

**Problème.** Les docs de migration (docs/superpowers/specs/2026-05-28-*, docs/superpowers/plans/...) peuvent contenir des références périmées (ex: fastapi, anciens seuils/poids) — même nature de drift documentaire que DX-21 (.gitignore Python) et DX-31 (fallback fastapi). NB : la mémoire projet indique que la spec V2 est hors périmètre, et le workflow a jugé ce point hors-scope DX strict ; il est inclus ici pour la traçabilité/exhaustivité.

**Preuves.**
- `docs/superpowers/specs/2026-05-28-harness-typescript-port-design.md` — Spec de migration — drift possible vs état actuel.
- `docs/superpowers/plans/2026-05-28-harness-typescript-port.md` — Plan de migration — idem.

**Impact DX.** Des docs périmées induisent en erreur un nouveau contributeur. Au minimum, un bandeau « archive — non maintenue » lève l'ambiguïté à coût quasi nul.

**Correctif proposé.**
1. Soit relire et corriger les écarts vs le code actuel (effort un peu plus élevé),
2. soit ajouter un bandeau d'en-tête « Document de migration archivé — peut diverger de l'état actuel du code » (quick win recommandé).

**Critères d'acceptation.**
- [ ] Les docs de migration portent un statut clair (à jour, ou archivé/non maintenu).

**Risques.** Aucun identifié.

<details><summary>Notes de vérification</summary>

Issu de critic.files_not_examined. Priorité basse / optionnel (cf. note hors-périmètre).

</details>

---

## Thème — Portabilite

_DX-19 : le nettoyage de ports (lsof + /proc/<pid>/cwd) est Linux-only ; sur macOS/Windows les zombies dev-server survivent en silence. Documenter la contrainte de plateforme et logger le no-op._

### DX-19 — Documenter la contrainte de plateforme Linux-only du nettoyage de ports et logger le no-op silencieux sur macOS/Windows

**Thème** Portabilité · **Sévérité** 🟠 moyenne · **Effort** M · **Fidélité V1** oui · **Change le comportement** oui · **Dépend de** —

**Problème.** `cleanupWorkspacePorts()` (src/orchestrator.ts:81-147) tue les dev-servers zombies entre sprints en deux temps : (1) `lsof -tiTCP -sTCP:LISTEN -i:3000,3001,8000,8001` pour lister les PID en écoute, puis (2) pour chaque PID, lecture du cwd via `fs.readlinkSync('/proc/${pid}/cwd')` afin de ne tuer que les processus dont le cwd est confiné au workspace.

Le mécanisme de confinement repose sur `/proc/<pid>/cwd`, un pseudo-système de fichiers spécifique à Linux. Sur macOS `/proc` n'existe pas : le `readlinkSync` lève une erreur, le `catch` exécute `continue`, et AUCUN processus n'est jamais tué — alors que `lsof` (présent sur macOS) a bel et bien trouvé des PID. Résultat : no-op silencieux, les zombies (uvicorn/next dev backgroundés par un agent dont le parent claude est mort) survivent entre sprints et peuvent occuper les ports du sprint suivant. Sur Windows, ni `lsof` ni `/proc` n'existent : `spawnSync` retourne `out.error` et la fonction `return` immédiatement (no-op également, mais sans même tenter).

Aucune documentation (CLAUDE.md, README.md quasi vide — une seule ligne titre) ne mentionne que le harnais suppose un hôte Linux pour ce nettoyage. Le pire cas n'est pas le crash mais le silence : sur macOS l'utilisateur ne voit rien dans les logs alors que le nettoyage est intégralement inopérant.

Précision vs ticket source : l'affirmation « tout le nettoyage est Linux-only » est à nuancer — `lsof` lui-même fonctionne sur macOS ; c'est uniquement la vérification de confinement par `/proc/<pid>/cwd` qui est Linux-only et casse silencieusement. La piste « lsof -t sur macOS » du ticket source est donc imprécise : lsof est déjà invoqué et déjà portable ; le vrai trou est la détection du cwd (à remplacer par `lsof -p <pid> -a -d cwd` ou `lsof -tiTCP ... -F cn` parsé par cwd sur macOS).

**Preuves.**
- `src/orchestrator.ts:91-106` — spawnSync('lsof', ['-tiTCP','-sTCP:LISTEN','-i:'+ports]) ; si out.error (ex: lsof absent sur Windows) -> return silencieux ; sinon stdout récupéré
- `src/orchestrator.ts:113-117` — cwd = fs.readlinkSync(`/proc/${pid}/cwd`) dans un try/catch ; le catch fait `continue`. Sur macOS /proc n'existe pas => lève => continue => aucun PID n'est jamais tué malgré des PID trouvés par lsof. Aucun log n'est émis dans ce chemin.
- `src/orchestrator.ts:137-143` — Seul un log est émis si killed.length > 0 (PIDs tués). Aucun log n'avertit quand lsof/proc est indisponible ou quand des PID ont été trouvés mais tous ignorés.
- `src/orchestrator.ts:332` — Premier appel : début de chaque sprint (runSprint), pour nettoyer les zombies du sprint précédent.
- `src/orchestrator.ts:594` — Second appel : bloc finally de main(), nettoyage final même sur Ctrl+C/crash.
- `legacy-python/orchestrator.py:98-100` — V1 Python utilise os.readlink(f'/proc/{pid}/cwd') avec except OSError: continue — implémentation Linux-only IDENTIQUE. Le port TS est fidèle, d'où la tension de fidélité.
- `README.md:1` — Le README ne contient qu'une ligne (# fullstack-harness) — aucune contrainte de plateforme documentée nulle part.
- `CLAUDE.md:1` — CLAUDE.md ne mentionne aucune contrainte OS pour le nettoyage de ports ('Requires Node, pnpm, the claude CLI...' sans préciser Linux pour lsof+/proc).

**Impact DX.** Un mainteneur sur macOS (cible probable d'un dev TS) croit le nettoyage de ports actif alors qu'il est un no-op total : les ports 3000/3001/8000/8001 restent occupés par des zombies du sprint précédent, ce qui fait échouer le démarrage des dev-servers des sprints suivants (et donc la QA Playwright) sans message expliquant la cause. Le silence (`continue`/`return` sans log) rend le diagnostic coûteux. Documenter la contrainte et logger explicitement « cleanup unsupported on this platform » transforme un échec opaque en limitation connue et traçable.

**Correctif proposé.**
1. Documenter la contrainte de plateforme : dans CLAUDE.md (section Commands ou une note dédiée près du paragraphe 'Requires Node, pnpm, the claude CLI...') et dans README.md, indiquer explicitement que cleanupWorkspacePorts est entièrement opérationnel uniquement sur Linux (dépend de lsof + /proc/<pid>/cwd), qu'il est un no-op silencieux sur macOS (lsof présent mais /proc absent) et sur Windows (lsof absent), et que sur ces OS les zombies dev-server doivent être tués manuellement.
2. Rendre le no-op observable (changement de comportement minimal, additif) : au début de cleanupWorkspacePorts, détecter process.platform. Si platform !== 'linux', émettre UN log via console.info + appendProgressLog (ex: `Port cleanup skipped: unsupported platform '<platform>' (requires Linux /proc); kill stray dev-servers manually`) puis return. Cela évite le scan lsof inutile ET surtout supprime le silence.
3. Dans le chemin Linux existant, ajouter un log non-fatal lorsque des PID ont été trouvés par lsof mais qu'AUCUN n'a pu être confirmé via /proc (ex: tous les readlinkSync ont échoué) — pour distinguer 'rien en écoute' de 'détection cwd cassée'.
4. (Optionnel, plus ambitieux) Fournir une détection de cwd cross-platform pour macOS via `lsof -p <pid> -a -d cwd -Fn` (parser la ligne 'n<path>') au lieu de /proc, derrière une branche process.platform === 'darwin'. À traiter comme amélioration séparée car élargit la surface de test ; ne pas bloquer le ticket dessus.
5. Ajouter/mettre à jour les tests unitaires (tests/orchestrator-scoring.test.ts ou un nouveau tests/orchestrator-cleanup.test.ts) : importer cleanupWorkspacePorts, mocker process.platform à 'darwin'/'win32' et vérifier qu'aucun process.kill n'est tenté et qu'un log/appendProgressLog d'avertissement est émis ; vérifier que sur 'linux' (ou non mocké) le chemin nominal reste inchangé (régression de fidélité V1).
6. Lancer pnpm typecheck (clean) et pnpm test (vert) ; mentionner dans la note CLAUDE.md/README que ce comportement diffère désormais légèrement de la V1 Python (V1 ne logge pas le no-op) — divergence assumée car purement diagnostique.

**Critères d'acceptation.**
- [ ] CLAUDE.md ET README.md documentent explicitement que cleanupWorkspacePorts est Linux-only (lsof + /proc) et no-op silencieux sur macOS/Windows, avec la consigne de tuer les zombies manuellement sur ces OS.
- [ ] Sur une plateforme non-Linux (process.platform mocké à 'darwin' ou 'win32'), cleanupWorkspacePorts émet au moins un message d'avertissement (console.info + appendProgressLog) et n'appelle jamais process.kill.
- [ ] Un test unitaire échoue si le chemin non-Linux n'émet pas d'avertissement ou tente un kill.
- [ ] Sur Linux, le comportement nominal (lister via lsof, confiner via /proc, SIGTERM, log 'Cleaned up dev-server zombies') reste strictement inchangé.
- [ ] pnpm typecheck est clean.
- [ ] pnpm test passe (y compris le nouveau test de plateforme).

**Risques.**
- Tension de fidélité V1 : la V1 Python (legacy-python/orchestrator.py:73-114) est elle-même Linux-only et NE logge PAS le no-op. Ajouter un log/early-return introduit une micro-divergence de comportement vs V1 ; à assumer explicitement comme amélioration diagnostique non comportementale sur le résultat (aucun process tué en plus/en moins sur Linux).
- Mocker process.platform dans vitest peut être fragile (propriété en lecture seule) ; utiliser vi.stubGlobal/Object.defineProperty et restaurer en afterEach pour ne pas polluer les autres tests.
- La branche darwin via `lsof -d cwd` (étape optionnelle) tuerait potentiellement des processus si le parsing du cwd est incorrect — risque de tuer un dev-server hors workspace. Ne pas l'activer sans tests dédiés ; garder le confinement strict (égalité ou préfixe + path.sep).
- Si l'early-return non-Linux est mal placé, il pourrait masquer un futur support Windows/macOS ; bien le confiner derrière process.platform et le documenter comme limitation, pas comme refus définitif.
- Le harnais tourne probablement en CI/dev Linux : le risque de régression sur le chemin nominal est faible si les tests verrouillent le comportement Linux existant.

<details><summary>Notes de vérification</summary>

Toutes les locations du ticket source vérifiées et corrigées. (1) src/orchestrator.ts:81-147 confirmé pour le corps de la fonction. (2) Correction importante : le ticket dit 'tout le nettoyage est Linux-only' — en réalité lsof (ligne 91-99) est portable et fonctionne sur macOS ; SEUL le confinement via /proc/<pid>/cwd (ligne 114) est Linux-only et casse silencieusement. La suggestion source 'lsof -t sur macOS' est donc inexacte (lsof -t est déjà utilisé) ; le vrai correctif cross-platform serait `lsof -p <pid> -d cwd -Fn`. (3) Deux call sites confirmés (lignes 332 et 594), pas un seul. (4) Comportement Windows précisé : out.error -> return immédiat (ligne 100-102), no-op sans même scanner. (5) Fidélité confirmée : legacy-python/orchestrator.py:98-100 utilise os.readlink('/proc/{pid}/cwd') à l'identique => vraie tension de fidélité, fidelity_tension=true justifié. (6) behavior_change repassé à true (le ticket source disait false) car logger le no-op + early-return sur plateforme non-Linux modifie le comportement observable (logs), même si le résultat sur Linux est inchangé. (7) README.md vérifié : contient une seule ligne, donc 'documenter dans README' = écrire réellement du contenu. (8) Aucune dépendance envers d'autres tickets : DX-19 est documentaire + diagnostique autonome (les renvois DX-13/DX-14 du seed concernent la même zone mais ne sont pas des prérequis bloquants). Ce ticket n'est PAS un ticket scoring — Option A non applicable.

</details>

---

## Thème — Outillage & CI

_DX-21 : documenter ou retirer les regles .gitignore Python dans un repo presente comme port TS. DX-22 : aligner les scripts package.json (build duplique typecheck, aucun lint/format) et clarifier le role sous-utilise de zod. DX-37 : etendre la couverture de tests (readJson, formatage du feedback QA a extraire, cas avances de security, trous de validate_json)._

### DX-21 — Documenter (ou justifier) les règles .gitignore Python dans un repo présenté comme port TS

**Thème** Outillage/CI · **Sévérité** 🟡 basse · **Effort** S · **Fidélité V1** non · **Change le comportement** non · **Dépend de** —

**Problème.** Le `.gitignore` de la racine ouvre sur des règles Python (`__pycache__/` en ligne 1, puis sous l'en-tête `# Python` : `*.pyc`, `*.pyo`, `.venv/`, `venv/`) alors que le harnais actif est entièrement TypeScript. Le ticket source supposait que ces entrées étaient soit purement liées à l'archive soit un vestige non nettoyé. VÉRIFICATION : elles ne sont PAS un pur vestige. `legacy-python/` est bien versionné (10 fichiers, dont du `.py` réel) et contient `legacy-python/agents/__pycache__/` qui apparaît effectivement comme ignoré (`git status --ignored`). Ces règles servent donc activement à empêcher de committer les bytecode/venv de l'archive Python. Le problème réel est purement un signal DX : sans commentaire, un lecteur de la racine d'un repo annoncé comme « port TS » voit des règles Python en TÊTE de fichier et en déduit une « migration pas finie » ou une incohérence, alors que c'est intentionnel. Le correctif n'est donc PAS une suppression mais une clarification (commentaire de scope), et accessoirement une mise en ordre du fichier (regrouper Node/TS en tête, Python sous une rubrique « legacy archive »). Constat additionnel non mentionné dans le seed : la racine de travail contient aussi des artefacts physiques résiduels de l'ère Python — `.venv/`, `__pycache__/` et quatre fichiers `debug_8_avril.txt`/`debug_8_avril_2.txt`/`debug_9_avril.txt`/`debug_10_avril.txt` (tous vides, 0 octet). Ils sont correctement non suivis/ignorés (`debug*.txt` couvre les `debug_*.txt`, ligne 17), mais leur présence physique renforce le même signal « migration pas finie » et peut être nettoyée du disque pour cohérence.

**Preuves.**
- `.gitignore:1` — `__pycache__/` est en ligne 1, AU-DESSUS de l'en-tête `# Python` (ligne 3). Le seed citait `.gitignore:1-7` pour « commence par __pycache__/, *.pyc, *.pyo, .venv/, venv/ » : exact sur le contenu, mais la ligne 1 est orpheline (hors de la rubrique commentée), et le bloc commenté `# Python` couvre en réalité les lignes 3-7.
- `.gitignore:3-7` — Bloc `# Python` : `*.pyc` (4), `*.pyo` (5), `.venv/` (6), `venv/` (7). Aucun commentaire n'indique que ces règles existent pour l'archive `legacy-python/`.
- `.gitignore:20-23` — Les règles Node/TypeScript (`node_modules/`, `dist/`, `*.tsbuildinfo`) qui concernent le harnais ACTIF sont reléguées en fin de fichier (lignes 20-23), après Python/IDE/workspace/debug — ordre inverse de la priorité réelle du projet.
- `legacy-python/orchestrator.py` — L'archive Python est VERSIONNÉE : `git ls-files legacy-python` retourne 10 fichiers (orchestrator.py, security.py, tools.py, progress.py, agents/*.py, requirements.txt). Les règles Python du .gitignore ne sont donc pas mortes : elles protègent cette archive.
- `legacy-python/agents/__pycache__/` — `git status --porcelain --ignored` liste `!! legacy-python/agents/__pycache__/` : preuve directe que la règle `__pycache__/` est activement utile pour l'archive.
- `.gitignore:17` — `debug*.txt` ignore bien les quatre fichiers racine `debug_8_avril.txt`, `debug_8_avril_2.txt`, `debug_9_avril.txt`, `debug_10_avril.txt` (tous 0 octet, datés avril, non suivis par git — confirmé par `git ls-files` vide pour ces motifs et `git status --ignored` qui les marque `!!`).

**Impact DX.** Friction de lecture mineure mais répétée : tout nouveau contributeur ou relecteur qui ouvre la racine voit un `.gitignore` à dominante Python en tête, des dossiers `.venv/`/`__pycache__/` et des `debug_*.txt` au format date française jamais nettoyés. Cela contredit le pitch « port TS fidèle » affiché dans CLAUDE.md/README et crée un doute sur l'état d'avancement réel de la migration. Coût quasi nul à corriger, gain de clarté immédiat sur l'intention (« le Python est archivé exprès, pas oublié »).

**Correctif proposé.**
1. Réordonner `.gitignore` pour refléter le projet actif : placer en tête une rubrique `# Node / TypeScript` (node_modules/, dist/, *.tsbuildinfo), suivie de `# Workspace (generated projects)` (workspace/) et `# Debug logs` (debug*.txt, cli_debug.log), puis `# IDE` (.idea/, .vscode/).
2. Regrouper TOUTES les règles Python (déplacer `__pycache__/` de la ligne 1 sous la rubrique) en fin de fichier sous un en-tête explicite, ex : `# Legacy Python archive (legacy-python/ — kept for reference, see CLAUDE.md)` au-dessus de `__pycache__/`, `*.pyc`, `*.pyo`, `.venv/`, `venv/`.
3. (Optionnel, hygiène disque) Supprimer du working tree les artefacts résiduels racine non suivis : `.venv/`, `__pycache__/` et les quatre `debug_8_avril.txt`/`debug_8_avril_2.txt`/`debug_9_avril.txt`/`debug_10_avril.txt` (vérifier au préalable `git ls-files` qu'aucun n'est suivi — confirmé non suivi à l'audit).
4. NE PAS supprimer les règles Python du .gitignore : elles protègent l'archive `legacy-python/` (versionnée) et son `__pycache__/`. Le but est de documenter/scoper, pas d'enlever.
5. Committer en `chore(gitignore): scope Python rules to legacy archive, reorder TS-first`.

**Critères d'acceptation.**
- [ ] `.gitignore` présente les rubriques Node/TS, Workspace, Debug et IDE AVANT toute règle Python.
- [ ] Toutes les règles Python (`__pycache__/`, `*.pyc`, `*.pyo`, `.venv/`, `venv/`) sont regroupées sous un en-tête de commentaire mentionnant explicitement `legacy-python/` / l'archive ; plus aucune règle Python orpheline en ligne 1.
- [ ] `git check-ignore legacy-python/agents/__pycache__/` retourne toujours le chemin (les règles continuent d'ignorer l'archive Python).
- [ ] `git status --porcelain` ne fait apparaître AUCUN nouveau fichier précédemment ignoré (la couverture d'ignore n'a pas régressé).
- [ ] (Si étape optionnelle appliquée) `ls` à la racine ne montre plus `.venv/`, `__pycache__/`, ni les quatre `debug_*.txt` ; et `git status` reste propre (ces chemins n'étaient pas suivis).

**Risques.**
- Sur-correction par suppression : retirer les règles Python casserait l'ignore de l'archive `legacy-python/__pycache__/` et risquerait de polluer le repo de bytecode si quelqu'un réexécute le Python legacy. Le ticket demande explicitement de DOCUMENTER, pas de supprimer.
- L'étape optionnelle de suppression physique touche des fichiers non versionnés : aucun impact git, mais s'assurer via `git ls-files` qu'aucun n'est suivi avant `rm` (vérifié non suivi à l'audit) ; éviter tout `git rm`.
- Aucune tension de fidélité V1 : `.gitignore` n'est pas un artefact de comportement runtime du harnais ; le réordonner/commenter ne modifie aucune logique d'orchestration ni aucun résultat d'agent (behavior_change = false).
- Risque cosmétique de conflit de merge si une autre branche modifie `.gitignore` en parallèle ; négligeable vu la taille (23 lignes).

<details><summary>Notes de vérification</summary>

Lu `.gitignore` intégralement (23 lignes) : confirmé l'ordre Python(1)/# Python(3-7)/# IDE(9-11)/workspace(13-14)/debug(16-18)/# Node-TS(20-23). CORRECTION du seed : (1) la location `.gitignore:1-7` est imprécise — `__pycache__/` est en ligne 1 hors du bloc commenté `# Python` qui couvre 3-7 ; (2) l'hypothèse « ces entrées soit ne servent qu'à l'archive, soit sont un vestige non nettoyé » est tranchée par le code réel : elles SERVENT à l'archive — `git ls-files legacy-python` = 10 fichiers versionnés dont du `.py`, et `git status --ignored` liste `!! legacy-python/agents/__pycache__/`. Donc le correctif correct est documentation/scoping, PAS suppression. AJOUTS factuels : artefacts résiduels physiques à la racine (`.venv/`, `__pycache__/`, 4× `debug_*.txt` de 0 octet, datés avril) tous non suivis et correctement ignorés (`git ls-files` ne les retourne pas ; `git status --ignored` les marque `!!`). Aucun fichier Python n'est suivi en dehors de `legacy-python/`. Ce ticket relève d'Outillage/CI, pas du scoring : l'Option A (config.yaml SSOT) ne s'applique pas ici. fidelity_tension=false, behavior_change=false confirmés.

</details>

### DX-22 — Aligner les scripts package.json (build duplique typecheck, aucun lint/format) et clarifier le rôle de zod (sous-utilisé)

**Thème** Outillage/CI · **Sévérité** 🟡 basse · **Effort** S · **Fidélité V1** non · **Change le comportement** non · **Dépend de** —

**Problème.** Trois incohérences d'outillage dans le harnais (pas dans les apps générées) :

1. Doublon trompeur build/typecheck. `package.json:10` ("build": "tsc --noEmit") et `package.json:11` ("typecheck": "tsc --noEmit") exécutent EXACTEMENT la même commande. Le nom "build" laisse croire qu'un artefact est produit, alors que tsconfig.json:13 force "noEmit": true — donc `pnpm build` ne génère rien. Pire, tsconfig.json:15-16 déclare "outDir": "dist" et "rootDir": "." qui sont des options mortes/contradictoires tant que noEmit reste true (et "dist" est aussi exclu via tsconfig.json:19). Le harnais tourne en réalité via tsx (package.json:8-9 dev/start = "tsx src/index.ts"), donc aucun build de compilation n'est nécessaire — le script "build" n'a pas de raison d'exister sous sa forme actuelle.

2. Aucun lint/format malgré des conventions de style fortes. CLAUDE.md impose des conventions explicites (TypeScript strict, ESM, annotations de types partout, format des messages de commit, prompts FR / user-prompts EN). Aucun outil ne les fait respecter : pas de script lint/format dans package.json, aucun fichier de config eslint/prettier/biome à la racine, et aucun répertoire .github (donc aucune CI). Rien n'empêche une régression de style d'entrer dans le repo.

3. zod sous-utilisé / incohérent. zod est déclaré en dependency RUNTIME (package.json:17, ^4.4.3) mais n'est importé qu'à un seul endroit : src/tools.ts:16. Il n'y sert qu'à typer les params de 2 outils MCP (update_progress: phase/message à tools.ts:146-147 ; validate_json: file_path/schema_name à tools.ts:165-167). Il n'est utilisé NULLE PART ailleurs dans src/. Or les deux endroits où il apporterait le plus de valeur ne l'utilisent pas : loadConfig (orchestrator.ts:41-50) fait `parse(raw) as Config` — cast aveugle, zéro validation runtime de config.yaml ; readJson (orchestrator.ts:53-62) fait `JSON.parse(raw) as unknown` puis les artefacts inter-agents sont castés sans validation (la validation existante des artefacts repose sur REQUIRED_KEYS, une simple vérif de clés, pas zod — tools.ts:22-124). Le choix d'embarquer zod en runtime est donc soit à exploiter (valider config + artefacts) soit à clarifier ; en l'état c'est une dépendance lourde pour un usage marginal.

Ce ticket porte uniquement sur l'hygiène d'outillage (scripts/lint/dépendance). L'exploitation effective de zod pour valider config.yaml et les artefacts est le sujet de DX-09/DX-11 ; ici on se limite à corriger les scripts et, au minimum, à documenter/cadrer l'intention zod pour qu'elle soit cohérente.

**Preuves.**
- `package.json:10` — "build": "tsc --noEmit" — identique à typecheck, ne produit aucun artefact
- `package.json:11` — "typecheck": "tsc --noEmit" — commande dupliquée à l'identique de build
- `package.json:8-9` — dev/start = "tsx src/index.ts" — le harnais s'exécute via tsx, aucun build de compilation requis
- `tsconfig.json:13` — "noEmit": true — rend l'idée d'un build émetteur inopérante
- `tsconfig.json:15-16` — "outDir": "dist", "rootDir": "." — options mortes/contradictoires tant que noEmit=true (et dist est exclu ligne 19)
- `package.json (scripts 7-13)` — aucun script lint ou format ; seuls dev/start/build/typecheck/test existent
- `(racine du repo)` — aucun fichier eslint/prettier/biome ; aucun répertoire .github → aucune CI fait respecter les conventions de CLAUDE.md
- `package.json:17` — "zod": "^4.4.3" déclaré en dependency RUNTIME (et non devDependency)
- `src/tools.ts:16` — import { z } from "zod" — unique import de zod dans tout src/ (vérifié par grep)
- `src/tools.ts:146-147,165-167` — seul usage de zod : typage des params de 2 outils MCP (phase/message ; file_path/schema_name enum)
- `src/orchestrator.ts:48-49` — loadConfig : parse(raw) as Config — cast sans validation runtime, zod inutilisé alors qu'il serait pertinent ici
- `src/orchestrator.ts:60-61` — readJson : JSON.parse(raw) as unknown — artefacts inter-agents non validés par zod
- `src/tools.ts:22-124` — la validation d'artefacts existante = REQUIRED_KEYS (vérif de clés, fidèle V1), pas zod

**Impact DX.** Friction et risque silencieux pour le mainteneur. (1) `pnpm build` donne une fausse impression de produire un livrable ; un nouveau contributeur peut perdre du temps à chercher dist/. (2) Sans lint/format/CI, les conventions de CLAUDE.md ne sont que déclaratives : style/imports/types peuvent dériver sans signal, et les commits non conformes passent. (3) zod en runtime non exploité = bruit dans le graphe de dépendances et signal contradictoire (« on a un validateur mais on caste à l'aveugle ») qui complique l'onboarding et masque le fait que config.yaml/artefacts ne sont pas validés au runtime. Correctif à faible effort, sans changement de comportement à l'exécution du pipeline.

**Correctif proposé.**
1. Résoudre le doublon build/typecheck. Option simple et recommandée (le harnais tourne via tsx) : SUPPRIMER le script "build" de package.json:10, et garder "typecheck": "tsc --noEmit". Mettre à jour toute référence à `pnpm build` (README, docs) vers `pnpm typecheck`.
2. Nettoyer tsconfig.json : retirer les options mortes "outDir": "dist" (ligne 15) et "rootDir": "." (ligne 16) puisque noEmit=true et qu'aucun artefact n'est émis (laisse une config cohérente : type-check only). Conserver l'exclude de dist est sans effet mais inoffensif ; on peut le retirer aussi par cohérence.
3. Ajouter un linter/formatter léger. Recommandation : Biome (un seul binaire, lint+format, zéro config lourde) en devDependency. Ajouter un biome.json minimal aligné sur les conventions CLAUDE.md (ESM, strict, pas de var inutilisée). Ajouter les scripts package.json : "lint": "biome check src tests" et "format": "biome format --write src tests". (Alternative : eslint+prettier si préféré, mais plus de config.)
4. Câbler une CI minimale. Créer .github/workflows/ci.yml qui, sur push/PR : `pnpm install`, `pnpm typecheck`, `pnpm lint`, `pnpm test`. Ainsi les conventions deviennent contraignantes.
5. Clarifier le statut de zod. Décision binaire à acter avec DX-09/DX-11 : (a) si zod doit valider config.yaml + artefacts (recommandé, synergie DX-09/DX-11) → le conserver en dependency runtime et planifier son usage dans loadConfig/readJson via ces tickets ; (b) sinon → c'est l'outil zod du SDK MCP, le garder en runtime mais documenter brièvement (commentaire src/tools.ts ou note CLAUDE.md) que son périmètre est volontairement limité aux schémas d'outils MCP. NE PAS supprimer zod sans avoir tranché DX-09/DX-11. Aucun chiffre/seuil de scoring n'est concerné par ce ticket (hors périmètre Option A).
6. Vérifier que `pnpm typecheck`, `pnpm lint`, `pnpm test` passent tous proprement après changements.

**Critères d'acceptation.**
- [ ] package.json ne contient plus deux scripts à commande identique : soit "build" est supprimé, soit il fait quelque chose de distinct et documenté
- [ ] `pnpm typecheck` reste clean (tsc --noEmit, exit 0)
- [ ] tsconfig.json ne déclare plus outDir/rootDir morts (ou alors noEmit est levé et un vrai build émet dans dist — mais ce n'est PAS l'option retenue ici)
- [ ] un script "lint" existe dans package.json et `pnpm lint` s'exécute (exit 0 sur le code actuel, après éventuels fixes de format)
- [ ] un script "format" existe et `pnpm format` reformate sans casser le typecheck
- [ ] un workflow CI (.github/workflows/ci.yml) exécute install + typecheck + lint + test sur PR
- [ ] le statut de zod est tranché et tracé : soit un commentaire/doc explique son périmètre limité, soit DX-09/DX-11 sont liés pour son extension à config/artefacts
- [ ] aucune régression de comportement du pipeline d'orchestration (dev/start inchangés)

**Risques.**
- Choix d'outil lint : introduire eslint+prettier alourdit la config et peut générer un grand diff de reformatage initial ; Biome limite ce risque. Le premier `format --write` peut toucher de nombreux fichiers — faire un commit de reformatage isolé.
- Tension de fidélité V1 faible mais réelle : la validation d'artefacts est volontairement REQUIRED_KEYS (port fidèle). Ne PAS remplacer cette logique par zod dans CE ticket (c'est DX-09/DX-11) au risque de diverger du comportement V1 préservé.
- Supprimer le script build pourrait casser une commande/doc externe qui l'appelle (CI hypothétique, scripts perso) — grep le repo et la doc pour `pnpm build`/`npm run build` avant suppression.
- Retirer outDir/rootDir est sûr tant que noEmit=true ; mais si un futur ticket veut émettre du JS, il faudra les réintroduire — laisser une note.
- Supprimer zod prématurément casserait les outils MCP (tools.ts) et romprait DX-09/DX-11 : ne pas le faire sans décision explicite.
- Ajouter une CI exige que pnpm test passe en CI (vitest pinné ^2 pour Node <20.19 — vérifier la version Node de la CI pour éviter un échec d'environnement).

**Notes de complétude (critique).**
- Référencer DX-11 et DX-40 comme les endroits où `zod` prend réellement de la valeur (validation config + validation d'artefacts).

<details><summary>Notes de vérification</summary>

Toutes les locations du ticket source ont été lues et confirmées. build (package.json:10) et typecheck (package.json:11) sont bien identiques (\"tsc --noEmit\"). tsconfig.json:13 a noEmit=true et 15-16 déclarent outDir/rootDir morts — confirmé que build ne produit aucun artefact. Aucun fichier eslint/prettier/biome ni répertoire .github à la racine — confirmé (ls + grep). zod : import unique à src/tools.ts:16 (grep -rn 'zod' src/ ne renvoie que cette ligne), utilisé aux 4 appels z.string()/z.enum() des 2 outils MCP (tools.ts:146-147 pour update_progress, 165-167 pour validate_json). CORRECTION mineure au seed : il s'agit de 4 déclarations de params réparties sur 2 outils, pas \"2 params\". zod est bien en dependency runtime (package.json:17, version ^4.4.3 — le seed disait ^4.4.3, exact). Ajout d'evidence non mentionnée par le seed : loadConfig (orchestrator.ts:48-49) et readJson (orchestrator.ts:60-61) castent sans validation — il n'existe PAS de src/config.ts ; le chargement de config se fait dans orchestrator.ts. La synergie zod est donc bien avec DX-09/DX-11 (validation config/artefacts), confirmée par le code. Aucun lien avec le scoring/Option A : ce ticket ne touche aucun chiffre/seuil de scoring, donc la contrainte Option A ne s'applique pas ici (noté pour éviter toute confusion).

</details>

### DX-37 — Étendre la couverture de tests unitaires : readJson, formatage du feedback QA (à extraire), cas avancés de security, et trous de validate_json

**Thème** Outillage/CI · **Sévérité** 🟡 basse · **Effort** M · **Fidélité V1** non · **Change le comportement** non · **Dépend de** —

**Problème.** Le harnais teste correctement les modules de logique pure les plus visibles (sprintPassed, validateJson, ProjectProgress) mais plusieurs logiques pures non-SDK à fort risque de régression ne sont pas couvertes :

1. **readJson** (src/orchestrator.ts:53-66) — déjà exporté, directement testable. Aucun test ne couvre ses 3 chemins : fichier absent (warn + null), JSON cassé (catch + error + null), JSON valide (objet parsé). Une régression silencieuse (ex: throw au lieu de return null) casserait toute la boucle d'orchestration sans qu'aucun test n'échoue.

2. **Construction de la chaîne de feedback QA** (src/orchestrator.ts:402-412) — formate chaque bug en `- [severity] description (file: X, line: Y) → Fix: Z` avec valeurs par défaut ('unknown' pour severity, '' pour description, '?' pour file/line, 'N/A' pour suggested_fix). ATTENTION (correction du ticket source) : cette logique n'est PAS une fonction pure exportée — elle est inline à l'intérieur de `runSprint()` (async, pilotée SDK : appelle runBuilderImplement/runEvaluatorQa). Elle ne peut donc pas être testée en l'état. Il faut d'abord l'EXTRAIRE dans un helper pur exporté (ex: `buildQaFeedback(report): string`), puis l'appeler depuis runSprint, puis la tester. C'est un refactor sans changement de comportement.

3. **Cas avancés de security** (src/security.ts) — c'est le module qui porte la valeur sécurité du harnais, et ses branches les plus subtiles ne sont pas testées. tests/security.test.ts (8 tests) couvre seulement : allowlist simple, denylist, cd sibling, bare cd, Read hors workspace, Write/Glob dans workspace. Non couvert : (a) suivi de effectiveCwd sur cd chaînés `cd a && cd b` (lignes 162-226), (b) refus d'un chemin absolu hors workspace passé en argument `cat /etc/passwd`-style (lignes 195-203, sauf que cat n'est pas allowlisté — il faut un binaire allowlisté + chemin absolu hors workspace, ex: `node /etc/x`), (c) préfixe d'env `NODE_ENV=production npm start` qui doit résoudre le binaire `npm` en sautant le token `NODE_ENV=...` (segmentBinary lignes 97-109), (d) quote non fermée qui fait renvoyer `[]` à shlexSplit → segmentBinary null → deny (lignes 78-81, 167-172).

4. **Trous de validate_json** (src/tools.ts + tests/tools.test.ts) — deux trous distincts (correction du ticket source) :
   (a) Validation SEULEMENT au 1er niveau : `k in record` (tools.ts:113) ne valide pas les structures imbriquées. Le test à tests/tools.test.ts:25 passe avec `scores: { quality: 9 }` même si la forme interne de scores est arbitraire. C'est un comportement (faithful V1) à documenter par un test, pas à corriger.
   (b) Le ticket source dit "ne couvre pas schema_name='feature_list_item'". Vérification : le chemin `feature_list` (validation de tableau) EST couvert (tests/tools.test.ts:44-63). Ce qui n'est PAS couvert, c'est de passer littéralement `schema_name='feature_list_item'` : c'est une valeur d'enum VALIDE (feature_list_item est une clé de REQUIRED_KEYS, tools.ts:24, et l'enum est `[...Object.keys(REQUIRED_KEYS), 'feature_list']` tools.ts:166-168), qui route vers la branche objet-unique (tools.ts:91-123) et valide contre `[id,sprint,category,description,passes]` au lieu de la branche tableau. Ce comportement (un agent qui se trompe de schema_name pour feature_list) n'a aucun test.

5. **vitest.config.ts** (vitest.config.ts:1-8) — aucune configuration de couverture (`coverage`), juste `environment: 'node'` + `include`. Aucun moyen de mesurer ou faire respecter un seuil de couverture sur les modules purs.

**Preuves.**
- `src/orchestrator.ts:53-66` — readJson exporté, 3 branches (existsSync false → warn+null ; JSON.parse throw → catch+error+null ; succès → objet). Aucun test ne l'importe.
- `src/orchestrator.ts:402-412` — Construction inline du feedback QA dans runSprint(). bug.severity ?? 'unknown', bug.description ?? '', bug.file ?? '?', bug.line ?? '?', bug.suggested_fix ?? 'N/A'. Non extraite, donc non testable directement.
- `src/orchestrator.ts:322-414` — runSprint() est async et pilotée SDK (runBuilderImplement ligne 346, runEvaluatorQa ligne 369) ; le bloc feedback y est imbriqué, d'où la nécessité d'extraire un helper pur avant de tester.
- `src/security.ts:162-226` — effectiveCwd initialisé à absWorkspace puis mis à jour à chaque segment cd (ligne 225). Logique de cd chaîné non couverte par les tests.
- `src/security.ts:97-109` — segmentBinary saute les tokens 'X=Y' non-flag (ligne 103) pour résoudre le vrai binaire — gère 'NODE_ENV=production npm start'. Non testé.
- `src/security.ts:78-81` — shlexSplit renvoie [] si quote non fermée ; segmentBinary renvoie alors null → deny 'Could not parse segment'. Non testé.
- `src/security.ts:195-203` — Chemin absolu argument résolu et refusé si hors workspace via isInside. Non testé avec un binaire allowlisté + chemin absolu externe.
- `tests/security.test.ts:26-67` — 8 tests : allowlist, denylist, sudo, cd sibling, bare cd, Read /etc/passwd, Write in-workspace, Glob {}. Aucun cd chaîné, env-prefix, quote non fermée, ni absolu-externe-avec-binaire-allowlisté.
- `src/tools.ts:104-123` — Branche objet-unique : missing = required.filter(k => !(k in record)) — validation top-level seulement, pas de récursion dans scores.
- `src/tools.ts:166-168` — enum schema_name = [...Object.keys(REQUIRED_KEYS), 'feature_list'] ⇒ 'feature_list_item' est une valeur acceptée qui route vers la branche objet-unique.
- `tests/tools.test.ts:20-71` — 7 tests couvrent qa_report (valide/incomplet), feature_list (valide/items manquants), unknown schema, file not found, invalid JSON. Pas de test passant 'feature_list_item' en schema_name, ni de test documentant la validation top-level-only.
- `vitest.config.ts:1-8` — Config minimale : environment node + include tests/**/*.test.ts. Aucune clé coverage.
- `src/types.ts:94-112` — QaReportBug (severity/description/file/line/suggested_fix tous optionnels) et QaReport (bugs: QaReportBug[], feedback?: string) — formes à respecter dans les fixtures de test.

**Impact DX.** Filet de sécurité pour les refactors futurs. Le module security est le plus dense en cas limites et le plus dangereux à casser (un faux 'allow' = échappement du sandbox) ; aujourd'hui un refactor de splitSegments/segmentBinary/effectiveCwd passerait la suite verte. readJson et le feedback QA sont sur le chemin critique de l'orchestration. La synergie est forte avec les tickets scoring Option A (DX-08 validation feature_list_item, DX-09/DX-13 SSOT poids/seuils) : ces tickets vont toucher tools.ts/validate_json et les surfaces de scoring ; disposer d'abord de tests caractérisant le comportement actuel permet de refactorer en confiance. Ajouter un seuil de couverture rend la dette visible.

**Correctif proposé.**
1. tests/orchestrator-io.test.ts (nouveau) — tester readJson (déjà exporté) : (a) fichier inexistant → null ; (b) fichier JSON cassé écrit dans un tmpdir → null ; (c) JSON valide → objet attendu. Utiliser mkdtempSync/rmSync comme tools.test.ts. Optionnel : spyOn(console,'warn'/'error') pour vérifier les messages.
2. REFACTOR sans changement de comportement : extraire le bloc src/orchestrator.ts:402-412 dans un helper pur exporté `export function buildQaFeedback(report: QaReport): string`, qui reproduit exactement le format (`[report.feedback ?? '']` en tête, puis une ligne par bug avec les défauts 'unknown'/''/'?'/'?'/'N/A'). Remplacer le code inline de runSprint par un appel à ce helper. Vérifier pnpm typecheck + pnpm test verts (aucun changement de sortie).
3. tests/orchestrator-feedback.test.ts (nouveau) — tester buildQaFeedback : (a) report sans bugs → juste report.feedback ; (b) un bug complet → ligne exacte attendue ; (c) un bug aux champs absents → vérifier les défauts 'unknown'/'?'/'N/A' ; (d) report.feedback absent → première ligne vide.
4. Étendre tests/security.test.ts : (a) cd chaîné valide `cd subdir && npm i` après avoir créé subdir dans le workspace → allow, et `cd subdir && cd ../../etc` → deny (effectiveCwd) ; (b) env-prefix `NODE_ENV=production npm start` → allow (binaire npm résolu) ; (c) quote non fermée `npm run "build` → deny (segment non parsable) ; (d) chemin absolu hors workspace avec binaire allowlisté, ex `node /etc/passwd` → deny (Path resolves outside workspace). Réutiliser le `handler` + `ctx` existants.
5. Étendre tests/tools.test.ts : (a) passer `schema_name='feature_list_item'` sur un objet unique valide → Valid (route objet-unique) et sur un objet sans 'passes' → Missing required keys ; (b) test caractérisant la validation top-level-only : un qa_report avec `scores: {}` (objet vide) passe — documenter que la forme interne de scores n'est pas validée (comportement faithful V1).
6. vitest.config.ts : ajouter un bloc `coverage` (provider 'v8') ciblant src/security.ts, src/tools.ts, src/progress.ts et les helpers purs de src/orchestrator.ts ; définir des seuils raisonnables (ne PAS inclure les modules SDK src/agents/* qui ne sont pas testés en unitaire). Ajouter le devDependency @vitest/coverage-v8 (compatible vitest ^2) et un script `pnpm test:coverage` dans package.json.
7. Lancer pnpm typecheck (clean) et pnpm test (tout vert) ; vérifier que le nombre de tests a augmenté.

**Critères d'acceptation.**
- [ ] pnpm typecheck est clean après le refactor d'extraction de buildQaFeedback.
- [ ] pnpm test passe avec un nombre de tests strictement supérieur à 27 (baseline actuelle vérifiée : 27 tests / 4 fichiers).
- [ ] buildQaFeedback est exporté depuis src/orchestrator.ts et runSprint l'utilise (plus de bloc de formatage inline aux lignes ~402-412).
- [ ] Un test échoue si readJson lève une exception au lieu de renvoyer null sur JSON cassé.
- [ ] Un test échoue si security accepte (allow) `cd subdir && cd ../../etc`, `node /etc/passwd`, ou une commande à quote non fermée.
- [ ] Un test verrouille que `NODE_ENV=production npm start` est allow (régression si segmentBinary cesse de sauter le token env).
- [ ] Un test couvre `schema_name='feature_list_item'` (route objet-unique) ET documente la validation top-level-only de validate_json.
- [ ] vitest.config.ts contient un bloc coverage ; `pnpm test:coverage` produit un rapport ; les modules src/agents/* (SDK) sont exclus des seuils.

**Risques.**
- Extraction de buildQaFeedback (étape 2) = seule modification de src de production de ce ticket : tout écart au format exact (ordre, défauts, jointure '\n') changerait le prompt reçu par le builder → écrire le test caractérisant AVANT le refactor pour figer le format.
- Tension de fidélité V1 légère : tester la validation top-level-only de validate_json fige un comportement 'naïf' hérité de V1 ; le test doit documenter que c'est intentionnel (faithful port), pas une cible de correction. Ce ticket ne change PAS ce comportement.
- Synergie/ordre avec les tickets scoring Option A : DX-08 ajoutera probablement une vraie validation de feature_list_item et DX-09/DX-13 déplaceront poids/seuils dans config.yaml + placeholders. Les tests de validate_json/scoring ajoutés ici devront être revus quand ces tickets passeront ; les écrire comme tests de caractérisation (et non figés sur des chiffres en dur) limite la casse.
- Le seuil de couverture (étape 6) peut faussement échouer en CI s'il inclut par erreur les modules SDK non testables — bien restreindre l'include de coverage aux modules purs.
- @vitest/coverage-v8 doit être pinné compatible vitest ^2 (cf. CLAUDE.md : vitest pinné ^2 pour Node < 20.19) — vérifier la version installée.

<details><summary>Notes de vérification</summary>

Lu et vérifié contre le code réel. CORRECTIONS au ticket source : (1) Le bloc de feedback QA (orchestrator.ts:402-412) n'est PAS une fonction pure exportée comme le sous-entend le ticket — il est inline dans runSprint() (async, SDK-driven) ; un refactor d'extraction est un PRÉREQUIS à son test. Ajouté comme étape 2. (2) readJson EST déjà exporté (orchestrator.ts:53) — testable sans extraction. (3) Affirmation 'tools.test.ts ne couvre pas feature_list_item' imprécise : le chemin 'feature_list' (tableau) EST couvert (tools.test.ts:44-63) ; le trou réel est de passer littéralement schema_name='feature_list_item' (valeur d'enum valide via REQUIRED_KEYS, tools.ts:166-168) qui route vers la branche objet-unique. Reformulé. (4) Confirmé : validation top-level-only (tools.ts:113, `k in record`), 'scores:{quality:9} passe' (tools.test.ts:25) — réel et faithful V1. (5) Cas security confirmés présents dans le code et absents des tests : effectiveCwd sur cd chaînés (security.ts:162-226), env-prefix via segmentBinary (security.ts:97-109), quote non fermée → [] (security.ts:78-81), chemin absolu hors workspace (security.ts:195-203). (6) vitest.config.ts : aucune config coverage (vérifié, 8 lignes). (7) depends_on mis à [] : ce ticket peut être fait seul (logique pure, behavior_change false) ; DX-08/DX-09/DX-13 sont des synergies, pas des prérequis bloquants (au contraire, faire ces tests d'abord facilite ces tickets). (8) Baseline mesurée : pnpm test = 27 tests, 4 fichiers, tous verts. fidelity_tension laissé à false (le ticket source disait false) car aucun comportement de prod n'est modifié hors extraction iso-comportement ; la seule nuance de fidélité concerne le test qui documente validate_json top-level-only.

</details>

### DX-41 — Auditer/compléter vitest.config.ts (couverture, include/exclude) en support de DX-37

**Thème** Outillage & CI · **Sévérité** 🟡 basse · **Effort** S · **Fidélité V1** non · **Change le comportement** non · **Dépend de** —

> _Ajouté par la critique de complétude — locations à reconfirmer en session._

**Problème.** vitest.config.ts n'a jamais été examiné par l'audit. Sans connaître son include/exclude et sa configuration de couverture, le ticket DX-37 (ajout de tests) risque d'être incomplet ou de cibler des fichiers exclus.

**Preuves.**
- `vitest.config.ts` — Fichier de config de test non audité (include/exclude, coverage).

**Impact DX.** Prérequis de cadrage pour DX-37 : garantit que les nouveaux tests sont effectivement collectés et que la couverture est mesurable.

**Correctif proposé.**
1. Lire vitest.config.ts ; vérifier include/exclude (les tests de logique pure sont-ils bien pris ?), l'environnement, et l'éventuelle config de couverture.
2. Compléter si besoin (ex: activer un reporter de couverture) avant/avec DX-37.

**Critères d'acceptation.**
- [ ] La config de test est documentée ; DX-37 peut s'appuyer dessus sans surprise (fichiers collectés, couverture mesurable).

**Risques.** Aucun identifié.

<details><summary>Notes de vérification</summary>

Issu de critic.files_not_examined. À traiter conjointement avec DX-37.

</details>

---

## Hors-périmètre / traçabilité

- **Spec V2 du dépôt** : explicitement hors périmètre (chantier futur ; cf. mémoire projet). Ce backlog ne traite que la DX/qualité du harnais V1 porté.
- **`legacy-python/`** : archive de référence, non auditée pour la DX.
- **Docs de migration** : drift possible signalé en DX-42 (priorité basse/optionnel).

_Document généré à partir de deux workflows d'audit/enrichissement multi-agents, le 2026-05-29._
