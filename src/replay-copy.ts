import type { Language } from '../shared/waitlist';
export const replayCopy: Record<Language, { variation: string; hint: string; saved: string; cancelPromotion: string }> = {
  'en-GB': { variation: 'Variation', hint: 'Move either side to explore an alternative. Your saved game stays unchanged.', saved: 'Return to saved line', cancelPromotion: 'Cancel promotion' },
  'es-ES': { variation: 'Variante', hint: 'Mueve cualquiera de los dos bandos para explorar una alternativa. La partida guardada no cambia.', saved: 'Volver a la línea guardada', cancelPromotion: 'Cancelar promoción' },
  'fr-FR': { variation: 'Variante', hint: 'Jouez les deux camps pour explorer une autre suite. Votre partie enregistrée reste inchangée.', saved: 'Revenir à la suite enregistrée', cancelPromotion: 'Annuler la promotion' },
};
