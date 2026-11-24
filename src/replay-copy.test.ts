import { replayCopy } from './replay-copy';
import { expect, it } from 'vitest';

it('records the replay copy', () => {
  // Arrange

  // Act
  const copy = replayCopy;

  // Assert
  expect(copy).toMatchInlineSnapshot(`
    {
      "en-GB": {
        "cancelPromotion": "Cancel promotion",
        "hint": "Move either side to explore an alternative. Your saved game stays unchanged.",
        "saved": "Return to saved line",
        "variation": "Variation",
      },
      "es-ES": {
        "cancelPromotion": "Cancelar promoción",
        "hint": "Mueve cualquiera de los dos bandos para explorar una alternativa. La partida guardada no cambia.",
        "saved": "Volver a la línea guardada",
        "variation": "Variante",
      },
      "fr-FR": {
        "cancelPromotion": "Annuler la promotion",
        "hint": "Jouez les deux camps pour explorer une autre suite. Votre partie enregistrée reste inchangée.",
        "saved": "Revenir à la suite enregistrée",
        "variation": "Variante",
      },
    }
  `);
});
