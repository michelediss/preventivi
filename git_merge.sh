#!/bin/bash

# Funzione per gestire gli errori
error_exit() {
    echo "Errore: $1" >&2
    exit 1
}

# Funzione per il logging
log_info() {
    echo "INFO: $1"
}

# Controllo se si è in una repository Git
if ! git rev-parse --is-inside-work-tree > /dev/null 2>&1; then
    error_exit "Non sei in una repository Git"
fi

# Variabili modificabili
DEV_BRANCH="dev"
MASTER_BRANCH="master"
COMMIT_MESSAGE="${1:-Aggiornamento automatico}"

# Salva il branch corrente
CURRENT_BRANCH=$(git symbolic-ref --short HEAD)
log_info "Branch corrente: $CURRENT_BRANCH"

# Verifica che non ci siano modifiche in sospeso
if [[ -n "$(git status -s)" ]]; then
    log_info "Ci sono modifiche non committate. Procedo con il commit."
    git add . || error_exit "Impossibile aggiungere i file modificati"
    git commit -m "$COMMIT_MESSAGE" || error_exit "Impossibile creare il commit"
fi

# Vai sul branch dev
log_info "Passaggio al branch $DEV_BRANCH"
git checkout "$DEV_BRANCH" || error_exit "Impossibile passare al branch $DEV_BRANCH"

# Pull prima del push per evitare conflitti
log_info "Pull dal branch $DEV_BRANCH remoto"
git pull origin "$DEV_BRANCH" || log_info "Nessun pull effettuato o branch remoto non esistente"

# Controllo se il branch dev remoto esiste
if ! git ls-remote --heads origin "$DEV_BRANCH" | grep -q "$DEV_BRANCH"; then
    log_info "Il branch $DEV_BRANCH non esiste in remoto. Lo creo."
    git push -u origin "$DEV_BRANCH" || error_exit "Impossibile creare il branch $DEV_BRANCH remoto"
else
    # Carica le modifiche sul branch dev remoto
    log_info "Push sul branch $DEV_BRANCH remoto"
    git push origin "$DEV_BRANCH" || error_exit "Impossibile pushare su $DEV_BRANCH"
fi

# Passa al branch master e aggiorna
log_info "Passaggio al branch $MASTER_BRANCH"
git checkout "$MASTER_BRANCH" || error_exit "Impossibile passare al branch $MASTER_BRANCH"

log_info "Pull dal branch $MASTER_BRANCH remoto"
git pull origin "$MASTER_BRANCH" || error_exit "Impossibile fare pull su $MASTER_BRANCH"

# Merge del branch dev in master
log_info "Merge del branch $DEV_BRANCH in $MASTER_BRANCH"
git merge "$DEV_BRANCH" || {
    log_info "Attenzione: Ci sono conflitti durante il merge"
    log_info "Risolvi manualmente i conflitti e poi esegui:"
    log_info "git add ."
    log_info "git commit -m \"Risoluzione conflitti\""
    log_info "git push origin $MASTER_BRANCH"
    exit 1
}

# Pusha le modifiche su master
log_info "Push sul branch $MASTER_BRANCH"
git push origin "$MASTER_BRANCH" || error_exit "Impossibile pushare su $MASTER_BRANCH"

# Ritorna al branch originale
log_info "Ritorno al branch originale: $CURRENT_BRANCH"
git checkout "$CURRENT_BRANCH" || log_info "Non è stato possibile tornare al branch originale: $CURRENT_BRANCH"

log_info "Merge e push completati con successo!"