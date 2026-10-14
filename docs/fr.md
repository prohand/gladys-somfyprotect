# Somfy Protect pour Gladys

Pilotez votre alarme **Somfy Protect** depuis Gladys : activez-la,
désactivez-la, voyez ce que remontent ses détecteurs et caméras, et réagissez
aux alarmes dans vos scènes.

Somfy Protect est un service **cloud** : l'intégration parle aux serveurs
Somfy, exactement comme l'application Somfy Protect. Une connexion Internet est
nécessaire, Somfy ne propose pas d'accès local.

## Ce que vous obtenez

| Dans Somfy Protect             | Dans Gladys                                                                 |
| ------------------------------ | --------------------------------------------------------------------------- |
| Chaque site (système d'alarme) | Un appareil « Somfy Protect _site_ » : niveau de sécurité + alarme en cours |
| Détecteur de mouvement         | Mouvement (1 pendant 30 s à chaque détection), pile, température            |
| IntelliTag                     | Détection (1 pendant 30 s), pile, température                               |
| Badge                          | Présence (1 = à la maison), pile                                            |
| Détecteur de fumée             | Fumée, pile                                                                 |
| Caméra intérieure, Somfy One   | Image de la caméra, interrupteur « Caméra active » (cache)                  |
| Serrure                        | Verrou (1 = verrouillé)                                                     |
| Visiophone                     | Sonnette                                                                    |
| Sirène, Link, répéteur         | Pile, température, arrachement, quand l'appareil les remonte                |

Le niveau de sécurité est une liste à trois choix, affichés en anglais par
Gladys : **Disarmed** (désactivée), **Partial** (partielle) et **Armed**
(totale). Le changer dans Gladys le change dans Somfy Protect.

Chaque appareil porte un badge **Cloud**. Il passe à **Injoignable** quand le
cloud Somfy ne répond pas, ou quand le Link a perdu le contact avec l'appareil.
Le badge du site prend un point orange quand les événements en temps réel sont
coupés.

## Installation

1. Dans Gladys, ouvrez **Intégrations**, cherchez **Somfy Protect** et
   installez-la.
2. Dans l'écran **Configuration**, saisissez l'**e-mail** et le **mot de
   passe** de votre compte Somfy Protect, puis enregistrez.
3. Appuyez sur **Tester la connexion** : vos sites et appareils s'affichent.
4. Ouvrez l'onglet **Découverte** et créez les appareils voulus.

> Conseil : créez un utilisateur dédié dans l'application Somfy Protect
> (Réglages, Utilisateurs) pour Gladys. Votre propre compte reste privé, et
> vous pouvez supprimer cet utilisateur à tout moment.

### Réglages

| Réglage                            | Par défaut | Rôle                                                                                              |
| ---------------------------------- | ---------- | ------------------------------------------------------------------------------------------------- |
| Intervalle de rafraîchissement (s) | 120        | Fréquence de lecture des piles, températures et états (60 à 3600)                                 |
| Événements en temps réel           | activé     | Alarmes, changements de niveau et détections arrivent en une seconde. Requis par les déclencheurs |
| Intervalle des captures caméra (s) | 0          | Envoie une image des caméras toutes les N secondes. 0 = seulement sur demande                     |
| Journaux détaillés (debug)         | désactivé  | Journalise chaque requête et événement, pour diagnostiquer un problème                            |

## Scènes

### Déclencheurs

- **Alarme Somfy Protect déclenchée** : alarme intrusion, panique ou incendie.
  Filtrez sur le site et le type. Variables : nom du site, type, nom de
  l'appareil qui a détecté.
- **Alarme Somfy Protect terminée** : l'alarme s'est arrêtée.
- **Niveau de sécurité Somfy Protect modifié** : filtrez sur le nouveau niveau.

Les états des appareils (mouvement, présence, fumée, niveau de sécurité...)
fonctionnent aussi avec le déclencheur standard **État d'un appareil**.

### Actions

- **Changer le niveau de sécurité Somfy Protect**
- **Arrêter l'alarme Somfy Protect**
- **Ouvrir ou fermer le cache d'une caméra**
- **Prendre une photo avec une caméra Somfy Protect** : placez-la avant
  l'action **Envoyer l'image d'une caméra** pour recevoir une image récente.

Exemple : « quand l'alarme se déclenche, prendre une photo avec la caméra du
salon, puis me l'envoyer ».

## Widget du tableau de bord

Ajoutez le widget **Alarme Somfy Protect** à un tableau de bord. Il affiche le
niveau de sécurité, l'alarme, les appareils injoignables ou à pile faible, et
des boutons pour activer le site.

Les boutons **Désactiver** et **Arrêter l'alarme** n'apparaissent que si le
réglage du widget **Autoriser la désactivation** est coché. Laissez-le décoché
sur un tableau de bord accessible à tous (une tablette dans l'entrée, par
exemple). Chaque bouton demande une confirmation.

## Dépannage

- **« Somfy Protect a refusé le compte »** : vérifiez d'abord l'e-mail et le
  mot de passe dans l'application Somfy Protect.
- **« Somfy Protect limite les requêtes »** : Somfy bloque les comptes qui se
  connectent trop souvent. Attendez le nombre de secondes indiqué,
  l'intégration réessaie seule. Évitez d'enregistrer la configuration
  plusieurs fois de suite.
- **Pas d'événements en temps réel** : vérifiez que le conteneur peut joindre
  `websocket.myfox.io` sur le port 443. Les états se rafraîchissent quand même
  à l'intervalle choisi.
- **Pas d'image de caméra** : le cache de la caméra est fermé, ou la caméra est
  hors ligne.
- Activez les **Journaux détaillés**, reproduisez le problème, puis lisez les
  logs de l'intégration. Mots de passe et jetons n'y sont jamais écrits.

## Vie privée et sécurité

- Votre mot de passe n'est envoyé qu'à Somfy. Gladys le stocke comme secret.
- L'intégration garde un jeton de rafraîchissement Somfy dans son volume privé
  `/data`, pour ne pas se reconnecter à chaque redémarrage.
- Cette intégration n'est ni faite ni supportée par Somfy. Elle utilise les
  mêmes serveurs que l'application Somfy Protect.
