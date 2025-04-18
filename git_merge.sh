#!/bin/bash

# Funzione per gestire gli errori
error_exit() {
    echo "Errore: $1" >&2
    exit 1
}

# Controllo se si è in una repository Git
if ! git rev-parse --is-inside-work-tree > /dev/null 2>&1; then
    error_exit "Non sei in una repository Git"
fi

# Variabili modificabili
DEV_BRANCH="dev"
MASTER_BRANCH="master"
COMMIT_MESSAGE="${1:-Aggiornamento automatico}"

# Verifica che non ci siano modifiche in sospeso
if [[ -n "$(git status -s)" ]]; then
    echo "Ci sono modifiche non committate. Procedo con il commit."
    git add .
    git commit -m "$COMMIT_MESSAGE"
fi

# Vai sul branch dev
git checkout "$DEV_BRANCH" || error_exit "Impossibile passare al branch $DEV_BRANCH"

# Carica le modifiche sul branch dev remoto
git push origin "$DEV_BRANCH" || error_exit "Impossibile pushare su $DEV_BRANCH"

# Passa al branch master e aggiorna
git checkout "$MASTER_BRANCH" || error_exit "Impossibile passare al branch $MASTER_BRANCH"
git pull origin "$MASTER_BRANCH" || error_exit "Impossibile fare pull su $MASTER_BRANCH"

# Merge del branch dev in master
git merge "$DEV_BRANCH" || {
    echo "Attenzione: Ci sono conflitti durante il merge"
    echo "Risolvi manualmente i conflitti e poi esegui:"
    echo "git add ."
    echo "git commit -m \"Risoluzione conflitti\""
    echo "git push origin $MASTER_BRANCH"
    exit 1
}

# Pusha le modifiche su master
git push origin "$MASTER_BRANCH" || error_exit "Impossibile pushare su $MASTER_BRANCH"

echo "Merge e push completati con successo!"