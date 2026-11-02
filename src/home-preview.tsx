import { isLanguage } from '../shared/waitlist';
import { Board } from './board';
import { AppleMailTabs } from './components/apple-mail-tabs';
import { Button } from './components/button';
import { ControlIcon } from './components/control-icon';
import { gameCopy } from './game-copy';
import { Tabs } from '@base-ui/react/tabs';
import { Chess } from 'chess.js';
import { Component, Suspense, lazy, useState } from 'react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

const Board3D = lazy(() => import('./board-3d'));
const position = new Chess();
for (const move of ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5']) {
  position.move(move);
}
const fen = position.fen();

class PreviewBoundary extends Component<
  { children: ReactNode; fallback: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

export function HomePreview() {
  const { t, i18n } = useTranslation();
  const [view, setView] = useState<'3d' | '2d'>('3d');
  const [resetKey, setResetKey] = useState(0);
  const copy = gameCopy[isLanguage(i18n.language) ? i18n.language : 'en-GB'];
  const props = {
    copy,
    onSquare: () => {},
    position: { destinations: [], fen, flipped: false, lastMove: [], selected: null },
  };
  const flatBoard = (
    <div className="home-flat-board" inert aria-hidden="true">
      <Board {...props} />
    </div>
  );

  return (
    <figure className="home-preview">
      <AppleMailTabs
        value={view}
        onValueChange={setView}
        menu={{
          label: t('boardView'),
          tabs: [
            { icon: <ControlIcon name="look" />, label: '3D', value: '3d' },
            { icon: <ControlIcon name="board" />, label: '2D', value: '2d' },
          ],
        }}
      >
        <div className="preview-stage">
          <Tabs.Panel value="3d">
            <PreviewBoundary
              fallback={
                <>
                  <p className="preview-fallback" role="status">
                    {copy.unavailable3d}
                  </p>
                  {flatBoard}
                </>
              }
            >
              <Suspense fallback={flatBoard}>
                <Board3D
                  board={props}
                  presentation
                  resetKey={resetKey}
                  looking={false}
                  table={{
                    captured: [],
                    tableClock: { active: null, times: { b: '10:00', w: '10:00' } },
                  }}
                />
              </Suspense>
            </PreviewBoundary>
          </Tabs.Panel>
          <Tabs.Panel value="2d">{flatBoard}</Tabs.Panel>
          {view === '3d' && (
            <Button
              type="button"
              className="preview-reset"
              aria-label={copy.reset}
              onClick={() => {
                setResetKey((key) => key + 1);
              }}
            >
              <ControlIcon name="reset" />
            </Button>
          )}
        </div>
      </AppleMailTabs>
      <figcaption>
        <span>
          {t('boardCaption')}
          <span className="preview-caption-divider" aria-hidden="true">
            {' '}
            /{' '}
          </span>
          <span className="preview-caption-hint">
            {t(view === '3d' ? 'boardSub' : 'flatCaption')}
          </span>
        </span>
        <span>{t('preview')}</span>
      </figcaption>
    </figure>
  );
}
