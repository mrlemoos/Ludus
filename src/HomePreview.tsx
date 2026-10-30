import { Component, lazy, Suspense, useState, type ReactNode } from 'react';
import { Tabs } from '@base-ui/react/tabs';
import { useTranslation } from 'react-i18next';
import { Chess } from 'chess.js';
import { isLanguage } from '../shared/waitlist';
import { Board } from './Board';
import { gameCopy } from './game-copy';
import { AppleMailTabs } from './components/apple-mail-tabs';
import { ControlIcon } from './components/control-icon';

const Board3D = lazy(() => import('./Board3D'));
const position = new Chess();
for (const move of ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5']) position.move(move);
const fen = position.fen();

class PreviewBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}

export function HomePreview() {
  const { t, i18n } = useTranslation();
  const [view, setView] = useState<'3d' | '2d'>('3d');
  const [resetKey, setResetKey] = useState(0);
  const copy = gameCopy[isLanguage(i18n.language) ? i18n.language : 'en-GB'];
  const props = { fen, flipped: false, selected: null, destinations: [], lastMove: [], onSquare: () => {}, copy };
  const flatBoard = <div className="home-flat-board" inert aria-hidden="true"><Board {...props} /></div>;

  return <figure className="home-preview">
    <AppleMailTabs value={view} onValueChange={setView} label={t('boardView')} tabs={[
      { value: '3d', label: '3D', icon: <ControlIcon name="look" /> },
      { value: '2d', label: '2D', icon: <ControlIcon name="board" /> },
    ]}>
      <div className="preview-stage">
        <Tabs.Panel value="3d"><PreviewBoundary fallback={<><p className="preview-fallback" role="status">{copy.unavailable3d}</p>{flatBoard}</>}>
          <Suspense fallback={flatBoard}><Board3D {...props} presentation resetKey={resetKey} looking={false} captured={[]} tableClock={{ times: { w: '10:00', b: '10:00' }, active: null }} /></Suspense>
        </PreviewBoundary></Tabs.Panel>
        <Tabs.Panel value="2d">{flatBoard}</Tabs.Panel>
        {view === '3d' && <button type="button" className="preview-reset" aria-label={copy.reset} onClick={() => setResetKey((key) => key + 1)}><ControlIcon name="reset" /></button>}
      </div>
    </AppleMailTabs>
    <figcaption><span>{t('boardCaption')}<span className="preview-caption-divider" aria-hidden="true"> / </span><span className="preview-caption-hint">{t(view === '3d' ? 'boardSub' : 'flatCaption')}</span></span><span>{t('preview')}</span></figcaption>
  </figure>;
}
