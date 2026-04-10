# Critères de notation QA

Ces critères sont utilisés par l'évaluateur pour noter chaque sprint et par le builder comme référence de qualité.

---

## 1. Complétude fonctionnelle (30%)

> Toutes les features du sprint contract fonctionnent-elles correctement ?

| Score | Description |
|-------|-------------|
| 10 | Toutes les features marchent parfaitement, y compris les cas limites |
| 8-9 | Toutes les features principales marchent, quelques cas limites manqués |
| 6-7 | La majorité des features marchent, 1-2 features partiellement implémentées |
| 4-5 | Plusieurs features manquantes ou cassées |
| 1-3 | La majorité des features ne marchent pas |

**Vérifications** :
- Chaque critère de test du sprint contract est-il satisfait ?
- Les endpoints API retournent-ils les bons codes HTTP et formats JSON ?
- Les formulaires fonctionnent-ils de bout en bout ?
- Les données persistent-elles correctement ?

---

## 2. Qualité du design (25%)

> L'interface est-elle cohérente, professionnelle et agréable à utiliser ?

| Score | Description |
|-------|-------------|
| 10 | Design exceptionnel, cohérent, responsive, micro-interactions soignées |
| 8-9 | Design professionnel et cohérent, bonne utilisation de l'espace |
| 6-7 | Design correct mais basique, quelques incohérences mineures |
| 4-5 | Design incohérent, problèmes de layout ou de lisibilité |
| 1-3 | Interface cassée ou inutilisable |

**Vérifications** :
- La palette de couleurs correspond-elle au `design_system` de `product_spec.json` ?
- La typographie est-elle cohérente (headings, body, tailles) ?
- Le layout est-il responsive (mobile 375px, tablet 768px, desktop 1280px) ?
- Les espaces, paddings et margins sont-ils cohérents ?
- Les états interactifs (hover, focus, active, disabled) sont-ils gérés ?
- Les transitions et animations sont-elles fluides ?

---

## 3. Robustesse (25%)

> L'application gère-t-elle correctement les erreurs et cas limites ?

| Score | Description |
|-------|-------------|
| 10 | Aucun crash, gestion élégante de tous les cas d'erreur |
| 8-9 | Très robuste, rares cas limites non gérés |
| 6-7 | Fonctionnel dans le parcours nominal, quelques crashes sur cas limites |
| 4-5 | Crashes fréquents ou comportements inattendus |
| 1-3 | Application instable, crashes au parcours nominal |

**Vérifications** :
- Que se passe-t-il avec des champs vides dans les formulaires ?
- Que se passe-t-il avec des données invalides (email mal formé, texte trop long) ?
- L'application affiche-t-elle des messages d'erreur clairs ?
- Les requêtes API échouées sont-elles gérées côté frontend ?
- La navigation arrière/avant fonctionne-t-elle correctement ?
- Le double-clic sur un bouton de soumission cause-t-il des problèmes ?

---

## 4. Qualité du code (20%)

> Le code est-il lisible, maintenable et bien structuré ?

| Score | Description |
|-------|-------------|
| 10 | Code exemplaire, bien organisé, tests complets |
| 8-9 | Code propre, bonne structure, tests pour les cas principaux |
| 6-7 | Code fonctionnel, structure acceptable, quelques tests |
| 4-5 | Code désorganisé, duplication, peu ou pas de tests |
| 1-3 | Code illisible, pas de tests, anti-patterns majeurs |

**Vérifications** :
- Les fichiers sont-ils organisés de manière logique ?
- Les fonctions sont-elles courtes et à responsabilité unique ?
- Y a-t-il de la duplication de code ?
- Les tests unitaires couvrent-ils les endpoints et composants principaux ?
- Les imports sont-ils propres (pas d'imports inutilisés) ?
- Les noms de variables/fonctions sont-ils descriptifs ?

---

## Calcul du score final

```
score_final = (completeness × 0.30) + (design × 0.25) + (robustness × 0.25) + (code_quality × 0.20)
```

**PASS** si `score_final >= 7.5` ET chaque critère individuel `>= 6.0`
**FAIL** sinon

**Exception** : un sprint est automatiquement en FAIL si une feature **centrale** (core feature du sprint contract) est totalement cassée, quel que soit le score.
