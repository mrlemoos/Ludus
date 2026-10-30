import type { Language } from '../shared/waitlist';
const en = {
  matches: 'reviewed matches', tags: { 'hanging-piece': 'Unprotected pieces', 'missed-tactic': 'Missed tactics', 'king-safety': 'King safety', endgame: 'Endgames', 'time-management': 'Time management' },
  title: 'Review with Lucía', back: 'Back to game', generate: 'Generate review', analysing: 'Analysing selected positions', generating: 'Writing your review…', cancel: 'Cancel analysis',
  unavailable: 'Coaching is unavailable. Saved reviews remain accessible. Retry manually when the service returns.', retry: 'Retry', error: 'Could not load coaching. Sign in and complete onboarding first.',
  empty: 'No saved review for this match.', saved: 'Saved reviews', language: 'This review was written in', preserved: 'New replies use your current language. Saved text stays in its original language.',
  analysisNote: 'Stockfish analyses up to 40 positions in this tab. Keep it active. Browser evaluations are untrusted; suggested lines are checked for legal moves on the server.',
  free: 'Free', plus: 'Plus', usage: 'reviews reserved or saved this UTC month', profiles: ['Beginner', 'Developing', 'Club', 'Advanced'],
  suggestion: 'Your reviewed history suggests trying a deeper teaching profile.', accept: 'Accept suggestion', settings: 'Teaching settings',
  ask: 'Ask Lucía about this review', send: 'Send question', conversation: 'Saved conversation', plusNote: 'New conversation replies require Plus. Saved replies remain accessible.',
  replyLimit: 'Plus includes 20 replies per review and 200 per UTC month.', recurring: 'Recurring themes across reviewed matches',
  delete: 'Delete review and conversation', confirmDelete: 'Delete this saved review and its conversation? Monthly review usage stays unchanged.',
  quota: 'Review allowance or monthly coach spending limit reached. Saved reviews remain accessible.',
  mismatch: 'Request settings changed. Retry to use the current language and profile.', position: 'Position', before: 'Before variation', next: 'Next move', previous: 'Previous move',
  untrusted: 'Suggestions use browser engine analysis and may contain evaluation errors.', noMoves: 'This match ended before a move was played; no positions are available for review.',
};
type Copy = typeof en;
const es: Copy = {
  matches: 'partidas revisadas', tags: { 'hanging-piece': 'Piezas sin proteger', 'missed-tactic': 'Tácticas omitidas', 'king-safety': 'Seguridad del rey', endgame: 'Finales', 'time-management': 'Gestión del tiempo' },
  title: 'Revisión con Lucía', back: 'Volver a la partida', generate: 'Generar revisión', analysing: 'Analizando posiciones seleccionadas', generating: 'Redactando tu revisión…', cancel: 'Cancelar análisis',
  unavailable: 'El entrenador no está disponible. Las revisiones guardadas siguen accesibles. Reintenta manualmente cuando vuelva el servicio.', retry: 'Reintentar', error: 'No se pudo cargar el entrenador. Inicia sesión y completa la incorporación.',
  empty: 'No hay revisiones guardadas de esta partida.', saved: 'Revisiones guardadas', language: 'Esta revisión se escribió en', preserved: 'Las nuevas respuestas usan tu idioma actual. El texto guardado conserva su idioma original.',
  analysisNote: 'Stockfish analiza hasta 40 posiciones en esta pestaña. Mantenla activa. Las evaluaciones del navegador no son fiables; el servidor comprueba la legalidad de las variantes.',
  free: 'Gratis', plus: 'Plus', usage: 'revisiones reservadas o guardadas este mes UTC', profiles: ['Principiante', 'En desarrollo', 'Club', 'Avanzado'],
  suggestion: 'Tu historial de revisiones sugiere probar un perfil de enseñanza más profundo.', accept: 'Aceptar sugerencia', settings: 'Ajustes de enseñanza',
  ask: 'Pregunta a Lucía sobre esta revisión', send: 'Enviar pregunta', conversation: 'Conversación guardada', plusNote: 'Las nuevas respuestas requieren Plus. Las respuestas guardadas siguen accesibles.',
  replyLimit: 'Plus incluye 20 respuestas por revisión y 200 por mes UTC.', recurring: 'Temas recurrentes en partidas revisadas',
  delete: 'Eliminar revisión y conversación', confirmDelete: '¿Eliminar esta revisión y su conversación? El uso mensual no cambia.', quota: 'Se alcanzó el límite de revisiones o de gasto mensual. Las revisiones guardadas siguen accesibles.',
  mismatch: 'Los ajustes han cambiado. Reintenta con el idioma y perfil actuales.', position: 'Posición', before: 'Antes de la variante', next: 'Siguiente jugada', previous: 'Jugada anterior',
  untrusted: 'Las sugerencias usan análisis del navegador y pueden contener errores de evaluación.', noMoves: 'La partida terminó antes de jugar un movimiento; no hay posiciones que revisar.',
};
const fr: Copy = {
  matches: 'parties analysées', tags: { 'hanging-piece': 'Pièces sans défense', 'missed-tactic': 'Tactiques manquées', 'king-safety': 'Sécurité du roi', endgame: 'Finales', 'time-management': 'Gestion du temps' },
  title: 'Analyse avec Lucía', back: 'Revenir à la partie', generate: 'Générer une analyse', analysing: 'Analyse des positions sélectionnées', generating: 'Rédaction de votre analyse…', cancel: 'Annuler',
  unavailable: 'Le coach est indisponible. Les analyses enregistrées restent accessibles. Réessayez manuellement au retour du service.', retry: 'Réessayer', error: 'Impossible de charger le coach. Connectez-vous et terminez votre inscription.',
  empty: 'Aucune analyse enregistrée pour cette partie.', saved: 'Analyses enregistrées', language: 'Cette analyse a été rédigée en', preserved: 'Les nouvelles réponses utilisent votre langue actuelle. Le texte enregistré conserve sa langue d’origine.',
  analysisNote: 'Stockfish analyse jusqu’à 40 positions dans cet onglet. Gardez-le actif. Les évaluations du navigateur ne sont pas fiables ; le serveur vérifie la légalité des variantes.',
  free: 'Gratuit', plus: 'Plus', usage: 'analyses réservées ou enregistrées ce mois UTC', profiles: ['Débutant', 'En progression', 'Club', 'Avancé'],
  suggestion: 'Votre historique suggère un profil pédagogique plus approfondi.', accept: 'Accepter la suggestion', settings: 'Réglages pédagogiques',
  ask: 'Interrogez Lucía sur cette analyse', send: 'Envoyer la question', conversation: 'Conversation enregistrée', plusNote: 'Les nouvelles réponses nécessitent Plus. Les réponses enregistrées restent accessibles.',
  replyLimit: 'Plus inclut 20 réponses par analyse et 200 par mois UTC.', recurring: 'Thèmes récurrents des parties analysées',
  delete: 'Supprimer l’analyse et la conversation', confirmDelete: 'Supprimer cette analyse et sa conversation ? Le quota mensuel reste inchangé.', quota: 'Quota d’analyses ou plafond de dépenses mensuel atteint. Les analyses enregistrées restent accessibles.',
  mismatch: 'Les réglages ont changé. Réessayez avec la langue et le profil actuels.', position: 'Position', before: 'Avant la variante', next: 'Coup suivant', previous: 'Coup précédent',
  untrusted: 'Les suggestions utilisent le moteur du navigateur et peuvent contenir des erreurs d’évaluation.', noMoves: 'La partie s’est terminée avant le premier coup ; aucune position à analyser.',
};
export const coachCopy: Record<Language, Copy> = { 'en-GB': en, 'es-ES': es, 'fr-FR': fr };
