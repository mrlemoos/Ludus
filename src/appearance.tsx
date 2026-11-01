import { useEffect, useState } from 'react';
import { Button } from '@base-ui/react/button';
import { useTranslation } from 'react-i18next';
import { defaultAppearance, parseAppearance, type Appearance } from '../shared/cosmetics';
const labels = {
  'en-GB': { title: 'Board materials', wood: 'Traditional wood', walnut: 'Walnut', marble: 'Marble', ebony: 'Ivory and ebony finish', error: 'Could not save appearance. Try again.' },
  'es-ES': { title: 'Materiales del tablero', wood: 'Madera tradicional', walnut: 'Nogal', marble: 'Mármol', ebony: 'Acabado marfil y ébano', error: 'No se pudo guardar. Inténtalo de nuevo.' },
  'fr-FR': { title: 'Matériaux de l’échiquier', wood: 'Bois traditionnel', walnut: 'Noyer', marble: 'Marbre', ebony: 'Finition ivoire et ébène', error: 'Enregistrement impossible. Réessayez.' },
};
export function useAppearance(enabled = true) {
  const [appearance, setAppearance] = useState<Appearance>(defaultAppearance);
  const [error, setError] = useState(false);
  const [pending, setPending] = useState(false);
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch('/api/appearance', { signal: controller.signal });
        if (response.ok) {
          const data = await response.json() as { appearance?: unknown };
          if (!controller.signal.aborted) setAppearance(parseAppearance(data.appearance) ?? defaultAppearance);
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
      const data = await response.json() as { appearance?: unknown };
      setAppearance(parseAppearance(data.appearance) ?? defaultAppearance);
    } catch { setError(true); } finally { setPending(false); }
  }
  return { appearance, error, pending, save };
}
export function AppearanceControls({ state, swatches = false }: { state: ReturnType<typeof useAppearance>; swatches?: boolean }) {
  const { i18n } = useTranslation();
  const c = labels[i18n.language as keyof typeof labels] ?? labels['en-GB'];
  if (swatches) return <div className="swatch-row" role="group" aria-label={c.title}>{(['wood', 'walnut', 'marble'] as const).map((board) => <Button key={board} type="button" className={`swatch swatch-${board}`} aria-label={c[board]} aria-pressed={state.appearance.board === board} disabled={state.pending} onClick={() => void state.save({ ...state.appearance, board })} />)}<Button type="button" className="swatch swatch-ebony" aria-label={c.ebony} aria-pressed={state.appearance.pieces === 'ebony'} disabled={state.pending} onClick={() => void state.save({ ...state.appearance, pieces: state.appearance.pieces === 'ebony' ? 'wood' : 'ebony' })} />{state.error && <p role="alert" className="sr-only">{c.error}</p>}</div>;
  return <fieldset className="grid gap-3 mt-5" disabled={state.pending}><legend className="eyebrow">{c.title}</legend>
    <select aria-label={c.title} className="game-input" value={state.appearance.board} onChange={(e) => void state.save({ ...state.appearance, board: e.target.value as Appearance['board'] })}>
      <option value="wood">{c.wood}</option><option value="walnut">{c.walnut}</option><option value="marble">{c.marble}</option>
    </select><label className="flex gap-2 text-sm"><input type="checkbox" checked={state.appearance.pieces === 'ebony'} onChange={(e) => void state.save({ ...state.appearance, pieces: e.target.checked ? 'ebony' : 'wood' })} />{c.ebony}</label>
    {state.error && <p role="alert" className="text-sm">{c.error}</p>}
  </fieldset>;
}
