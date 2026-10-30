import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { defaultAppearance, parseAppearance, type Appearance } from '../shared/cosmetics';
const labels = {
  'en-GB': { title: 'Board materials', wood: 'Traditional wood', walnut: 'Walnut', marble: 'Marble', ebony: 'Ivory and ebony finish', plus: 'Plus materials', error: 'Could not save appearance. Try again.' },
  'es-ES': { title: 'Materiales del tablero', wood: 'Madera tradicional', walnut: 'Nogal', marble: 'Mármol', ebony: 'Acabado marfil y ébano', plus: 'Materiales Plus', error: 'No se pudo guardar. Inténtalo de nuevo.' },
  'fr-FR': { title: 'Matériaux de l’échiquier', wood: 'Bois traditionnel', walnut: 'Noyer', marble: 'Marbre', ebony: 'Finition ivoire et ébène', plus: 'Matériaux Plus', error: 'Enregistrement impossible. Réessayez.' },
};
export function useAppearance(enabled = true) {
  const [appearance, setAppearance] = useState<Appearance>(defaultAppearance);
  const [plus, setPlus] = useState(false);
  const [error, setError] = useState(false);
  const [pending, setPending] = useState(false);
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch('/api/appearance', { signal: controller.signal });
        if (response.ok) {
          const data = await response.json() as { appearance?: unknown; plus?: boolean };
          if (!controller.signal.aborted) { setAppearance(parseAppearance(data.appearance) ?? defaultAppearance); setPlus(data.plus === true); }
        }
      } catch { /* Optional appearance must not prevent play. */ }
    }
    void load();
    const timer = setInterval(() => void load(), 60_000);
    return () => { controller.abort(); clearInterval(timer); };
  }, [enabled]);
  async function save(next: Appearance) {
    if (pending) return;
    setPending(true); setError(false);
    try {
      const response = await fetch('/api/appearance', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(next) });
      if (!response.ok) throw new Error('appearance');
      const data = await response.json() as { appearance?: unknown; plus?: boolean };
      setAppearance(parseAppearance(data.appearance) ?? defaultAppearance); setPlus(data.plus === true);
    } catch { setError(true); } finally { setPending(false); }
  }
  return { appearance, plus, error, pending, save };
}
export function AppearanceControls({ state }: { state: ReturnType<typeof useAppearance> }) {
  const { i18n } = useTranslation();
  const c = labels[i18n.language as keyof typeof labels] ?? labels['en-GB'];
  return <fieldset className="grid gap-3 mt-5" disabled={state.pending}><legend className="eyebrow">{c.title}</legend>
    <select aria-label={c.title} className="game-input" value={state.appearance.board} onChange={(e) => void state.save({ ...state.appearance, board: e.target.value as Appearance['board'] })}>
      <option value="wood">{c.wood}</option><option value="walnut" disabled={!state.plus}>{c.walnut} · Plus</option><option value="marble" disabled={!state.plus}>{c.marble} · Plus</option>
    </select><label className="flex gap-2 text-sm"><input type="checkbox" disabled={!state.plus} checked={state.appearance.pieces === 'ebony'} onChange={(e) => void state.save({ ...state.appearance, pieces: e.target.checked ? 'ebony' : 'wood' })} />{c.ebony} · Plus</label>
    {state.error && <p role="alert" className="text-sm">{c.error}</p>}
  </fieldset>;
}
